/**
 * Give every PP1 button a real library icon, legible on the background it actually sits on.
 *
 * Usage: node tools/pp1-icons.js <live-full.json> <outdir>
 *
 * TWO DEFECTS, ONE PASS.
 *
 * 1. TEN EMBEDDED BITMAPS. Five different 25-33px PNGs across the clear row, and one 20x26 PNG
 *    used FIVE TIMES on the looks row — five buttons that did different things and looked
 *    identical, told apart only by their label. Every one is replaced by a library icon, which
 *    is resolution-independent and shared, so fixing it once fixes it everywhere.
 *
 * 2. ICONS THAT COULD NOT BE SEEN. The operator picked strong flat colours — bright orange
 *    transport, red clears, blue looks — and the icons kept their semantic hue on top. Previous
 *    and Next measured 1.31:1, fainter than the white-on-#DADADA button this library was built
 *    to have caught; Clear All was 2.13:1 on its own red.
 *
 * So the icon's COLOUR is chosen per button here, not fixed in the library: keep the semantic
 * hue where it clears the threshold on that background, and fall back to the paper/ink pair
 * where it does not. That keeps the page as colourful as the operator made it, and legible.
 *
 * Buttons this tool does not recognise keep whatever image they already had.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLORS, DEFAULT_BG, MIN_CONTRAST } from '../src/palette.js'
import { contrastRatio, contrastVariant } from '../src/wiring.js'
import { ICONS } from '../src/variants.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-icons.js <live-full.json> <outdir>')
	process.exit(1)
}

/**
 * Button label → the shape that belongs on it.
 *
 * Keyed on the label because that is what the operator typed and what the key says; matching on
 * position would break the first time a button moves, and this page moves often.
 */
const SHAPES = {
	'Clear All': 'clear',
	'Clear Audio': 'clear-audio',
	'Clear Messages': 'clear-messages',
	'Clear Props': 'clear-props',
	'Clear Announce': 'clear-announce',
	'Clear Slide': 'clear-slide',
	'Clear Media': 'clear-media',
	'Clear Vid Inputs': 'clear-video',
	'Focus Prev': 'focus-prev',
	'Focus Next': 'focus-next',
	Previous: 'slide-prev',
	Next: 'slide-next',
	'All Screens': 'macro',
	'Stage Notes': 'stage-display',
	Thunder: 'thunder',
	'Transition Song': 'transition',
	'Worship Set': 'playlist',
	'Green wall': 'green-wall',
	'Water Calm': 'water-calm',
	'Storm water': 'water-storm',
}

/** The library's own colour for a shape, when one exists as a plain (non-contrast) icon. */
const NATURAL = new Map(ICONS.filter((i) => i.collection !== 'contrast').map((i) => [i.shape, i]))
const KNOWN = new Set(ICONS.map((i) => i.name))

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const page = structuredClone(full.pages[number])
const layerOf = (control, type) => (control?.style?.layers ?? []).find((l) => l.type === type)
const hex = (n) => '#' + ((n ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6)

/**
 * A button's label, reduced to the words on it.
 *
 * Several of these labels carry a LITERAL backslash-n — typed into the text field to push the
 * caption below the icon rather than entered as a real newline. Collapsing only real whitespace
 * left five of them unmatched and their bitmaps in place, which is how this was found.
 */
const labelOf = (control) =>
	(layerOf(control, 'text')?.text?.value ?? '')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const changed = []
const untouched = []

for (const r of Object.keys(page.controls ?? {}).sort((a, b) => a - b)) {
	for (const c of Object.keys(page.controls[r]).sort((a, b) => a - b)) {
		const control = page.controls[r][c]
		const label = labelOf(control)
		const shape = SHAPES[label]
		if (!shape) {
			if (label) untouched.push(`${r}/${c}  ${label}`)
			continue
		}

		const image = layerOf(control, 'image')
		if (!image) {
			untouched.push(`${r}/${c}  ${label}  (no image layer)`)
			continue
		}

		const background = layerOf(control, 'box')?.color?.value ?? DEFAULT_BG
		const natural = NATURAL.get(shape)
		const naturalRatio = natural ? contrastRatio(COLORS[natural.color], hex(background)) : 0

		// Keep the semantic colour when it is legible here; fall back to paper/ink when it is not.
		const legible = natural && naturalRatio >= MIN_CONTRAST
		const name = legible ? natural.name : `${shape}-${contrastVariant(background)}`
		if (!KNOWN.has(name)) throw new Error(`${r}/${c} ${label}: the library has no icon "${name}"`)

		const ratio = legible ? naturalRatio : contrastRatio(COLORS[contrastVariant(background)], hex(background))
		const was = image.base64Image.value
		image.base64Image = { value: `$(image:${name})`, isExpression: false }

		changed.push(
			`${r}/${c}  ${label.padEnd(17)} ${hex(background)}  -> ${name.padEnd(22)} ${ratio.toFixed(2)}:1` +
				(was?.startsWith('data:') ? '   (was an embedded bitmap)' : legible ? '' : '   (recoloured for contrast)')
		)
	}
}

for (const m of changed) console.log(`  ${m}`)
for (const m of untouched) console.log(`  left alone  ${m}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-pp1.companionconfig`)
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	})
)
console.log(`\n${changed.length} icons wired, ${untouched.length} left alone -> ${path.basename(file)}`)
