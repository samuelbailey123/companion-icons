/**
 * The ATEM page: a program bus, a preview bus, and the transition controls beside them.
 *
 * WHY THIS SHAPE. The page this replaces had four source keys that each cut STRAIGHT TO
 * PROGRAM. There was no preview bus and no transition, so the only way to change what was on
 * screen was to take it there — every source change was a hard cut, live, with no way to line
 * one up first. This lays the deck out the way a switcher actually works: pick a source on
 * preview, look at it, then CUT or AUTO it to air.
 *
 * The program row keeps the old hot behaviour on purpose. Sometimes you do just need to take
 * a camera NOW, and having to preview-then-cut in an emergency is worse than a hot row that
 * is clearly labelled and physically separated from preview by a whole row.
 *
 * COLOUR IS NOT DECORATION HERE. Red is on air and green is cued; that is the one broadcast
 * convention nobody may get creative with, and getting it backwards would be worse than
 * showing nothing.
 *
 * These are the module's OWN action and feedback ids, read out of bmd-atem 4.1.2's preset
 * definitions rather than remembered:
 *   program / preview  actions and feedbacks, options { mixeffect, input }
 *   cut / auto         actions,                options { mixeffect }
 *   inTransition       feedback,               options { mixeffect }
 *
 * One deliberate departure from those presets: the module lights preview with #00FF00 under
 * white text, which measures 1.37:1 — fainter than the white-on-#DADADA button this whole
 * library exists to have caught. The tally colours below are the rig's own, and every
 * combination they produce is asserted in the tests.
 */

import { COLORS } from './palette.js'
import { ICONS } from './variants.js'
import { contrastVariant } from './wiring.js'

/** Mix effect this page drives. The Television Studio HD8 has one. */
export const ME = 1

/**
 * Tally colours, and the icon that stays legible on each.
 *
 * A single icon colour cannot serve all three states: white vanishes on the lit buses and
 * black vanishes on the idle key. So the icon is swapped per state — the same paper/ink rule
 * used everywhere else on this deck — and each pairing is contrast-checked.
 */
export const TALLY = {
	idle: { variant: 'paper' },
	program: { bg: 0xff0000, variant: 'ink' },
	preview: { bg: 0x00a651, variant: 'ink' },
}

/**
 * Resting background per row, so the two buses are never mistaken for one another.
 *
 * WITHOUT THIS THE ROWS ARE IDENTICAL. Sixteen keys in the same icons and the same black, the
 * top eight of which put a source STRAIGHT TO AIR. Tally tells them apart only while something
 * is lit — which is exactly not the case before a service starts, or any time the ATEM is
 * unreachable and every feedback is off. That is when someone leans in and presses a row they
 * have to count to identify.
 *
 * These are barely-there tints, a few percent off black: enough to read as "the red row" and
 * "the green row" at a glance, far too dark to be confused with the real tally above them, and
 * dark enough that the white icon still sits at better than 15:1.
 */
export const REST = {
	program: 0x1e0505,
	preview: 0x04140a,
	transition: 0x000000,
}

/** White, for every label on this page. */
const LABEL = 0xffffff

/**
 * The bus, left to right.
 *
 * Order is the operator's, not the ATEM's: the four cameras first because they are what gets
 * cut between during a service, then the graphics and playback sources. `input` is the ATEM's
 * own source id — 3010 is Media Player 1, which is why this is a list and not a range.
 */
