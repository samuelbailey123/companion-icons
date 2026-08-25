import { describe, expect, it } from 'vitest'
import { contrastRatio, inkCoverage, rasterise, touchesMargin } from './helpers/skia.js'
import { ICONS, resolveShape } from '../src/variants.js'
import { renderIcon } from '../src/render.js'
import { COLORS, DEFAULT_BG, MIN_CONTRAST } from '../src/palette.js'

/**
 * The real surfaces on this rig, each with its own ink band.
 *
 * Two KEY sizes, because the two decks do not agree: a Stream Deck + draws 120x120 keys and a
 * Stream Deck + XL draws 112x112. Both are checked rather than just the smaller one — an icon
 * is not verified at a size it was never rasterised at, and 8px is enough to move a hairline
 * across a device-pixel boundary. Their touchstrips are identical at 200x100 per zone, so the
 * strip is measured once.
 *
 * The strip band is roughly half the key band because the strip letterboxes a square icon into
 * 100x100 inside a 200x100 canvas: the same glyph covers half as much of the surface there. A
 * single shared floor would either be vacuous on keys or reject perfectly good strip icons.
 *
 * Floors sit just below the lightest real glyph, measured across the whole set, so a future
 * icon that is fainter than anything currently shipping fails rather than sneaking through.
 * The `calibration` test at the bottom keeps them honest.
 */
const SURFACES = [
	{ label: 'key, Stream Deck +', w: 120, h: 120, minInk: 0.06, maxInk: 0.48 },
	{ label: 'key, Stream Deck + XL', w: 112, h: 112, minInk: 0.06, maxInk: 0.48 },
	{ label: 'touchstrip', w: 200, h: 100, minInk: 0.03, maxInk: 0.24 },
]

/** Just the key surfaces, for checks about how a square icon sits in a square key. */
const KEYS = SURFACES.filter((s) => s.w === s.h)

const cases = ICONS.map((i) => [i.name, i])

describe.each(SURFACES)(
	'rasterised through Companion Skia at $label ($w x $h)',
	({ w, h, minInk, maxInk }) => {
		it.each(cases)('%s renders with ink inside the legible band', async (name, entry) => {
			const svg = renderIcon(resolveShape(entry), COLORS[entry.color])
			const ink = inkCoverage(await rasterise(svg, w, h))
			expect(ink, `${name} ink=${(ink * 100).toFixed(2)}%`).toBeGreaterThan(minInk)
			expect(ink, `${name} ink=${(ink * 100).toFixed(2)}%`).toBeLessThan(maxInk)
		})
	}
)

describe.each(KEYS)('layout on a $label', ({ w, h }) => {
	it.each(cases)('%s keeps clear of the key edge', async (name, entry) => {
		const svg = renderIcon(resolveShape(entry), COLORS[entry.color])
		const raster = await rasterise(svg, w, h)
		expect(touchesMargin(raster, 0.06), `${name} touches the edge`).toBe(false)
	})
})

describe('contrast against the intended button background', () => {
	// The `contrast` collection is exempt from this check by design: those icons are not
	// for the default dark background at all. They are the paper/ink pair used on buttons
	// whose background is feedback-driven, and are asserted separately below against the
	// backgrounds they are actually chosen for.
	const fixed = cases.filter(([, entry]) => entry.collection !== 'contrast')

	it.each(fixed)('%s clears the legibility threshold', (name, entry) => {
		const ratio = contrastRatio(COLORS[entry.color], DEFAULT_BG)
		expect(ratio, `${name} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
	})

	it('the paper/ink pair covers the whole luminance range between them', () => {
		// Sweep every grey from black to white: at each one, at least one of the pair must
		// clear the threshold. That is what lets `contrastVariant` guarantee legibility on
		// any feedback colour, not just the ones this rig happens to use today.
		for (let i = 0; i <= 255; i += 5) {
			const bg = `#${i.toString(16).padStart(2, '0').repeat(3)}`
			const best = Math.max(
				contrastRatio(COLORS.paper, bg),
				contrastRatio(COLORS.ink, bg)
			)
			expect(best, `no legible variant for ${bg}`).toBeGreaterThanOrEqual(4.5)
		}
	})

	it('would have rejected the defect this library replaces', () => {
		// The old ProPresenter macro buttons: a white glyph on a #DADADA background.
		// It shipped invisible for months. Encoding it here means it cannot come back.
		expect(contrastRatio('#FFFFFF', '#DADADA')).toBeLessThan(MIN_CONTRAST)
	})
})

