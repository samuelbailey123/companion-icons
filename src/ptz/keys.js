/**
 * The 27 keys of the PTZ page: rows 1-3, nine across.
 *
 *   col:   0    1     2   |  3      4         5        6         7          8
 *   row 1: ↖    ↑     ↗   |  P1     P2        P3       P4        P5         P6
 *   row 2: ←   STOP   →   |  Home   Zoom in   AF       Track     WB         Save
 *   row 3: ↙    ↓     ↘   |  Menu   Zoom out  1-push   Exposure  Backlight  Power
 *
 * THE D-PAD DRIVES WHILE HELD. Press starts the camera moving, release stops it — the one
 * gesture every PTZ joystick on earth uses, and the only one where "hold" is the natural
 * reading rather than a hidden second function. While the camera's on-screen menu is open
 * the same four arrows navigate it and STOP closes it. The camera rejects the VISCA "menu
 * enter" and "menu back" bytes outright (checked), and its own command list has no menu
 * section, so the arrows are the whole interface: on this family of OSD, right enters a
 * submenu or changes a value and left backs out. That part could not be watched — the
 * camera had no monitor while this was built — and wants one look at a screen.
 *
 * STOP CARRIES TALLY. The centre key goes red when the ATEM has this camera on program and
 * green on preview: it is the key you are looking at when you move the camera, so it is the
 * place to be told not to.
 *
 * PRESETS SAVE ONLY WHEN ARMED. A preset key recalls. Press Save first and every preset key
 * (and the dial) turns solid red; the next press saves the current shot there and disarms.
 * Two deliberate presses to overwrite, never a long-press — the operator has said no to
 * hold gestures, and a preset lost to a held finger mid-service is exactly the accident that
 * rule exists to prevent.
 *
 * TOGGLES READ THE CAMERA, NOT A GUESS. Autofocus, backlight, power and menu all branch on
 * the state the poller last read from the camera, so a key pressed after someone changed the
 * setting from the camera's web page still does the right thing. Tracking is the exception:
 * the camera does not answer a tracking inquiry, so the deck remembers what it last sent.
 */

import { cv, field, logicIf, raw, setVar, visca, wait, when, override } from './actions.js'
import { BG, INK, LABEL, key } from './controls.js'
import { driveCommand } from './knobs.js'
import * as V from './variables.js'

/** The page's accent, for the "last preset" border. */
const ACCENT = 0xf472b6

/** Direct-recall preset keys, in row-1 order. */
export const PRESET_KEYS = [1, 2, 3, 4, 5, 6]

const menuOpen = (id) => when(id, `${field('menu')} == "On"`)
const armed = (id) => when(id, `${cv(V.ARMED)} == 1`)

/** A preset action on a fixed number. */
const presetFixed = (id, conn, definitionId, n) =>
	visca(id, conn, definitionId, {
		isText: { value: false, isExpression: false },
		presetAsNumber: { value: n, isExpression: false },
		presetAsText: { value: String(n), isExpression: false },
	})

/** Overrides that turn a key solid red with ink glyph and caption while Save is armed. */
const armedLook = (prefix, caption, icon) => [
	override(`${prefix}-bg`, 'box0', 'color', BG.armed),
	override(`${prefix}-text`, 'text0', 'text', caption),
	override(`${prefix}-label`, 'text0', 'color', INK),
	override(`${prefix}-icon`, 'image0', 'base64Image', `$(image:${icon}-ink)`),
]

/**
 * A drive key: move while held, navigate the menu instead while it is open.
 *
 * @param {string} name       id prefix and caption
 * @param {string} conn
 * @param {string} icon
 * @param {string} direction  module drive action id
 * @param {string|null} menuDirection  module OSD navigate direction, or null for diagonals
 */
const driveKey = (name, conn, icon, direction, menuDirection) => {
	const move = [driveCommand(`${name}-go`, conn, direction)]
	const down = menuDirection
		? [
				logicIf(
					`${name}-dn-if`,
					[menuOpen(`${name}-dn-menu`)],
					[visca(`${name}-nav`, conn, 'onScreenDisplayNavigate', { direction: { value: menuDirection, isExpression: false } })],
					move
				),
			]
		: move
	return key({
		style: { icon, label: '', bg: BG.pad },
		notes: `Hold to drive ${direction}; release to stop.${menuDirection ? ' Navigates the camera menu while it is open (right enters, left backs out).' : ''}`,
		actionSets: { down, up: [visca(`${name}-up-stop`, conn, 'stop')] },
	})
}

