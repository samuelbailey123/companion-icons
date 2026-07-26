/**
 * Assemble the whole library in memory.
 *
 * Kept separate from `build.js` so the assembly logic is testable without touching the
 * filesystem: `build.js` is a thin wrapper that only does I/O.
 */
import { createRequire } from 'node:module'
import { renderIcon } from './render.js'
import { resolveShape } from './variants.js'
import { COLORS } from './palette.js'
import { buildCollection, buildImageEntry, buildPageExport } from './companionconfig.js'

const requireCompanion = createRequire('/Applications/Companion.app/Contents/Resources/')
const { Canvas, loadImage } = requireCompanion('@napi-rs/canvas')

/**
 * Generate a library preview thumbnail.
 *
 * Mirrors Companion's own `Renderer.createImagePreview`: WebP at quality 0.75, longest
 * side capped at 200px, never upscaled. Producing it here keeps the exported file
 * self-contained rather than relying on Companion to derive it at import time.
 *
 * @param {string} svg
 * @returns {Promise<string>} WebP data URL
 */
export async function makePreview(svg) {
	const img = await loadImage('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
	const scale = Math.min(1, 200 / Math.max(img.width, img.height))
	const w = Math.round(img.width * scale)
	const h = Math.round(img.height * scale)

	const canvas = new Canvas(w, h)
	canvas.getContext('2d').drawImage(img, 0, 0, w, h)
	return canvas.toDataURL('image/webp', 0.75)
}

/**
 * Render every icon and assemble the importable page export.
 *
 * @param {import('./variants.js').Icon[]} icons
 * @returns {Promise<{files: Array<{name: string, svg: string}>, config: object}>}
 */
export async function buildLibrary(icons) {
	const collections = new Map()
	const entries = []
	const files = []

	for (const [i, entry] of icons.entries()) {
		const svg = renderIcon(resolveShape(entry), COLORS[entry.color])
		files.push({ name: entry.name, svg })

		if (!collections.has(entry.collection)) {
			collections.set(
				entry.collection,
				buildCollection(entry.collection, entry.collection, collections.size)
			)
		}

		entries.push(
			buildImageEntry({
				name: entry.name,
				description: entry.description,
				collectionId: entry.collection,
				svg,
				previewDataUrl: await makePreview(svg),
				sortOrder: i,
			})
		)
	}

	return { files, config: buildPageExport(entries, [...collections.values()]) }
}
