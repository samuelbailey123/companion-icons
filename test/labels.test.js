import { describe, expect, it } from 'vitest'
import { LINE_HEIGHT, PADDING, maxFontSize, toFontSizePercent, uniformFontSize, wrapLabel } from '../src/labels.js'

/** A stand-in for real text metrics: every glyph half an em wide. */
const measure = (text, size) => text.length * size * 0.5

const KEY = 112

describe('wrapping', () => {
	it('leaves a short caption alone', () => {
		expect(wrapLabel('Next')).toBe('Next')
		expect(wrapLabel('Thunder')).toBe('Thunder')
	})

	it('breaks a long caption at a word boundary', () => {
		expect(wrapLabel('Transition Song')).toBe('Transition\nSong')
	})

	/*
	 * The longest LINE on the page sets the size for every key, so a split that leaves one long
	 * line has cost the whole page. "Clear Vid Inputs" balances to 9 and 6, not 5 and 10.
	 */
	it('balances the two lines rather than breaking at the first space', () => {
		expect(wrapLabel('Clear Vid Inputs')).toBe('Clear Vid\nInputs')
	})

	it('collapses the padding newlines some captions carry', () => {
		expect(wrapLabel('Clear\\n\\n\\nMessages')).toBe('Clear\nMessages')
	})

	it('cannot break a single long word', () => {
		expect(wrapLabel('Announcements')).toBe('Announcements')
	})

	it('honours a different wrap threshold', () => {
		expect(wrapLabel('Clear All', 20)).toBe('Clear All')
		expect(wrapLabel('Clear All', 4)).toBe('Clear\nAll')
	})
})

describe('fitting one caption', () => {
	it('is limited by height when the caption is short and stacked', () => {
		// Two lines in a 46% band: 51.52 / (2 * 1.18) = 21.8
		const size = maxFontSize('Clear\nAudio', 46, KEY, measure)
		expect(size).toBeCloseTo((0.46 * KEY) / (2 * LINE_HEIGHT), 5)
	})

	it('is limited by width when a line is long', () => {
		// 10 characters at half an em must fit 112 - 12 = 100px
		const size = maxFontSize('Transition', 100, KEY, measure)
		expect(size).toBeCloseTo((KEY - PADDING * 2) / (10 * 0.5), 5)
	})

	it('gets smaller as lines are added', () => {
		const one = maxFontSize('Clear', 46, KEY, measure)
		const two = maxFontSize('Clear\nAudio', 46, KEY, measure)
		expect(two).toBeLessThan(one)
	})

	it('ignores an empty line rather than dividing by its zero width', () => {
		expect(Number.isFinite(maxFontSize('Clear\n\nAudio', 46, KEY, measure))).toBe(true)
	})

	/*
	 * The touchstrip is 200x100, not a square key. Measuring its captions against the key width
	 * would size them for half the room they actually have.
	 */
	it('measures width separately from height for a non-square zone', () => {
		const square = maxFontSize('Speaker', 100, 100, measure)
		const strip = maxFontSize('Speaker', 100, 100, measure, 200)
		expect(strip).toBeGreaterThan(square)
	})

	it('defaults the width to the key size when none is given', () => {
		expect(maxFontSize('Speaker', 100, KEY, measure)).toBe(maxFontSize('Speaker', 100, KEY, measure, KEY))
	})
})

describe('one size for the page', () => {
	const labels = ['Next', 'Clear\nAudio', 'Transition\nSong', 'Clear Vid\nInputs']

	it('takes the smallest fit so every caption fits', () => {
		const { size } = uniformFontSize(labels, 46, KEY, measure)
		for (const label of labels) {
			expect(maxFontSize(label, 46, KEY, measure), label).toBeGreaterThanOrEqual(size)
		}
	})

	it('reports which caption set the limit, so it can be shortened if wanted', () => {
		const { limitedBy } = uniformFontSize(labels, 46, KEY, measure)
		expect(labels).toContain(limitedBy.label)
	})

	/* Rounding UP would put the worst caption a fraction over its band — the overflow this avoids. */
	it('floors rather than rounds', () => {
		const { size } = uniformFontSize(['Clear\nAudio'], 46, KEY, measure)
		expect(Number.isInteger(size)).toBe(true)
		expect(size).toBeLessThanOrEqual(maxFontSize('Clear\nAudio', 46, KEY, measure))
	})

	it('grows when the band grows', () => {
		const small = uniformFontSize(labels, 46, KEY, measure).size
		const large = uniformFontSize(labels, 60, KEY, measure).size
		expect(large).toBeGreaterThanOrEqual(small)
	})

	it('never returns a size below one pixel', () => {
		expect(uniformFontSize(['A very very long single line indeed'], 4, KEY, measure).size).toBeGreaterThanOrEqual(1)
	})

	/* Silently defaulting would restyle every key on a page whose captions were never found. */
	it('refuses to guess when there is nothing to measure', () => {
		expect(() => uniformFontSize([], 46, KEY, measure)).toThrow(/no captions/)
	})
})

describe("Companion's font size unit", () => {
	/*
	 * The regression this exists to prevent. `fontsize` is a PERCENTAGE OF THE ELEMENT HEIGHT,
	 * not pixels. Writing a measured pixel value into it once shrank every caption on a live
	 * page to under half its previous size — 23 meant 23% of a 58px band, about 13px.
	 */
	it('expresses pixels as a percentage of the band', () => {
		expect(toFontSizePercent(29, 58)).toBe(50)
		expect(toFontSizePercent(58, 58)).toBe(100)
	})

	it('is not the identity, however tempting', () => {
		expect(toFontSizePercent(23, 58.24)).not.toBe(23)
		expect(toFontSizePercent(23, 58.24)).toBeGreaterThan(23)
	})

	it('clamps to the range Companion accepts', () => {
		expect(toFontSizePercent(0.1, 100)).toBe(3)
		expect(toFontSizePercent(1000, 100)).toBe(200)
	})

	it('refuses a band with no height rather than dividing by zero', () => {
		expect(() => toFontSizePercent(20, 0)).toThrow(/positive/)
	})
})