/** The centre of the pad: stop everything, or close the menu, and show tally. */
const stopKey = (conn) =>
	key({
		style: { icon: 'stop', label: 'STOP', bg: BG.key },
		notes:
			'Stops pan, tilt and zoom. Closes the camera menu while it is open. ' +
			'Red when this camera is on ATEM program, green on preview (input number in ptz_atem_input).',
		feedbacks: [
			when('stop-menu', `${field('menu')} == "On"`, [
				override('stop-menu-text', 'text0', 'text', 'EXIT'),
				override('stop-menu-bg', 'box0', 'color', BG.notice),
			]),
			when('stop-pvw', `$(atem:pvw1_input_id) == ${cv(V.ATEM_INPUT)}`, [
				override('stop-pvw-bg', 'box0', 'color', BG.preview),
				override('stop-pvw-text', 'text0', 'text', 'PREVIEW'),
				override('stop-pvw-label', 'text0', 'color', INK),
				override('stop-pvw-icon', 'image0', 'base64Image', '$(image:stop-ink)'),
			]),
			when('stop-pgm', `$(atem:pgm1_input_id) == ${cv(V.ATEM_INPUT)}`, [
				override('stop-pgm-bg', 'box0', 'color', BG.program),
				override('stop-pgm-text', 'text0', 'text', 'LIVE'),
				override('stop-pgm-label', 'text0', 'color', LABEL),
				override('stop-pgm-icon', 'image0', 'base64Image', '$(image:stop-paper)'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'stop-if',
					[menuOpen('stop-menu-cond')],
					[raw('stop-menu-close', conn, '81 01 06 06 03 FF')],
					[visca('stop-pt', conn, 'stop'), visca('stop-zoom', conn, 'zoomS')]
				),
			],
			up: [],
		},
	})

const presetKey = (n, conn) =>
	key({
		style: { icon: 'preset', label: String(n), bg: BG.key },
		notes: `Recall preset ${n}. With Save armed, saves the current shot as preset ${n} instead.`,
		feedbacks: [
			when(`p${n}-last`, `${cv(V.LAST_PRESET)} == ${n}`, [
				override(`p${n}-last-bw`, 'box0', 'borderWidth', 6),
				override(`p${n}-last-bc`, 'box0', 'borderColor', ACCENT),
			]),
			when(`p${n}-armed`, `${cv(V.ARMED)} == 1`, armedLook(`p${n}-armed`, `SAVE ${n}`, 'preset-save')),
		],
		actionSets: {
			down: [
				logicIf(
					`p${n}-if`,
					[armed(`p${n}-cond`)],
					[presetFixed(`p${n}-save`, conn, 'setPreset', n), setVar(`p${n}-disarm`, V.ARMED, '0'), setVar(`p${n}-last-s`, V.LAST_PRESET, String(n))],
					[presetFixed(`p${n}-recall`, conn, 'recallPreset', n), setVar(`p${n}-last-r`, V.LAST_PRESET, String(n))]
				),
			],
			up: [],
		},
	})

const saveKey = () =>
	key({
		style: { icon: 'preset-save', label: 'Save', bg: BG.key },
		notes: 'Arms saving: the next preset key or dial press saves the current shot there. Press again to cancel.',
		feedbacks: [when('save-armed', `${cv(V.ARMED)} == 1`, armedLook('save-armed', 'ARMED', 'preset-save'))],
		actionSets: {
			down: [setVar('save-toggle', V.ARMED, `${cv(V.ARMED)} == 1 ? 0 : 1`, true)],
			up: [],
		},
	})

const homeKey = (conn) =>
	key({
		style: { icon: 'ptz-home', label: 'Home', bg: BG.key },
		notes: 'Drives pan and tilt to the camera home position.',
		actionSets: { down: [visca('home-go', conn, 'home'), setVar('home-last', V.LAST_PRESET, '')], up: [] },
	})

const menuKey = (conn) =>
	key({
		style: { icon: 'menu', label: 'Menu', bg: BG.key },
		notes: 'Opens or closes the camera on-screen menu. While open, the arrows navigate (right enters, left backs out) and STOP closes it.',
		feedbacks: [
			when('menu-open', `${field('menu')} == "On"`, [
				override('menu-open-bg', 'box0', 'color', BG.notice),
				override('menu-open-text', 'text0', 'text', 'Menu OPEN'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'menu-if',
					[menuOpen('menu-cond')],
					[raw('menu-close', conn, '81 01 06 06 03 FF')],
					[raw('menu-open-cmd', conn, '81 01 06 06 02 FF')]
				),
			],
			up: [],
		},
	})

/** Zoom while held, at the derived zoom speed. */
const zoomKey = (name, conn, icon, bytes, label) =>
	key({
		style: { icon, label, bg: BG.key },
		notes: `Hold to ${label.toLowerCase()} at the Speed knob's speed; release to stop.`,
		actionSets: {
			down: [raw(`${name}-go`, conn, bytes, '9', [cv(V.ZOOM_SPEED)])],
			up: [visca(`${name}-stop`, conn, 'zoomS')],
		},
	})

const autofocusKey = (conn) =>
	key({
		style: { icon: 'focus-manual', label: `concat('AF ', ${field('focus')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Toggles autofocus. Green while the camera is in auto focus.',
		feedbacks: [
			when('af-on', `${field('focus')} == "Auto"`, [
				override('af-on-bg', 'box0', 'color', BG.engaged),
				override('af-on-icon', 'image0', 'base64Image', '$(image:focus-auto)'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'af-if',
					[when('af-cond', `${field('focus')} == "Auto"`)],
					[visca('af-manual', conn, 'focusM', { bol: { value: '1', isExpression: false } })],
					[visca('af-auto', conn, 'focusM', { bol: { value: '0', isExpression: false } })]
				),
			],
			up: [],
		},
	})

const onePushKey = (conn) =>
	key({
		style: { icon: 'focus', label: '1-Push', bg: BG.key },
		notes: 'One-push autofocus: the camera focuses once on what it sees now, then holds.',
		actionSets: { down: [raw('onepush-go', conn, '81 01 04 38 04 FF')], up: [] },
	})

const trackingKey = (conn) =>
	key({
		style: { icon: 'tracking', label: 'Track', bg: BG.key },
		notes: 'Toggles the camera AI auto tracking. Green while on (as last set from this deck).',
		feedbacks: [
			when('track-on', `${cv(V.TRACKING)} == 1`, [
				override('track-on-bg', 'box0', 'color', BG.engaged),
				override('track-on-icon', 'image0', 'base64Image', '$(image:tracking-on)'),
				override('track-on-text', 'text0', 'text', 'Track ON'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'track-if',
					[when('track-cond', `${cv(V.TRACKING)} == 1`)],
					[raw('track-off', conn, '81 0A 01 32 00 00 03 00 FF'), setVar('track-set-off', V.TRACKING, '0')],
					[raw('track-on-cmd', conn, '81 0A 01 32 00 00 02 00 FF'), setVar('track-set-on', V.TRACKING, '1')]
				),
			],
			up: [],
		},
	})

/** Cycle Auto → Shutter priority → Iris priority → Manual → Auto. */
const exposureKey = (conn) => {
	const mode = (id, val) => visca(id, conn, 'expM', { val: { value: val, isExpression: false } })
	const is = (id, s) => when(id, `${field('ae')} == "${s}"`)
	return key({
		style: { icon: 'exposure', label: `concat('Exp ', ${field('ae')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Steps the exposure mode: Auto, Shutter priority, Iris priority, Manual, then back to Auto.',
		actionSets: {
			down: [
				logicIf('exp-if-auto', [is('exp-c-auto', 'Auto')], [mode('exp-shutter', '2')], [
					logicIf('exp-if-shutter', [is('exp-c-shutter', 'Shutter')], [mode('exp-iris', '3')], [
						logicIf('exp-if-iris', [is('exp-c-iris', 'Iris')], [mode('exp-manual', '1')], [mode('exp-auto', '0')]),
					]),
				]),
			],
			up: [],
		},
	})
}

/** Cycle Auto → Indoor (3000K) → Outdoor (4000K) → One push → Auto. */
const whiteBalanceKey = (conn) => {
	const mode = (id, val) => visca(id, conn, 'wb', { val: { value: val, isExpression: false } })
	const is = (id, s) => when(id, `${field('wb')} == "${s}"`)
	return key({
		style: { icon: 'white-balance', label: `concat('WB ', ${field('wb')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Steps white balance: Auto, Indoor 3000K, Outdoor 4000K, One-push (measures now), then Auto.',
		actionSets: {
			down: [
				logicIf('wb-if-auto', [is('wb-c-auto', 'Auto')], [mode('wb-indoor', 'indoor')], [
					logicIf('wb-if-indoor', [is('wb-c-indoor', '3000K')], [mode('wb-outdoor', 'outdoor')], [
						logicIf(
							'wb-if-outdoor',
							[is('wb-c-outdoor', '4000K')],
							[mode('wb-onepush', 'onepush'), wait('wb-onepush-wait', 300), visca('wb-trigger', conn, 'wbOPT')],
							[mode('wb-auto', 'automatic')]
						),
					]),
				]),
			],
			up: [],
		},
	})
}

const backlightKey = (conn) =>
	key({
		style: { icon: 'backlight', label: `concat('BLC ', ${field('backlight')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Toggles backlight compensation. Green while on.',
		feedbacks: [
			when('blc-on', `${field('backlight')} == "On"`, [
				override('blc-on-bg', 'box0', 'color', BG.engaged),
				override('blc-on-icon', 'image0', 'base64Image', '$(image:backlight-on)'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'blc-if',
					[when('blc-cond', `${field('backlight')} == "On"`)],
					[raw('blc-off', conn, '81 01 04 33 03 FF')],
					[raw('blc-on-cmd', conn, '81 01 04 33 02 FF')]
				),
			],
			up: [],
		},
	})

const powerKey = (conn) =>
	key({
		style: { icon: 'ptz-power', label: `concat('Power ', ${field('power')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Toggles the camera between on and standby. Amber with a red glyph while in standby.',
		feedbacks: [
			when('power-standby', `${field('power')} == "Standby"`, [
				override('power-standby-bg', 'box0', 'color', BG.notice),
				override('power-standby-icon', 'image0', 'base64Image', '$(image:ptz-standby)'),
				override('power-standby-text', 'text0', 'text', 'STANDBY'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'power-if',
					[when('power-cond', `${field('power')} == "On"`)],
					[visca('power-off', conn, 'power', { bool: { value: 'off', isExpression: false } })],
					[visca('power-on', conn, 'power', { bool: { value: 'on', isExpression: false } })]
				),
			],
			up: [],
		},
	})

/**
 * Build rows 1-3.
 *
 * @param {string} conn  the ptzoptics-visca connection id
 * @returns {Record<number, Record<number, object>>} row → column → control
 */
export function buildKeys(conn) {
	const presets = Object.fromEntries(PRESET_KEYS.map((n, i) => [3 + i, presetKey(n, conn)]))
	return {
		1: {
			0: driveKey('ul', conn, 'arrow-up-left', 'upLeft', null),
			1: driveKey('u', conn, 'arrow-up', 'up', 'up'),
			2: driveKey('ur', conn, 'arrow-up-right', 'upRight', null),
			...presets,
		},
		2: {
			0: driveKey('l', conn, 'arrow-left', 'left', 'left'),
			1: stopKey(conn),
			2: driveKey('r', conn, 'arrow-right', 'right', 'right'),
			3: homeKey(conn),
			4: zoomKey('zi', conn, 'zoom-in', '81 01 04 07 20 FF', 'Zoom in'),
			5: autofocusKey(conn),
			6: trackingKey(conn),
			7: whiteBalanceKey(conn),
			8: saveKey(),
		},
		3: {
			0: driveKey('dl', conn, 'arrow-down-left', 'downLeft', null),
			1: driveKey('d', conn, 'arrow-down', 'down', 'down'),
			2: driveKey('dr', conn, 'arrow-down-right', 'downRight', null),
			3: menuKey(conn),
			4: zoomKey('zo', conn, 'zoom-out', '81 01 04 07 30 FF', 'Zoom out'),
			5: onePushKey(conn),
			6: exposureKey(conn),
			7: backlightKey(conn),
			8: powerKey(conn),
		},
	}
}
