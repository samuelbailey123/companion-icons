/**
 * MA2: one knob for the one fader that runs the lights.
 *
 * Sam, 2026-10-27: "I just have 1 fader. Fader 1. on fader page 5. it's the only control now it
 * does house lights stage lights everything." So the MA2 page keeps its folder row and BLACKOUT,
 * and gains one knob: the first, which sets Executor 5.1 and shows its level on the touchstrip
 * above it. Everything else on the page goes: the four knobs on Executors 1.1-1.4, the executor
 * keys 101-109 and Go Next / Go Back all drove parts of the show the one fader has replaced.
 *
 * OPEN LOOP. The grandMA2 module reports nothing back (its one variable is the last Telnet echo),
 * so the strip shows the level the deck last SENT. Move the fader on the console and the strip is
 * wrong until the knob is next turned, and that turn starts from the strip's number.
 *
 * MODULE API 1.8. The grandMA2 module cannot evaluate expression options, so each turn first
 * clamps and stores the new level in a custom variable, then sends a command that reads it back
 * by plain `$(...)` interpolation, which Companion fills in before the module sees it.
 *
 * IDEMPOTENT. A rerun over its own output rebuilds the same page.
 */
import { KNOB_ROW, STRIP_ROW } from './layout.js'

export const MODULE_ID = 'malighting-grandma2'
/** Fader 1 on fader page 5, in grandMA2's page.executor form. */
export const EXECUTOR = '5.1'
export const NAME = 'Lights'
/** Sam calls it Fader 1, and the variable of that name already held the deck's first knob. */
export const VARIABLE = 'fader1_level'
export const DESCRIPTION = `Lights knob (Executor ${EXECUTOR}): the level the deck last sent, 0-100. Not read back from the console`
/** One detent, in percent: 20 detents from out to full, and every level a multiple, so 0 and 100 are exact. */
export const STEP = 5
/** The first knob, and the strip segment above it. */
export const COLUMN = 0
/** Prefix of every id this file writes. */
export const MARK = 'ma2-lights'

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/** The grandMA2 connection's id. */
export function findMa2(full) {
	const found = Object.entries(full.instances ?? {}).find(([, i]) => i?.moduleId === MODULE_ID)
	if (!found) throw new Error('no grandMA2 connection on this rig')
	return found[0]
}

const actionsOf = (control) =>
	Object.values(control.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets))
		.filter(Array.isArray)
		.flat()

/** The BLACKOUT key: the one that sends the desk's Blackout command. */
export const isBlackout = (control, connectionId) =>
	actionsOf(control).some(
		(a) => a.connectionId === connectionId && a.definitionId === 'command' && /^blackout$/i.test(String(a.options.command.value).trim()),
	)

const action = (suffix, connectionId, definitionId, options) => ({
	id: `${MARK}-${suffix}`,
	definitionId,
	connectionId,
	options,
	upgradeIndex: null,
	type: 'action',
})

/** Store the clamped level first, then send it: the order is what lets the module see a number. */
const turn = (connectionId, dir) => [
	action(`${dir}-level`, 'internal', 'custom_variable_set_value', {
		name: v(VARIABLE),
		value: expr(dir === 'up' ? `min(100, $(this:current) + ${STEP})` : `max(0, $(this:current) - ${STEP})`),
	}),
	action(`${dir}-send`, connectionId, 'command', { command: v(`Executor ${EXECUTOR} At $(internal:custom_${VARIABLE})`) }),
]

/**
 * A text layer. The name is set at 36 because Companion shrinks text to fit by breaking words: at
 * 70 or 51 it drew "Light / s" on two lines (rendered on the rig, 2026-10-27).
 */
const text = (id, value, x, width, halign, color, size = 51) => ({
	id, name: id === 'text0' ? 'Name' : 'Level', usage: 'auto', type: 'text',
	enabled: v(true), opacity: v(100), x: v(x), y: v(2), width: v(width), height: v(56), rotation: v(0),
	text: v(value), color: v(color), halign: v(halign), valign: v('center'),
	fontsize: v(size), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
})
const NAME_SIZE = 36

