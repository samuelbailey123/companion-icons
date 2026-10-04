/**
 * Button captions: wrapping, and one type size a whole page can share.
 *
 * TWO DEFECTS THIS EXISTS TO REMOVE.
 *
 * 1. AUTO-SHRINK MAKES EVERY KEY A DIFFERENT SIZE. Companion's `fontsizeAllowShrink` fits each
 *    caption to its own box independently, so "Next" comes out large and "Clear Announce" comes
 *    out small — on the same row, in the same colour, doing the same class of thing. Nothing is
 *    wrong with any single key; the row is just visually incoherent, and the longest labels (the
 *    ones that most need reading) end up smallest.
 *
 * 2. A FIXED SIZE THAT DOES NOT FIT IS WORSE. The alternative already on this rig was
 *    `fontsize: 29.4, shrink: false`, which needs about 69px for two lines inside a 51px band.
 *    It does not shrink and it does not fit; it simply overflows.
 *
 * So: measure what actually fits, take the SMALLEST such size across the page, and give every
 * caption that one size with shrinking off. Uniform by construction, and guaranteed to fit
 * because the worst case is what chose the number.
 */

/** Horizontal breathing room either side of a caption, in pixels of a real key. */
export const PADDING = 4

/** Line height as a multiple of font size. */
export const LINE_HEIGHT = 1.18

/**
 * Break a caption at the word boundary nearest its middle.
 *
 * Nearest-the-middle rather than at the first space: two balanced lines need less shrinking than
 * one long line and one short one, and it is the longest LINE that sets the size for the whole
 * page. "Clear Vid Inputs" becomes "Clear Vid / Inputs", not "Clear / Vid Inputs".
 */
export function wrapLabel(label, wrapOver = 9) {
	const flat = String(label).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
	if (flat.length <= wrapOver) return flat

	const words = flat.split(' ')
	if (words.length < 2) return flat

	let best = null
	for (let i = 1; i < words.length; i++) {
		const left = words.slice(0, i).join(' ')
		const right = words.slice(i).join(' ')
		const score = Math.max(left.length, right.length)
		if (!best || score < best.score) best = { score, text: `${left}\n${right}` }
	}
	return best.text
}

/**
 * Largest font size at which one caption fits its band.
 *
 * @param {string} label            caption, newlines already inserted
 * @param {number} bandPercent      text band height, as a percentage of the key
 * @param {number} keyPx            real key size in pixels
 * @param {(text: string, size: number) => number} measure  text width at a given size
 */
export function maxFontSize(label, bandPercent, keyPx, measure, widthPx = keyPx) {
	const lines = String(label).split('\n')
	const band = (bandPercent / 100) * keyPx

	const byHeight = band / (lines.length * LINE_HEIGHT)

	const usable = widthPx - PADDING * 2
	const byWidth = Math.min(
		...lines.map((line) => {
			if (!line) return Infinity
			// Measure once at a reference size and scale: text width is linear in font size.
			const width = measure(line, 100)
			return width > 0 ? (100 * usable) / width : Infinity
		})
	)

	return Math.min(byHeight, byWidth)
}

/**
 * One font size every caption on the page can use.
 *
 * The minimum across all of them, floored to a whole pixel. Floored rather than rounded because
 * rounding up would put the worst-case caption a fraction over its band, which is the overflow
 * this is here to prevent.
 *
 * @returns {{size: number, limitedBy: {label: string, size: number}}}
 * @throws if there is nothing to measure — silently returning a default would hide a page whose
 *   captions were never found, and every key would be restyled to an arbitrary size.
 */
export function uniformFontSize(labels, bandPercent, keyPx, measure, widthPx = keyPx) {
	if (!labels.length) throw new Error('no captions to measure')

	let limitedBy = null
	for (const label of labels) {
		const size = maxFontSize(label, bandPercent, keyPx, measure, widthPx)
		if (!limitedBy || size < limitedBy.size) limitedBy = { label, size }
	}

	return { size: Math.max(1, Math.floor(limitedBy.size)), limitedBy }
}

/**
 * Convert a size in PIXELS to what Companion's `fontsize` field actually means.
 *
 * THIS FIELD IS NOT PIXELS. Companion labels it "Text Size" and documents it as "the size of
 * the text, in percentage of the element height" — so 70 on a 58px band is about 41px, and
 * writing 23 there does not give you 23px, it gives you 13. Setting measured pixel values
 * straight into it shrank every caption on a page to less than half its previous size.
 *
 * Clamped to the 3..200 the field accepts.
 */
export function toFontSizePercent(px, bandPx) {
	if (!(bandPx > 0)) throw new Error('band height must be positive')
	return Math.min(200, Math.max(3, Math.floor((100 * px) / bandPx)))
}
