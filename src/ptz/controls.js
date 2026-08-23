/**
 * Control envelopes for the PTZ page: a key, a touchstrip zone, an encoder.
 *
 * All three share one layer stack — background box, library icon, caption — in the same
 * percent geometry every other page on the deck uses, so a PTZ key sits next to an ATEM key
 * without either looking like it came from somewhere else. Feedbacks and action sets are
 * passed in; nothing here decides what a control does.
 *
 * The caption band is the bottom half and the icon the top, matching `src/novastar.js` and
 * the folder row exactly. On a 200x100 touchstrip zone that same split gives the readout the
 * whole lower half, which is where a value has to be to be read from a standing position.
 */

import { v } from './actions.js'

/** Resting backgrounds. The page is dark like the rest of the deck; tints carry state. */
export const BG = {
	key: 0x0d0d0f,
	/** Pan/tilt arrows: a faint tint so the pad reads as one control. */
	pad: 0x1a1016,
	/** Strip zones sit on a dark pink so they are visibly this page's, not the router's. */
	strip: 0x2a0f22,
	/** Encoders are black, matching every other knob on the deck. */
	knob: 0x000000,
	/** Engaged states (autofocus, tracking, backlight on): dark green. */
	engaged: 0x14361f,
	/** Something the operator should notice (standby, menu open): dark amber. */
	notice: 0x3a2e06,
	/** Armed to overwrite a preset: solid red, the one bright background on the page. */
	armed: 0xb91c1c,
	/** ATEM tally on the stop key — the same pair the ATEM page uses. */
	program: 0xff0000,
	preview: 0x00a651,
}

export const LABEL = 0xffffff
export const INK = 0x000000

/** Caption size as a percentage of the text band, the deck-wide value. */
const CAPTION_SIZE = 51

/**
 * Layer stack shared by every control on the page.
 *
 * @param {object} args
 * @param {string} args.icon    library image name
 * @param {string} args.label   caption; may carry variables
 * @param {number} args.bg      background colour
 * @param {boolean} [args.labelIsExpression]
 */
export const layers = ({ icon, label, bg, labelIsExpression = false }) => [
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
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(2), width: v(100), height: v(44), rotation: v(0),
		base64Image: v(`$(image:${icon})`),
		halign: v('center'), valign: v('center'), fillMode: v('fit'),
	},
	{
		id: 'text0', name: 'Label', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(46), width: v(100), height: v(52), rotation: v(0),
		text: labelIsExpression ? { value: label, isExpression: true } : v(label),
		color: v(LABEL),
		halign: v('center'), valign: v('center'),
		fontsize: v(CAPTION_SIZE), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

/**
 * A control.
 *
 * @param {object} args
 * @param {object} args.style           what `layers` takes
 * @param {string} args.notes           shown in Companion's editor; say what the control does
 * @param {boolean} [args.rotary]       true for an encoder
 * @param {object[]} [args.feedbacks]
 * @param {object} args.actionSets      down/up and, for an encoder, rotate_left/rotate_right
 * @param {object[]} [args.localVariables]
 */
export const control = ({ style, notes, rotary = false, feedbacks = [], actionSets, localVariables = [] }) => ({
	type: 'button-layered',
	style: { layers: layers(style) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: rotary,
		canModifyStyleInApis: false, notes,
	},
	feedbacks,
	steps: { 0: { action_sets: actionSets, options: { runWhileHeld: [] } } },
	localVariables,
})

/** A key: press and release. */
export const key = (args) => control({ ...args, rotary: false })

/** A strip zone: display, usually inert. */
export const strip = (args) =>
	control({ ...args, rotary: false, actionSets: args.actionSets ?? { down: [], up: [] } })

/** An encoder: turn either way, press. */
export const knob = (args) => control({ ...args, rotary: true })
