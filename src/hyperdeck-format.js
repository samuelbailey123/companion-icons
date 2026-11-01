/**
 * Format the HyperDeck's card from the Stream Deck: two keys on the System page.
 *
 * It erases the card, and the card can hold the only copy of a service, so one press must not be
 * able to do it. On 2026-11-01 something started a recording with nobody meaning to, an hour
 * before the service. So:
 *
 * - **Format card** only asks the deck to get ready, and the deck gives it {@link ARMED_SECONDS}
 *   seconds. It erases nothing.
 * - **Confirm** does it, and only inside those seconds. It's a different key with a gap beside it,
 *   so a double tap, or a hand resting on the deck, can't reach both. Until the deck is ready it's
 *   dark and does nothing; when ready it goes red and says how many clips will go.
 * - Both refuse while the deck is recording.
 *
 * WHY NOT ONE KEY WITH TWO STEPS, like Stream. A stepped key stays armed until its next press, with
 * no timeout: one stray press today and another next week would erase a card. The deck's own
 * prepare and confirm can't stay armed. Companion's `bmd-hyperdeck` 3.2.0 exposes them as
 * `formatPrepare` and `formatConfirm`, with `format_ready` to show the state.
 *
 * WHY exFAT. The module defaults to HFS+. Cards go to the edit desk and the server, and exFAT reads
 * everywhere; the recorder notes say to format cards in the deck.
 *
 * The keys are built from the Record key, so they carry the rig's current look.
 */

export const PAGE_NAME = 'System'
export const FORMAT_CELL = { row: 3, column: 6 }
export const CONFIRM_CELL = { row: 3, column: 8 }
export const FILESYSTEM = 'exFAT'
export const ARMED_SECONDS = 10

const IDLE_GROUND = 0x1f2937
const CONFIRM_GROUND = 0x14161c
const READY_RED = 0xb91c1c
const NO_CARD_AMBER = 0xa16207
const CLIPS = 'concat($(hyperdeck:clipCount), " clips")'
const NOT_RECORDING = '$(hyperdeck:status) != "Record"'

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/** The control whose actions include `definitionId` on any page. */
function findKey(full, definitionId) {
	for (const page of Object.values(full.pages)) {
		for (const cells of Object.values(page.controls ?? {})) {
			for (const control of Object.values(cells)) {
				if (JSON.stringify(control.steps ?? {}).includes(`"definitionId":"${definitionId}"`)) return control
			}
		}
	}
	return null
}

/** Run `action` only while the deck isn't recording. */
function unlessRecording(id, action) {
	return {
		id,
		definitionId: 'logic_if',
		connectionId: 'internal',
		options: {},
		type: 'action',
		children: {
			condition: [
				{
					id: `${id}-condition`,
					definitionId: 'check_expression',
					connectionId: 'internal',
					options: { expression: expr(NOT_RECORDING) },
					type: 'feedback',
					isInverted: v(false),
					styleOverrides: [],
					children: {},
				},
			],
			actions: [action],
			else_actions: [],
		},
	}
}

/** The Record key's look with no icon: a caption across the top and a value under it. */
function keyFrom(record, { ground, caption, value, notes, feedbacks, action }) {
	const key = structuredClone(record)
	key.style.layers = key.style.layers.filter((l) => l.type !== 'image')
	for (const layer of key.style.layers) {
		if (layer.id === 'box0') layer.color = v(ground)
		if (layer.id === 'text0') Object.assign(layer, { text: v(caption), width: v(94), halign: v('center') })
		if (layer.id === 'text1') layer.text = value
	}
	key.options = { ...key.options, notes }
	key.feedbacks = feedbacks
	key.steps = { 0: { action_sets: { down: [action], up: [] }, options: { runWhileHeld: [] } } }
	return key
}

const fill = (overrideId, colour) => ({ overrideId, elementId: 'box0', elementProperty: 'color', override: v(colour) })
const words = (overrideId, elementId, text) => ({ overrideId, elementId, elementProperty: 'text', override: text })

