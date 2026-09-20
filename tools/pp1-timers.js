/**
 * PP1: two clocks on the strip, and a key per preset that fires one.
 *
 * Usage: node tools/pp1-timers.js <live-full.json> <outdir>
 *
 * THE ORIGINAL DEFECT. Both timer zones drove the SAME ProPresenter timer — Speaker set it to
 * 45:00 and started it, Worship set the same timer to 25:00 and started it. They were two
 * presets for one clock, so starting either wiped the other and both readouts always showed
 * whichever ran last. ProPresenter already had four independent timers; Speaker took Main
 * Timer, Worship moved to Segment Countdown, and they stopped touching each other.
 *
 * THE SECOND DEFECT, WHICH THIS PASS FIXES. Hosting then joined Speaker on Main Timer — the
 * right call, because the host sits down before the speaker stands up and the strip had no
 * zone to spare. But the strip zone was still captioned "Speaker", so firing Hosting left a
 * zone reading "Speaker" over a seven-minute countdown. A readout named after a PRESET lies
 * the moment one clock carries two.
 *
 * So the strip is now named after the CLOCKS, not the presets, and the left readout names
 * whichever preset last fired it: every preset key writes its own name into
 * `pp1_main_label` as it sets the duration, and the readout's name line reads that variable.
 * The strip says "Hosting 7:00", then "Speaker 45:00", and is never wrong. Worship is
 * captioned literally, because only one preset ever fires Segment Countdown.
 *
 * THE LAYOUT FOLLOWS FROM THAT. Two live clocks take the left of the strip, the four
 * adjusters take the right, and the presets come off the strip onto real keys — three fires
 * on row 3 with their three resets beside them. Display and control stop sharing a control:
 * the strip zones carry no action at all now, so a clock cannot be restarted by a thumb
 * brushing the readout while you read it.
 *
 * ZONES SHOW STATE, WHICH NOTHING DID BEFORE. The module publishes `_state` per timer —
 * running, stopped, or overran. A stopped 00:00 and a running 00:00 looked identical; overrun
 * looked like nothing at all, on the one page where a timer running past zero is the whole
 * point of watching it. The fire and reset keys carry no state feedback: Main Timer running
 * is as likely to be the speaker's 45 minutes as the host's seven, and a key that goes green
 * for another preset's clock is worse than a key that stays still.
 *
 * EVERY RESET IS A `set`, NOT A `reset`. ProPresenter's reset returns a timer to its
 * CONFIGURED duration, which on a shared clock is whatever fired last — so a plain reset on
 * Main Timer is the same key twice over, and after Hosting has fired, "Speaker — Reset" would
 * put back 7:00. Each reset instead sets its own duration and passes `reset` as the optional
 * operation, which the module sends as one `PUT /v1/timer/<id>/reset` carrying that duration:
 * this preset's time back on the clock, stopped, whatever ran before it.
 *
 * ADJUSTMENT IS PER CLOCK, NOT MODAL. Each timer keeps its own minus and plus rather than a
 * shared pair acting on "the selected timer". With two clocks running, a shared adjuster needs
 * a mode, and a mode is a thing to get wrong while a service waits. `increment` takes SECONDS
 * and a negative subtracts — the module's own tooltip — so one minute is ±60. It was five,
 * which is a blunt instrument on a seven-minute hosting slot.
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
 * The two clocks, as ProPresenter holds them.
 *
 * `uuid` addresses the timer in actions; `variable` is the same id with the dashes stripped,
 * which is how the module names the variables it publishes. Targeting by UUID rather than by
 * name — the module accepts either — because a UUID survives someone renaming a timer in
 * ProPresenter, and a rename would otherwise silently break the button.
 */
const CLOCKS = {
	main: {
		uuid: '8F66EEB4-82F2-4BFF-A8A6-DAC0B3EA7AAE',
		variable: 'timer_8F66EEB482F24BFFA8A6DAC0B3EA7AAE',
		proName: 'Main Timer',
	},
	segment: {
		uuid: '28FAF666-E93E-4396-B603-1F8B4330DAE5',
		variable: 'timer_28FAF666E93E4396B6031F8B4330DAE5',
		proName: 'Segment Countdown',
	},
}

