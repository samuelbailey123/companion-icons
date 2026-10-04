/**
 * The six encoders on the PTZ page, each with the strip zone above it as its face.
 *
 * WHY A KNOB IS TWO CONTROLS. On this deck an encoder has no display of its own; the
 * touchstrip zone directly above it is its readout. Every knob on the rig is authored as a
 * row-4 + row-5 pair at the same column (see `src/novastar.js`), and this file emits pairs
 * for the same reason: a knob without its zone turns silently and shows nothing.
 *
 * HOW A DETENT BECOMES MOVEMENT. VISCA has no "move one notch". A drive command starts the
 * camera moving and it keeps moving until told to stop. Relative-position moves were
 * considered — the camera executes them exactly — but the camera only queues two commands
 * at a time, so a quick spin would drop most of its detents on the floor.
 *
 * ONLY THE LAST DETENT OF A TURN STOPS THE CAMERA. Until 2026-10-04 every detent fired its
 * own drive → wait → stop, on the theory that a steady turn's restarts would overlap the
 * stops. They did not: Companion runs each detent as its own concurrent chain, so while the
 * knob turned, the earlier detents' stops kept landing between the later drives and the
 * camera braked and restarted every few tens of milliseconds. Turned slowly, it was 150ms of
 * movement per click. The operator called it clicky.
 *
 * So each detent stamps the time (`unixNow()`, milliseconds) into the axis's variable, drives,
 * waits HOLD_MS, and stops only if no later detent has stamped it since. A turn becomes one
 * drive that is refreshed while the knob moves and one stop HOLD_MS after it stops; the
 * speed is still the Speed knob's, not how fast the knob is spun. SLACK_MS is the allowance
 * for the stamp landing a moment after the wait starts — the actions are dispatched together
 * — and without it the last detent could find its own stamp "too recent" and never stop.
 *
 * PAN AND TILT TRAVEL IN ONE COMMAND. `81 01 06 01 VV WW pp tt FF` carries both axes, so a
 * pan-only drive used to tell tilt to stop: turning both knobs at once made them fight. Each
 * axis now records its direction byte (1/2 moving, 3 stopped) and every pan/tilt command fills
 * the other axis's byte from it. An axis stopping while the other still moves sends its own 3
 * and the other's direction; the last axis to stop sends the module's plain `stop`, which reads
 * no variable at all, so the final stop cannot be spoiled by a bad variable.
 *
 * THE SPEED TRAVELS IN THE BYTES, NOT IN THE MODULE. The module keeps its own pan/tilt speed
 * and offers an action to set it, but that action's option is not evaluated when fed an
 * expression (measured: speed 3 and speed 24 drove at exactly the same rate, the module's
 * default 12). Its custom-command action DOES fill parameters from variables, so every drive
 * is sent as raw VISCA with the speed nibbles read from the Speed knob's variable at the
 * moment of the turn. Nothing is cached anywhere that could go stale.
 *
 * PRESSES ARE CONSERVATIVE. Pan, tilt and zoom presses just stop, because an encoder is easy
 * to knock while reaching for it and every other candidate (home, reset) would be a visible
 * jump on a camera that may be live. Focus press is one-push autofocus — safe, and the thing
 * you want most when the picture has gone soft. Speed press returns to the default; Preset
 * press is the dial's whole purpose.
 */

import { KNOB_ROW, STRIP_ROW } from '../layout.js'
import { cv, field, logicIf, raw, setVar, visca, wait, when, override } from './actions.js'
import { BG, INK, knob, strip } from './controls.js'
import * as V from './variables.js'
import { lookExec } from './web.js'

/** Milliseconds the camera keeps driving after the last detent of a turn. */
export const HOLD_MS = 200

/** A detent stamped within this long of its own wait starting still counts as the last one. */
export const SLACK_MS = 40

/** Columns that exist on the strip and encoder rows, in the order the knobs are laid out. */
export const KNOBS = { pan: 0, tilt: 2, zoom: 3, focus: 5, speed: 6, preset: 8 }

/** Module speed 1..24 squeezed onto the camera's 0..7 zoom/focus speed scale, never below 1. */
const DERIVED_SPEED = `max(1, min(7, round(${cv(V.SPEED)} * 7 / 24)))`

/** The actions that keep the derived speeds in step with the main one. */
export const deriveSpeeds = (prefix) => [
	setVar(`${prefix}-ts`, V.TILT_SPEED, `min(20, ${cv(V.SPEED)})`, true),
	setVar(`${prefix}-zs`, V.ZOOM_SPEED, DERIVED_SPEED, true),
	setVar(`${prefix}-fs`, V.FOCUS_SPEED, DERIVED_SPEED, true),
]

