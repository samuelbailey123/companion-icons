/**
 * The deck's look on Companion 5.1: rounded keys and bold captions (Sam chose this on 2026-10-31).
 *
 * Every one of the rig's keys is a full-key box behind the picture and a caption above it, so one
 * pass over the layers changes all of them. 5.1's upgrade already gave every box a `cornerRadius`
 * of 0 and every text a `weight` of normal. This only sets those two, plus shrinking on a bold
 * caption, and leaves colours, icons, feedbacks and actions alone.
 *
 * ONLY THE BACKGROUND IS ROUNDED. A box that is not the whole key is something else: on the MA2
 * page, the fader's track and fill.
 *
 * ONLY THE CAPTION GOES BOLD. `text0` is a key's caption and `name` a Videohub key's. `text1` and the
 * Videohub's `port` and `feed` are readings, and staying regular is what makes them read as values
 * under a label.
 *
 * BOLD IS WIDER, so a caption that fitted exactly may not any more. Shrinking is turned on for each
 * one: a caption that still fits is untouched, and one that does not comes down just enough.
 */

/** Percent of half the key's shorter side: 25 rounds a 112 px key by 14 px. */
export const CORNER_RADIUS = 25

const CAPTIONS = new Set(['text0', 'name'])
const v = (value) => ({ value, isExpression: false })

/** The box filling the whole key. Geometry held in an expression moves, so it is never this. */
function isBackground(layer) {
	if (layer.type !== 'box') return false
	const edges = [layer.x, layer.y, layer.width, layer.height]
	return edges.every((e) => !e?.isExpression) && edges.map((e) => e?.value).join() === '0,0,100,100'
}

/** Round one key's background and embolden its caption, in place. Counts what changed. */
export function restyleControl(control, radius = CORNER_RADIUS) {
	let rounded = 0
	let bolded = 0
	for (const layer of control.style?.layers ?? []) {
		if (isBackground(layer)) {
			layer.cornerRadius = v(radius)
			rounded++
		} else if (layer.type === 'text' && CAPTIONS.has(layer.id)) {
			layer.weight = v('bold')
			layer.fontsizeAllowShrink = v(true)
			bolded++
		}
	}
	return { rounded, bolded }
}

/** Restyle every key on a page, in place. */
export function restylePage(page, radius = CORNER_RADIUS) {
	const totals = { keys: 0, rounded: 0, bolded: 0 }
	for (const row of Object.values(page.controls ?? {})) {
		for (const control of Object.values(row)) {
			const { rounded, bolded } = restyleControl(control, radius)
			totals.keys++
			totals.rounded += rounded
			totals.bolded += bolded
		}
	}
	return totals
}