const box = (id, name, x, y, width, height, color) => ({
	id, name, usage: 'auto', type: 'box',
	enabled: v(true), opacity: v(100), x: v(x), y: v(y), width, height: v(height), rotation: v(0),
	color, borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
})

const canvas = { id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') }

/** The knob: turn to set Executor 5.1, press to select it on the desk. */
export function knob(connectionId) {
	return {
		type: 'button-layered',
		style: { layers: [canvas, { ...text('text0', NAME, 0, 100, 'center', 0xffffff, NAME_SIZE), name: 'Text', y: v(0), height: v(100) }] },
		options: {
			stepProgression: 'auto', stepExpression: '', rotaryActions: true, canModifyStyleInApis: false,
			notes: `${NAME}: Fader 1 on fader page 5 (Executor ${EXECUTOR}), the only lighting control. Turn to set 0-100 in steps of ${STEP}; press to select it on the desk. Built by tools/ma2-page.js.`,
		},
		feedbacks: [],
		steps: {
			0: {
				action_sets: {
					down: [action('select', connectionId, 'command', { command: v(`Select Executor ${EXECUTOR}`) })],
					up: [],
					rotate_left: turn(connectionId, 'down'),
					rotate_right: turn(connectionId, 'up'),
				},
				options: { runWhileHeld: [] },
			},
		},
		localVariables: [],
	}
}

/** The strip segment above it: the name, the level the deck last sent, and a bar of it. */
export function strip() {
	const level = `$(internal:custom_${VARIABLE})`
	return {
		type: 'button-layered',
		style: {
			layers: [
				canvas,
				box('box0', 'Background', 0, 0, v(100), 100, v(0x121212)),
				box('track0', 'Track', 6, 64, v(88), 22, v(0x1f2937)),
				// 88% of the segment is the full track. A box whose width is an expression, because
				// Companion's gauge element drew full width whatever its value.
				box('fill0', 'Level', 6, 64, expr(`max(0, min(100, ${level})) * 0.88`), 22, v(0x38bdf8)),
				text('text0', NAME, 3, 58, 'left', 0xffffff, NAME_SIZE),
				text('text1', `${level}%`, 60, 37, 'right', 0x38bdf8),
			],
		},
		options: {
			stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false,
			notes: `${NAME}: the level the deck last sent to Executor ${EXECUTOR}. Not read back from the console.`,
		},
		feedbacks: [],
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
		localVariables: [],
	}
}

/**
 * The MA2 page with only the folder row, BLACKOUT where it sits, and the Lights knob and strip.
 *
 * @returns {{ number: number, page: object, removed: string[] }} the page and the cells it emptied
 */
export function ma2Page(full) {
	const connectionId = findMa2(full)
	const found = Object.entries(full.pages).find(([, p]) => p.name === 'MA2')
	if (!found) throw new Error('no MA2 page on this rig')
	const [number, source] = found

	const page = structuredClone(source)
	page.controls = { 0: structuredClone(source.controls[0] ?? {}) }
	const removed = []
	let blackout = 0
	for (const [r, cols] of Object.entries(source.controls)) {
		if (Number(r) === 0) continue
		for (const [c, control] of Object.entries(cols)) {
			if (Number(r) < STRIP_ROW && isBlackout(control, connectionId)) {
				;(page.controls[r] ??= {})[c] = structuredClone(control)
				blackout++
			} else if (!(Number(c) === COLUMN && (Number(r) === STRIP_ROW || Number(r) === KNOB_ROW))) {
				removed.push(`r${r}c${c}`)
			}
		}
	}
	if (blackout !== 1) throw new Error(`expected one BLACKOUT key on the MA2 page, found ${blackout}`)

	;(page.controls[STRIP_ROW] ??= {})[COLUMN] = strip()
	;(page.controls[KNOB_ROW] ??= {})[COLUMN] = knob(connectionId)
	return { number: Number(number), page, removed }
}
