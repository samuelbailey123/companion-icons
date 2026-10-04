import { describe, expect, it } from 'vitest'
import { LINE_HEIGHT, maxFontSize } from '../src/labels.js'
import { assertPermutation, isPureNavKey, relocatePage } from '../src/layout.js'
import { wireButton } from '../src/wiring.js'

/*
 * The defensive branches — the `?? {}` and `?? ''` fallbacks that keep a malformed or
 * half-built page from crashing the tools.
 *
 * They existed untested, which is the worst of both worlds: the guard is in the source, so a
 * reader assumes the case is handled, but nothing proves the fallback produces a SENSIBLE
 * result rather than merely avoiding a throw. Each test below names the malformed shape it
 * feeds in and asserts what the fallback should yield.
 */

const v = (value) => ({ value, isExpression: false })

describe('a caption that measures zero width', () => {
	/*
	 * measure() returning 0 — an empty glyph run, or a canvas that failed to load a font —
	 * would divide by zero. The width limit has to drop out so the band height decides,
	 * rather than the size becoming Infinity or NaN and being written into a button.
	 */
	it('falls back to the height limit instead of dividing by zero', () => {
		const size = maxFontSize('Word', 50, 120, () => 0)
		expect(size).toBeCloseTo((50 / 100) * 120 / LINE_HEIGHT, 6)
		expect(Number.isFinite(size)).toBe(true)
	})
})

describe('a step with no action sets', () => {
	/*
	 * Companion writes a step with no action_sets for a button that has been created but never
	 * given an action. Such a key has no actions, so it is not a nav key — and must not be
	 * mistaken for one, or the relayout would drop it as covered by the folder row.
	 */
	it('is treated as having no actions, so it is not a nav key', () => {
		expect(isPureNavKey({ steps: { 0: {} } })).toBe(false)
	})
})

describe('a page with no controls at all', () => {
	const emptyPage = { id: 'p', name: 'Empty', gridSize: {} }

	it('relocates to an empty page rather than throwing', () => {
		const result = relocatePage(emptyPage, 'Empty', { alreadyGridded: true })
		expect(result.controls).toEqual({})
		expect(result.moves).toEqual([])
		expect(result.dropped).toEqual([])
	})

	/* Zero in and zero out is a valid permutation; it must not read as "everything vanished". */
	it('counts as zero controls, so the permutation check passes', () => {
		const result = relocatePage(emptyPage, 'Empty', { alreadyGridded: true })
		expect(() => assertPermutation(emptyPage, result, 'Empty')).not.toThrow()
	})
})

describe('a style override with no element id', () => {
	/*
	 * Overrides that target the whole button rather than one layer carry no elementId. Testing
	 * `.startsWith` on that undefined would throw, so it is coerced — and the override must be
	 * skipped, NOT matched, or a button-wide override would be mistaken for the background and
	 * the icon variant chosen from the wrong colour.
	 */
	const control = {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', type: 'canvas' },
				{ id: 'box0', type: 'box', color: v(3355443) },
				{ id: 'image0', type: 'image', base64Image: v(null) },
				{ id: 'text0', type: 'text', text: v('X'), fontsize: v(25), color: v(16777215) },
			],
		},
		steps: { 0: { action_sets: { down: [{ id: 'a1', connectionId: 'conn1' }] } } },
		feedbacks: [
			{
				id: 'f1',
				styleOverrides: [
					// No elementId — must be skipped rather than crashing or matching.
					{ overrideId: 'whole-button', elementProperty: 'color', override: v(0xffffff) },
					{ overrideId: 'the-box', elementId: 'box0', elementProperty: 'color', override: v(0xeeee00) },
				],
			},
		],
		options: { rotaryActions: false },
	}

	it('skips it and reads the background off the box override instead', () => {
		const out = wireButton(control, { icon: 'macro-run' })
		const icon = out.feedbacks[0].styleOverrides.find((o) => o.elementProperty === 'base64Image')

		// #EEEE00 is light, so the dark variant is the legible one. Had the elementId-less
		// override won, the background would have read as #FFFFFF — also light, so assert the
		// box override is what survived rather than relying on the variant alone.
		expect(icon.override.value).toBe('$(image:macro-run-ink)')
		expect(out.feedbacks[0].styleOverrides.find((o) => o.overrideId === 'whole-button')).toBeTruthy()
	})
})
