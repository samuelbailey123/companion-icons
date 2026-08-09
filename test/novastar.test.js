import { describe, expect, it } from 'vitest'
import {
	BRIGHTNESS_STEP,
	WALL_COLUMN,
	addWallBrightness,
	brightnessKnob,
	brightnessStrip,
} from '../src/novastar.js'
import { KNOB_COLS, KNOB_ROW, STRIP_ROW } from '../src/layout.js'
import { ICONS } from '../src/variants.js'

const CONNECTION = 'WhM7ot7YE9NcRVgL_FmGl'

/** Every action across every action set of a control. */
const actionsIn = (control, group) => control.steps[0].action_sets[group] ?? []

const layerOfType = (control, type) => control.style.layers.find((l) => l.type === type)

describe('the brightness strip readout', () => {
	it('shows the module-published brightness rather than a copy of it', () => {
		expect(layerOfType(brightnessStrip(), 'text').text.value).toBe('Wall $(novastar:brite)%')
	})

	it('draws the brightness icon the library ships', () => {
		const icon = layerOfType(brightnessStrip(), 'image').base64Image.value
		expect(icon).toBe('$(image:brightness)')
		expect(ICONS.some((i) => i.name === 'brightness')).toBe(true)
	})

	it('is not a rotary and does nothing when pressed', () => {
		const strip = brightnessStrip()
		expect(strip.options.rotaryActions).toBe(false)
		expect(actionsIn(strip, 'down')).toHaveLength(0)
		expect(actionsIn(strip, 'up')).toHaveLength(0)
	})
})

describe('the brightness encoder', () => {
	it('declares itself a rotary, which is what the deck dispatches on', () => {
		expect(brightnessKnob(CONNECTION).options.rotaryActions).toBe(true)
	})

	it('adjusts down on the left detent and up on the right, by the same step', () => {
		const knob = brightnessKnob(CONNECTION)
		const [left] = actionsIn(knob, 'rotate_left')
		const [right] = actionsIn(knob, 'rotate_right')

		expect(left.options.adj.value).toBe(String(-BRIGHTNESS_STEP))
		expect(right.options.adj.value).toBe(String(BRIGHTNESS_STEP))
	})

	/*
	 * Mode 'A' is the whole reason this works on an encoder: it adds to the brightness the
	 * module already tracks. Mode 'S' would set an absolute value, so every detent would
	 * jump the wall to the same number instead of nudging it.
	 */
	it('uses adjust mode on the global channel', () => {
		for (const group of ['rotate_left', 'rotate_right']) {
			const [action] = actionsIn(brightnessKnob(CONNECTION), group)
			expect(action.definitionId).toBe('set_brightness')
			expect(action.options.mode.value).toBe('A')
			expect(action.options.which.value).toBe('O')
		}
	})

	/*
	 * The module parses `value` before it branches on mode, so the option has to exist even
	 * though adjust mode never uses it.
	 */
	it('still supplies a parseable value option, which adjust mode reads before branching', () => {
		for (const group of ['rotate_left', 'rotate_right']) {
			const [action] = actionsIn(brightnessKnob(CONNECTION), group)
			expect(Number.isNaN(parseFloat(action.options.value.value))).toBe(false)
		}
	})

	it('routes both detents to the connection it was given', () => {
		const knob = brightnessKnob(CONNECTION)
		for (const group of ['rotate_left', 'rotate_right']) {
			expect(actionsIn(knob, group)[0].connectionId).toBe(CONNECTION)
		}
	})

	it('does nothing when pressed, so a knocked encoder cannot jump the wall', () => {
		const knob = brightnessKnob(CONNECTION)
		expect(actionsIn(knob, 'down')).toHaveLength(0)
		expect(actionsIn(knob, 'up')).toHaveLength(0)
	})
})

describe('placing the pair on a page', () => {
	it('lands the readout and the encoder in the same column', () => {
		const page = addWallBrightness({ controls: {} }, CONNECTION)
		expect(page.controls[STRIP_ROW][WALL_COLUMN]).toBeDefined()
		expect(page.controls[KNOB_ROW][WALL_COLUMN]).toBeDefined()
		expect(page.controls[KNOB_ROW][WALL_COLUMN].options.rotaryActions).toBe(true)
	})

	/* An encoder only physically exists at these columns. */
	it('occupies a column the deck actually has an encoder at', () => {
		expect(KNOB_COLS).toContain(WALL_COLUMN)
	})

	it('works on a page with no controls at all', () => {
		const page = addWallBrightness({}, CONNECTION)
		expect(page.controls[KNOB_ROW][WALL_COLUMN]).toBeDefined()
	})

	it('leaves the page it was given untouched', () => {
		const original = { controls: { [STRIP_ROW]: {} } }
		const snapshot = JSON.stringify(original)
		addWallBrightness(original, CONNECTION)
		expect(JSON.stringify(original)).toBe(snapshot)
	})

	it('keeps controls that are already on the page', () => {
		const existing = { type: 'button-layered', marker: true }
		const page = addWallBrightness({ controls: { [STRIP_ROW]: { 0: existing } } }, CONNECTION)
		expect(page.controls[STRIP_ROW][0]).toEqual(existing)
	})

	/*
	 * The refusal is the point. This runs against a live rig's export, where an overwrite
	 * would delete a working control with no error and no way to notice.
	 */
	it('refuses to overwrite an occupied strip zone', () => {
		const page = { controls: { [STRIP_ROW]: { [WALL_COLUMN]: { type: 'button-layered' } } } }
		expect(() => addWallBrightness(page, CONNECTION)).toThrow(/already occupied/)
	})

	it('refuses to overwrite an occupied encoder', () => {
		const page = { controls: { [KNOB_ROW]: { [WALL_COLUMN]: { type: 'button-layered' } } } }
		expect(() => addWallBrightness(page, CONNECTION)).toThrow(/already occupied/)
	})

	it('accepts an explicit column', () => {
		const page = addWallBrightness({ controls: {} }, CONNECTION, 8)
		expect(page.controls[KNOB_ROW][8]).toBeDefined()
		expect(page.controls[KNOB_ROW][WALL_COLUMN]).toBeUndefined()
	})
})