const whenExpression = (id, expression, styleOverrides) => ({
	id,
	type: 'feedback',
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	isInverted: v(false),
	styleOverrides,
	children: {},
})

/** Both keys, built on the rig's Record key. */
export function buildKeys(full) {
	const record = findKey(full, 'recordStopToggle')
	if (!record) throw new Error('no Record key found to build from')
	const hyperdeck = Object.entries(full.instances).find(([, i]) => i?.moduleId === 'bmd-hyperdeck')?.[0]
	if (!hyperdeck) throw new Error('no HyperDeck connection found')
	const upgradeIndex = Number(JSON.stringify(record.steps).match(/"upgradeIndex":(-?\d+)/)?.[1] ?? -1)
	const moduleAction = (id, definitionId, options) => ({
		id,
		definitionId,
		connectionId: hyperdeck,
		options,
		type: 'action',
		upgradeIndex,
		children: {},
	})

	const format = keyFrom(record, {
		ground: IDLE_GROUND,
		caption: 'Format card',
		value: expr(`$(hyperdeck:slotId) == "-" ? "NO CARD" : ${CLIPS}`),
		notes:
			'hyperdeck-format: asks the HyperDeck to get ready to format the card. Erases nothing; the Confirm key does that, within 10 seconds. Refused while recording. Built by tools/hyperdeck-format.js.',
		feedbacks: [
			whenExpression('hyperdeck-format:no-card', '$(hyperdeck:slotId) == "-"', [fill('hyperdeck-format:no-card-bg', NO_CARD_AMBER)]),
			whenExpression('hyperdeck-format:recording', '$(hyperdeck:status) == "Record"', [
				words('hyperdeck-format:recording-text', 'text1', v('RECORDING')),
			]),
		],
		action: unlessRecording(
			'hyperdeck-format:prepare-guard',
			moduleAction('hyperdeck-format:prepare', 'formatPrepare', { filesystem: v(FILESYSTEM), timeout: v(ARMED_SECONDS) }),
		),
	})

	const confirm = keyFrom(record, {
		ground: CONFIRM_GROUND,
		caption: 'Confirm',
		value: v('format'),
		notes:
			'hyperdeck-format: ERASES THE CARD, but only within 10 seconds of Format card, when it is red. Dark, it does nothing. Refused while recording. Built by tools/hyperdeck-format.js.',
		feedbacks: [
			{
				id: 'hyperdeck-format:ready',
				type: 'feedback',
				definitionId: 'format_ready',
				connectionId: hyperdeck,
				options: {},
				isInverted: v(false),
				children: {},
				styleOverrides: [
					fill('hyperdeck-format:ready-bg', READY_RED),
					words('hyperdeck-format:ready-caption', 'text0', v('ERASE')),
					words('hyperdeck-format:ready-value', 'text1', expr(CLIPS)),
				],
			},
		],
		action: unlessRecording('hyperdeck-format:confirm-guard', moduleAction('hyperdeck-format:confirm', 'formatConfirm', {})),
	})

	return { format, confirm }
}

/** The System page with both keys on it. Refuses a cell something else is using. */
export function addKeys(full) {
	const entry = Object.entries(full.pages).find(([, p]) => p.name === PAGE_NAME)
	if (!entry) throw new Error(`no ${PAGE_NAME} page`)
	const [number, source] = entry
	const page = structuredClone(source)
	const { format, confirm } = buildKeys(full)
	for (const [cell, key] of [
		[FORMAT_CELL, format],
		[CONFIRM_CELL, confirm],
	]) {
		const taken = page.controls[cell.row]?.[cell.column]
		if (taken && !String(taken.options?.notes).startsWith('hyperdeck-format:')) {
			throw new Error(`${PAGE_NAME} row ${cell.row} column ${cell.column} is taken`)
		}
		page.controls[cell.row] ??= {}
		page.controls[cell.row][cell.column] = key
	}
	return { number, page }
}
