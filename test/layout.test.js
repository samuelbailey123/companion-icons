import { describe, expect, it } from 'vitest'
import {
	COLUMNS,
	GRID_SIZE,
	KNOB_COLS,
	KNOB_ROW,
	STRIP_ROW,
	PAGE_OVERRIDES,
	assertPermutation,
	classify,
	destinationFor,
	isPureNavKey,
	relocatePage,
} from '../src/layout.js'

/** A plain key. */
const key = (label, actions = []) => ({
	type: 'button-layered',
	style: { layers: [{ type: 'text', text: { value: label, isExpression: false } }] },
	options: { rotaryActions: false },
	feedbacks: [],
	steps: { 0: { action_sets: { down: actions, up: [] } } },
})

/** A control the deck dispatches rotation to. */
const knob = (label) => ({ ...key(label), options: { rotaryActions: true } })

/** The per-page Home key the folder row replaces. */
const homeKey = () => key('Home', [{ definitionId: 'set_page', connectionId: 'internal' }])

const page = (controls) => ({ name: 'Test', controls })

describe('grid geometry', () => {
	/*
	 * These are transcribed from Companion's Stream Deck driver. If they drift, every page
	 * built from this module lands on cells the hardware does not have — so they are pinned
	 * rather than left as documentation.
	 */
	it('matches the + XL as Companion declares it', () => {
		expect(COLUMNS).toBe(9)
		expect(STRIP_ROW).toBe(4)
		expect(KNOB_ROW).toBe(5)
		expect(KNOB_COLS).toEqual([0, 2, 3, 5, 6, 8])
	})

	it('describes a grid big enough for every row it uses', () => {
		expect(GRID_SIZE).toEqual({ minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 })
	})

	it('leaves columns 1, 4 and 7 free of strip zones and encoders', () => {
		for (const absent of [1, 4, 7]) expect(KNOB_COLS).not.toContain(absent)
	})
})

describe('classification', () => {
	it('calls a rotary control a knob wherever it sits', () => {
		expect(classify(knob('House'), 3)).toBe('knob')
		expect(classify(knob('House'), 0)).toBe('knob')
	})

	/*
	 * The regression that motivated behaviour-based classification. Four working keys were
	 * authored on row 3 — the old encoder row — and a position-based rule would have moved
	 * them onto the touchstrip, where a press does something else entirely.
	 */
	it('calls a non-rotary control on the old encoder row a key', () => {
		expect(classify(key('Green wall'), 3)).toBe('key')
	})

	it('calls a non-rotary control on the old touchstrip row a strip zone', () => {
		expect(classify(key('PROGRAM'), 2)).toBe('strip')
	})

	it('tolerates a control with no options at all', () => {
		expect(classify({}, 1)).toBe('key')
		expect(classify(undefined, 1)).toBe('key')
	})
})

describe('keys the folder row makes redundant', () => {
	it('recognises a pure page jump wherever it sits', () => {
		expect(isPureNavKey(homeKey())).toBe(true)
	})

	/*
	 * The old Home page is eight of these, and they must ALL go — that is what empties the page
	 * for its dashboard. An earlier position-based rule only caught the one at 0/0, which would
	 * have left seven duplicates of the folder row sitting on Home.
	 */
	it('recognises every folder on the old Home page, not just the first', () => {
		const folders = [2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
			key(`page ${n}`, [{ definitionId: 'set_page', connectionId: 'internal', options: { page: String(n) } }])
		)
		expect(folders.every(isPureNavKey)).toBe(true)
	})

	/* A button that navigates as PART of doing something else is not navigation. */
	it('is not a button that jumps pages alongside other work', () => {
		const combo = key('Setup', [
			{ definitionId: 'set_page', connectionId: 'internal' },
			{ definitionId: 'macro_run', connectionId: 'atem' },
		])
		expect(isPureNavKey(combo)).toBe(false)
	})

	it('is not a button with no actions', () => {
		expect(isPureNavKey(key('Readout'))).toBe(false)
	})

	it('is not a readout with no steps at all', () => {
		expect(isPureNavKey({})).toBe(false)
	})
})

describe('destinations', () => {
	it('drops the top two key rows by one to clear the folder row', () => {
		expect(destinationFor('key', 0, 3)).toEqual([1, 3])
		expect(destinationFor('key', 1, 0)).toEqual([2, 0])
	})

	/* Rows 2 and 3 are already key rows on the new deck; moving them would be pure churn. */
	it('leaves keys already on rows 2 and 3 exactly where they are', () => {
		expect(destinationFor('key', 2, 6)).toEqual([2, 6])
		expect(destinationFor('key', 3, 4)).toEqual([3, 4])
	})

	it('spreads the old four strip zones across the new six', () => {
		expect([0, 1, 2, 3].map((c) => destinationFor('strip', 2, c))).toEqual([
			[STRIP_ROW, 0],
			[STRIP_ROW, 2],
			[STRIP_ROW, 3],
			[STRIP_ROW, 5],
		])
	})

	/*
	 * SQ7's knobs sit at old columns 0, 1 and 3 — two together and one apart. That gap is the
	 * layout: Main is deliberately not adjacent to the two aux sends. Slot-indexing preserves it.
	 */
	it('preserves the gap between grouped and separated knobs', () => {
		expect([0, 1, 3].map((c) => destinationFor('knob', 3, c)[1])).toEqual([0, 2, 5])
	})

	it('refuses a slot the new deck has no control for', () => {
		expect(() => destinationFor('knob', 3, 6)).toThrow(/only 6 knob slots/)
		expect(() => destinationFor('strip', 2, 9)).toThrow(/only 6 strip slots/)
	})
})

