/**
 * Keys for the camera's AI tracking, shared by the run page and the setup page.
 *
 * All of these go through the web API (`web.js`): a press runs `ptz_web.py` on the Pi, which
 * applies the change and prints the new state, and that state lands in the tracking
 * variable immediately. The captions read the same variable, so a key shows what the camera
 * is actually doing — including when someone changed it from the camera's own web page.
 *
 * A SETTING KEY CYCLES. Mode, speed, sensitivity, placement, headroom and lost-target each
 * have three to five values; one key per value would be a page on its own. Each press moves
 * to the next value and the caption names the current one, the way the exposure and white
 * balance keys already work. Framing is the exception and gets one key per value, because
 * switching between close-up and full body is something done live, mid-service, where a
 * second press is a second too many.
 */

import { logicIf, override, when } from './actions.js'
import { BG, key } from './controls.js'
import { BODY, HEADROOM, LOST, MODE, PLACEMENT, SENSITIVITY, SPEED, track, webExec } from './web.js'

const is = (id, field, value) => when(id, `${track(field)} == "${value}"`)

/** Tracking on/off, green while on. */
export const trackKey = (host, prefix = 'track') =>
	key({
		style: { icon: 'tracking', label: 'Track', bg: BG.key },
		notes: 'Toggles the camera AI auto tracking. Green while on, as the camera reports it.',
		feedbacks: [
			when(`${prefix}-on`, `${track('tracking')} == "On"`, [
				override(`${prefix}-on-bg`, 'box0', 'color', BG.engaged),
				override(`${prefix}-on-icon`, 'image0', 'base64Image', '$(image:tracking-on)'),
				override(`${prefix}-on-text`, 'text0', 'text', 'Track ON'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					`${prefix}-if`,
					[is(`${prefix}-cond`, 'tracking', 'On')],
					[webExec(`${prefix}-off`, host, 'track off')],
					[webExec(`${prefix}-on-cmd`, host, 'track on')]
				),
			],
			up: [],
		},
	})

/**
 * One framing: close-up, half body or full body. Lit while it is the camera's current
 * framing, so the three keys read as a selector.
 */
export const framingKey = (host, which, prefix = `frame-${which}`) =>
	key({
		style: { icon: `frame-${which}`, label: BODY[which], bg: BG.key },
		notes: `Tracking framing: ${BODY[which].toLowerCase()}. Lit while selected. (Ignored by the camera in Stage mode.)`,
		feedbacks: [
			when(`${prefix}-sel`, `${track('body')} == "${BODY[which]}"`, [
				override(`${prefix}-sel-bg`, 'box0', 'color', BG.engaged),
			]),
		],
		actionSets: { down: [webExec(`${prefix}-set`, host, `body ${which}`)], up: [] },
	})

/**
 * Who to track: the person on the left, in the middle or on the right of the frame.
 *
 * The camera picks its subject by a point in its 1920x1080 picture — the web page sends the
 * coordinates of a click, and the camera takes whoever is there. A deck cannot show the
 * picture, but a stage is wide and shallow, so a point a sixth, a half and five sixths of the
 * way across, at torso height, reaches whoever stands in each third of the frame: a worship
 * leader on the left, a speaker in the middle. Momentary keys with no state, because the
 * person moves the moment they are chosen.
 */
export const FRAME = { width: 1920, height: 1080 }
export const TARGETS = {
	left: { x: 320, y: 486, icon: 'who-left', label: '◂ Left' },
	middle: { x: 960, y: 486, icon: 'who-middle', label: 'Middle' },
	right: { x: 1600, y: 486, icon: 'who-right', label: 'Right ▸' },
}

export const targetKey = (host, which, prefix = `target-${which}`) => {
	const { x, y, icon, label } = TARGETS[which]
	return key({
		style: { icon, label, bg: BG.key },
		notes: `Tracks the person on the ${which === 'middle' ? 'middle' : which} of the frame (the camera is told to take whoever is at a point ${which === 'middle' ? 'halfway' : which === 'left' ? 'a sixth of the way' : 'five sixths of the way'} across, at torso height). Works while tracking is on.`,
		actionSets: { down: [webExec(`${prefix}-go`, host, `select ${x} ${y}`)], up: [] },
	})
}

/**
 * A key that steps a tracking setting through its values.
 *
 * @param {object} spec
 * @param {string} spec.prefix   id prefix
 * @param {string} spec.icon
 * @param {string} spec.caption  caption prefix, e.g. "Speed"
 * @param {string} spec.field    field in the tracking JSON
 * @param {string} spec.param    MonoTracking field name the script sets
 * @param {Array<[string, number]>} spec.values  [label, code] in cycle order
 * @param {string} host
 */
export const cycleKey = ({ prefix, icon, caption, field, param, values }, host) => {
	const set = (i) => webExec(`${prefix}-set-${i}`, host, `set ${param}=${values[i][1]}`)
	// if current == values[0] → set values[1]; … ; else → set values[0]
	let chain = [set(0)]
	for (let i = values.length - 2; i >= 0; i--) {
		chain = [logicIf(`${prefix}-if-${i}`, [is(`${prefix}-cond-${i}`, field, values[i][0])], [set(i + 1)], chain)]
	}
	return key({
		style: { icon, label: `concat('${caption} ', ${track(field)})`, bg: BG.key, labelIsExpression: true },
		notes: `Steps ${caption.toLowerCase()} through ${values.map(([l]) => l).join(' → ')}. The caption shows the camera's current value.`,
		actionSets: { down: chain, up: [] },
	})
}

/** The six settings on the setup page, in its row order. */
export const SETTINGS = [
	{ prefix: 'at-mode', icon: 'tracking', caption: 'Mode', field: 'mode', param: 'nTrackMode', values: MODE.map((l, i) => [l, i]) },
	{ prefix: 'at-speed', icon: 'speed', caption: 'AT spd', field: 'speed', param: 'nSpeed', values: SPEED.map((l, i) => [l, i]) },
	{ prefix: 'at-sens', icon: 'focus', caption: 'Sens', field: 'sensitivity', param: 'nSensitivity', values: SENSITIVITY.map((l, i) => [l, i]) },
	{ prefix: 'at-place', icon: 'pan', caption: 'Place', field: 'placement', param: 'nCenterPos', values: PLACEMENT.map((l, i) => [l, i]) },
	{ prefix: 'at-head', icon: 'tilt', caption: 'Head', field: 'headroom', param: 'nHeadRoomRatio', values: HEADROOM.map((l, i) => [l, i]) },
	{ prefix: 'at-lost', icon: 'ptz-home', caption: 'Lost', field: 'lost', param: 'nLostReac', values: Object.entries(LOST).map(([code, l]) => [l, Number(code)]) },
]
