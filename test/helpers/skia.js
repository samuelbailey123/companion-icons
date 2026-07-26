/**
 * Rasterisation helpers backed by Companion's own bundled Skia.
 *
 * These tests deliberately require `@napi-rs/canvas` out of the installed Companion app
 * rather than adding it as a devDependency. Version drift between what we test with and
 * what the deck draws with would quietly invalidate every legibility assertion here.
 *
 * Verified to load under Node 25 against Companion 5.0.1's bundled 1.0.1 build; NAPI is
 * ABI-stable across Node majors, so the version mismatch is not a problem.
 */
import { createRequire } from 'node:module'

const COMPANION_RESOURCES = '/Applications/Companion.app/Contents/Resources/'

const requireCompanion = createRequire(COMPANION_RESOURCES)
const { Canvas, loadImage } = requireCompanion('@napi-rs/canvas')

/**
 * Rasterise an SVG document at a given pixel size, preserving aspect and centring —
 * matching the `fit` fill mode a Companion image layer uses by default.
 *
 * @param {string} svg
 * @param {number} width
 * @param {number} height
 * @returns {Promise<{data: Uint8ClampedArray, width: number, height: number}>}
 */
export async function rasterise(svg, width, height) {
	const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
	const img = await loadImage(dataUrl)

	const canvas = new Canvas(width, height)
	const ctx = canvas.getContext('2d')

	const scale = Math.min(width / img.width, height / img.height)
	const dw = img.width * scale
	const dh = img.height * scale
	ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh)

	const { data } = ctx.getImageData(0, 0, width, height)
	return { data, width, height }
}

/**
 * Fraction of pixels carrying meaningful alpha.
 *
 * Catches three failure modes at once: a glyph that renders as nothing, one clipped away
 * by bad coordinates, and one so heavy it fills the key.
 *
 * @param {{data: Uint8ClampedArray}} raster
 * @returns {number} 0..1
 */
export function inkCoverage({ data }) {
	let lit = 0
	for (let i = 3; i < data.length; i += 4) if (data[i] > 24) lit++
	return lit / (data.length / 4)
}

/**
 * Whether any ink falls inside a margin band around the edge of the raster.
 *
 * Icons that touch the edge look cramped beside their neighbours and can collide with
 * Companion's own status decorations.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} raster
 * @param {number} fraction Margin as a fraction of the shorter side.
 * @returns {boolean}
 */
export function touchesMargin({ data, width, height }, fraction) {
	const margin = Math.round(Math.min(width, height) * fraction)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const inBand = x < margin || y < margin || x >= width - margin || y >= height - margin
			if (!inBand) continue
			if (data[(y * width + x) * 4 + 3] > 24) return true
		}
	}
	return false
}

/**
 * WCAG relative luminance of a hex colour.
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
	const n = parseInt(hex.replace('#', ''), 16)
	const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/**
 * WCAG contrast ratio between two hex colours, 1..21.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((p, q) => q - p)
	return (lighter + 0.05) / (darker + 0.05)
}
