import { describe, expect, it } from 'vitest'
import { applyMacroIcon } from '../src/atem.js'
import { ICONS } from '../src/variants.js'
import { COLORS, MIN_CONTRAST } from '../src/palette.js'
import { contrastRatio } from './helpers/skia.js'
import LIVE_MACRO_KEY from './fixtures/macro-key.json' with { type: 'json' }

/*
 * The fixture is the REAL control, lifted off the rig — ATEM page, key 3/7, the stock
 * bmd-atem "Run macro X" preset exactly as the module drops it in. Testing against a
 * hand-written stub would prove the helper works on a shape nobody ships; the whole defect
 * here is that the module's own preset has no image, so the module's own preset is what has
 * to go through it.
 */
const clone = (o) => JSON.parse(JSON.stringify(o))
const hex = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0')

const layer = (control, id) => control.style.layers.find((l) => l.id === id)
const macroFeedback = (control, state) =>
	control.feedbacks.find((f) => f.definitionId === 'macro' && f.options.state.value === state)
const override = (feedback, elementId, elementProperty) =>
	feedback.styleOverrides.find((o) => o.elementId === elementId && o.elementProperty === elementProperty)

/** The background each state imposes, read off the fixture rather than restated here. */
const BG = Object.fromEntries(
	LIVE_MACRO_KEY.feedbacks.map((f) => [f.options.state.value, override(f, 'box0', 'color').override.value])
)

/** Every state the key can be in, with the background it wears. `null` is the resting key. */
const STATES = [
	['at rest', null, 0x000000],
	['marked as used', 'isUsed', BG.isUsed],
	['running', 'isRunning', BG.isRunning],
	['waiting', 'isWaiting', BG.isWaiting],
	['recording', 'isRecording', BG.isRecording],
]

/** Icon and label a state ends up with, whether it came from the base layer or an override. */
const appearance = (control, state) => {
	if (state === null) {
		return { icon: layer(control, 'image0').base64Image.value, label: layer(control, 'text0').color.value }
	}
	const f = macroFeedback(control, state)
	return {
		icon: override(f, 'image0', 'base64Image').override.value,
		label: override(f, 'text0', 'color').override.value,
	}
}

