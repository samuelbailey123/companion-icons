import { describe, expect, it } from 'vitest'
import { contrastRatio, inkCoverage, rasterise, touchesMargin } from './helpers/skia.js'
import { ICONS, resolveShape } from '../src/variants.js'
import { renderIcon } from '../src/render.js'
import { COLORS, DEFAULT_BG, MIN_CONTRAST } from '../src/palette.js'

/**
 * The two real surfaces on this rig, each with its own ink band.
 *
 * The bands differ by roughly a factor of two because the touchstrip letterboxes a square
 * icon into 100x100 inside a 200x100 canvas: the same glyph covers half as much of the
 * surface there. A single shared floor would either be vacuous on keys or reject perfectly
 * good icons on the touchstrip.
 *
 * Floors sit just below the lightest real glyph, measured across the whole set, so a future
 * icon that is fainter than anything currently shipping fails rather than sneaking through.
 * The `calibration` test at the bottom keeps them honest.
 */
const SURFACES = [
	{ label: 'key', w: 120, h: 120, minInk: 0.06, maxInk: 0.48 },
	{ label: 'touchstrip', w: 200, h: 100, minInk: 0.03, maxInk: 0.24 },
]

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

describe('layout', () => {
	it.each(cases)('%s keeps clear of the key edge', async (name, entry) => {
		const svg = renderIcon(resolveShape(entry), COLORS[entry.color])
		const raster = await rasterise(svg, 120, 120)
		expect(touchesMargin(raster, 0.06), `${name} touches the edge`).toBe(false)
	})
})

describe('contrast against the intended button background', () => {
	it.each(cases)('%s clears the legibility threshold', (name, entry) => {
		const ratio = contrastRatio(COLORS[entry.color], DEFAULT_BG)
		expect(ratio, `${name} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
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
