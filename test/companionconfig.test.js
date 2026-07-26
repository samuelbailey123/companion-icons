import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
	FILE_VERSION,
	base64ByteLength,
	buildCollection,
	buildImageEntry,
	buildLibraryExport,
} from '../src/companionconfig.js'
import { makeLabelSafe } from './helpers/labelsafe.js'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"></svg>'
const preview = 'data:image/webp;base64,AAAABBBB'

const entry = () =>
	buildImageEntry({
		name: 'slide-next',
		description: 'Next slide',
		collectionId: 'present',
		svg,
		previewDataUrl: preview,
		sortOrder: 3,
	})

describe('base64ByteLength', () => {
	it('accounts for padding', () => {
		expect(base64ByteLength('AAAA')).toBe(3)
		expect(base64ByteLength('AAA=')).toBe(2)
		expect(base64ByteLength('AA==')).toBe(1)
	})
})

describe('buildImageEntry', () => {
	it('carries exactly the ImageLibraryInfo field set Companion expects', () => {
		expect(Object.keys(entry().info).sort()).toEqual([
			'backgroundColor',
			'checksum',
			'collectionId',
			'createdAt',
			'description',
			'mimeType',
			'modifiedAt',
			'name',
			'originalSize',
			'previewSize',
			'sortOrder',
		])
	})

	it('declares the SVG mime type', () => {
		expect(entry().info.mimeType).toBe('image/svg+xml')
	})

	it('stores the original as an svg+xml data URL', () => {
		expect(entry().originalImage.startsWith('data:image/svg+xml;base64,')).toBe(true)
	})

	it('checksums the full data URL with sha1, exactly as Companion does', () => {
		const e = entry()
		expect(e.info.checksum).toBe(
			crypto.createHash('sha1').update(e.originalImage).digest('hex')
		)
	})

	it('reports decoded byte size rather than data-URL length', () => {
		const e = entry()
		expect(e.info.originalSize).toBe(Buffer.byteLength(svg))
		expect(e.info.originalSize).toBeLessThan(e.originalImage.length)
	})

	it('uses a name Companion will not rewrite on import', () => {
		expect(makeLabelSafe(entry().info.name)).toBe(entry().info.name)
	})

	it('is byte-stable across builds', () => {
		expect(JSON.stringify(entry())).toBe(JSON.stringify(entry()))
	})
})

describe('buildCollection', () => {
	it('matches Companion CollectionBase', () => {
		expect(buildCollection('power', 'power', 0)).toEqual({
			id: 'power',
			label: 'power',
			sortOrder: 0,
			children: [],
			metaData: null,
		})
	})
})

describe('buildLibraryExport', () => {
	const out = () => buildLibraryExport([entry()], [buildCollection('present', 'present', 0)])

	it('declares the file protocol version Companion 5.0.1 actually reads', () => {
		expect(FILE_VERSION).toBe(12)
		expect(out().version).toBe(12)
	})

	it('is a FULL export, because page import never restores the image library', () => {
		// Verified against a live Companion: importing a page export offers only
		// "Replace page N with imported page" and no library option at all.
		expect(out().type).toBe('full')
		expect(out().imageLibrary).toHaveLength(1)
		expect(out().imageLibraryCollections).toHaveLength(1)
	})

	it('carries no other section, so no other section can be imported', () => {
		// Companion derives the offered import sections from which keys are present.
		for (const key of [
			'pages',
			'instances',
			'triggers',
			'triggerCollections',
			'custom_variables',
			'expressionVariables',
			'surfaces',
			'surfaceGroups',
			'surfacesRemote',
			'surfaceInstances',
		]) {
			expect(out(), key).not.toHaveProperty(key)
		}
	})

	it('serialises to valid JSON', () => {
		expect(() => JSON.parse(JSON.stringify(out()))).not.toThrow()
	})
})
