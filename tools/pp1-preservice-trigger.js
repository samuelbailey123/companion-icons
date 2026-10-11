/**
 * Start the pre-service pre-roll at 10:00 every Sunday, and check that it started.
 *
 * Usage: node tools/pp1-preservice-trigger.js <live-full.json> <outdir>
 *   then, for each trigger id it prints: node tools/rig.js add-trigger <bundle> <triggerId>
 *
 * Asked for on 2026-10-11: "make the preservice slide to auto start at 10am make sure it get's
 * started properly". Two triggers:
 *
 * - "Sunday pre-service" at 10:00:00 fires the PP1 Pre-Service key's actions, copied whole at
 *   build time the way `pp1-countdown-trigger.js` copies the Countdown key's (see there for why),
 *   so the key and the clock can never fire two different things. Then it cuts the switcher's
 *   program to the PP1 feed (Sam, the same day: "auto cut the switcher over to PP1 feed as well"),
 *   the deck's own program action on input 7. The walk-in tracks start at the same second, as
 *   Sam asked; the pre-roll has no sound.
 * - "Sunday pre-service check" at 10:00:20 fires them again, but only if ProPresenter is not
 *   showing Pre-Service by then. ProPresenter tells Companion what is live
 *   (`$(propresenter:active_presentation_name)`), so a dropped request or a ProPresenter that was
 *   busy at 10:00 gets a second go. It checks once only: a check a minute later could yank the
 *   screens back from something an operator chose on purpose.
 *
 * Both are added with `rig.js add-trigger`, which leaves every other trigger alone. Sunday only,
 * like the countdown: on any other day 10:00 is a rehearsal or an empty room.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-preservice-trigger.js <live-full.json> <outdir>')
	process.exit(1)
}

const KEY_LABEL = 'Pre-Service'
const DAYS = [0]
const START = { name: 'Sunday pre-service', time: '10:00:00' }
const CHECK = { name: 'Sunday pre-service check', time: '10:00:20' }
/** What ProPresenter reports while the pre-roll is up: the presentation's own name. */
const LIVE_VARIABLE = 'propresenter:active_presentation_name'
/** The switcher input carrying ProPresenter's PP1 output, checked against its live name below. */
const PP1_INPUT = 7
const PP1_NAME = 'PP1'
/** Companion, as tools/rig.js reaches it. */
const RIG = 'http://10.23.0.242:8000'

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

/** A control's caption, reduced to its words — the same reading the other PP1 tools do. */
const labelOf = (control) =>
	(control?.style?.layers ?? [])
		.filter((l) => l.type === 'text')
		.map((l) => l.text?.value ?? '')
		.join(' ')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const page = full.pages[number]
const keys = Object.entries(page.controls ?? {}).flatMap(([row, cols]) =>
	Object.entries(cols).filter(([, c]) => labelOf(c) === KEY_LABEL).map(([column, control]) => ({ cell: `${row}/${column}`, control }))
)
if (keys.length !== 1) throw new Error(`PP1 has ${keys.length} "${KEY_LABEL}" keys; expected exactly one`)
const [source] = keys

const actions = Object.values(source.control.steps ?? {})
	.flatMap((step) => Object.values(step.action_sets ?? {}))
	.filter(Array.isArray)
	.flat()
	.filter(Boolean)
if (!actions.length) throw new Error(`the "${KEY_LABEL}" key at ${source.cell} has no actions to copy`)
console.log(`  copying ${actions.length} action(s) from the ${KEY_LABEL} key at ${source.cell}`)
for (const a of actions) {
	console.log(`    ${a.definitionId}  ${Object.entries(a.options ?? {}).map(([k, o]) => `${k}=${o?.value ?? o}`).join(' ')}`)
}

const atem = Object.entries(full.instances).find(([, i]) => i.moduleId === 'bmd-atem')
if (!atem) throw new Error('no ATEM connection on this rig')
const [atemId, atemInstance] = atem
// Refuse to wire a cut to an input that is no longer PP1: the switcher's own name for it, live.
const res = await fetch(`${RIG}/api/variable/${atemInstance.label}/long_${PP1_INPUT}/value`, { signal: AbortSignal.timeout(6000) })
const inputName = res.ok ? (await res.text()).trim() : `HTTP ${res.status}`
if (inputName !== PP1_NAME) throw new Error(`switcher input ${PP1_INPUT} is "${inputName}", not "${PP1_NAME}"; fix PP1_INPUT`)
console.log(`  then cut program to input ${PP1_INPUT} ("${inputName}")`)

const existing = full.triggers ?? {}
for (const { name } of [START, CHECK]) {
	if (Object.values(existing).some((t) => t.options?.name === name)) {
		throw new Error(`the rig already has a "${name}" trigger; remove it in Companion before re-adding`)
	}
}

let seq = 0
const id = (prefix) => `pp1-preservice-trigger-${prefix}-${(seq++).toString(36)}`
let sortOrder = Math.max(-1, ...Object.values(existing).map((t) => t.options?.sortOrder ?? 0)) + 1

const cutToPp1 = () => ({
	id: id('action'),
	definitionId: 'program',
	connectionId: atemId,
	options: { mixeffect: v(1), input: v(PP1_INPUT) },
	upgradeIndex: null,
	type: 'action',
})

const trigger = ({ name, time }, notes, condition, extra = []) => ({
	type: 'trigger',
	options: { name, enabled: true, sortOrder: sortOrder++, notes },
	actions: [...actions.map((a) => ({ ...a, id: id('action') })), ...extra],
	condition,
	events: [{ id: id('event'), type: 'timeofday', enabled: true, options: { time, days: [...DAYS] } }],
	localVariables: [],
})

const added = {
	[id('start')]: trigger(
		START,
		`Fires the PP1 "${KEY_LABEL}" key's actions at ${START.time} on Sunday, then cuts the switcher ` +
			`to input ${PP1_INPUT} (${PP1_NAME}). Re-point the key with tools/pp1-preservice.js, then remove ` +
			`both pre-service triggers and re-run tools/pp1-preservice-trigger.js.`,
		[],
		[cutToPp1()]
	),
	[id('check')]: trigger(
		CHECK,
		`At ${CHECK.time} on Sunday, fires the "${KEY_LABEL}" key's actions again if ProPresenter is not ` +
			`showing "${KEY_LABEL}" — a second go when the ${START.time} start did not land.`,
		[
			{
				id: id('condition'),
				type: 'feedback',
				definitionId: 'variable_value',
				connectionId: 'internal',
				options: { variable: v(LIVE_VARIABLE), op: v('ne'), value: v(KEY_LABEL) },
				isInverted: v(false),
				styleOverrides: [],
				children: {},
			},
		]
	),
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
for (const [tid, t] of Object.entries(added)) {
	console.log(`  ${tid}  "${t.options.name}" at ${t.events[0].options.time} on ${DAYS.map((d) => DAY_NAMES[d]).join(', ')}`)
}

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'preservice-triggers.companionconfig')
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages: full.pages,
		triggers: { ...existing, ...added },
		triggerCollections: full.triggerCollections ?? [],
		custom_variables: full.custom_variables ?? {},
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)
console.log(`\nwrote ${path.basename(file)} — add each with: node tools/rig.js add-trigger ${file} <triggerId>`)
