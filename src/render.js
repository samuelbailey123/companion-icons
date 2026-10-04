import { INTRINSIC, STROKE, VIEWBOX } from './palette.js'

/**
 * @typedef {string
 *   | {d: string, fill?: true}
 *   | {rect: [number, number, number, number, number?], fill?: true}
 *   | {circle: [number, number, number], fill?: true}
 *   | {line: [number, number, number, number]}
 *   | {group: GlyphPath[], at: [number, number], scale: number}
 * } GlyphPath
 *
 * A plain string is a stroked path. The primitive forms exist because most glyphs in this
 * set are built from rects, circles and lines, and expressing those as arc path data by
 * hand is unreadable and easy to get subtly wrong across seventy drawings.
 *
 * `fill: true` makes an element solid and unstroked, for inherently-solid forms such as a
 * tally dot or a battery cell.
 *
 * `group` places an existing glyph's geometry inside another drawing — used by the folder
 * icons, which set a system emblem into a folder body. `at` is the top-left corner in
 * viewBox units and `scale` shrinks the nested 0..120 space.
 *
 * The nested stroke is deliberately NOT counter-scaled. An SVG `scale()` transform shrinks
 * stroke-width along with the geometry, and that is the behaviour we want: every glyph is
 * authored at one stroke weight relative to its own 120-unit box, so scaling both together
 * is what preserves the drawing.
 *
 * This was originally written the other way — pinning the nested stroke to the library's
 * absolute weight — on the reasoning that one weight should read across the whole icon. At
 * the folder's 0.48 scale that put an 11-unit stroke on a 57-unit glyph, roughly double the
 * proportion it was drawn at, and every interior gap closed up: the CPU emblem rendered as a
 * solid blob and the microphone as an arrow. Verified at the real 67px key size, where the
 * scaled stroke stays legible for all eight folder emblems.
 */

/**
 * Serialise one glyph element to SVG.
 * @param {GlyphPath} p
 * @param {string} colorHex
 * @returns {string}
 */
function element(p, colorHex) {
	const paint = p.fill ? ` fill="${colorHex}" stroke="none"` : ''

	if (typeof p === 'string') return `<path d="${p}"/>`

	if (p.group) {
		const [x, y] = p.at
		const inner = p.group.map((c) => element(c, colorHex)).join('')
		// No stroke-width here: the transform scales the inherited one, which is the point.
		return `<g transform="translate(${x} ${y}) scale(${p.scale})">${inner}</g>`
	}
	if (p.d) return `<path d="${p.d}"${paint}/>`

	if (p.rect) {
		const [x, y, w, h, r = 0] = p.rect
		return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"${paint}/>`
	}
	if (p.circle) {
		const [cx, cy, r] = p.circle
		return `<circle cx="${cx}" cy="${cy}" r="${r}"${paint}/>`
	}
	if (p.line) {
		const [x1, y1, x2, y2] = p.line
		return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
	}

	throw new Error(`Unrecognised glyph element: ${JSON.stringify(p)}`)
}

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

	const body = shape.paths.map((p) => element(p, colorHex)).join('')

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
		`viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" fill="none" stroke="${colorHex}" ` +
		`stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
	)
}
