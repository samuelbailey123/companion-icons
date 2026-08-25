/**
 * PP1: give each timer its own ProPresenter timer, and a way to nudge it mid-service.
 *
 * Usage: node tools/pp1-timers.js <live-full.json> <outdir>
 *
 * THE DEFECT THIS FIXES. Both timer zones drove the SAME ProPresenter timer — Speaker set it to
 * 45:00 and started it, Worship set the same timer to 25:00 and started it. They were two
 * presets for one clock, so starting either wiped the other and both readouts always showed
 * whichever ran last. You could never see the speaker's remaining time and the worship
 * countdown at once, which is the entire reason for having two.
 *
 * ProPresenter already had four independent timers; nothing needed creating. Speaker keeps Main
 * Timer, Worship moves to Segment Countdown, and they no longer touch each other.
 *
 * THE ZONES NOW SHOW STATE, WHICH NOTHING DID BEFORE. The module publishes `_state` per timer —
 * running, stopped, or overran. A stopped 00:00 and a running 00:00 looked identical; overrun
 * looked like nothing at all, on the one page where a timer running past zero is the whole
 * point of watching it.
 *
 * ADJUSTMENT IS PER TIMER, NOT MODAL. Each timer gets its own minus and plus beside it rather
 * than a shared pair acting on "the selected timer". With two clocks running, a shared adjuster
 * needs a mode, and a mode is a thing to get wrong while a service waits. `increment` takes
 * SECONDS and a negative subtracts — the module's own tooltip — so five minutes is ±300.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { KNOB_COLS, STRIP_ROW } from '../src/layout.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-timers.js <live-full.json> <outdir>')
	process.exit(1)
}

/**
 * The two timers, as ProPresenter holds them.
 *
 * `uuid` addresses the timer in actions; `variable` is the same id with the dashes stripped,
 * which is how the module names the variables it publishes. Targeting by UUID rather than by
 * name — the module accepts either — because a UUID survives someone renaming a timer in
 * ProPresenter, and a rename would otherwise silently break the button.
 */
const TIMERS = [
	{
		label: 'Speaker',
		uuid: '8F66EEB4-82F2-4BFF-A8A6-DAC0B3EA7AAE',
		variable: 'timer_8F66EEB482F24BFFA8A6DAC0B3EA7AAE',
		duration: '00:45:00',
		proName: 'Main Timer',
	},
	{
		label: 'Worship',
		uuid: '28FAF666-E93E-4396-B603-1F8B4330DAE5',
		variable: 'timer_28FAF666E93E4396B6031F8B4330DAE5',
		duration: '00:25:00',
		proName: 'Segment Countdown',
	},
]

/** Seconds a nudge moves the clock. Negative subtracts, per the module's own tooltip. */
const NUDGE = 300

/**
 * Strip layout: each timer takes a readout and its own pair of adjusters, in that order.
 *
 * Six zones, two groups of three. The gap the deck's own geometry puts between columns 3 and 5
 * falls exactly between the groups, so the two timers read as two things rather than a row of
 * six buttons.
 */
const ZONES = KNOB_COLS // [0, 2, 3, 5, 6, 8]

const REST_BG = 0x1e1e28
const RUNNING_BG = 0x14361f
const OVERRAN_BG = 0xcc0000
const NUDGE_BG = 0x2a2438

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

const lit = (id, expression, bg) => ({
	id,
	type: 'feedback',
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	isInverted: v(false),
	styleOverrides: [{ overrideId: `${id}-bg`, elementId: 'box0', elementProperty: 'color', override: v(bg) }],
})

/** Two stacked text layers on a strip zone: a name over a value. */
const zone = ({ name, value, bg, notes, feedbacks = [], actions = [] }) => ({
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
				text: v(name), color: v(0xffffff),
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
	feedbacks,
	steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

/** Every option `timerOperation` takes, so each action carries a complete, explicit set. */
const timerAction = (id, connectionId, timer, overrides) => ({
	id,
	definitionId: 'timerOperation',
	connectionId,
	options: {
		timer_id_dropdown: v(timer.uuid),
		timer_id_text: v(''),
		timer_operation: v('start'),
		timer_increment_value: v('30'),
		timer_type: v('countdown'),
		timer_duration: v(timer.duration),
		timer_time_of_day: v('09:00:00'),
		timer_timeperiod: v('am'),
		timer_start_time: v('00:00:00'),
		timer_end_time: v(''),
		timer_allows_overrun: v(true),
		timer_optional_operation: v('start'),
		timer_new_name: v(''),
		...overrides,
	},
	upgradeIndex: null,
	type: 'action',
})

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'renewedvision-propresenter-api')
if (!found) throw new Error('no ProPresenter connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

const page = structuredClone(full.pages[number])
const strip = {}
let slot = 0

for (const timer of TIMERS) {
	const state = `$(propresenter:${timer.variable}_state)`

	// The readout: press sets the duration and starts it, exactly as before.
	strip[ZONES[slot++]] = zone({
		name: timer.label,
		value: `$(propresenter:${timer.variable})`,
		bg: REST_BG,
		notes: `${timer.label} — ProPresenter "${timer.proName}" (${timer.uuid}). Press sets ${timer.duration} and starts it.`,
		feedbacks: [
			lit(`pp1-${timer.label}-running`, `${state} == "running"`, RUNNING_BG),
			// Overrun last: a timer past zero outranks the fact that it is still running.
			lit(`pp1-${timer.label}-overran`, `${state} == "overran"`, OVERRAN_BG),
		],
		actions: [
			timerAction(`pp1-${timer.label}-set`, connectionId, timer, {
				timer_operation: v('set'),
				timer_optional_operation: v('start'),
			}),
		],
	})

	// ASCII hyphen, not a typographic minus: U+2212 is not in the deck's font and renders as a
	// missing-glyph box. Caught in the preview before it reached the surface.
	for (const [sign, seconds] of [['-', -NUDGE], ['+', NUDGE]]) {
		strip[ZONES[slot++]] = zone({
			name: timer.label,
			value: `${sign}${NUDGE / 60} min`,
			bg: NUDGE_BG,
			notes: `${sign}${NUDGE / 60} minutes on ${timer.label} ("${timer.proName}"). Applies to the running timer.`,
			actions: [
				timerAction(`pp1-${timer.label}-${seconds}`, connectionId, timer, {
					timer_operation: v('increment'),
					timer_increment_value: v(String(seconds)),
				}),
			],
		})
	}
}

if (slot > ZONES.length) throw new Error(`${slot} zones needed but the strip has ${ZONES.length}`)

page.controls[STRIP_ROW] = strip

for (const [column, control] of Object.entries(strip)) {
	const texts = control.style.layers.filter((l) => l.type === 'text').map((l) => l.text.value)
	console.log(`  ${STRIP_ROW}/${column}  ${texts.join('  ')}`)
}
console.log(`  Speaker -> ${TIMERS[0].proName}, Worship -> ${TIMERS[1].proName} — separate timers, no longer shared`)

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
