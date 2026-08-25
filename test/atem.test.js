import { describe, expect, it } from 'vitest'
import { ME, REST, SOURCES, TALLY, busKey, busRows, transitionKey } from '../src/atem.js'
import { ICONS } from '../src/variants.js'
import { contrastRatio } from './helpers/skia.js'
import { COLORS, MIN_CONTRAST } from '../src/palette.js'

const ATEM = 'conn-atem'
const hex = (n) => '#' + n.toString(16).padStart(6, '0')

const layer = (control, id) => control.style.layers.find((l) => l.id === id)
const feedback = (control, definitionId) => control.feedbacks.find((f) => f.definitionId === definitionId)
const action = (control) => control.steps[0].action_sets.down[0]

describe('bus keys', () => {
	const cam1 = SOURCES[0]

	it('takes a source to the bus it belongs to', () => {
		expect(action(busKey(ATEM, 'program', cam1)).definitionId).toBe('program')
		expect(action(busKey(ATEM, 'preview', cam1)).definitionId).toBe('preview')
	})

	it('addresses the right mix effect and input', () => {
		const options = action(busKey(ATEM, 'program', cam1)).options
		expect(options.mixeffect.value).toBe(ME)
		expect(options.input.value).toBe(cam1.input)
	})

	it('labels itself from the ATEM rather than a hardcoded name', () => {
		const text = layer(busKey(ATEM, 'program', cam1), 'text0').text
		expect(text).toEqual({ value: `$(atem:long_${cam1.input})`, isExpression: true })
	})

	/*
	 * This rig's short names are still factory defaults: short_5 and short_6 say "CAM5" and
	 * "CAM6" for inputs that are really Words Overlay and PP1B. Only the long names were ever
	 * set, so a key must never be labelled from the short ones — a bus key that says CAM5 and
	 * takes graphics to air is worse than one with no label.
	 */
	it('never labels a key from the unmaintained short names', () => {
		for (const source of SOURCES) {
			const text = layer(busKey(ATEM, 'program', source), 'text0').text.value
			expect(text, `input ${source.input}`).not.toMatch(/short_/)
		}
	})

	/*
	 * THE REGRESSION THAT REACHED THE DECK. Program keys used to carry a preview feedback as
	 * well, so that taking a source to program — which can leave it cued too — turned the
	 * PROGRAM key green. Green means "not on air" everywhere else on this page, so a live key
	 * was wearing the safe colour. Each row now shows exactly one colour and one meaning.
	 */
	it('gives a program key only the program feedback', () => {
		expect(busKey(ATEM, 'program', cam1).feedbacks.map((f) => f.definitionId)).toEqual(['program'])
	})

	it('gives a preview key only the preview feedback', () => {
		expect(busKey(ATEM, 'preview', cam1).feedbacks.map((f) => f.definitionId)).toEqual(['preview'])
	})

	it('never lets a key light in the other row colour', () => {
		for (const [bus, wrong] of [['program', TALLY.preview.bg], ['preview', TALLY.program.bg]]) {
			for (const source of SOURCES) {
				const colours = busKey(ATEM, bus, source).feedbacks.flatMap((f) =>
					f.styleOverrides.filter((o) => o.elementProperty === 'color' && o.elementId === 'box0')
						.map((o) => o.override.value)
				)
				expect(colours, `${bus} key for input ${source.input}`).not.toContain(wrong)
			}
		}
	})

	it('rests with the light icon', () => {
		const key = busKey(ATEM, 'program', cam1)
		expect(layer(key, 'image0').base64Image.value).toBe(`$(image:${cam1.icon}-paper)`)
	})

	/*
	 * The two rows are otherwise identical — same eight icons, same eight labels — and the top
	 * one puts a source straight to air. Tally distinguishes them only while something is lit,
	 * which is not the case before a service or whenever the ATEM is unreachable. The resting
	 * tint is what keeps the hot row identifiable when every feedback is off.
	 */
	it('rests each bus on its own tint so the hot row is never guessed at', () => {
		expect(layer(busKey(ATEM, 'program', cam1), 'box0').color.value).toBe(REST.program)
		expect(layer(busKey(ATEM, 'preview', cam1), 'box0').color.value).toBe(REST.preview)
		expect(REST.program).not.toBe(REST.preview)
	})

	it('keeps the resting tints far darker than the tally they sit under', () => {
		// Each channel of a rest tint must be well below its lit counterpart, or a resting key
		// starts reading as a live one.
		const channels = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255]
		for (const bus of ['program', 'preview']) {
			const rest = channels(REST[bus])
			const lit = channels(TALLY[bus].bg)
			expect(Math.max(...rest), bus).toBeLessThan(Math.max(...lit) / 4)
		}
	})

	it('swaps to the dark icon and its own tally colour when lit', () => {
		for (const bus of ['program', 'preview']) {
			const state = TALLY[bus]
			const overrides = feedback(busKey(ATEM, bus, cam1), bus).styleOverrides
			const by = (el, prop) => overrides.find((o) => o.elementId === el && o.elementProperty === prop)
			expect(by('box0', 'color').override.value, bus).toBe(state.bg)
			expect(by('image0', 'base64Image').override.value, bus).toBe(`$(image:${cam1.icon}-${state.variant})`)
		}
	})

	it('gives every override on a key a unique id', () => {
		const key = busKey(ATEM, 'program', cam1)
		const ids = key.feedbacks.flatMap((f) => f.styleOverrides.map((o) => o.overrideId))
		expect(new Set(ids).size).toBe(ids.length)
	})
})