describe('calibration', () => {
	it.each(SURFACES)(
		'the $label band stays snug against the real set rather than going vacuous',
		async ({ w, h, minInk, maxInk }) => {
			let min = 1
			let max = 0
			for (const entry of ICONS) {
				const svg = renderIcon(resolveShape(entry), COLORS[entry.color])
				const ink = inkCoverage(await rasterise(svg, w, h))
				min = Math.min(min, ink)
				max = Math.max(max, ink)
			}

			// The band must contain the set...
			expect(min, `lightest ${(min * 100).toFixed(2)}%`).toBeGreaterThan(minInk)
			expect(max, `heaviest ${(max * 100).toFixed(2)}%`).toBeLessThan(maxInk)

			// ...but stay close to it, so it keeps catching regressions. A floor far below
			// the lightest real glyph would pass anything.
			expect(minInk).toBeGreaterThan(min * 0.6)
			expect(maxInk).toBeLessThan(max * 1.8)
		}
	)
})

/**
 * Optical size.
 *
 * Companion scales an icon's whole 120x120 canvas to fit its layer, so two glyphs on identical
 * buttons render at visibly different sizes whenever their INK fills different fractions of that
 * canvas. Nothing about the button geometry shows it — this was reported on the MA2 page as
 * "icons are randomly larger", where a 100px `executor` sat directly above a 72px `ftb` on keys
 * whose layers matched exactly.
 *
 * So the longest side of each glyph's ink is measured and held to a band. The library's median
 * is 88 of 120; the band below is wide enough for the deliberately-small utility marks and the
 * deliberately-broad folders, and narrow enough that nothing can drift as far as the executor did.
 */
describe('optical size', () => {
	const MIN_SPAN = 56
	const MAX_SPAN = 98

	/** Longest side of the glyph's ink, in viewBox units. */
	async function inkSpan(entry) {
		const raster = await rasterise(renderIcon(resolveShape(entry), COLORS[entry.color]), 120, 120)
		let minX = 120
		let minY = 120
		let maxX = -1
		let maxY = -1
		for (let y = 0; y < 120; y++) {
			for (let x = 0; x < 120; x++) {
				if (raster.data[(y * 120 + x) * 4 + 3] > 30) {
					if (x < minX) minX = x
					if (x > maxX) maxX = x
					if (y < minY) minY = y
					if (y > maxY) maxY = y
				}
			}
		}
		return Math.max(maxX - minX + 1, maxY - minY + 1)
	}

	it.each(cases)('%s draws at a size consistent with the rest of the set', async (name, entry) => {
		const span = await inkSpan(entry)
		expect(span, `${name} spans ${span}/120`).toBeGreaterThanOrEqual(MIN_SPAN)
		expect(span, `${name} spans ${span}/120`).toBeLessThanOrEqual(MAX_SPAN)
	})

	/*
	 * The pairing that was actually complained about. Whatever the band allows in general, icons
	 * that share a page must not differ enough to read as different sizes.
	 */
	it('keeps the MA2 page internally consistent', async () => {
		const names = ['executor', 'cue-next', 'cue-back', 'ftb']
		const spans = await Promise.all(
			names.map((n) => inkSpan(ICONS.find((i) => i.name === n)))
		)
		expect(Math.max(...spans) - Math.min(...spans), `spans ${names.map((n, i) => `${n}=${spans[i]}`)}`).toBeLessThanOrEqual(8)
	})
})
