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

/** Wrap a plain value in Companion's ExpressionOrValue envelope. */
const v = (value) => ({ value, isExpression: false })

/**
 * Geometry for the icon-over-label layout, in percent of the button.
 *
 * The image occupies the upper area and the text sits in a strip beneath it. The previous
 * setup faked this by padding labels with blank lines ("Previous\n\n\nSlide"), which breaks
 * the moment a font size or label length changes.
 */
export const LAYOUT = {
	image: { x: 0, y: 4, width: 100, height: 56 },
	text: { x: 0, y: 62, width: 100, height: 34 },
	fontsize: 18,
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
	const imageIndex = layers.findIndex((l) => l.type === 'image')
	const textIndex = layers.findIndex((l) => l.type === 'text')

	const image = makeImageLayer(spec.icon, imageIndex >= 0 ? layers[imageIndex].id : 'image0')

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

	return { ...control, style: { ...control.style, layers } }
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
