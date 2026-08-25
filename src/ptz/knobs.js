/**
 * The six encoders on the PTZ page, each with the strip zone above it as its face.
 *
 * WHY A KNOB IS TWO CONTROLS. On this deck an encoder has no display of its own; the
 * touchstrip zone directly above it is its readout. Every knob on the rig is authored as a
 * row-4 + row-5 pair at the same column (see `src/novastar.js`), and this file emits pairs
 * for the same reason: a knob without its zone turns silently and shows nothing.
 *
 * HOW A DETENT BECOMES MOVEMENT. VISCA has no "move one notch". A drive command starts the
 * camera moving and it keeps moving until told to stop, so each detent fires
 * drive → wait → stop. Turn steadily and the restarts overlap the stops, so the camera
 * moves for as long as the knob turns and halts a beat after it stops; the speed of that
 * movement is the Speed knob's, not how fast the knob is spun. Relative-position moves were
 * considered — the camera executes them exactly — but the camera only queues two commands
 * at a time, so a quick spin would drop most of its detents on the floor.
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

/** Milliseconds the camera keeps driving after a detent before the stop lands. */
export const DRIVE_MS = 150

/** Columns that exist on the strip and encoder rows, in the order the knobs are laid out. */
export const KNOBS = { pan: 0, tilt: 2, zoom: 3, focus: 5, speed: 6, preset: 8 }

/** Module speed 1..24 squeezed onto the camera's 0..7 zoom/focus speed scale, never below 1. */
const DERIVED_SPEED = `max(1, min(7, round(${cv(V.SPEED)} * 7 / 24)))`

/** The actions that keep the derived speeds in step with the main one. */
const deriveSpeeds = (prefix) => [
	setVar(`${prefix}-ts`, V.TILT_SPEED, `min(20, ${cv(V.SPEED)})`, true),
	setVar(`${prefix}-zs`, V.ZOOM_SPEED, DERIVED_SPEED, true),
	setVar(`${prefix}-fs`, V.FOCUS_SPEED, DERIVED_SPEED, true),
]

/**
 * One pan/tilt drive command at the knob's speed, as raw VISCA.
 *
 * `81 01 06 01 VV WW dd dd FF`: VV is pan speed (nibbles 8-9), WW tilt speed (10-11), both
 * filled from the speed variables; the direction bytes are the camera's own table.
 */
export const DIRECTION = {
	up: '03 01', down: '03 02', left: '01 03', right: '02 03',
	upLeft: '01 01', upRight: '02 01', downLeft: '01 02', downRight: '02 02',
}
export const driveCommand = (id, conn, direction) =>
	raw(id, conn, `81 01 06 01 00 00 ${DIRECTION[direction]} FF`, '8,9;10,11', [cv(V.SPEED), cv(V.TILT_SPEED)])

/**
 * A pan or tilt drive in one direction for one detent: drive, wait, stop.
 *
 * @param {string} prefix   id prefix
 * @param {string} conn     connection id
 * @param {string} direction key of DIRECTION
 */
const drive = (prefix, conn, direction) => [
	driveCommand(`${prefix}-go`, conn, direction),
	wait(`${prefix}-wait`, DRIVE_MS),
	visca(`${prefix}-stop`, conn, 'stop'),
]

/**
 * Zoom at the camera's variable speed, through the module's custom-command action.
 *
 * `81 01 04 07 2p FF` is tele, `3p` wide. The speed nibble `p` is the command's ninth
 * half-byte, filled from the derived speed variable.
 */
const zoomDrive = (prefix, conn, bytes) => [
	raw(`${prefix}-go`, conn, bytes, '9', [cv(V.ZOOM_SPEED)]),
	wait(`${prefix}-wait`, DRIVE_MS),
	visca(`${prefix}-stop`, conn, 'zoomS'),
]

/**
 * One focus step. `81 01 04 08 2p FF` is far, `3p` near, `p` the speed nibble.
 *
 * No stop is sent: this camera answers the standard focus-stop with a syntax error, and
 * its focus drives end on their own (measured — the focus position settles within the
 * detent and never runs on). Sending the stop anyway would only fill the log.
 */
const focusStep = (prefix, conn, bytes) => raw(`${prefix}-go`, conn, bytes, '9', [cv(V.FOCUS_SPEED)])

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
 * @returns {{strips: Record<number, object>, knobs: Record<number, object>}} keyed by column
 */
export function buildKnobs(conn) {
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
		notes: `Turn to pan at the Speed knob's speed; each detent drives for ${DRIVE_MS}ms. Press stops.`,
		actionSets: {
			down: [visca('pan-press-stop', conn, 'stop')],
			up: [],
			rotate_left: drive('pan-l', conn, 'left'),
			rotate_right: drive('pan-r', conn, 'right'),
		},
	})

	strips[KNOBS.tilt] = strip({
		style: { icon: 'tilt', label: `concat('Tilt ', ${field('tilt')})`, bg: BG.strip, labelIsExpression: true },
		notes: 'Tilt angle as reported by the camera, polled every second. Display only.',
	})
	knobs[KNOBS.tilt] = knob({
		style: { icon: 'tilt', label: 'Tilt', bg: BG.knob },
		notes: `Turn clockwise to tilt up, anticlockwise down, at the Speed knob's speed. Press stops.`,
		actionSets: {
			down: [visca('tilt-press-stop', conn, 'stop')],
			up: [],
			rotate_left: drive('tilt-l', conn, 'down'),
			rotate_right: drive('tilt-r', conn, 'up'),
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
			rotate_left: [manualFocusFirst('focus-l', conn), focusStep('focus-l', conn, '81 01 04 08 30 FF')],
			rotate_right: [manualFocusFirst('focus-r', conn), focusStep('focus-r', conn, '81 01 04 08 20 FF')],
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
		notes: 'Turn to choose a preset 1-254, press to recall it. With Save armed, press saves the current shot to it instead.',
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
