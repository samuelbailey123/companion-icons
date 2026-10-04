/**
 * The 20 keys of the PTZ run page: rows 1-3, nine across.
 *
 *   col:   0      1      2   |  3        4         5        6         7          8
 *   row 1: P1     P2     P3  |  Home     Zoom in   AF       Track     Close-up   Save
 *   row 2: P4     P5     P6  |  Speed    STOP      1-push   Half      Full       Menu
 *   row 3: ·      ·      ·   |  Setup ▸  Zoom out  ·        ·         ·          ·
 *
 * RUN HERE, SET UP ON THE NEXT PAGE. This page holds what an operator touches during a
 * service: presets, speed, focus, tracking on/off and its framing. Exposure, white
 * balance, backlight, power and the tracking parameters live on the setup sub-page
 * (`setup.js`), one press away on Setup ▸ and back on the folder row or its own ◂ key.
 *
 * PRESETS SIT UNDER THE THUMB. The left block used to be an eight-way arrow pad that drove
 * while held. The operator never used it — pan and tilt live on the encoders — and on
 * 2026-09-06 asked for its space instead. The six presets, the keys pressed most in a
 * service, now fill it as a 2×3 block with their shot names on them; everything else moved
 * one column right. Speed steps the drive speed through three stops, 1 → 10 → 24 → 1:
 * creep, normal, fast. The Speed knob still fine-tunes between them, and both write the
 * same variable so the caption is always right. The pad also navigated the camera's
 * on-screen menu while it was open; that went with it, and Menu now only opens and closes
 * the OSD. The camera's web page covers everything the menu did.
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
 * TOGGLES READ THE CAMERA, NOT A GUESS. Autofocus, backlight, power, menu and tracking all
 * branch on the state last read from the camera, so a key pressed after someone changed the
 * setting from the camera's web page still does the right thing.
 */

import { cv, field, logicIf, override, overrideExpr, raw, setVar, visca, when } from './actions.js'
import { BG, INK, LABEL, key } from './controls.js'
import { menuKey } from './image.js'
import { deriveSpeeds } from './knobs.js'
import { framingKey, trackKey } from './tracking.js'
import * as V from './variables.js'

/** The page's accent, for the "last preset" border. */
const ACCENT = 0xf472b6

/** Direct-recall preset keys, in row-1 order. */
export const PRESET_KEYS = [1, 2, 3, 4, 5, 6]

/** The drive speeds the Speed key steps through, in order; the last wraps to the first. */
export const SPEED_STOPS = [1, 10, 24]

/**
 * An expression that moves a value to the next stop: below the second stop go to it, below
 * the third go there, otherwise wrap. Written from the stops so the list is the only truth.
 */
export const nextStop = (variable, stops) => {
	const [first, ...rest] = stops
	return rest.reduceRight(
		(tail, stop, i) => `${cv(variable)} < ${stop} ? ${stop} : ${i === rest.length - 1 ? tail : `(${tail})`}`,
		String(first)
	)
}

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
 * Speed: one press per stop, 1 → 10 → 24 → 1, shown in the caption.
 *
 * Writes the same variable the Speed knob turns, then re-derives the tilt, zoom and focus
 * speeds exactly as the knob does, so a press and a turn are interchangeable.
 */
const speedKey = () =>
	key({
		style: { icon: 'speed', label: `concat('Speed ', ${cv(V.SPEED)})`, bg: BG.key, labelIsExpression: true },
		notes: `Steps the drive speed ${SPEED_STOPS.join(' → ')} → ${SPEED_STOPS[0]} for pan, tilt, zoom and focus. The Speed knob still fine-tunes it.`,
		actionSets: {
			down: [setVar('speed-cycle', V.SPEED, nextStop(V.SPEED, SPEED_STOPS), true), ...deriveSpeeds('speed-cycle')],
			up: [],
		},
	})

/** The centre of the old pad: stop everything, or close the menu, and show tally. */
/**
 * The centre key's caption: which camera this page drives, from the ATEM input number.
 *
 * Taken from `ptz_atem_input` rather than baked in, so the same builder produces "CAM 3" for one
 * camera and "CAM 1" for the other with no parameter — the variable rename that makes the second
 * camera's page carries it across for free.
 */
const CAMERA = `concat('CAM ', ${cv(V.ATEM_INPUT)})`

/**
 * Stop, and the page's camera indicator.
 *
 * IT NAMES THE CAMERA BECAUSE IT IS WHERE THE EYE ALREADY IS. This key sits between Zoom in and
 * Zoom out, beside Speed, and it already carried the ATEM tally — so it is the one place on the
 * page that is being looked at while a camera is being moved. A corner badge was tried first and
 * did not work; this does the same job at no cost in keys, and folds "which camera" and "is it on
 * air" into one glance.
 *
 * The stop function is unchanged; the icon still says stop and the caption is the state.
 */
