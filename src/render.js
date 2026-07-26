import { INTRINSIC, STROKE, VIEWBOX } from './palette.js'

/**
 * @typedef {string | {d: string, fill: true}} GlyphPath
 * A plain string is a stroked path. A `{d, fill: true}` entry is filled and unstroked,
 * used only for inherently-solid forms such as a tally dot or a battery cell.
 */

/**
 * @typedef {{paths: GlyphPath[], levels?: (level: number) => {paths: GlyphPath[]}}} Glyph
 * Monochrome geometry authored in a 0 0 120 120 viewBox. Colour is applied at render
 * time so one drawing can serve several semantic states.
 */

/**
 * Render a glyph to a complete SVG document string.
 *
 * @param {Glyph} shape Monochrome geometry.
 * @param {string} colorHex Stroke colour, and fill colour for solid entries.
 * @param {{stroke?: number, size?: number}} [opts] Overrides, used by tests and previews.
 * @returns {string} A self-contained SVG document.
 */
export function renderIcon(shape, colorHex, opts = {}) {
	const stroke = opts.stroke ?? STROKE
	const size = opts.size ?? INTRINSIC

	const body = shape.paths
		.map((p) =>
			typeof p === 'string'
				? `<path d="${p}"/>`
				: `<path d="${p.d}" fill="${colorHex}" stroke="none"/>`
		)
		.join('')

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
		`viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" fill="none" stroke="${colorHex}" ` +
		`stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
	)
}