export const SOURCES = [
	{ input: 1, icon: 'camera' },
	{ input: 2, icon: 'camera' },
	{ input: 3, icon: 'camera' },
	{ input: 4, icon: 'camera' },
	{ input: 5, icon: 'message' },
	{ input: 7, icon: 'media' },
	{ input: 6, icon: 'media' },
	{ input: 3010, icon: 'media' },
]

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

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
		id: 'image0', name: 'Image', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(2), width: v(100), height: v(56), rotation: v(0),
		base64Image: v(`$(image:${icon})`),
		halign: v('center'), valign: v('center'), fillMode: v('fit'),
	},
	{
		id: 'text0', name: 'Text', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(60), width: v(100), height: v(38), rotation: v(0),
		text: label.isExpression ? expr(label.value) : v(label.value), color: v(LABEL),
		halign: v('center'), valign: v('center'),
		fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

/** Style overrides that light a key: background, label colour, and the contrasting icon. */
const lit = (prefix, state, icon) => [
	{ overrideId: `${prefix}-bg`, elementId: 'box0', elementProperty: 'color', override: v(state.bg) },
	{ overrideId: `${prefix}-text`, elementId: 'text0', elementProperty: 'color', override: v(LABEL) },
	{
		overrideId: `${prefix}-icon`, elementId: 'image0', elementProperty: 'base64Image',
		override: v(`$(image:${icon}-${state.variant})`),
	},
]

const control = ({ style, feedbacks, actions }) => ({
	type: 'button-layered',
	style: { layers: layers(style) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes: '',
	},
	feedbacks,
	steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

/**
 * One key on a bus.
 *
 * EACH ROW SHOWS EXACTLY ONE COLOUR. The program row lights red and only red; the preview row
 * lights green and only green. A key's colour therefore means the same thing as the row it is
 * in, and nothing else.
 *
 * An earlier version gave program keys a preview feedback too, so you could read what was cued
 * without looking down a row. That was a mistake: taking a source to program can leave it on
 * preview as well, and the program key then went GREEN — the colour that everywhere else on
 * this page means "not on air", sitting on a key whose source was live. A row that can show
 * either colour has no reliable meaning, and it made the whole page a puzzle rather than a
 * readout. The preview row already answers "what is cued", which is its entire job.
 *
 * @param {'program'|'preview'} bus
 */
export function busKey(connectionId, bus, { input, icon }) {
	const options = { mixeffect: v(ME), input: v(input) }
	const feedback = (definitionId, state) => ({
		id: `atem-${bus}-${input}-${definitionId}`,
		type: 'feedback',
		definitionId,
		connectionId,
		options,
		isInverted: v(false),
		styleOverrides: lit(`${bus}-${input}-${definitionId}`, state, icon),
	})

	/*
	 * LABELLED FROM `long_`, NOT `short_`. The ATEM's short names on this switcher are still
	 * the factory defaults — short_5 and short_6 read "CAM5" and "CAM6" for inputs that are
	 * actually Words Overlay and PP1B. A key that confidently says CAM5 and takes a graphics
	 * source to air is worse than one with no label at all. The long names are the ones
	 * somebody actually set, so those are the ones the deck shows; `fontsizeAllowShrink`
	 * handles the couple that are wordy.
	 */
	return control({
		style: { icon: `${icon}-${TALLY.idle.variant}`, label: expr(`$(atem:long_${input})`), bg: REST[bus] },
		feedbacks: [feedback(bus, TALLY[bus])],
		actions: [
			{
				id: `atem-${bus}-${input}-act`,
				definitionId: bus,
				connectionId,
				options,
				upgradeIndex: null,
				type: 'action',
			},
		],
	})
}

/**
 * CUT or AUTO.
 *
 * Only AUTO carries the `inTransition` feedback. A cut is instantaneous, so lighting it would
 * be a flash too short to read — an indicator that never legibly indicates is just noise.
 *
 * @param {'cut'|'auto'} kind
 */
export function transitionKey(connectionId, kind) {
	const options = { mixeffect: v(ME) }
	return control({
		style: { icon: `${kind}-${TALLY.idle.variant}`, label: v(kind.toUpperCase()), bg: REST.transition },
		feedbacks:
			kind === 'auto'
				? [
						{
							id: 'atem-auto-intransition',
							type: 'feedback',
							definitionId: 'inTransition',
							connectionId,
							options,
							isInverted: v(false),
							styleOverrides: lit('auto-intransition', TALLY.program, kind),
						},
					]
				: [],
		actions: [
			{ id: `atem-${kind}-act`, definitionId: kind, connectionId, options, upgradeIndex: null, type: 'action' },
		],
	})
}

/**
 * The two bus rows and the transition column.
 *
 * @returns {{1: Record<number, object>, 2: Record<number, object>}} rows keyed by grid row
 */
export function busRows(connectionId, sources = SOURCES) {
	if (sources.length > 8) throw new Error(`${sources.length} sources but only 8 columns before the transition column`)

	const program = {}
	const preview = {}
	for (const [column, source] of sources.entries()) {
		program[column] = busKey(connectionId, 'program', source)
		preview[column] = busKey(connectionId, 'preview', source)
	}

	// Column 8 is the transition column: CUT above AUTO, hard against the right edge, where a
	// hand reaches without crossing the bus and hitting a source on the way.
	program[8] = transitionKey(connectionId, 'cut')
	preview[8] = transitionKey(connectionId, 'auto')

	return { 1: program, 2: preview }
}

const ICON_NAMES = new Set(ICONS.map((i) => i.name))

/** Companion stores colours as 24-bit ints; the palette is authored as hex. */
const asInt = (hex) => parseInt(hex.slice(1), 16)

/**
 * Give a stock bmd-atem macro key the symbol it never shipped with.
 *
 * WHY A PATCH AND NOT A BUILDER. The other keys on this page are generated whole, but macro
 * keys are dropped in from the module's own `macro_run` preset — and that preset defines text,
 * a background and four feedbacks, with NO image field at all. Three of them reached the rig
 * that way and sat there with an empty image layer: `base64Image: null` on a key whose caption
 * band had already been moved down to leave room for an icon, so the top 44% was a reserved
 * hole. Rebuilding the key from scratch would mean re-deriving which macro it runs and the
 * persisted local index behind it — real behaviour, re-implemented, to fix its appearance. So
 * this takes the working key and changes only how it looks.
 *
 * WHY THE ICON HAS TO CHANGE PER STATE. The module lights a running macro #00EE00 and a
 * waiting one #EEEE00, both under white text. A white icon there measures 1.59:1 and 1.25:1 —
 * fainter than the white-on-#DADADA key this whole library exists to have caught, and blank at
 * exactly the moment you look down to see whether the macro fired. Both the icon and the label
 * are therefore chosen per state by the same paper/ink rule used everywhere else, off the
 * background that state actually imposes rather than a colour table restated here. If the
 * module ever changes those colours, this follows them.
 *
 * The background is never touched: those colours are the module's signal for what a macro is
 * doing, and only their legibility is this library's business.
 *
 * @param {object} control    a macro key as exported from the rig
 * @param {{icon?: string}} [options]  library icon to use, without the -paper/-ink suffix
 * @returns {object} a new control; the input is left alone
 */
export function applyMacroIcon(control, { icon = 'macro-run' } = {}) {
	for (const variant of ['paper', 'ink']) {
		if (!ICON_NAMES.has(`${icon}-${variant}`)) throw new Error(`${icon}-${variant} is not in the library`)
	}

	const next = structuredClone(control)
	const layers = next.style?.layers ?? []

	/*
	 * Preconditions, not assumptions. Silently skipping a key that is not shaped like a macro
	 * key would report success while leaving the hole exactly as it was.
	 */
	const pick = (type) => {
		const found = layers.find((l) => l.type === type)
		if (!found) throw new Error(`macro key has no ${type} layer to style`)
		return found
	}
	const image = pick('image')
	const text = pick('text')
	const box = pick('box')

	/** Appearance for a key sitting on `bg`: the contrasting icon and the matching label. */
	const appearanceOn = (bg) => {
		const variant = contrastVariant(bg)
		return { icon: `$(image:${icon}-${variant})`, label: asInt(COLORS[variant]) }
	}

	// The resting key. Its own background is what the icon must read against when no feedback
	// is active — which is most of the time, and always before a service starts.
	const rest = appearanceOn(box.color.value)
	image.base64Image = { value: rest.icon, isExpression: false }
	text.color = { value: rest.label, isExpression: false }

	const put = (feedback, elementId, elementProperty, value) => {
		const kept = (feedback.styleOverrides ?? []).filter(
			(o) => !(o.elementId === elementId && o.elementProperty === elementProperty)
		)
		// Replace rather than append, and derive the id, so re-running over an already-patched
		// rig produces the same key instead of a second stack of overrides.
		kept.push({
			overrideId: `${feedback.id}-${elementId}-${elementProperty}`,
			elementId,
			elementProperty,
			override: { value, isExpression: false },
		})
		feedback.styleOverrides = kept
	}

	for (const feedback of next.feedbacks ?? []) {
		if (feedback.definitionId !== 'macro') continue

		// A state that imposes no background of its own leaves the resting tint showing, so the
		// resting variant is the right one for it.
		const lit = (feedback.styleOverrides ?? []).find(
			(o) => o.elementId === box.id && o.elementProperty === 'color'
		)
		const { icon: source, label } = appearanceOn(lit ? lit.override.value : box.color.value)

		put(feedback, image.id, 'base64Image', source)
		put(feedback, text.id, 'color', label)
	}

	return next
}
