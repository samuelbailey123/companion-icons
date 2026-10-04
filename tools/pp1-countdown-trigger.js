/**
 * Fire the pre-service countdown at a fixed time, every Sunday.
 *
 * Usage: node tools/pp1-countdown-trigger.js <live-full.json> <outdir>
 *   then: node tools/rig.js import <bundle> triggers
 *
 * WHY A TRIGGER AND NOT A KEY. The Countdown key on PP1 already fires the right thing, but it
 * needs a hand on it at the right second. The countdown runs to the top of the service, so the
 * moment it starts is the moment that matters — start it four seconds late and it ends four
 * seconds late, in front of everyone. A clock does that better than a person who is also doing
 * six other things at 10:24.
 *
 * THE TRIGGER DOES NOT KNOW WHAT IT FIRES. It copies its actions off the PP1 Countdown key,
 * whole, at build time. That key already resolves the playlist and the item index live against
 * ProPresenter (see pp1-countdown.js), so the trigger inherits that work rather than repeating
 * it — and the key and the trigger can never drift into firing two different things, which is
 * the failure you would only notice on the Sunday it happened.
 *
 * WHY THE WHOLE TRIGGER SET COMES OUT. Companion's import has no "add one trigger" — the
 * triggers section is reset-and-import, all or nothing. So this emits every trigger the rig
 * already has, untouched, plus this one. Re-running replaces its own trigger by name instead
 * of adding a second copy, so a change of time is a re-run, not a cleanup job.
 *
 * SUNDAY ONLY. `days` is the weekday set, Sunday being 0. A countdown that fired at 10:24:57
 * on a Tuesday would put the pre-service video on the wall in the middle of an empty room, or
 * worse, a rehearsal.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-countdown-trigger.js <live-full.json> <outdir>')
	process.exit(1)
}

/** When it fires. `time` is the deck's own timezone; `days` is 0=Sunday .. 6=Saturday. */
const TIME = '10:24:57'
const DAYS = [0]

/** The key whose actions this trigger borrows, and what the trigger is called. */
const KEY_LABEL = 'Countdown'
const TRIGGER_NAME = 'Sunday countdown'

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
let source = null
for (const row of Object.keys(page.controls ?? {})) {
	for (const column of Object.keys(page.controls[row])) {
		const control = page.controls[row][column]
		if (labelOf(control) !== KEY_LABEL) continue
		if (source) throw new Error(`PP1 has more than one "${KEY_LABEL}" key; cannot tell which to copy`)
		source = { cell: `${row}/${column}`, control }
	}
}
if (!source) throw new Error(`PP1 has no "${KEY_LABEL}" key to copy actions from`)

const actions = Object.values(source.control.steps ?? {})
	.flatMap((step) => Object.values(step.action_sets ?? {}))
	.filter(Array.isArray)
	.flat()
	.filter(Boolean)
if (!actions.length) throw new Error(`the "${KEY_LABEL}" key at ${source.cell} has no actions to copy`)

console.log(`  copying ${actions.length} action(s) from the ${KEY_LABEL} key at ${source.cell}`)
for (const a of actions) {
	const detail = Object.entries(a.options ?? {})
		.map(([k, o]) => `${k}=${o?.value ?? o}`)
		.join(' ')
	console.log(`    ${a.definitionId}  ${detail}`)
}

/*
 * Ids are generated rather than copied. Companion keys actions by id within a control, and a
 * trigger is a control: reusing the key's ids would leave two controls claiming the same
 * entity, which the importer is free to resolve either way.
 */
let seq = 0
const id = (prefix) => `pp1-countdown-trigger-${prefix}-${(seq++).toString(36)}`

const existing = full.triggers ?? {}
const mine = Object.entries(existing).find(([, t]) => t.options?.name === TRIGGER_NAME)
if (mine) console.log(`  replacing the existing "${TRIGGER_NAME}" trigger (${mine[0]})`)

const triggers = Object.fromEntries(Object.entries(existing).filter(([tid]) => tid !== mine?.[0]))
const sortOrder = Math.max(-1, ...Object.values(existing).map((t) => t.options?.sortOrder ?? 0)) + 1

triggers[mine?.[0] ?? id('self')] = {
	type: 'trigger',
	options: {
		name: TRIGGER_NAME,
		enabled: true,
		sortOrder: mine?.[1]?.options?.sortOrder ?? sortOrder,
		notes:
			`Fires the PP1 "${KEY_LABEL}" key's actions at ${TIME} on Sunday. The actions are copied ` +
			`from that key, so re-point the key with tools/pp1-countdown.js and re-run this to keep ` +
			`them together. Change TIME in tools/pp1-countdown-trigger.js and re-run to move it.`,
	},
	actions: actions.map((a) => ({ ...a, id: id('action') })),
	condition: [],
	events: [{ id: id('event'), type: 'timeofday', enabled: true, options: { time: TIME, days: [...DAYS] } }],
	localVariables: [],
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
console.log(`  "${TRIGGER_NAME}" at ${TIME} on ${DAYS.map((d) => DAY_NAMES[d]).join(', ')}`)
console.log(`  ${Object.keys(triggers).length} triggers in the bundle (${Object.keys(existing).length} were on the rig)`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'triggers.companionconfig')
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages: full.pages,
		triggers,
		triggerCollections: full.triggerCollections ?? [],
		custom_variables: full.custom_variables ?? {},
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)
console.log(`\nwrote ${path.basename(file)} — import with: node tools/rig.js import ${file} triggers`)
