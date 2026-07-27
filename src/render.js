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
 * viewBox units and `scale` shrinks the nested 0..120 space. The group counter-scales its
 * own stroke-width so nested geometry keeps the library's single stroke weight instead of
 * thinning in proportion to the scale; without that, an emblem at 0.45 would draw at half
 * the weight of everything around it.
 */

/**
 * Serialise one glyph element to SVG.
 * @param {GlyphPath} p
 * @param {string} colorHex
 * @returns {string}
 */
function element(p, colorHex, stroke = STROKE) {
	const paint = p.fill ? ` fill="${colorHex}" stroke="none"` : ''

	if (typeof p === 'string') return `<path d="${p}"/>`

	if (p.group) {
		const [x, y] = p.at
		const inner = p.group.map((c) => element(c, colorHex, stroke)).join('')
		// Counter-scale the stroke so nested geometry keeps the library's one weight.
		return (
			`<g transform="translate(${x} ${y}) scale(${p.scale})" ` +
			`stroke-width="${stroke / p.scale}">${inner}</g>`
		)
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

	const body = shape.paths.map((p) => element(p, colorHex, stroke)).join('')

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
		`viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" fill="none" stroke="${colorHex}" ` +
		`stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
	)
}
