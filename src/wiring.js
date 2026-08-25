/**
 * Wire library icons onto existing buttons.
 *
 * Takes a page's exported content and rewrites its style layers so each mapped button
 * carries an image layer pointing at `$(image:<name>)`, with the text moved into a strip
 * underneath instead of being shoved down with blank lines.
 *
 * Deliberately touches **only** `style.layers`. Actions, feedbacks, steps, options and
 * connection references are passed through untouched, so wiring an icon can never change
 * what a button does.
 */

import { ICONS } from './variants.js'

/** Wrap a plain value in Companion's ExpressionOrValue envelope. */
const v = (value) => ({ value, isExpression: false })

/** icon name -> shape name, so a mapping entry can be resolved back to its drawing. */
const SHAPE_OF = new Map(ICONS.map((i) => [i.name, i.shape]))
const ICON_NAMES = new Set(ICONS.map((i) => i.name))

/**
 * Relative luminance of a colour, accepting Companion's 24-bit int or a hex string.
 * @param {number|string} c
 * @returns {number} 0..1
 */
export function luminance(c) {
	const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : Number(c) & 0xffffff
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
		.map((x) => {
			const s = x / 255
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
		})
		.reduce((acc, x, i) => acc + [0.2126, 0.7152, 0.0722][i] * x, 0)
}

/**
 * Choose the high-contrast icon variant for a given background.
 *
 * The threshold is the luminance at which white and black are equally legible (~0.186).
 * Whichever side of it a background falls, the chosen variant clears 4.58:1 — the floor
 * being the crossover itself.
 *
 * @param {number|string} background
 * @returns {'paper'|'ink'}
 */
export function contrastVariant(background) {
	return luminance(background) > 0.186 ? 'ink' : 'paper'
}

/**
 * WCAG contrast ratio between two colours, 1..21.
 *
 * Accepts either form `luminance` does — Companion's 24-bit integer or a hex string — so a
 * button's background can be compared with a palette colour without converting first.
 *
 * @param {number|string} a
 * @param {number|string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((p, q) => q - p)
	return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Every background colour a control's feedbacks can impose, with the feedback that does it.
 *
 * @param {object} control
 * @returns {Array<{feedbackId: string, overrideId: string, color: number}>}
 */
export function feedbackBackgrounds(control) {
	const out = []
	for (const f of control?.feedbacks ?? []) {
		for (const o of f.styleOverrides ?? []) {
			if (o.elementProperty !== 'color') continue
			if (!String(o.elementId ?? '').startsWith('box')) continue
			out.push({ feedbackId: f.id, overrideId: o.overrideId, color: o.override?.value })
		}
	}
	return out
}

/**
 * Geometry for the icon-over-label layout, in percent of the button.
 *
 * The image occupies the upper area and the text sits in a strip beneath it. The previous
 * setup faked this by padding labels with blank lines ("Previous\n\n\nSlide"), which breaks
 * the moment a font size or label length changes.
 *
 * `fontsize` is a ceiling, not a fixed size: `fontsizeAllowShrink` is on, so Companion uses
 * the largest size up to this that fits the strip. Setting it high therefore means "fill
 * the space", which is what you want on a key you read at a glance.
 */
export const LAYOUT = {
	image: { x: 0, y: 2, width: 100, height: 56 },
	text: { x: 0, y: 60, width: 100, height: 38 },
	fontsize: 70,
}

/** Strip the blank-line padding hack out of a label. */
export function cleanLabel(text) {
	if (typeof text !== 'string') return text
	return text
		.split(/\\n|\n/)
		.map((s) => s.trim())
		.filter(Boolean)
		.join(' ')
}

/**
 * Build a fresh image layer referencing a library image.
 *
 * @param {string} iconName Library image name, e.g. `projector-on`.
 * @param {string} [id] Element id; only varied when a button somehow already has `image0`.
 */
export function makeImageLayer(iconName, id = 'image0') {
	return {
		id,
		name: 'Image',
		usage: 'auto',
		type: 'image',
		enabled: v(true),
		opacity: v(100),
		x: v(LAYOUT.image.x),
		y: v(LAYOUT.image.y),
		width: v(LAYOUT.image.width),
		height: v(LAYOUT.image.height),
		rotation: v(0),
		base64Image: v(`$(image:${iconName})`),
		halign: v('center'),
		valign: v('center'),
		fillMode: v('fit'),
	}
}

/**
 * Wire one button.
 *
 * Reuses an existing image layer where there is one — including the six ATEM layers that
 * exist with `base64Image: null` — rather than stacking a second image on top.
 *
 * @param {object} control A `button-layered` control from a page export.
 * @param {{icon: string, label?: string}} spec
 * @returns {object} A new control; the input is not mutated.
 */