/**
 * Pan and tilt: the variables each axis keeps, and its direction bytes. The bytes are the
 * camera's own — pan 01 left, 02 right; tilt 01 up, 02 down — and 03 is stop on either axis.
 */
export const AXES = {
	pan: { at: V.PAN_AT, dir: V.PAN_DIR, other: 'tilt', bytes: { left: 1, right: 2 } },
	tilt: { at: V.TILT_AT, dir: V.TILT_DIR, other: 'pan', bytes: { up: 1, down: 2 } },
}

/**
 * The pan/tilt drive as raw VISCA, every field a parameter.
 *
 * `81 01 06 01 VV WW pp tt FF`: VV pan speed (nibbles 8-9) and WW tilt speed (10-11) from the
 * speed variables, pp pan direction (12-13) and tt tilt direction (14-15). The module reads
 * each parameter as a decimal number after substituting variables, so a direction is either a
 * literal byte or a direction variable.
 *
 * @param {string} pan   pan direction: '1', '2', '3' or a variable reference
 * @param {string} tilt  tilt direction, likewise
 */
export const panTiltCommand = (id, conn, pan, tilt) =>
	raw(id, conn, '81 01 06 01 00 00 00 00 FF', '8,9;10,11;12,13;14,15', [cv(V.SPEED), cv(V.TILT_SPEED), pan, tilt])

/** True once nothing has stamped `at` for HOLD_MS - SLACK_MS: the detent that waited was the last. */
const lastDetent = (id, at) => when(id, `unixNow() - ${cv(at)} >= ${HOLD_MS - SLACK_MS}`)

/**
 * One detent on pan or tilt: stamp the time, record the direction, drive, wait, and stop the
 * axis only if no later detent has come.
 *
 * @param {string} prefix     id prefix
 * @param {string} conn       connection id
 * @param {'pan'|'tilt'} axis
 * @param {string} direction  key of the axis's `bytes`
 */
const drive = (prefix, conn, axis, direction) => {
	const own = AXES[axis]
	const other = AXES[own.other]
	const byte = String(own.bytes[direction])
	// The command lists pan before tilt, whichever axis is turning.
	const command = (id, mine) =>
		axis === 'pan' ? panTiltCommand(id, conn, mine, cv(other.dir)) : panTiltCommand(id, conn, cv(other.dir), mine)
	return [
		setVar(`${prefix}-at`, own.at, 'unixNow()', true),
		setVar(`${prefix}-dir`, own.dir, byte),
		command(`${prefix}-go`, byte),
		wait(`${prefix}-wait`, HOLD_MS),
		logicIf(`${prefix}-last`, [lastDetent(`${prefix}-last-cond`, own.at)], [
			setVar(`${prefix}-rest`, own.dir, String(V.STOPPED)),
			logicIf(
				`${prefix}-other`,
				[when(`${prefix}-other-cond`, `${cv(other.dir)} == 1 || ${cv(other.dir)} == 2`)],
				[command(`${prefix}-stop-own`, String(V.STOPPED))],
				[visca(`${prefix}-stop`, conn, 'stop')]
			),
		]),
	]
}

/**
 * One detent on zoom, at the camera's variable speed: stamp, drive, wait, stop if it was the
 * last detent.
 *
 * `81 01 04 07 2p FF` is tele, `3p` wide. The speed nibble `p` is the command's ninth
 * half-byte, filled from the derived speed variable.
 */
const zoomDrive = (prefix, conn, bytes) => [
	setVar(`${prefix}-at`, V.ZOOM_AT, 'unixNow()', true),
	raw(`${prefix}-go`, conn, bytes, '9', [cv(V.ZOOM_SPEED)]),
	wait(`${prefix}-wait`, HOLD_MS),
	logicIf(`${prefix}-last`, [lastDetent(`${prefix}-last-cond`, V.ZOOM_AT)], [visca(`${prefix}-stop`, conn, 'zoomS')]),
]