/** The custom variable naming whichever preset last fired Main Timer. */
const MAIN_LABEL = 'pp1_main_label'

/**
 * The presets, left to right along row 3. Two share Main Timer; only they write the label.
 *
 * Hosting leads because it runs first in the service, and Speaker sits between it and Worship
 * so the two Main Timer presets stay adjacent.
 */
const PRESETS = [
	{ label: 'Hosting', clock: 'main', duration: '00:07:00', caption: '7 min' },
	{ label: 'Speaker', clock: 'main', duration: '00:45:00', caption: '45 min' },
	{ label: 'Worship', clock: 'segment', duration: '00:25:00', caption: '25 min' },
]

/** Row 3: the three fires, then the three resets, in the same order. */
const KEY_ROW = 3
const FIRE_COLUMNS = [3, 4, 5]
const RESET_COLUMNS = [6, 7, 8]

/** Seconds a nudge moves the clock. Negative subtracts, per the module's own tooltip. */
const NUDGE = 60

/**
 * Strip layout: the two clocks first, then the four adjusters.
 *
 * Six zones, read left to right. Displays on the left, controls on the right — the readouts
 * no longer double as preset keys, so the strip is a strip of information with a bank of
 * adjusters beside it, and each adjuster names the clock it moves.
 */
const ZONES = KNOB_COLS // [0, 2, 3, 5, 6, 8]
const READOUT_SLOTS = { main: 0, segment: 1 }
const NUDGE_SLOTS = { main: [2, 3], segment: [4, 5] }

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