describe('relocating a page', () => {
	it('drops redundant navigation and reports it', () => {
		const p = page({ 0: { 0: homeKey(), 1: key('Projectors') } })
		const result = relocatePage(p, 'Power')
		expect(result.dropped).toEqual(['0/0'])
		expect(result.controls[1][1]).toBe(p.controls['0']['1'])
		expect(result.controls[1][0]).toBeUndefined()
	})

	it('sends keys, strip zones and knobs to their own rows', () => {
		const p = page({
			0: { 1: key('Go Next') },
			2: { 0: key('House readout') },
			3: { 0: knob('House') },
		})
		const { controls } = relocatePage(p, 'MA2')
		expect(controls[1][1]).toBeDefined()
		expect(controls[STRIP_ROW][0]).toBeDefined()
		expect(controls[KNOB_ROW][0]).toBeDefined()
	})

	it('leaves keys authored on the old encoder row untouched', () => {
		const p = page({ 3: { 3: key('Thunder'), 6: key('Storm water') } })
		const { controls, moves } = relocatePage(p, 'PP1')
		expect(controls[3][3]).toBe(p.controls['3']['3'])
		expect(controls[3][6]).toBe(p.controls['3']['6'])
		expect(moves.every((m) => m.from === m.to)).toBe(true)
	})

	it('applies a page override in preference to the default', () => {
		const p = page({ 0: { 1: key('BGV 1-4') } })
		const { controls, moves } = relocatePage(p, 'Mics')
		expect(controls[2][2]).toBe(p.controls['0']['1'])
		expect(moves[0]).toMatchObject({ from: '0/1', to: '2/2', overridden: true })
	})

	it('reports unoverridden moves as such', () => {
		const { moves } = relocatePage(page({ 0: { 1: key('PA') } }), 'Power')
		expect(moves[0].overridden).toBe(false)
	})

	/*
	 * The default rules cannot collide on their own — keys from rows 0, 1 and 3 land on three
	 * different rows, and strip zones and knobs get a row each. Only the override table can
	 * aim two controls at one cell, so that is what this forces. Silently letting the second
	 * win would delete a working button, which is the one outcome that must never be quiet.
	 */
	it('refuses to put two controls in one cell', () => {
		expect(PAGE_OVERRIDES.Mics['0/1']).toEqual([2, 2])
		PAGE_OVERRIDES.Mics['0/4'] = [2, 2]
		try {
			const p = page({ 0: { 1: key('BGV 1-4'), 4: key('squatter') } })
			expect(() => relocatePage(p, 'Mics')).toThrow(/0\/4 and 0\/1 both land on 2\/2/)
		} finally {
			delete PAGE_OVERRIDES.Mics['0/4']
		}
	})

	it('refuses a control that would land on the folder row', () => {
		// A strip zone can never reach row 0, so this is forced through an override table entry.
		const p = page({ 0: { 1: key('x') } })
		const original = PAGE_OVERRIDES.Mics['0/1']
		PAGE_OVERRIDES.Mics['0/1'] = [0, 4]
		try {
			expect(() => relocatePage(p, 'Mics')).toThrow(/reserved for the folder row/)
		} finally {
			PAGE_OVERRIDES.Mics['0/1'] = original
		}
	})

	it('refuses a control pushed outside the grid', () => {
		const p = page({ 0: { 1: key('x') } })
		const original = PAGE_OVERRIDES.Mics['0/1']
		PAGE_OVERRIDES.Mics['0/1'] = [2, COLUMNS]
		try {
			expect(() => relocatePage(p, 'Mics')).toThrow(/outside the 9x6 grid/)
		} finally {
			PAGE_OVERRIDES.Mics['0/1'] = original
		}
	})

	it('refuses a plain key dropped onto the touchstrip or encoder row', () => {
		const p = page({ 0: { 1: key('x') } })
		const original = PAGE_OVERRIDES.Mics['0/1']
		PAGE_OVERRIDES.Mics['0/1'] = [KNOB_ROW, 0]
		try {
			expect(() => relocatePage(p, 'Mics')).toThrow(/cannot land on the touchstrip or encoder row/)
		} finally {
			PAGE_OVERRIDES.Mics['0/1'] = original
		}
	})

	it('refuses a knob on a column the deck has no encoder for', () => {
		const p = page({ 3: { 0: knob('House') } })
		const original = PAGE_OVERRIDES.Mics['3/0']
		PAGE_OVERRIDES.Mics['3/0'] = [KNOB_ROW, 1]
		try {
			expect(() => relocatePage(p, 'Mics')).toThrow(/column 1 has no knob/)
		} finally {
			if (original === undefined) delete PAGE_OVERRIDES.Mics['3/0']
			else PAGE_OVERRIDES.Mics['3/0'] = original
		}
	})

	/*
	 * PP1 was rebuilt by hand directly on the + XL: 8 keys across row 1, keys on rows 2 and 3
	 * out to column 8, and two touchstrip readouts on row 4. Running the normal rules over it
	 * would read row 2 as the old touchstrip and move working transport keys onto the strip.
	 */
	describe('a page already authored on the new deck', () => {
		const gridded = () =>
			page({
				0: { 0: homeKey() },
				1: { 0: key('Clear All'), 7: key('Clear Vid Inputs') },
				2: { 0: key('Focus Prev'), 8: key('Stage Notes') },
				3: { 3: key('Thunder'), 8: key('Storm water') },
				4: { 0: key('Speaker timer'), 2: key('Worship timer') },
			})

		it('leaves every control exactly where it was', () => {
			const p = gridded()
			const { controls, moves } = relocatePage(p, 'PP1', { alreadyGridded: true })
			expect(moves.every((m) => m.from === m.to)).toBe(true)
			for (const [r, cells] of Object.entries(p.controls)) {
				for (const [c, control] of Object.entries(cells)) {
					if (r === '0') continue
					expect(controls[r][c], `${r}/${c}`).toBe(control)
				}
			}
		})

		it('still clears the redundant nav key so the folder row can land', () => {
			const result = relocatePage(gridded(), 'PP1', { alreadyGridded: true })
			expect(result.dropped).toEqual(['0/0'])
			expect(result.controls[0]).toBeUndefined()
		})

		it('does not treat row 2 as a touchstrip', () => {
			const { controls } = relocatePage(gridded(), 'PP1', { alreadyGridded: true })
			expect(controls[2][0]).toBeDefined()
			expect(controls[STRIP_ROW][8]).toBeUndefined()
		})

		it('reconciles under the permutation check', () => {
			const p = gridded()
			expect(assertPermutation(p, relocatePage(p, 'PP1', { alreadyGridded: true }), 'PP1')).toEqual({
				before: 9,
				after: 8,
				dropped: 1,
			})
		})

		it('refuses a page with real content already on the folder row', () => {
			const p = page({ 0: { 4: key('squatter') } })
			expect(() => relocatePage(p, 'PP1', { alreadyGridded: true })).toThrow(/already has a control there/)
		})

		it('refuses a strip zone on a column the deck has none', () => {
			const p = page({ 4: { 1: key('nowhere') } })
			expect(() => relocatePage(p, 'PP1', { alreadyGridded: true })).toThrow(/has no control on that row/)
		})

		it('refuses a non-rotary control sitting on the encoder row', () => {
			const p = page({ 5: { 0: key('not a knob') } })
			expect(() => relocatePage(p, 'PP1', { alreadyGridded: true })).toThrow(/non-rotary control is sitting/)
		})

		it('keeps a genuine knob on the encoder row', () => {
			const p = page({ 5: { 3: knob('House') } })
			const { controls } = relocatePage(p, 'PP1', { alreadyGridded: true })
			expect(controls[5][3]).toBe(p.controls['5']['3'])
		})
	})

	it('handles a page with no controls at all', () => {
		expect(relocatePage({ name: 'Empty' }, 'Empty')).toEqual({ controls: {}, moves: [], dropped: [] })
	})
})

