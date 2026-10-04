/**
 * The LED wall's brightness control: a strip readout above an encoder.
 *
 * WHY TWO CONTROLS FOR ONE KNOB. On this deck an encoder has no display of its own — the
 * touchstrip zone directly above it is its face. Every knob already on the rig is authored as
 * a pair (SQ7's `Main` knob under a `MAIN $(SQ:level_79.0)` readout, MA2's four faders under
 * their percentages), so a knob written without its strip zone would turn silently and show
 * nothing. The pair is the unit, which is why this module emits both or neither.
 *
 * WHY `Adjust +/-` RATHER THAN A VALUE TABLE. The novastar-controller module offers two
 * brightness actions: `change_brightness`, a dropdown of 22 fixed steps, and `set_brightness`,
 * which in mode `A` reads the brightness it already tracks, adds a delta and clamps to 0..100.
 * Only the second is meaningful on an encoder — a dropdown entry cannot express "a bit more
 * than it is now". It also means no custom variable is needed: the module owns the running
 * value and republishes it as `$(novastar:brite)`, so the readout and the knob cannot drift
 * apart the way they would if this tracked its own copy.
 *
 * THE PRESS DOES NOTHING, DELIBERATELY. An encoder press is easy to do by accident while
 * reaching for it, and every candidate action (reset to 50%, blackout, full) would be an
 * abrupt, visible change to a wall in front of an audience. Turning is incremental and
 * self-correcting; pressing is not. `down` is left empty until someone asks for it.
 */

import { KNOB_ROW, STRIP_ROW } from './layout.js'

/** Percentage points added or removed per detent. */
export const BRIGHTNESS_STEP = 5

/**
 * Column the pair occupies.
 *
 * Strip zones and encoders exist only at columns 0, 2, 3, 5, 6 and 8. The VW page already
 * spends 0, 2, 3 and 5 on router output readouts, so 6 is the first free slot — and it keeps
 * the wall next to the routing it belongs with rather than isolated at the far edge.
 */
export const WALL_COLUMN = 6

/** The module's own published brightness, 0-100. */
const BRIGHTNESS_VARIABLE = '$(novastar:brite)'

/** Dark blue: the video identity, marking this zone as not another router output. */
const STRIP_BG = 0x0e2742

/** Encoders sit on black, matching every other knob on the deck. */
const KNOB_BG = 0x000000

const v = (value) => ({ value, isExpression: false })

/**
 * Layer stack shared by both halves of the pair.
 *
 * Geometry is in percent of the control, not pixels, so the same numbers hold on a 120px key
 * and a 200x100 strip zone.
 */
const layers = ({ icon, label, bg }) => [
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
		text: v(label), color: v(0xffffff),
		halign: v('center'), valign: v('center'),
		fontsize: v(51), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

/**
 * One `set_brightness` action in adjust mode.
 *
 * `value` is filled in even though adjust mode never reads it: the module runs
 * `parseFloat(await context.parseVariablesInString(event.options.value))` unconditionally,
 * before it branches on mode, and handing that an absent option is a needless risk on a
 * control that fires mid-service.
 *
 * @param {string} id            stable action id
 * @param {string} connectionId  the novastar-controller connection
 * @param {number} delta         percentage points, signed
 */
const adjust = (id, connectionId, delta) => ({
	id,
	definitionId: 'set_brightness',
	connectionId,
	options: {
		mode: v('A'),
		which: v('O'),
		value: v('0'),
		adj: v(String(delta)),
	},
	upgradeIndex: null,
	type: 'action',
})

/** Shared control envelope. */
const control = ({ style, notes, rotary, actionSets }) => ({
	type: 'button-layered',
	style: { layers: layers(style) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: rotary,
		canModifyStyleInApis: false, notes,
	},
	feedbacks: [],
	steps: { 0: { action_sets: actionSets, options: { runWhileHeld: [] } } },
	localVariables: [],
})

/**
 * The strip zone: shows what the wall is currently at, and does nothing when pressed.
 *
 * @returns {object} a Companion control
 */
export const brightnessStrip = () =>
	control({
		style: { icon: 'brightness', label: `Wall ${BRIGHTNESS_VARIABLE}%`, bg: STRIP_BG },
		notes: 'LED wall brightness, as reported by the VX6S. Display only.',
		rotary: false,
		actionSets: { down: [], up: [] },
	})

/**
 * The encoder: turn to change brightness, press does nothing.
 *
 * @param {string} connectionId the novastar-controller connection
 * @returns {object} a Companion control
 */
export const brightnessKnob = (connectionId) =>
	control({
		style: { icon: 'brightness', label: 'Wall', bg: KNOB_BG },
		notes: `Turn to adjust LED wall brightness by ${BRIGHTNESS_STEP}% per detent. Press does nothing.`,
		rotary: true,
		actionSets: {
			down: [],
			up: [],
			rotate_left: [adjust('vw-brightness-down', connectionId, -BRIGHTNESS_STEP)],
			rotate_right: [adjust('vw-brightness-up', connectionId, BRIGHTNESS_STEP)],
		},
	})

/**
 * Add the pair to a page, in place on a copy.
 *
 * Refuses to land on an occupied cell rather than overwriting it: this runs against a live
 * rig's exported config, and silently replacing a working control would be the worst possible
 * outcome of a tool whose whole job is additive.
 *
 * @param {object} page          page as it appears in a Companion export
 * @param {string} connectionId  the novastar-controller connection
 * @param {number} column        strip/encoder column to occupy
 * @returns {object} a new page with the pair added
 * @throws if either cell is already in use
 */
export function addWallBrightness(page, connectionId, column = WALL_COLUMN) {
	const next = structuredClone(page)
	next.controls ??= {}

	for (const row of [STRIP_ROW, KNOB_ROW]) {
		if (next.controls[row]?.[column]) {
			throw new Error(`row ${row} column ${column} is already occupied — pick another column`)
		}
	}

	next.controls[STRIP_ROW] ??= {}
	next.controls[KNOB_ROW] ??= {}
	next.controls[STRIP_ROW][column] = brightnessStrip()
	next.controls[KNOB_ROW][column] = brightnessKnob(connectionId)

	return next
}
