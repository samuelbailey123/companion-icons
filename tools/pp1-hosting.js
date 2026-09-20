/**
 * PP1: a seven-minute hosting clock, on the timer the Speaker already drives.
 *
 * Usage: node tools/pp1-hosting.js <live-full.json> <outdir>
 *
 * HOSTING SHARES MAIN TIMER, ON PURPOSE. `pp1-timers.js` exists because Speaker and Worship
 * used to share one ProPresenter timer and wiped each other. Hosting sharing with Speaker is
 * not that mistake repeated: the host speaks and then sits down, and the speaker gets up —
 * they are never on the clock at the same time. Sharing is what makes the key useful, because
 * the strip is full. All six zones are spoken for, so a hosting timer of its own would have
 * nowhere to show itself; on Main Timer its countdown appears on the Speaker readout the
 * operator is already watching. (ProPresenter does have a fourth timer free, "Game Timer",
 * and it would be a clock nobody could see.)
 *
 * THE COST, STATED PLAINLY. `set` rewrites the timer's configured duration, so once Hosting
 * has fired, the existing "Speaker — Reset Timer" key resets Main Timer to 7:00 rather than
 * 45:00, until Speaker is pressed again. The strip readout will say "Speaker" over a hosting
 * countdown for those seven minutes. Both follow from one timer, two presets, and are the
 * price of the readout being there at all.
 *
 * THE UUID IS READ, NOT TYPED. "The same timer as the Speaker key" is a fact about the page,
 * so the tool takes it from the page: every control captioned Speaker is searched for a timer
 * action, and the tool refuses to build unless they all name one and the same timer. Hardcode
 * the UUID instead and the day someone repoints Speaker is the day Hosting quietly drives an
 * orphan clock.
 *
 * WHY THE RESET KEY IS A `set`, NOT A `reset`. ProPresenter's reset returns a timer to its
 * CONFIGURED duration — which on a shared timer is whatever fired last. A plain reset here
 * would be the Speaker reset key drawn twice. So Hosting's reset sets 00:07:00 and passes
 * `reset` as the optional operation, which the module sends as one `PUT /v1/timer/<id>/reset`
 * carrying the new duration: seven minutes back on the clock, stopped, whatever ran before it.
 *
 * TWO GROUNDS, THE PAGE'S OWN. The fire key takes the dark ground the strip readouts use —
 * press it and a clock starts. The reset takes the purple the nudge and reset keys use. So the
 * four keys along the bottom right read as one timer block that is not all the same kind of key.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-hosting.js <live-full.json> <outdir>')
	process.exit(1)
}

/** The caption whose timer Hosting borrows. */
const SHARES_WITH = 'Speaker'

/** How long a host gets. */
const DURATION = '00:07:00'

/**
 * The two keys, left to right, ending against the Speaker and Worship reset keys at 3/7 and 3/8.
 *
 * `operation` is the module's optional operation on a `set`: `start` fires the clock, `reset`
 * puts the duration back and stops it.
 */
const KEYS = [
	{ cell: { row: 3, column: 5 }, value: '7 min', operation: 'start', bg: 0x1e1e28 },
	{ cell: { row: 3, column: 6 }, value: 'Reset Timer', operation: 'reset', bg: 0x2a2438 },
]