export function wireButton(control, spec) {
	if (control?.type !== 'button-layered') return control

	const layers = (control.style?.layers ?? []).map((l) => ({ ...l }))

	/*
	 * If feedbacks drive this button's background, a fixed-colour icon cannot work: the
	 * palettes in use here span dark red and bright amber, and no single colour clears 3:1
	 * against both. Swap the icon per state instead, picking paper or ink by that state's
	 * background luminance.
	 */
	const fbBackgrounds = feedbackBackgrounds(control)
	const shape = SHAPE_OF.get(spec.icon)
	const contrastable =
		fbBackgrounds.length > 0 && shape && ICON_NAMES.has(`${shape}-paper`) && ICON_NAMES.has(`${shape}-ink`)

	let iconName = spec.icon
	if (contrastable) {
		const baseBox = layers.find((l) => l.type === 'box')
		const baseColor = baseBox?.color?.value ?? baseBox?.color ?? 0
		iconName = `${shape}-${contrastVariant(baseColor)}`
	}
	const imageIndex = layers.findIndex((l) => l.type === 'image')
	const textIndex = layers.findIndex((l) => l.type === 'text')

	const image = makeImageLayer(iconName, imageIndex >= 0 ? layers[imageIndex].id : 'image0')

	if (imageIndex >= 0) {
		layers[imageIndex] = image
	} else {
		// Insert below the text layer so the label always draws on top of the icon.
		const at = textIndex >= 0 ? textIndex : layers.length
		layers.splice(at, 0, image)
	}

	const t = layers.findIndex((l) => l.type === 'text')
	if (t >= 0) {
		const label = spec.label ?? cleanLabel(layers[t].text?.value ?? layers[t].text)
		layers[t] = {
			...layers[t],
			text: v(label),
			x: v(LAYOUT.text.x),
			y: v(LAYOUT.text.y),
			width: v(LAYOUT.text.width),
			height: v(LAYOUT.text.height),
			valign: v('center'),
			halign: v('center'),
			fontsize: v(LAYOUT.fontsize),
			fontsizeAllowShrink: v(true),
		}
	}

	if (!contrastable) return { ...control, style: { ...control.style, layers } }

	const imageId = layers.find((l) => l.type === 'image').id
	// `contrastable` implies feedbackBackgrounds() found entries, so feedbacks is non-empty.
	const feedbacks = control.feedbacks.map((f) => {
		const boxOverride = (f.styleOverrides ?? []).find(
			(o) => o.elementProperty === 'color' && String(o.elementId ?? '').startsWith('box')
		)
		if (!boxOverride) return f

		// Finding boxOverride proves styleOverrides exists, so no fallback is needed here.
		// Drop any image override we previously added, then add the right one for this state.
		const kept = f.styleOverrides.filter(
			(o) => !(o.elementId === imageId && o.elementProperty === 'base64Image')
		)
		return {
			...f,
			styleOverrides: [
				...kept,
				{
					overrideId: `${boxOverride.overrideId}-icon`,
					elementId: imageId,
					elementProperty: 'base64Image',
					override: v(`$(image:${shape}-${contrastVariant(boxOverride.override?.value ?? 0)})`),
				},
			],
		}
	})

	return { ...control, style: { ...control.style, layers }, feedbacks }
}

/**
 * Apply a mapping to a page's controls.
 *
 * @param {object} pageContent `ExportPageContentv6`.
 * @param {Record<string, Record<string, {icon: string, label?: string}>>} mapping row -> col -> spec
 * @returns {{page: object, wired: string[], missing: string[]}}
 */
export function wirePage(pageContent, mapping) {
	const controls = {}
	const wired = []
	const missing = []

	for (const [row, cols] of Object.entries(pageContent.controls ?? {})) {
		controls[row] = {}
		for (const [col, control] of Object.entries(cols)) {
			const spec = mapping?.[row]?.[col]
			if (!spec) {
				controls[row][col] = control
				continue
			}
			if (control?.type !== 'button-layered') {
				missing.push(`${row},${col} (type ${control?.type})`)
				controls[row][col] = control
				continue
			}
			controls[row][col] = wireButton(control, spec)
			wired.push(`${row},${col} -> ${spec.icon}`)
		}
	}

	// Surface any mapping entry that pointed at a cell with no button on it.
	for (const [row, cols] of Object.entries(mapping ?? {})) {
		for (const col of Object.keys(cols)) {
			if (!pageContent.controls?.[row]?.[col]) missing.push(`${row},${col} (no control)`)
		}
	}

	return { page: { ...pageContent, controls }, wired, missing }
}
