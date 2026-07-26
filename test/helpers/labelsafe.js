/**
 * Ported verbatim from Bitfocus Companion v5.0.1 `shared-lib/lib/Label.ts`.
 *
 * Source of truth: the original TypeScript is embedded in
 * /Applications/Companion.app/Contents/Resources/main.js.map (sourcesContent).
 *
 * Why this exists: Companion silently rewrites an unsafe image-library name. A rewritten
 * name breaks the `$(image:...)` reference a button depends on, and the button then
 * renders blank with no error and no log line. Asserting our names against the real rules
 * is the only way to know an icon will actually resolve once imported.
 */

/**
 * @param {string} label
 * @returns {string} The name Companion would actually store.
 */
export function makeLabelSafe(label) {
	return label.trim().replace(/[^\w-]/gi, '_')
}

/** Reserved words Companion refuses as labels. */
const RESERVED = ['internal', 'this', 'local', 'companion', 'image', 'custom', 'expression', 'page']

/**
 * @param {string} label
 * @returns {boolean} Whether Companion considers this label valid as-is.
 */
export function isLabelValid(label) {
	if (!label || typeof label !== 'string') return false
	if (RESERVED.includes(label.toLowerCase())) return false
	return makeLabelSafe(label) === label
}
