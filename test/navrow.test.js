import { describe, expect, it } from 'vitest'
import { FOLDERS, NAV_ORDER, assertNavCoverage, navRow } from '../src/navrow.js'
import { COLUMNS } from '../src/layout.js'
import { ICONS } from '../src/variants.js'

const NUMBERS = { Home: 1, Power: 2, PP1: 3, MA2: 4, ATEM: 5, SQ7: 6, VH: 7, System: 8, Mics: 9 }

const layerOf = (control, type) => control.style.layers.find((l) => l.type === type)
const actionOf = (control) => control.steps[0].action_sets.down[0]

describe('the folder row', () => {
	it('fills every column of the deck exactly once', () => {
		const row = navRow('Home', NUMBERS)
		expect(Object.keys(row)).toHaveLength(COLUMNS)
		expect(NAV_ORDER).toHaveLength(COLUMNS)
		expect(new Set(NAV_ORDER).size).toBe(COLUMNS)
	})

	it('covers every page on the deck', () => {
		expect([...NAV_ORDER].sort()).toEqual(Object.keys(NUMBERS).sort())
	})

	it('sends each key to its own page', () => {
		const row = navRow('Home', NUMBERS)
		for (const [column, name] of NAV_ORDER.entries()) {
			const action = actionOf(row[column])
			expect(action.definitionId).toBe('set_page')
			expect(action.connectionId).toBe('internal')
			expect(action.options.surfaceId.value).toBe('self')
			expect(action.options.page.value).toBe(String(NUMBERS[name]))
		}
	})

	/* Companion reads page "0" as "wherever you already are", so it can never be a destination. */
	it('refuses page number zero', () => {
		expect(() => navRow('Home', { ...NUMBERS, VH: 0 })).toThrow(/reads as "current page"/)
	})

	it('refuses a page it has no number for', () => {
		const { SQ7, ...rest } = NUMBERS
		expect(() => navRow('Home', rest)).toThrow(/no page number for "SQ7"/)
	})

	it('refuses a page it has no art for', () => {
		const original = FOLDERS.VH
		delete FOLDERS.VH
		try {
			expect(() => navRow('Home', NUMBERS)).toThrow(/no folder art for "VH"/)
		} finally {
			FOLDERS.VH = original
		}
	})
})

describe('marking the current page', () => {
	it('borders the current page and nothing else', () => {
		const row = navRow('SQ7', NUMBERS)
		for (const [column, name] of NAV_ORDER.entries()) {
			const box = layerOf(row[column], 'box')
			expect(box.borderWidth.value, name).toBe(name === 'SQ7' ? 6 : 0)
		}
	})

	it('borders in the page accent, not an arbitrary highlight', () => {
		const row = navRow('MA2', NUMBERS)
		const box = layerOf(row[NAV_ORDER.indexOf('MA2')], 'box')
		expect(box.borderColor.value).toBe(FOLDERS.MA2.accent)
	})

	/*
	 * The reason a border was chosen over recolouring: the icon must sit on the SAME background
	 * whether or not its page is current, so its verified contrast still holds.
	 */
	it('leaves the icon and its background untouched when active', () => {
		const [inactive, active] = [navRow('Home', NUMBERS), navRow('VH', NUMBERS)].map(
			(row) => row[NAV_ORDER.indexOf('VH')]
		)
		expect(layerOf(active, 'image').base64Image.value).toEqual(layerOf(inactive, 'image').base64Image.value)
		expect(layerOf(active, 'box').color.value).toEqual(layerOf(inactive, 'box').color.value)
	})

	it('marks a different key on every page', () => {
		for (const name of NAV_ORDER) {
			const row = navRow(name, NUMBERS)
			const marked = NAV_ORDER.filter((_, c) => layerOf(row[c], 'box').borderWidth.value > 0)
			expect(marked).toEqual([name])
		}
	})
})

describe('folder art', () => {
	it('references only images the library actually ships', () => {
		const known = new Set(ICONS.map((i) => i.name))
		for (const [name, folder] of Object.entries(FOLDERS)) {
			expect(known.has(folder.image), `${name} → ${folder.image}`).toBe(true)
		}
	})

	it('wires each key to its own art', () => {
		const row = navRow('Home', NUMBERS)
		for (const [column, name] of NAV_ORDER.entries()) {
			expect(layerOf(row[column], 'image').base64Image.value).toBe(`$(image:${FOLDERS[name].image})`)
		}
	})

	it('labels each key with its page name', () => {
		const row = navRow('Home', NUMBERS)
		for (const [column, name] of NAV_ORDER.entries()) {
			expect(layerOf(row[column], 'text').text.value).toBe(name)
		}
	})

	it('gives every page a distinct resting background so the row is not nine grey slabs', () => {
		const backgrounds = NAV_ORDER.map((n) => FOLDERS[n].bg)
		expect(new Set(backgrounds).size).toBe(NAV_ORDER.length)
	})
})

describe('coverage checks', () => {
	it('passes when the row and the deck agree', () => {
		expect(() => assertNavCoverage(Object.keys(NUMBERS), COLUMNS)).not.toThrow()
	})

	it('catches a page that no folder points at', () => {
		expect(() => assertNavCoverage([...Object.keys(NUMBERS), 'Lyrics'], COLUMNS)).toThrow(
			/unreachable from the folder row: Lyrics/
		)
	})

	it('catches a folder pointing at a page that is gone', () => {
		expect(() => assertNavCoverage(Object.keys(NUMBERS).filter((n) => n !== 'VH'), COLUMNS)).toThrow(
			/do not exist: VH/
		)
	})

	it('catches the row not filling the deck', () => {
		expect(() => assertNavCoverage(Object.keys(NUMBERS), 8)).toThrow(/9 entries but the deck is 8 columns wide/)
	})
})
