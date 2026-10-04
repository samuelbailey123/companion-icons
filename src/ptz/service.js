/**
 * Worship and Sermon: both cameras on one page, a page for each part of the service.
 *
 * WHY BY SERVICE AND NOT BY CAMERA. A camera's run page carries everything that camera can do,
 * but a service only uses half of it at a time. In worship the cameras sit on presets and are
 * trimmed by hand; in the sermon they track the speaker and the operator picks the framing. The
 * operator asked (2026-10-04) for a page per part of the service with both cameras on it, so
 * moving from one camera to the other is a glance, not a page change.
 *
 * TWO HALVES, NOT A SELECTOR. CAM 1 is the left half and CAM 3 the right, the chooser's and the
 * ATEM's order. Every key and knob belongs to the half it sits in, and each half is tinted in
 * its camera's colour, so there is no "which camera am I driving" state to forget — the lesson
 * of the corner badge in `hub.js`. The six knobs split three and three: pan, tilt and zoom for
 * each camera, the operator's choice over one camera at a time. Focus and speed are keys here;
 * the camera's own page still has every knob.
 *
 *   WORSHIP   CAM 1                          CAM 3
 *   row 1     P1    P2    P3    STOP  Save   STOP  P1    P2    P3
 *   row 2     P4    P5    P6    Speed        Speed P4    P5    P6
 *   row 3     AF    1-Push            Sermon       AF    1-Push
 *   knobs     Pan         Tilt  Zoom         Pan   Tilt        Zoom
 *
 *   SERMON
 *   row 1     Track Close Half  Full         Track Close Half  Full
 *   row 2     Left  Mid   Right STOP         STOP  Left  Mid   Right
 *   row 3     P1    P2    P3          Worship      P1    P2    P3
 *   knobs     Pan         Tilt  Zoom         Pan   Tilt        Zoom
 *
 * STOP SITS BESIDE THE CENTRE, with the ATEM tally on it, so the camera that is live is the
 * first thing seen on either side before anything on it is pressed.
 *
 * ONE SAVE FOR BOTH. Save arms both cameras: every preset key on the page turns red, and the next
 * one pressed saves on its own camera and disarms both. Two Save keys would be two armed states
 * to keep track of, on a page built to have none.
 *
 * THE CAMERA CODE IS THE RUN PAGE'S. Each half is built from the same key and knob builders as the
 * camera's own page — with camera-one variables, renamed for the other camera exactly as
 * `second.js` does — so a preset, STOP, knob or tracking key behaves the same on every page it is
 * on. Only the tint, the preset border colour and the shared Save are this file's.
 */

import { KNOB_ROW, STRIP_ROW } from '../layout.js'
import { cv, logicIf, setVar, v, when } from './actions.js'
import { BG, key } from './controls.js'
import { LOOK, SERVICE_LOOK } from './hub.js'
import { armedLook, autofocusKey, navKey, onePushKey, presetKey, speedKey, stopKey } from './keys.js'
import { KNOBS, buildKnobs } from './knobs.js'
import { renameVariables } from './second.js'
import { framingKey, targetKey, trackKey } from './tracking.js'
import * as V from './variables.js'

export const WORSHIP = 'Worship'
export const SERMON = 'Sermon'

/**
 * The columns each half owns, left to right. `outer` holds the presets and the tracking choices;
 * `inner` is the column beside the centre, where STOP and Speed go. The knob columns are the
 * deck's own six, split three and three.
 */
export const HALVES = {
	left: { cols: [0, 1, 2, 3], outer: [0, 1, 2], inner: 3, knobs: { pan: 0, tilt: 2, zoom: 3 } },
	right: { cols: [5, 6, 7, 8], outer: [6, 7, 8], inner: 5, knobs: { pan: 5, tilt: 6, zoom: 8 } },
}

/** The column between the halves: the shared Save and the jump to the other page. */
export const CENTRE = 4

/**
 * @typedef {object} Camera
 * @property {string} conn     its ptzoptics-visca connection id
 * @property {string} host     its address, for the web-API keys
 * @property {number} atem     its ATEM input, which names it and picks its colour
 * @property {Record<number, string>} [presets]  preset number → shot name
 * @property {boolean} [second]  true for the camera on the `ptz2_*` variables
 */

/** A structure built with camera-one variables, made this camera's. */
const forCamera = (cam, structure) => (cam.second ? renameVariables(structure) : structure)

/** This camera's "Save is armed" variable. */
export const armedOf = (cam) => forCamera(cam, V.ARMED)

/**
 * Prefix every entity id in a control, so the two halves' copies of a key do not share ids.
 * Layer ids are left alone: overrides point at them by name.
 */
const prefixIds = (node, prefix) => {
	if (Array.isArray(node)) return node.map((n) => prefixIds(n, prefix))
	if (!node || typeof node !== 'object') return node
	const out = Object.fromEntries(Object.entries(node).map(([k, n]) => [k, prefixIds(n, prefix)]))
	if ('definitionId' in node) out.id = `${prefix}-${node.id}`
	if ('overrideId' in node) out.overrideId = `${prefix}-${node.overrideId}`
	return out
}

/** The control on its camera's ground. Feedbacks that recolour it still do. */
const tinted = (control, color) => {
	const out = structuredClone(control)
	out.style.layers.find((l) => l.id === 'box0').color = v(color)
	return out
}

/**
 * One camera's preset key for a shared page: the run page's, with this camera's border colour,
 * disarming the other camera as well when it saves — Save armed both.
 */