/**
 * One focus detent: stamp, drive, wait, stop if it was the last — the same shape as zoom.
 *
 * `81 01 04 08 2p FF` is far, `3p` near, `p` the speed nibble.
 *
 * THE STOP LOOKS LIKE IT FAILS AND DOES NOT. `81 01 04 08 00 FF` answers `90 60 02` — a
 * syntax error — and then halts the drive anyway; measured on 2026-08-28, focus position
 * frozen within 40ms of sending it and stable thereafter. An earlier version of this file
 * read that error reply as a rejection, concluded the drives "end on their own", and sent no
 * stop at all. They do not end on their own: one detent ran the focus from 2780 to 0, the far
 * endstop, and left it there. That is what a knob that runs away feels like.
 *
 * So the error reply is noise and is ignored. If the log fills with it, filter the log rather
 * than removing the stop.
 */
const focusStep = (prefix, conn, bytes) => [
	setVar(`${prefix}-at`, V.FOCUS_AT, 'unixNow()', true),
	raw(`${prefix}-go`, conn, bytes, '9', [cv(V.FOCUS_SPEED)]),
	wait(`${prefix}-wait`, HOLD_MS),
	logicIf(`${prefix}-last`, [lastDetent(`${prefix}-last-cond`, V.FOCUS_AT)], [raw(`${prefix}-stop`, conn, '81 01 04 08 00 FF')]),
]

/** Focus drives only work in manual mode; the camera refuses them during autofocus. */
const manualFocusFirst = (prefix, conn) => visca(`${prefix}-manual`, conn, 'focusM', { bol: { value: '1', isExpression: false } })

/** A preset action with the number taken from the dial. */
const presetFromDial = (id, conn, definitionId) =>
	visca(id, conn, definitionId, {
		isText: { value: true, isExpression: false },
		presetAsNumber: { value: 1, isExpression: false },
		presetAsText: { value: cv(V.PRESET), isExpression: false },
	})

/**
 * Build the six pairs.
 *
 * @param {string} conn  the ptzoptics-visca connection id
 * @param {string} host  the camera address, for the look re-applied after a dial recall
 * @returns {{strips: Record<number, object>, knobs: Record<number, object>}} keyed by column
 */