const LABEL = 'Hosting'

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'renewedvision-propresenter-api')
if (!found) throw new Error('no ProPresenter connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

const page = structuredClone(full.pages[number])

/** A control's caption, reduced to its words — the same reading the other PP1 tools do. */
const labelOf = (control) =>
	(control?.style?.layers ?? [])
		.filter((l) => l.type === 'text')
		.map((l) => l.text?.value ?? '')
		.join(' ')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

/** The name line alone, so "Hosting / 7 min" and "Hosting / Reset Timer" both read as Hosting. */
const nameOf = (control) =>
	((control?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const everyControl = function* () {
	for (const row of Object.keys(page.controls ?? {})) {
		for (const column of Object.keys(page.controls[row])) {
			yield { row, column, control: page.controls[row][column] }
		}
	}
}

/** Every timer this control names, as UUIDs, across all its steps. */
const timersIn = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter((a) => a?.definitionId === 'timerOperation')
		.map((a) => a.options?.timer_id_dropdown?.value ?? a.options?.timer_id_dropdown)
		.filter((id) => id && id !== 'manually_specify_timerid')
		.map(String)

const borrowed = new Map()
for (const { row, column, control } of everyControl()) {
	if (nameOf(control) !== SHARES_WITH) continue
	for (const uuid of timersIn(control)) {
		borrowed.set(uuid, [...(borrowed.get(uuid) ?? []), `${row}/${column}`])
	}
}
if (borrowed.size === 0) throw new Error(`no "${SHARES_WITH}" key on PP1 names a ProPresenter timer`)
if (borrowed.size > 1) {
	const listed = [...borrowed].map(([uuid, cells]) => `${uuid} (${cells.join(', ')})`).join('; ')
	throw new Error(`the "${SHARES_WITH}" keys name ${borrowed.size} different timers: ${listed}`)
}
const [uuid, cells] = [...borrowed][0]
console.log(`  ${SHARES_WITH} drives ${uuid} — from ${cells.join(', ')}`)

/** Every option `timerOperation` takes, so the action carries a complete, explicit set. */
const setTimer = (id, optionalOperation) => ({
	id,
	definitionId: 'timerOperation',
	connectionId,
	options: {
		timer_id_dropdown: v(uuid),
		timer_id_text: v(''),
		timer_operation: v('set'),
		timer_increment_value: v('30'),
		timer_type: v('countdown'),
		timer_duration: v(DURATION),
		timer_time_of_day: v('09:00:00'),
		timer_timeperiod: v('am'),
		timer_start_time: v('00:00:00'),
		timer_end_time: v(''),
		timer_allows_overrun: v(true),
		timer_optional_operation: v(optionalOperation),
		timer_new_name: v(''),
	},
	upgradeIndex: null,
	type: 'action',
})

/** A name over a value, the shape every timer key on this page already has. */
const key = ({ value, bg, notes, actions }) => ({
	type: 'button-layered',
	style: {
		layers: [
			{
				id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
				decoration: v('default'), showStatusIcons: v('default'),
			},
			{
				id: 'box0', name: 'Background', usage: 'auto', type: 'box',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
				color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
			},
			{
				id: 'text0', name: 'Name', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(4), width: v(100), height: v(34), rotation: v(0),
				text: v(LABEL), color: v(0xffffff),
				halign: v('center'), valign: v('center'),
				fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
			{
				id: 'text1', name: 'Value', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(38), width: v(100), height: v(58), rotation: v(0),
				text: v(value), color: v(0xffffff),
				halign: v('center'), valign: v('center'),
				fontsize: v(90), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
		],
	},
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes,
	},
	// No state feedback: the timer is shared, so a running Main Timer is as likely to be the
	// speaker's 45 minutes as the host's seven. A key that goes green for someone else's clock
	// is worse than a key that stays still. The strip readout is where this timer's state lives.
	feedbacks: [],
	steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

for (const spec of KEYS) {
	const { row, column } = spec.cell

	// Never silently overwrite a key someone else put here. This tool's own keys may be rebuilt.
	const occupant = page.controls[row]?.[column]
	if (occupant && nameOf(occupant) !== LABEL) {
		throw new Error(`${row}/${column} on PP1 is taken by "${labelOf(occupant)}"; move its cell in KEYS`)
	}

	const fires = spec.operation === 'start'
	page.controls[row] ??= {}
	page.controls[row][column] = key({
		value: spec.value,
		bg: spec.bg,
		notes:
			`${LABEL} — ProPresenter timer ${uuid}, the same one ${SHARES_WITH} drives. ` +
			(fires
				? `Press sets ${DURATION} and starts it. That rewrites the timer's configured duration, ` +
					`so ${SHARES_WITH}'s own reset key returns it to ${DURATION} until ${SHARES_WITH} is pressed again.`
				: `Press puts ${DURATION} back on the clock, stopped, whatever was set last.`),
		actions: [setTimer(`pp1-hosting-${spec.operation}`, spec.operation)],
	})

	console.log(`  ${row}/${column}  ${LABEL} ${spec.value.padEnd(11)} set ${DURATION}, then ${spec.operation}`)
}

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-pp1.companionconfig`)
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	})
)
console.log(`\nwrote ${path.basename(file)}`)
