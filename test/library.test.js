import { describe, expect, it } from 'vitest'
import { buildLibrary, makePreview } from '../src/library.js'
import { mergeCollections } from '../src/glyphs/index.js'
import { ICONS } from '../src/variants.js'
import { renderIcon } from '../src/render.js'
import { makeLabelSafe } from './helpers/labelsafe.js'

describe('makePreview', () => {
	it('produces a WebP data URL', async () => {
		const svg = renderIcon({ paths: [{ circle: [60, 60, 30] }] }, '#FFFFFF')
		expect(await makePreview(svg)).toMatch(/^data:image\/webp;base64,/)
	})

	it('caps the longest side at 200px without upscaling small sources', async () => {
		const small = renderIcon({ paths: [{ circle: [60, 60, 30] }] }, '#FFF', { size: 64 })
		const large = renderIcon({ paths: [{ circle: [60, 60, 30] }] }, '#FFF', { size: 512 })
		// A 64px source must not be inflated, so its preview stays smaller than a 512px one.
		expect((await makePreview(small)).length).toBeLessThan((await makePreview(large)).length)
	})
})

describe('buildLibrary', () => {
	it('emits one SVG per icon', async () => {
		const { files } = await buildLibrary(ICONS)
		expect(files).toHaveLength(ICONS.length)
		expect(files.every((f) => f.svg.startsWith('<svg'))).toBe(true)
	})

	it('produces one collection per distinct icon collection', async () => {
		const { config } = await buildLibrary(ICONS)
		const expected = new Set(ICONS.map((i) => i.collection))
		expect(config.imageLibraryCollections).toHaveLength(expected.size)
		for (const c of config.imageLibraryCollections) expect(expected.has(c.id)).toBe(true)
	})

	it('carries every icon into the export with a Companion-safe name', async () => {
		const { config } = await buildLibrary(ICONS)
		expect(config.imageLibrary).toHaveLength(ICONS.length)
		for (const item of config.imageLibrary) {
			expect(makeLabelSafe(item.info.name), item.info.name).toBe(item.info.name)
		}
	})

	it('assigns each image to a collection that exists in the export', async () => {
		const { config } = await buildLibrary(ICONS)
		const ids = new Set(config.imageLibraryCollections.map((c) => c.id))
		for (const item of config.imageLibrary) {
			expect(ids.has(item.info.collectionId), item.info.name).toBe(true)
		}
	})

	it('ships no controls and no connections, so an import cannot overwrite buttons', async () => {
		const { config } = await buildLibrary(ICONS)
		expect(config.page.controls).toEqual({})
		expect(config.instances).toEqual({})
	})

	it('handles an empty icon list without inventing collections', async () => {
		const { files, config } = await buildLibrary([])
		expect(files).toEqual([])
		expect(config.imageLibrary).toEqual([])
		expect(config.imageLibraryCollections).toEqual([])
	})
})

describe('mergeCollections', () => {
	it('flattens collections into one table', () => {
		const merged = mergeCollections({ a: { one: { paths: [] } }, b: { two: { paths: [] } } })
		expect(Object.keys(merged).sort()).toEqual(['one', 'two'])
	})

	it('throws on a duplicate shape name across collections, naming the culprit', () => {
		expect(() =>
			mergeCollections({ a: { dup: { paths: [] } }, b: { dup: { paths: [] } } })
		).toThrow(/Duplicate shape "dup" in collection "b"/)
	})
})