export function buildKnobs(conn, host) {
	const strips = {}
	const knobs = {}

	strips[KNOBS.pan] = strip({
		style: { icon: 'pan', label: `concat('Pan ', ${field('pan')})`, bg: BG.strip, labelIsExpression: true },
		notes: 'Pan angle as reported by the camera, polled every second. Turns red if the camera stops answering.',
		feedbacks: [
			when('pan-strip-down', `${field('online')} != "OK"`, [
				override('pan-strip-down-bg', 'box0', 'color', BG.armed),
				override('pan-strip-down-text', 'text0', 'text', 'Camera DOWN'),
			]),
		],
	})
	knobs[KNOBS.pan] = knob({
		style: { icon: 'pan', label: 'Pan', bg: BG.knob },
		notes: `Turn to pan at the Speed knob's speed; the camera moves while the knob turns and stops ${HOLD_MS}ms after the last click. Press stops.`,
		actionSets: {
			down: [visca('pan-press-stop', conn, 'stop')],
			up: [],
			rotate_left: drive('pan-l', conn, 'pan', 'left'),
			rotate_right: drive('pan-r', conn, 'pan', 'right'),
		},
	})

	strips[KNOBS.tilt] = strip({
		style: { icon: 'tilt', label: `concat('Tilt ', ${field('tilt')})`, bg: BG.strip, labelIsExpression: true },
		notes: 'Tilt angle as reported by the camera, polled every second. Display only.',
	})
	knobs[KNOBS.tilt] = knob({
		style: { icon: 'tilt', label: 'Tilt', bg: BG.knob },
		notes: `Turn clockwise to tilt up, anticlockwise down, at the Speed knob's speed; stops ${HOLD_MS}ms after the last click. Press stops.`,
		actionSets: {
			down: [visca('tilt-press-stop', conn, 'stop')],
			up: [],
			rotate_left: drive('tilt-l', conn, 'tilt', 'down'),
			rotate_right: drive('tilt-r', conn, 'tilt', 'up'),
		},
	})

	strips[KNOBS.zoom] = strip({
		style: { icon: 'zoom-in', label: `concat('Zoom ', ${field('zoom')})`, bg: BG.strip, labelIsExpression: true },
		notes: 'Zoom position as a percentage of the lens range, polled every second. Display only.',
	})
	knobs[KNOBS.zoom] = knob({
		style: { icon: 'zoom-in', label: 'Zoom', bg: BG.knob },
		notes: 'Turn clockwise to zoom in, anticlockwise out. Speed follows the Speed knob. Press stops.',
		actionSets: {
			down: [visca('zoom-press-stop', conn, 'zoomS')],
			up: [],
			rotate_left: zoomDrive('zoom-l', conn, '81 01 04 07 30 FF'),
			rotate_right: zoomDrive('zoom-r', conn, '81 01 04 07 20 FF'),
		},
	})

	strips[KNOBS.focus] = strip({
		style: { icon: 'focus', label: `concat('Focus ', ${field('focus')})`, bg: BG.strip, labelIsExpression: true },
		notes: 'Focus mode as reported by the camera. Display only.',
	})
	knobs[KNOBS.focus] = knob({
		style: { icon: 'focus', label: 'Focus', bg: BG.knob },
		notes:
			'Turn to focus by hand (switches the camera to manual focus). ' +
			'Press for one-push autofocus: the camera focuses once and holds it.',
		actionSets: {
			down: [raw('focus-press-onepush', conn, '81 01 04 38 04 FF')],
			up: [],
			rotate_left: [manualFocusFirst('focus-l', conn), ...focusStep('focus-l', conn, '81 01 04 08 30 FF')],
			rotate_right: [manualFocusFirst('focus-r', conn), ...focusStep('focus-r', conn, '81 01 04 08 20 FF')],
		},
	})

	strips[KNOBS.speed] = strip({
		style: { icon: 'speed', label: `Speed ${cv(V.SPEED)}`, bg: BG.strip },
		notes: 'Drive speed for pan, tilt, zoom and focus, 1 (slow) to 24 (fast). Display only.',
	})
	knobs[KNOBS.speed] = knob({
		style: { icon: 'speed', label: 'Speed', bg: BG.knob },
		notes: `Turn to change drive speed 1-24. Press resets to ${V.DEFAULT_SPEED}.`,
		actionSets: {
			down: [setVar('speed-reset', V.SPEED, String(V.DEFAULT_SPEED)), ...deriveSpeeds('speed-reset')],
			up: [],
			rotate_left: [setVar('speed-down', V.SPEED, `max(1, ${cv(V.SPEED)} - 1)`, true), ...deriveSpeeds('speed-down')],
			rotate_right: [setVar('speed-up', V.SPEED, `min(24, ${cv(V.SPEED)} + 1)`, true), ...deriveSpeeds('speed-up')],
		},
	})

	strips[KNOBS.preset] = strip({
		style: { icon: 'preset', label: `Preset ${cv(V.PRESET)}`, bg: BG.strip },
		notes: 'The preset the dial is on. Turns red while Save is armed: the next press will overwrite it.',
		feedbacks: [
			when('preset-strip-armed', `${cv(V.ARMED)} == 1`, [
				override('preset-strip-armed-bg', 'box0', 'color', BG.armed),
				override('preset-strip-armed-text', 'text0', 'text', `SAVE to ${cv(V.PRESET)}`),
				override('preset-strip-armed-icon', 'image0', 'base64Image', '$(image:preset-save-ink)'),
				override('preset-strip-armed-label', 'text0', 'color', INK),
			]),
		],
	})
	knobs[KNOBS.preset] = knob({
		style: { icon: 'preset', label: 'Preset', bg: BG.knob },
		notes: 'Turn to choose a preset 1-254, press to recall it and put the saved look back. With Save armed, press saves the current shot to it instead.',
		actionSets: {
			down: [
				logicIf(
					'preset-press',
					[when('preset-press-armed', `${cv(V.ARMED)} == 1`)],
					[
						presetFromDial('preset-press-save', conn, 'setPreset'),
						setVar('preset-press-disarm', V.ARMED, '0'),
						setVar('preset-press-last-s', V.LAST_PRESET, cv(V.PRESET), true),
					],
					[
						presetFromDial('preset-press-recall', conn, 'recallPreset'),
						setVar('preset-press-last-r', V.LAST_PRESET, cv(V.PRESET), true),
						lookExec('preset-press-look', host, 'apply'),
					]
				),
			],
			up: [],
			rotate_left: [setVar('preset-down', V.PRESET, `${cv(V.PRESET)} <= 1 ? 254 : ${cv(V.PRESET)} - 1`, true)],
			rotate_right: [setVar('preset-up', V.PRESET, `${cv(V.PRESET)} >= 254 ? 1 : ${cv(V.PRESET)} + 1`, true)],
		},
	})

	return { strips, knobs }
}

/** Rows the pairs occupy, re-exported so the page assembler does not reach into layout. */
export const ROWS = { strip: STRIP_ROW, knob: KNOB_ROW }