const stopKey = (conn) =>
	key({
		style: { icon: 'stop', label: CAMERA, bg: BG.key, labelIsExpression: true },
		notes:
			'Stops pan, tilt and zoom, and names the camera this page drives. Closes the camera menu ' +
			'while it is open. Red and LIVE when this camera is on ATEM program, green and PVW on ' +
			'preview (input number in ptz_atem_input).',
		feedbacks: [
			when('stop-menu', `${field('menu')} == "On"`, [
				override('stop-menu-text', 'text0', 'text', 'EXIT'),
				override('stop-menu-bg', 'box0', 'color', BG.notice),
			]),
			when('stop-pvw', `$(atem:pvw1_input_id) == ${cv(V.ATEM_INPUT)}`, [
				override('stop-pvw-bg', 'box0', 'color', BG.preview),
				overrideExpr('stop-pvw-text', 'text0', 'text', `concat(${CAMERA}, ' PVW')`),
				override('stop-pvw-label', 'text0', 'color', INK),
				override('stop-pvw-icon', 'image0', 'base64Image', '$(image:stop-ink)'),
			]),
			when('stop-pgm', `$(atem:pgm1_input_id) == ${cv(V.ATEM_INPUT)}`, [
				override('stop-pgm-bg', 'box0', 'color', BG.program),
				overrideExpr('stop-pgm-text', 'text0', 'text', `concat(${CAMERA}, ' LIVE')`),
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

/**
 * The caption of a preset key: the number, and the shot's name in brackets when it has one.
 *
 * NAMES COME FROM THE BUILD, NOT FROM THE DECK. The operator named the presets by editing the
 * captions on the rig, and the next rebuild from code silently put the bare numbers back
 * (2026-09-06). Anything typed into Companion is one rebuild from gone, so the names live in
 * the per-camera configuration the tool passes in, and the caption format is the one the
 * operator chose.
 */
export const presetCaption = (n, name) => (name ? `${n} (${name})` : String(n))

const presetKey = (n, conn, name) =>
	key({
		style: { icon: 'preset', label: presetCaption(n, name), bg: BG.key },
		notes: `Recall preset ${n}${name ? ` (${name})` : ''}. With Save armed, saves the current shot as preset ${n} instead.`,
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

/**
 * A page jump. `set_page` with `surfaceId: self`, the same action the folder row uses.
 *
 * @param {string} prefix
 * @param {{icon: string, label: string, notes: string}} look
 * @param {number|string} pageNumber  destination page NUMBER; never 0, which Companion
 *   reads as "the page you are on"
 */
export const navKey = (prefix, look, pageNumber) => {
	if (Number(pageNumber) === 0 || pageNumber === undefined) throw new Error(`${prefix}: page number ${pageNumber} is not a destination`)
	return key({
		style: { icon: look.icon, label: look.label, bg: BG.key },
		notes: look.notes,
		actionSets: {
			down: [
				{
					id: `${prefix}-go`,
					definitionId: 'set_page',
					connectionId: 'internal',
					options: { surfaceId: { value: 'self', isExpression: false }, page: { value: String(pageNumber), isExpression: false } },
					upgradeIndex: null,
					type: 'action',
				},
			],
			up: [],
		},
	})
}

/**
 * Build rows 1-3 of the run page.
 *
 * @param {string} conn   the ptzoptics-visca connection id
 * @param {string} host   the camera address, for the web-API keys
 * @param {{setup: number|string}} pages  page numbers the jumps land on
 * @param {Record<number, string>} [names]  preset number → shot name, for the captions
 * @returns {Record<number, Record<number, object>>} row → column → control
 */
export function buildKeys(conn, host, pages, names = {}) {
	// Presets 1-3 across row 1, 4-6 across row 2, columns 0-2: three per row, in order.
	const presets = { 1: {}, 2: {} }
	PRESET_KEYS.forEach((n, i) => {
		presets[1 + Math.floor(i / 3)][i % 3] = presetKey(n, conn, names[n])
	})
	return {
		1: {
			...presets[1],
			3: homeKey(conn),
			4: zoomKey('zi', conn, 'zoom-in', '81 01 04 07 20 FF', 'Zoom in'),
			5: autofocusKey(conn),
			6: trackKey(host),
			7: framingKey(host, 'close'),
			8: saveKey(),
		},
		2: {
			...presets[2],
			3: speedKey(),
			4: stopKey(conn),
			5: onePushKey(conn),
			6: framingKey(host, 'half'),
			7: framingKey(host, 'full'),
			8: menuKey(conn),
		},
		3: {
			3: navKey('setup', { icon: 'ptz-setup', label: 'Setup', notes: 'Opens the PTZ setup page: exposure, white balance, backlight, power and the tracking settings.' }, pages.setup),
			4: zoomKey('zo', conn, 'zoom-out', '81 01 04 07 30 FF', 'Zoom out'),
		},
	}
}