const sharedPreset = (cam, other, n) => {
	const control = forCamera(cam, presetKey(n, cam.conn, cam.host, cam.presets?.[n], (LOOK[cam.atem] ?? LOOK.default).accent))
	const branch = control.steps[0].action_sets.down.find((a) => a.id === `p${n}-if`)
	branch.children.actions.push(setVar(`p${n}-disarm-other`, armedOf(other), '0'))
	return control
}

/** Save for both cameras at once. */
const saveBothKey = (cams) => {
	const armed = cams.map(armedOf)
	const anyArmed = armed.map((name) => `${cv(name)} == 1`).join(' || ')
	return key({
		style: { icon: 'preset-save', label: 'Save', bg: BG.key },
		notes:
			'Arms saving on both cameras: the next preset key pressed saves the current shot there, on its ' +
			'own camera, and disarms both. Press again to cancel.',
		feedbacks: [when('save-both-armed', anyArmed, armedLook('save-both-armed', 'ARMED', 'preset-save'))],
		actionSets: {
			down: [
				logicIf(
					'save-both',
					[when('save-both-cond', anyArmed)],
					armed.map((name, i) => setVar(`save-both-off-${i}`, name, '0')),
					armed.map((name, i) => setVar(`save-both-on-${i}`, name, '1'))
				),
			],
			up: [],
		},
	})
}

/** One camera's keys on the Worship page, row → column. */
const worshipKeys = (cam, other, h) => {
	const preset = (n) => sharedPreset(cam, other, n)
	const own = (control) => forCamera(cam, control)
	return {
		1: { [h.outer[0]]: preset(1), [h.outer[1]]: preset(2), [h.outer[2]]: preset(3), [h.inner]: own(stopKey(cam.conn)) },
		2: { [h.outer[0]]: preset(4), [h.outer[1]]: preset(5), [h.outer[2]]: preset(6), [h.inner]: own(speedKey()) },
		3: { [h.outer[0]]: own(autofocusKey(cam.conn)), [h.outer[1]]: own(onePushKey(cam.conn)) },
	}
}

/** One camera's keys on the Sermon page, row → column. */
const sermonKeys = (cam, other, h) => {
	const preset = (n) => sharedPreset(cam, other, n)
	const own = (control) => forCamera(cam, control)
	const [a, b, c, d] = h.cols
	return {
		1: {
			[a]: own(trackKey(cam.host)),
			[b]: own(framingKey(cam.host, 'close')),
			[c]: own(framingKey(cam.host, 'half')),
			[d]: own(framingKey(cam.host, 'full')),
		},
		2: {
			[h.outer[0]]: own(targetKey(cam.host, 'left')),
			[h.outer[1]]: own(targetKey(cam.host, 'middle')),
			[h.outer[2]]: own(targetKey(cam.host, 'right')),
			[h.inner]: own(stopKey(cam.conn)),
		},
		3: { [h.outer[0]]: preset(1), [h.outer[1]]: preset(2), [h.outer[2]]: preset(3) },
	}
}

/** One camera's pan, tilt and zoom knobs with their strip readouts, on its half's columns. */
const knobRows = (cam, h) => {
	const { strips, knobs } = forCamera(cam, buildKnobs(cam.conn, cam.host))
	const rows = { [STRIP_ROW]: {}, [KNOB_ROW]: {} }
	for (const [axis, col] of Object.entries(h.knobs)) {
		rows[STRIP_ROW][col] = strips[KNOBS[axis]]
		rows[KNOB_ROW][col] = knobs[KNOBS[axis]]
	}
	return rows
}

/**
 * Lay one camera's rows onto the page: ids prefixed by camera, keys and strips tinted (the
 * encoders stay black, like every knob on the deck).
 */
const place = (controls, rows, cam) => {
	const tint = (LOOK[cam.atem] ?? LOOK.default).tint
	for (const [row, cells] of Object.entries(rows)) {
		controls[row] ??= {}
		for (const [col, control] of Object.entries(cells)) {
			const own = prefixIds(control, `cam${cam.atem}`)
			controls[row][col] = Number(row) === KNOB_ROW ? own : tinted(own, tint)
		}
	}
}

/**
 * The Worship and Sermon pages, rows 1-5. Row 0, the folder row, is the caller's.
 *
 * @param {{left: Camera, right: Camera}} cams  CAM 1 on the left, CAM 3 on the right
 * @param {{worship: number|string, sermon: number|string}} pages  their page numbers, for the
 *   jump between them
 * @returns {{worship: {name: string, controls: object}, sermon: {name: string, controls: object}}}
 */
export function buildServicePages(cams, pages) {
	const worship = {}
	const sermon = {}
	for (const [side, cam, other] of [['left', cams.left, cams.right], ['right', cams.right, cams.left]]) {
		const h = HALVES[side]
		place(worship, { ...worshipKeys(cam, other, h), ...knobRows(cam, h) }, cam)
		place(sermon, { ...sermonKeys(cam, other, h), ...knobRows(cam, h) }, cam)
	}
	worship[1][CENTRE] = saveBothKey([cams.left, cams.right])
	worship[3][CENTRE] = navKey('to-sermon', SERVICE_LOOK.sermon, pages.sermon)
	sermon[3][CENTRE] = navKey('to-worship', SERVICE_LOOK.worship, pages.worship)
	return { worship: { name: WORSHIP, controls: worship }, sermon: { name: SERMON, controls: sermon } }
}
