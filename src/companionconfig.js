import crypto from 'node:crypto'

/**
 * Companion's export file protocol version.
 *
 * Read from `companion/lib/ImportExport/Constants.ts` in Companion 5.0.1, not guessed:
 * the plan for this project assumed 16, which would have produced a file Companion
 * rejects. If a future Companion bumps this, re-read the constant rather than inferring
 * it from the app's marketing version.
 */
export const FILE_VERSION = 12

/**
 * Fixed timestamp so a rebuild produces a byte-identical file.
 *
 * Companion only uses these for display ordering in the library UI, so a stable value
 * costs nothing and makes the output diffable.
 */
const FIXED_TIME = 1785000000000

/**
 * Decoded byte length of a base64 payload.
 *
 * Mirrors Companion's own `base64ByteLength`. The data-URL string is roughly a third
 * larger than the real binary, and storing the string length would misreport every size
 * in the library UI.
 *
 * @param {string} b64
 * @returns {number}
 */
export function base64ByteLength(b64) {
	const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
	return Math.floor((b64.length * 3) / 4) - pad
}

/**
 * Build one `ImageLibraryExportData` entry.
 *
 * @param {object} args
 * @param {string} args.name Library name; becomes `$(image:<name>)`.
 * @param {string} args.description Shown in the library UI.
 * @param {string} args.collectionId Folder id.
 * @param {string} args.svg Complete SVG document.
 * @param {string} args.previewDataUrl WebP preview data URL.
 * @param {number} args.sortOrder Position within the folder.
 * @param {string} args.backgroundColor Preview swatch background in the library UI only.
 * @returns {{info: object, originalImage: string, previewImage: string}}
 */
export function buildImageEntry({
	name,
	description,
	collectionId,
	svg,
	previewDataUrl,
	sortOrder,
	backgroundColor = '#0d0d0f',
}) {
	const b64 = Buffer.from(svg).toString('base64')
	const originalImage = `data:image/svg+xml;base64,${b64}`
	const previewB64 = previewDataUrl.slice(previewDataUrl.indexOf(',') + 1)

	return {
		info: {
			name,
			description,
			originalSize: base64ByteLength(b64),
			previewSize: base64ByteLength(previewB64),
			createdAt: FIXED_TIME,
			modifiedAt: FIXED_TIME,
			// Companion checksums the full data-URL string, not the raw bytes.
			checksum: crypto.createHash('sha1').update(originalImage).digest('hex'),
			mimeType: 'image/svg+xml',
			collectionId,
			sortOrder,
			backgroundColor,
		},
		originalImage,
		previewImage: previewDataUrl,
	}
}

/**
 * Build an image-library folder.
 *
 * @param {string} id
 * @param {string} label
 * @param {number} sortOrder
 * @returns {{id: string, label: string, sortOrder: number, children: [], metaData: null}}
 */
export function buildCollection(id, label, sortOrder) {
	return { id, label, sortOrder, children: [], metaData: null }
}

/**
 * Build a page export whose only real payload is the image library.
 *
 * The page itself is deliberately empty. Companion's importer treats `imageLibrary` as a
 * section independent of `buttons`, so importing this with buttons set to `unchanged`
 * loads the library and leaves every existing control alone.
 *
 * The grid is declared at the Stream Deck + size. Page import grows the user's configured
 * grid to fit an incoming page, so declaring something larger here would silently resize
 * their surface layout.
 *
 * @param {object[]} imageLibrary
 * @param {object[]} imageLibraryCollections
 * @returns {object}
 */
export function buildPageExport(imageLibrary, imageLibraryCollections) {
	return {
		version: FILE_VERSION,
		type: 'page',
		companionBuild: 'companion-icons',
		oldPageNumber: 99,
		page: {
			id: 'companion-icons-library',
			name: 'Icon Library',
			controls: {},
			gridSize: { minColumn: 0, maxColumn: 3, minRow: 0, maxRow: 3 },
		},
		instances: {},
		connectionCollections: [],
		imageLibrary,
		imageLibraryCollections,
	}
}