describe('applyMacroIcon', () => {
	const fixed = applyMacroIcon(clone(LIVE_MACRO_KEY))

	it('fills the empty image layer the module left behind', () => {
		expect(layer(LIVE_MACRO_KEY, 'image0').base64Image.value).toBe(null)
		expect(layer(fixed, 'image0').base64Image.value).toBe('$(image:macro-run-paper)')
	})

	it('accepts a different icon for keys that are not plain macro runs', () => {
		const fired = applyMacroIcon(clone(LIVE_MACRO_KEY), { icon: 'executor' })
		expect(layer(fired, 'image0').base64Image.value).toBe('$(image:executor-paper)')
	})

	/*
	 * `macro-stop` ships in the video collection but has NO contrast pair, so it cannot be used
	 * on a key whose background is driven by feedback — it would be legible at rest and gone the
	 * moment the key lit. Nothing on the rig uses it, so the gap is left as a refusal rather
	 * than papered over with a pair nobody needs; this pins that it fails loudly if someone
	 * reaches for it.
	 */
	it('refuses macro-stop, which has no contrast pair to swap to', () => {
		expect(() => applyMacroIcon(clone(LIVE_MACRO_KEY), { icon: 'macro-stop' })).toThrow(/macro-stop/)
	})

	/*
	 * THE DEFECT THIS EXISTS TO CLOSE. The module lights a running macro #00EE00 and a waiting
	 * one #EEEE00, both under white. Dropping a white icon in beside that white text would put
	 * the symbol at 1.59:1 and 1.25:1 — fainter than the white-on-#DADADA key this whole
	 * library was built to have caught, and invisible at exactly the moment you are looking at
	 * it to find out whether the macro fired.
	 */
	it('swaps to the dark icon on the states that light up bright', () => {
		for (const state of ['isRunning', 'isWaiting']) {
			expect(appearance(fixed, state).icon, state).toBe('$(image:macro-run-ink)')
		}
	})

	it('flips the label dark on those states too', () => {
		for (const state of ['isRunning', 'isWaiting']) {
			expect(hex(appearance(fixed, state).label), state).toBe(COLORS.ink.toLowerCase())
		}
	})

	it('keeps the light icon and label on the states that stay dark', () => {
		for (const state of ['isUsed', 'isRecording']) {
			expect(appearance(fixed, state).icon, state).toBe('$(image:macro-run-paper)')
			expect(hex(appearance(fixed, state).label), state).toBe(COLORS.paper.toLowerCase())
		}
	})

	/* The point of all of it: no state may render the symbol illegibly. */
	it.each(STATES)('keeps the icon legible when %s', (_name, state, bg) => {
		const variant = appearance(fixed, state).icon.match(/-(paper|ink)\)$/)[1]
		const ratio = contrastRatio(COLORS[variant], hex(bg))
		expect(ratio, `${hex(bg)} ${variant} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
	})

	it.each(STATES)('keeps the label legible when %s', (_name, state, bg) => {
		const ratio = contrastRatio(hex(appearance(fixed, state).label), hex(bg))
		expect(ratio, `${hex(bg)} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
	})

	/*
	 * Proof the two regressions above were real and not theoretical — if the module ever
	 * darkens these backgrounds this test fails, and the ink override becomes the wrong fix.
	 */
	it('would have rejected white on the running and waiting colours', () => {
		expect(contrastRatio(COLORS.paper, hex(BG.isRunning))).toBeLessThan(MIN_CONTRAST)
		expect(contrastRatio(COLORS.paper, hex(BG.isWaiting))).toBeLessThan(MIN_CONTRAST)
	})

	it('leaves the background of every state exactly as the module set it', () => {
		for (const [, state, bg] of STATES.filter(([, s]) => s !== null)) {
			expect(override(macroFeedback(fixed, state), 'box0', 'color').override.value, state).toBe(bg)
		}
	})

	/*
	 * This is a patch applied to a LIVE button, so everything that makes it work — which macro
	 * it runs, the persisted index behind it, its caption, its feedback wiring — has to come
	 * through untouched. Only appearance may change.
	 */
	it('changes nothing but appearance', () => {
		const strip = (c) => {
			const out = clone(c)
			delete out.style
			for (const f of out.feedbacks) delete f.styleOverrides
			return out
		}
		expect(strip(fixed)).toEqual(strip(LIVE_MACRO_KEY))
	})

	/*
	 * Each layer is compared with only the ONE property this helper may touch removed — so the
	 * resting background, the caption text, and every coordinate are all still under test. An
	 * earlier version of this stripped `color` from every layer, which quietly stopped checking
	 * that the resting tint survives.
	 */
	it.each([
		['canvas', null],
		['box0', null],
		['image0', 'base64Image'],
		['text0', 'color'],
	])('leaves everything on the %s layer alone but its own %s', (id, allowed) => {
		const before = clone(layer(LIVE_MACRO_KEY, id))
		const after = clone(layer(fixed, id))
		if (allowed) {
			delete before[allowed]
			delete after[allowed]
		}
		expect(after, id).toEqual(before)
	})

	it('does not mutate the control it was given', () => {
		const input = clone(LIVE_MACRO_KEY)
		const before = JSON.stringify(input)
		applyMacroIcon(input)
		expect(JSON.stringify(input)).toBe(before)
	})

	/* Safe to re-run over a rig that has already been patched. */
	it('is idempotent', () => {
		expect(applyMacroIcon(clone(fixed))).toEqual(fixed)
	})

	it('gives every override on the key a unique id', () => {
		const ids = fixed.feedbacks.flatMap((f) => f.styleOverrides.map((o) => o.overrideId))
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('references only icons that ship with a contrast pair', () => {
		const known = new Set(ICONS.map((i) => i.name))
		for (const [, state] of STATES) {
			const name = appearance(fixed, state).icon.match(/^\$\(image:(.+)\)$/)[1]
			expect(known.has(name), name).toBe(true)
		}
	})

	it('leaves feedbacks that are not macro states alone', () => {
		const withOther = clone(LIVE_MACRO_KEY)
		const other = { ...clone(withOther.feedbacks[0]), id: 'other', definitionId: 'inTransition' }
		withOther.feedbacks.push(other)
		const result = applyMacroIcon(withOther)
		expect(result.feedbacks.find((f) => f.id === 'other')).toEqual(other)
	})

	/*
	 * A macro feedback that imposes no background leaves the resting colour showing, so the
	 * resting variant is the correct one — not a crash, and not a guess at black.
	 */
	it('falls back to the resting background for a state that does not recolour the key', () => {
		const noBg = clone(LIVE_MACRO_KEY)
		const f = macroFeedback(noBg, 'isRunning')
		f.styleOverrides = f.styleOverrides.filter((o) => o.elementId !== 'box0')
		expect(appearance(applyMacroIcon(noBg), 'isRunning').icon).toBe('$(image:macro-run-paper)')
	})

	/* A macro feedback stripped of its colours still needs the icon it never had. */
	it('styles a macro feedback that carries no overrides at all', () => {
		const bare = clone(LIVE_MACRO_KEY)
		delete macroFeedback(bare, 'isRunning').styleOverrides
		expect(appearance(applyMacroIcon(bare), 'isRunning').icon).toBe('$(image:macro-run-paper)')
	})

	it.each([['image'], ['text'], ['box']])('refuses a control with no %s layer to style', (type) => {
		const missing = clone(LIVE_MACRO_KEY)
		missing.style.layers = missing.style.layers.filter((l) => l.type !== type)
		expect(() => applyMacroIcon(missing)).toThrow(new RegExp(`no ${type} layer`))
	})

	/* A control with no style at all is a missing-layer case, not a crash. */
	it('refuses a control with no style', () => {
		expect(() => applyMacroIcon({ feedbacks: [] })).toThrow(/no image layer/)
	})

	/*
	 * Feedbacks are what light the key, but a key with none is still a key — it gets the resting
	 * icon rather than an error, because there is nothing illegible about it.
	 */
	it('gives a key with no feedbacks the resting icon and nothing else', () => {
		const unlit = clone(LIVE_MACRO_KEY)
		delete unlit.feedbacks
		const result = applyMacroIcon(unlit)
		expect(layer(result, 'image0').base64Image.value).toBe('$(image:macro-run-paper)')
		expect(result.feedbacks).toBeUndefined()
	})

	it('refuses an icon that has no contrast pair in the library', () => {
		expect(() => applyMacroIcon(clone(LIVE_MACRO_KEY), { icon: 'not-an-icon' })).toThrow(/not-an-icon/)
	})
})