/**
 * Two stacked text layers: a name over a value.
 *
 * The same shape for a strip zone and for a key. The layers are sized in percentages, so one
 * definition covers both the 200x100 touchstrip zone and the 112x112 key.
 */
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
const timerAction = (id, connectionId, uuid, overrides) => ({
	id,
	definitionId: 'timerOperation',
	connectionId,
	options: {
		timer_id_dropdown: v(uuid),
		timer_id_text: v(''),
		timer_operation: v('start'),
		timer_increment_value: v('30'),
		timer_type: v('countdown'),
		timer_duration: v('00:05:00'),
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

/** Write a preset's own name into the label variable, so the readout can say whose clock it is. */
const nameTheClock = (id, label) => ({
	id,
	definitionId: 'custom_variable_set_value',
	connectionId: 'internal',
	options: { name: v(MAIN_LABEL), create: v(true), value: v(label) },
	type: 'action',
	children: {},
})

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'renewedvision-propresenter-api')
if (!found) throw new Error('no ProPresenter connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

const page = structuredClone(full.pages[number])

/** A control's name line, reduced to its words — how the cell guard recognises its own keys. */
const nameOf = (control) =>
	((control?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const OURS = new Set([...PRESETS.map((p) => p.label), `$(internal:custom_${MAIN_LABEL})`, 'Worship'])

// ---------------------------------------------------------------- the strip

const strip = {}

for (const [clockName, slot] of Object.entries(READOUT_SLOTS)) {
	const clock = CLOCKS[clockName]
	const state = `$(propresenter:${clock.variable}_state)`
	const dynamic = clockName === 'main'

	strip[ZONES[slot]] = zone({
		name: dynamic ? `$(internal:custom_${MAIN_LABEL})` : 'Worship',
		value: `$(propresenter:${clock.variable})`,
		bg: REST_BG,
		notes:
			`ProPresenter "${clock.proName}" (${clock.uuid}). Display only — no action, so it cannot be ` +
			`restarted by a thumb. ` +
			(dynamic
				? `The name is $(internal:custom_${MAIN_LABEL}), written by whichever preset key last fired this clock.`
				: `Only the Worship preset fires this clock, so the name is fixed.`),
		feedbacks: [
			lit(`pp1-${clockName}-running`, `${state} == "running"`, RUNNING_BG),
			// Overrun last: a timer past zero outranks the fact that it is still running.
			lit(`pp1-${clockName}-overran`, `${state} == "overran"`, OVERRAN_BG),
		],
		actions: [],
	})

	// ASCII hyphen, not a typographic minus: U+2212 is not in the deck's font and renders as a
	// missing-glyph box. Caught in the preview before it reached the surface.
	const [minusSlot, plusSlot] = NUDGE_SLOTS[clockName]
	for (const [slotIndex, sign, seconds] of [
		[minusSlot, '-', -NUDGE],
		[plusSlot, '+', NUDGE],
	]) {
		strip[ZONES[slotIndex]] = zone({
			name: dynamic ? `$(internal:custom_${MAIN_LABEL})` : 'Worship',
			value: `${sign}${NUDGE / 60} min`,
			bg: NUDGE_BG,
			notes:
					`${sign}${NUDGE / 60} minute${NUDGE === 60 ? '' : 's'} on "${clock.proName}". ` +
					`Applies to the running clock.`,
			actions: [
				timerAction(`pp1-${clockName}-${seconds}`, connectionId, clock.uuid, {
					timer_operation: v('increment'),
					timer_increment_value: v(String(seconds)),
				}),
			],
		})
	}
}

page.controls[STRIP_ROW] = strip

// ------------------------------------------------------------- the presets

page.controls[KEY_ROW] ??= {}

for (const [index, preset] of PRESETS.entries()) {
	const clock = CLOCKS[preset.clock]
	const writesLabel = preset.clock === 'main'

	for (const [kind, column, optional, caption, bg] of [
		['fire', FIRE_COLUMNS[index], 'start', preset.caption, REST_BG],
		['reset', RESET_COLUMNS[index], 'reset', 'Reset', NUDGE_BG],
	]) {
		// Never silently overwrite a key someone else put here. Our own keys may be rebuilt.
		const occupant = page.controls[KEY_ROW][column]
		if (occupant && !OURS.has(nameOf(occupant))) {
			throw new Error(`${KEY_ROW}/${column} on PP1 is taken by "${nameOf(occupant)}"; move the columns`)
		}

		const actions = [
			timerAction(`pp1-${preset.label.toLowerCase()}-${kind}`, connectionId, clock.uuid, {
				timer_operation: v('set'),
				timer_duration: v(preset.duration),
				timer_optional_operation: v(optional),
			}),
		]
		if (writesLabel) actions.push(nameTheClock(`pp1-${preset.label.toLowerCase()}-${kind}-label`, preset.label))

		page.controls[KEY_ROW][column] = zone({
			name: preset.label,
			value: caption,
			bg,
			notes:
				`${preset.label} — ProPresenter "${clock.proName}" (${clock.uuid}). ` +
				(kind === 'fire'
					? `Press sets ${preset.duration} and starts it.`
					: `Press puts ${preset.duration} back on the clock, stopped, whatever was set last.`) +
				(writesLabel ? ` Also writes "${preset.label}" to ${MAIN_LABEL}, which names the strip readout.` : ''),
			actions,
		})
	}
}

// ---------------------------------------------------------------- reporting

for (const [slot, column] of ZONES.entries()) {
	const control = strip[column]
	if (!control) continue
	const texts = control.style.layers.filter((l) => l.type === 'text').map((l) => l.text.value)
	console.log(`  strip ${STRIP_ROW}/${column} (slot ${slot})  ${texts.join('  ')}`)
}
for (const column of [...FIRE_COLUMNS, ...RESET_COLUMNS].sort((a, b) => a - b)) {
	const texts = page.controls[KEY_ROW][column].style.layers.filter((l) => l.type === 'text').map((l) => l.text.value)
	console.log(`  key   ${KEY_ROW}/${column}  ${texts.join('  ')}`)
}
console.log(`\n  Hosting + Speaker -> ${CLOCKS.main.proName}, named live by $(internal:custom_${MAIN_LABEL})`)
console.log(`  Worship -> ${CLOCKS.segment.proName}`)

// The label variable must exist before the readout can resolve it; `create-vars` reads this.
const custom_variables = {
	...(full.custom_variables ?? {}),
	[MAIN_LABEL]: {
		description: 'Which PP1 preset last fired ProPresenter Main Timer — names the left strip readout',
		defaultValue: 'Speaker',
		persistCurrentValue: true,
		sortOrder: Math.max(0, ...Object.values(full.custom_variables ?? {}).map((c) => c.sortOrder ?? 0)) + 1,
	},
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
		custom_variables,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	})
)
console.log(`\nwrote ${path.basename(file)}`)