describe('the permutation guarantee', () => {
	const built = () => {
		const p = page({
			0: { 0: homeKey(), 1: key('Focus Prev') },
			2: { 0: key('Speaker') },
			3: { 0: knob('House'), 3: key('Thunder') },
		})
		return { p, result: relocatePage(p, 'PP1') }
	}

	it('reconciles the counts and passes an untouched relocation', () => {
		const { p, result } = built()
		expect(assertPermutation(p, result, 'PP1')).toEqual({ before: 5, after: 4, dropped: 1 })
	})

	it('catches a control that was altered in transit', () => {
		const { p, result } = built()
		result.controls[1][1] = { ...result.controls[1][1], options: { rotaryActions: true } }
		expect(() => assertPermutation(p, result, 'PP1')).toThrow(/control 0\/1 was altered on its way to 1\/1/)
	})

	it('catches a control that went missing', () => {
		const { p, result } = built()
		delete result.controls[STRIP_ROW][0]
		expect(() => assertPermutation(p, result, 'PP1')).toThrow(/does not reconcile/)
	})

	it('catches a control that appeared from nowhere', () => {
		const { p, result } = built()
		result.controls[1][8] = key('surprise')
		expect(() => assertPermutation(p, result, 'PP1')).toThrow(/does not reconcile/)
	})

	it('accepts a page that had nothing to move', () => {
		const p = page({})
		expect(assertPermutation(p, relocatePage(p, 'Empty'), 'Empty')).toEqual({ before: 0, after: 0, dropped: 0 })
	})
})