describe('transition keys', () => {
	it('cuts and autos on the right mix effect', () => {
		for (const kind of ['cut', 'auto']) {
			const key = transitionKey(ATEM, kind)
			expect(action(key).definitionId).toBe(kind)
			expect(action(key).options.mixeffect.value).toBe(ME)
			expect(action(key).options.input).toBeUndefined()
		}
	})

	it('lights AUTO while the transition runs', () => {
		expect(transitionKey(ATEM, 'auto').feedbacks.map((f) => f.definitionId)).toEqual(['inTransition'])
	})

	/* A cut is instantaneous; an indicator too brief to read is noise, not information. */
	it('does not try to indicate a cut in progress', () => {
		expect(transitionKey(ATEM, 'cut').feedbacks).toEqual([])
	})

	it('labels itself plainly', () => {
		expect(layer(transitionKey(ATEM, 'cut'), 'text0').text.value).toBe('CUT')
		expect(layer(transitionKey(ATEM, 'auto'), 'text0').text.value).toBe('AUTO')
	})
})

describe('the two rows', () => {
	const rows = busRows(ATEM)

	it('puts program above preview', () => {
		expect(Object.keys(rows)).toEqual(['1', '2'])
		expect(action(rows[1][0]).definitionId).toBe('program')
		expect(action(rows[2][0]).definitionId).toBe('preview')
	})

	it('lines each source up in the same column on both buses', () => {
		for (const [column, source] of SOURCES.entries()) {
			expect(action(rows[1][column]).options.input.value).toBe(source.input)
			expect(action(rows[2][column]).options.input.value).toBe(source.input)
		}
	})

	it('puts CUT and AUTO in the last column, clear of the sources', () => {
		expect(action(rows[1][8]).definitionId).toBe('cut')
		expect(action(rows[2][8]).definitionId).toBe('auto')
		expect(SOURCES.length).toBeLessThanOrEqual(8)
	})

	it('refuses more sources than there are columns before the transition', () => {
		const tooMany = Array.from({ length: 9 }, (_, i) => ({ input: i + 1, icon: 'camera' }))
		expect(() => busRows(ATEM, tooMany)).toThrow(/only 8 columns/)
	})
})

describe('sources', () => {
	it('has no duplicate inputs', () => {
		expect(new Set(SOURCES.map((s) => s.input)).size).toBe(SOURCES.length)
	})

	it('references only icons that ship with a contrast pair', () => {
		const known = new Set(ICONS.map((i) => i.name))
		for (const { icon } of [...SOURCES, { icon: 'cut' }, { icon: 'auto' }]) {
			expect(known.has(`${icon}-paper`), `${icon}-paper`).toBe(true)
			expect(known.has(`${icon}-ink`), `${icon}-ink`).toBe(true)
		}
	})
})

describe('tally legibility', () => {
	/*
	 * The check that matters. bmd-atem's own preview preset is white on #00FF00 — 1.37:1,
	 * fainter than the white-on-#DADADA button this library was built to have caught. Every
	 * state this page can be in is measured here instead of trusted.
	 */
	it.each([
		['program at rest', COLORS[TALLY.idle.variant], REST.program],
		['preview at rest', COLORS[TALLY.idle.variant], REST.preview],
		['transition at rest', COLORS[TALLY.idle.variant], REST.transition],
		['program live', COLORS[TALLY.program.variant], TALLY.program.bg],
		['preview cued', COLORS[TALLY.preview.variant], TALLY.preview.bg],
	])('keeps the icon legible when %s', (_name, fg, bg) => {
		const ratio = contrastRatio(fg, hex(bg))
		expect(ratio, `${hex(bg)} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
	})

	it('keeps the white label readable on both tally colours', () => {
		for (const state of [TALLY.program, TALLY.preview]) {
			expect(contrastRatio('#FFFFFF', hex(state.bg))).toBeGreaterThanOrEqual(MIN_CONTRAST)
		}
	})

	it("would have rejected the module's own preview colour", () => {
		expect(contrastRatio('#FFFFFF', '#00FF00')).toBeLessThan(MIN_CONTRAST)
	})
})
