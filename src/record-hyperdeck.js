/**
 * Record on the HyperDeck, not the switcher.
 *
 * Sam, 2026-10-26: "we added a disk recorder to the network so let's use that. we will be
 * recording on that and streaming on the HD8." The recorder is a HyperDeck Studio Mini, fed from
 * the Videohub's "Deck Recorder" output. Everything on the deck that started the ATEM's recording
 * now starts the HyperDeck's instead, and nothing starts the ATEM's: the switcher is left to
 * stream.
 *
 * WHAT CHANGES. The Record keys (Home and ATEM, found by their action, wherever they sit) toggle
 * the HyperDeck. Recording, they go red and show the clip's running time; idle, they show the time
 * left on the card, or go amber with NO CARD when there is none. The PP1 Countdown key, whose
 * actions the Sunday 10:24:57 trigger copies, starts the HyperDeck where it started the switcher.
 *
 * NO CARD IS READ FROM THE MODULE'S ACTIVE SLOT. With both slots empty `slotId` reads "-" (read
 * off the rig 2026-10-26, cards out). The recorder has no USB disk: it records to SD cards only.
 *
 * Recording is read with the module's own `transport_status` feedback, not a string compare on
 * its `status` variable, so a change in how the module spells a state cannot hide a recording.
 * That feedback is last in the list, so a recording's red wins over NO CARD's amber.
 *
 * IDEMPOTENT. Keys already converted are recognised by their HyperDeck action and rebuilt the
 * same way, so a rerun over its own output is unchanged.
 */

export const MODULE_ID = 'bmd-hyperdeck'
export const ATEM_MODULE_ID = 'bmd-atem'
/** Prefix of every id and note this file writes. */
export const MARK = 'record-hyperdeck'
export const NO_CARD = 'NO CARD'
/** The rig's "look at this" amber and its recording red, as the Record keys already used them. */
export const AMBER = 0xa16207
export const RED = 0xb91c1c

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

const only = (full, moduleId) => {
	const found = Object.entries(full.instances ?? {}).filter(([, i]) => i?.moduleId === moduleId)
	if (found.length !== 1) throw new Error(`expected one ${moduleId} connection on this rig, found ${found.length}`)
	const [[connectionId, instance]] = found
	return { connectionId, label: instance.label }
}

export const findHyperdeck = (full) => only(full, MODULE_ID)
export const findAtem = (full) => only(full, ATEM_MODULE_ID)

const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)

/** The switcher's start-or-stop toggle, as the Record keys carried it. */
const isAtemToggle = (a, atem) =>
	a.connectionId === atem.connectionId && a.definitionId === 'recordStartStop' && a.options?.record?.value === 'toggle'
/** The switcher's start, as the Countdown key carried it. */
const isAtemStart = (a, atem) =>
	a.connectionId === atem.connectionId && a.definitionId === 'recordStartStop' && a.options?.record?.value === 'true'

/** A Record key, before or after conversion. */
export const isRecordKey = (control, atem, hyperdeck) =>
	actionsOf(control).some(
		(a) => isAtemToggle(a, atem) || (a.connectionId === hyperdeck.connectionId && a.definitionId === 'recordStopToggle')
	)

/** The Countdown key, before or after conversion: it starts a recording among other things. */
export const isCountdownKey = (control, atem, hyperdeck) =>
	actionsOf(control).some((a) => isAtemStart(a, atem) || (a.connectionId === hyperdeck.connectionId && a.definitionId === 'rec'))

const action = (id, hyperdeck, definitionId) => ({
	id,
	definitionId,
	connectionId: hyperdeck.connectionId,
	options: {},
	upgradeIndex: null,
	type: 'action',
})

/** What an idle Record key says: the time left on the card, or that there is no card. */
export const idleText = ({ label }) => `$(${label}:slotId) == "-" ? "${NO_CARD}" : $(${label}:recordingTime)`

/** A Record key, toggling the HyperDeck. Its look and caption are kept; its reading line changes. */
export function recordKey(control, hyperdeck) {
	const out = structuredClone(control)
	const reading = out.style?.layers?.find((l) => l.id === 'text1')
	if (!reading) throw new Error('a Record key without its reading line (text1)')
	reading.text = expr(idleText(hyperdeck))
	out.feedbacks = [
		{
			id: `${MARK}:no-card`,
			type: 'feedback',
			definitionId: 'check_expression',
			connectionId: 'internal',
			options: { expression: expr(`$(${hyperdeck.label}:slotId) == "-"`) },
			isInverted: v(false),
			styleOverrides: [{ overrideId: `${MARK}:no-card-bg`, elementId: 'box0', elementProperty: 'color', override: v(AMBER) }],
		},
		{
			id: `${MARK}:recording`,
			type: 'feedback',
			definitionId: 'transport_status',
			connectionId: hyperdeck.connectionId,
			options: { status: v('record') },
			isInverted: v(false),
			styleOverrides: [
				{ overrideId: `${MARK}:recording-bg`, elementId: 'box0', elementProperty: 'color', override: v(RED) },
				{ overrideId: `${MARK}:recording-time`, elementId: 'text1', elementProperty: 'text', override: expr(`$(${hyperdeck.label}:timecodeHMS)`) },
			],
		},
	]
	out.steps = { 0: { action_sets: { down: [action(`${MARK}:toggle`, hyperdeck, 'recordStopToggle')], up: [] }, options: { runWhileHeld: [] } } }
	out.options = {
		...out.options,
		notes: `${MARK}: starts and stops the HyperDeck. Red with the running time while it records; idle, the time left on the card, amber with ${NO_CARD} when there is none. Built by tools/record-hyperdeck.js.`,
	}
	return out
}

/** The Countdown key with its switcher start swapped for the HyperDeck's, and nothing else moved. */
export function countdownKey(control, atem, hyperdeck) {
	const out = structuredClone(control)
	for (const step of Object.values(out.steps ?? {})) {
		for (const [set, actions] of Object.entries(step.action_sets ?? {})) {
			if (!Array.isArray(actions)) continue
			step.action_sets[set] = actions.map((a) => (isAtemStart(a, atem) ? action(`${MARK}:start`, hyperdeck, 'rec') : a))
		}
	}
	return out
}

/**
 * Every page with a key to convert, converted, with the cells that changed.
 *
 * @throws when there is no Record key, or no Countdown key, so a moved key is noticed
 */
export function convertPages(full) {
	const atem = findAtem(full)
	const hyperdeck = findHyperdeck(full)
	const changed = []
	let records = 0
	let countdowns = 0
	for (const [number, page] of Object.entries(full.pages ?? {})) {
		const cells = []
		const next = structuredClone(page)
		for (const [row, cols] of Object.entries(page.controls ?? {})) {
			for (const [col, control] of Object.entries(cols ?? {})) {
				if (isRecordKey(control, atem, hyperdeck)) {
					next.controls[row][col] = recordKey(control, hyperdeck)
					records++
					cells.push(`${row}/${col} Record`)
				} else if (isCountdownKey(control, atem, hyperdeck)) {
					next.controls[row][col] = countdownKey(control, atem, hyperdeck)
					countdowns++
					cells.push(`${row}/${col} Countdown`)
				}
			}
		}
		if (cells.length) changed.push({ number, name: page.name, page: next, cells })
	}
	if (!records) throw new Error('no Record key found on any page')
	if (!countdowns) throw new Error('no Countdown key found on any page')
	return { atem, hyperdeck, changed }
}
