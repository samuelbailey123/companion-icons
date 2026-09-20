/**
 * Turn the projectors and the PA on at 08:00 every Sunday.
 *
 * Usage: node tools/sunday-power-trigger.js <live-full.json> <outdir>
 *   then: node tools/rig.js import <outdir>/triggers.companionconfig triggers
 *
 * WHY. Both already have a key on Home and on Power, and both take time to come up — a
 * projector needs its warm-up before anyone wants a picture. Whoever arrives first should find
 * them on rather than remember to press two buttons, and 08:00 is early enough to be ready and
 * late enough not to run them all night.
 *
 * IT COPIES THE COMMANDS, IT DOES NOT RETYPE THEM. The two shell commands are lifted off the
 * Home page's own Projectors and PA keys at build time, so the script paths, the nohup, and the
 * log redirect all stay in one place. Retyping a path into a second file is how a rename breaks
 * the automation and nobody notices until the Sunday it matters.
 *
 * ON, NOT TOGGLE. The keys pass `$(internal:custom_projector_action)`, which is the OPPOSITE of
 * the current state — that is what makes a key a toggle. A trigger must not toggle: fired
 * against gear that is already on, a toggle turns it OFF, which is the exact opposite of the
 * job and would do it silently at 08:00 with nobody in the room. So every `..._action` variable
 * in the copied command is replaced with a literal `on`, and the trigger is deterministic: it
 * turns them on, and running twice leaves them on.
 *
 * The `Poll PA state` and `Poll projector state` triggers already refresh `pa_state` and
 * `projector_state` every ten seconds, so the keys' own captions catch up on their own and this
 * trigger has no business writing them.
 *
 * SUNDAY ONLY (`days: [0]`). Nothing here should run itself on a Tuesday.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/sunday-power-trigger.js <live-full.json> <outdir>')
	process.exit(1)
}

/** When it fires. `days` is 0=Sunday .. 6=Saturday. */
const TIME = '08:00:00'
const DAYS = [0]

const TRIGGER_NAME = 'Sunday power on'

/** The page the keys live on, and what marks a command as one of theirs. */
const PAGE = 'Home'
const SCRIPT_MARKER = 'AV_Power_scripts'

/** What the toggle variables become. */
const ACTION = 'on'

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

const page = Object.values(full.pages).find((p) => p.name === PAGE)
if (!page) throw new Error(`no ${PAGE} page on this rig`)

const labelOf = (control) =>
	(control?.style?.layers ?? [])
		.filter((l) => l.type === 'text')
		.map((l) => l.text?.value ?? '')
		.join(' ')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

/** Every power key on the page, by the shell command it runs. */
const powerKeys = []
for (const row of Object.keys(page.controls ?? {})) {
	for (const column of Object.keys(page.controls[row])) {
		const control = page.controls[row][column]
		const actions = Object.values(control.steps ?? {})
			.flatMap((step) => Object.values(step.action_sets ?? {}))
			.filter(Array.isArray)
			.flat()
		for (const a of actions) {
			if (a.definitionId !== 'exec') continue
			const command = a.options?.path?.value ?? ''
			if (!command.includes(SCRIPT_MARKER)) continue
			powerKeys.push({ cell: `${row}/${column}`, label: labelOf(control), command })
		}
	}
}
if (!powerKeys.length) throw new Error(`no key on ${PAGE} runs a ${SCRIPT_MARKER} command`)

/*
 * The one substitution that matters. Anything matching `$(internal:custom_<something>_action)`
 * is a toggle's computed opposite; a scheduled run wants the literal instead.
 */
const TOGGLE = /\$\(internal:custom_[A-Za-z0-9_]*_action\)/g

let seq = 0
const id = (prefix) => `sunday-power-${prefix}-${(seq++).toString(36)}`

const actions = powerKeys.map(({ label, command }) => {
	if (!TOGGLE.test(command)) {
		throw new Error(`the "${label}" command has no toggle variable to replace; it may already be a literal`)
	}
	TOGGLE.lastIndex = 0
	return {
		id: id('exec'),
		definitionId: 'exec',
		connectionId: 'internal',
		options: {
			path: v(command.replace(TOGGLE, ACTION)),
			cwd: v(''),
			timeout: v(15000),
			targetVariable: v(''),
		},
		type: 'action',
		children: {},
	}
})

for (const [i, k] of powerKeys.entries()) {
	console.log(`  ${k.label} (${PAGE} ${k.cell})`)
	console.log(`    ${actions[i].options.path.value}`)
}

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
			`Turns on ${powerKeys.map((k) => k.label).join(' and ')} at ${TIME} on Sunday. The commands are ` +
			`copied from the ${PAGE} page's own keys with their toggle variable replaced by "${ACTION}", so ` +
			`this can only ever turn things ON — a toggle here would switch off gear that was already on. ` +
			`Rebuild with tools/sunday-power-trigger.js.`,
	},
	actions,
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
