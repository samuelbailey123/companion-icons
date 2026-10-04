/**
 * Make button captions readable and CONSISTENT.
 *
 * Usage: node tools/readable-labels.js <live-full.json> <outdir> <PageName> [PageName...]
 *
 * Three things, in order, because each one changes what the next can do:
 *
 * 1. DROP THE PADDING NEWLINES. Several captions carry "Clear\n\n\nMessages" — typed to shove
 *    the words clear of an icon back when the icon had no layer of its own. All it does now is
 *    make the text block four lines tall inside a 51px band, about ten pixels a line.
 *
 * 2. WRAP LONG CAPTIONS AT A BALANCED WORD BOUNDARY, so the longest LINE on the page is as
 *    short as it can be — because that line is what sets the type size for every other key.
 *
 * 3. GIVE EVERY CAPTION ONE MEASURED SIZE, with shrinking OFF. Companion's auto-shrink fits
 *    each caption to its own box, so "Next" comes out large and "Clear Announce" small on the
 *    same row — the inconsistency being complained about. The size is measured through Skia at
 *    the real key size, and the smallest fit wins, so it is uniform AND cannot overflow.
 *
 * Sizes are measured PER GROUP: the folder row is persistent chrome and its own thing, the
 * content keys are what you read while working. Both end up internally uniform.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { toFontSizePercent, uniformFontSize, wrapLabel } from '../src/labels.js'

const requireCompanion = createRequire('/Applications/Companion.app/Contents/Resources/')
const { Canvas, GlobalFonts } = requireCompanion('@napi-rs/canvas')

/**
 * Measure in the font the deck actually draws with.
 *
 * Companion ships its own faces and renders captions in NotoSans, which is about 11% WIDER
 * than the generic sans a naive measurement picks up. Measuring in the wrong face makes every
 * width limit optimistic, and a caption that was calculated to fit arrives clipped.
 */
const FONT = 'CompanionSans'
GlobalFonts.registerFromPath(
	'/Applications/Companion.app/Contents/Resources/assets/Fonts/NotoSans-Regular.otf',
	FONT
)

const [, , src, outDir, ...pageNames] = process.argv
if (!src || !outDir || !pageNames.length) {
	console.error('usage: node tools/readable-labels.js <live-full.json> <outdir> <PageName>...')
	process.exit(1)
}

/** Real key size on a Stream Deck + XL, which is what these are measured against. */
const KEY = 112

/** Icon keeps the top of the key; the caption gets the rest, up from 38%. */
const ICON_HEIGHT = 44
const TEXT_Y = 46
const TEXT_HEIGHT = 52

/**
 * One caption size for the whole deck, as a percentage of the text band.
 *
 * 51% of a 58px band is about 30px — matching what the untouched pages already render, so
 * switching pages does not change the size of the type.
 */
const CEILING = 51

const ctx = new Canvas(10, 10).getContext('2d')
const measure = (text, size) => {
	ctx.font = `${size}px ${FONT}`
	return ctx.measureText(text).width
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
await fs.mkdir(outDir, { recursive: true })

const layersOf = (control) => control.style?.layers ?? []

/**
 * Which set of captions a control belongs to.
 *
 * THE TOUCHSTRIP IS DELIBERATELY LEFT OUT. Its zones are 200x100 and carry TWO text layers — a
 * name across the top and a live value beneath — laid out to suit that. An earlier version of
 * this tool treated them as ordinary keys, saw only the first text layer, and sized "Speaker"
 * to 54px inside a 42px band. Their auto-shrink is also doing real work there, because the
 * value underneath is a reading whose width nobody controls. Keys with an icon are what this
 * pass is for; the strip already has its own design and is not what looked inconsistent.
 */
const GROUPS = {
	'folder row': { rows: [0], height: KEY, width: KEY, band: TEXT_HEIGHT },
	'content keys': { rows: [1, 2, 3], height: KEY, width: KEY, band: TEXT_HEIGHT },
}
const groupOf = (row) =>
	Object.entries(GROUPS).find(([, g]) => g.rows.includes(Number(row)))?.[0] ?? null

for (const name of pageNames) {
	const number = Object.entries(full.pages).find(([, p]) => p.name === name)?.[0]
	if (!number) throw new Error(`no page called "${name}" on this rig`)

	const page = structuredClone(full.pages[number])
	const captioned = []

	// Pass one: rebalance the bands and rewrap, collecting what will need a size.
	for (const r of Object.keys(page.controls ?? {}).sort((a, b) => a - b)) {
		for (const c of Object.keys(page.controls[r]).sort((a, b) => a - b)) {
			const layers = layersOf(page.controls[r][c])
			const group = groupOf(r)
			const texts = layers.filter((l) => l.type === 'text')
			const image = layers.find((l) => l.type === 'image')

			// Only single-caption keys that carry an icon. A control with two text layers has a
			// layout of its own that this pass has no business flattening.
			if (!group || !image || texts.length !== 1) continue
			const text = texts[0]

			image.height = { value: ICON_HEIGHT, isExpression: false }
			text.y = { value: TEXT_Y, isExpression: false }
			text.height = { value: TEXT_HEIGHT, isExpression: false }

			const before = text.text?.value
			if (typeof before !== 'string') continue

			/*
			 * An EXPRESSION caption cannot be wrapped here — its words arrive from the rig at draw
			 * time. It still gets the uniform size, measured against the reference below so a long
			 * value does not silently overflow.
			 */
			const after = text.text?.isExpression ? before : wrapLabel(before)
			if (!text.text.isExpression && after !== before) {
				text.text = { value: after, isExpression: false }
			}
			captioned.push({ row: r, column: c, text, group, sample: after, before })
		}
	}

	// Pass two: one measured size per group.
	const report = []
	for (const [group, geometry] of Object.entries(GROUPS)) {
		const members = captioned.filter((x) => x.group === group)
		if (!members.length) continue

		/*
		 * An expression contributes a WORST-CASE stand-in, not its raw source text. Measuring
		 * "$(atem:long_3010)" would size the page to a string nobody ever sees, and measuring
		 * nothing would let "Media Player 1" overflow.
		 */
		const REFERENCE = 'Media Player 1'
		const labels = members.map((x) => (x.text.text?.isExpression ? REFERENCE : x.sample))

		/*
		 * A SHARED CEILING, not a per-page minimum.
		 *
		 * Sizing from the worst caption on each page makes every key on that page as small as its
		 * longest label, and makes pages disagree with each other — switch from Mics to PP1 and the
		 * type changes size. So every page gets the SAME ceiling and shrink stays on: short captions
		 * all render at the ceiling, and the occasional long one drops just below it.
		 *
		 * The spread that leaves is bounded by physics, not by choice. An eight-character word
		 * cannot exceed about 22px on a 112px key in this font however the bands are arranged, so
		 * "Announce" sits a few pixels under its neighbours and nothing can be done about that
		 * short of shortening the word.
		 */
		const { size, limitedBy } = uniformFontSize(
			labels,
			geometry.band,
			geometry.height,
			measure,
			geometry.width
		)
		/*
		 * `fontsize` is a PERCENTAGE of the element height, not pixels — see toFontSizePercent.
		 * Shrink stays ON as a backstop: the percentage already fits the worst caption measured
		 * here, so it never fires in normal use, but it keeps a caption nobody anticipated from
		 * spilling off its key instead of merely being small.
		 */
		const bandPx = (geometry.band / 100) * geometry.height
		const fits = toFontSizePercent(size, bandPx)
		const percent = CEILING
		for (const m of members) {
			m.text.fontsize = { value: percent, isExpression: false }
			m.text.fontsizeAllowShrink = { value: true, isExpression: false }
		}
		const ceilingPx = (CEILING / 100) * bandPx
		report.push(
			`${group.padEnd(13)} ${String(members.length).padStart(2)} captions at ${CEILING}% ` +
				`= ${ceilingPx.toFixed(1)}px ceiling; longest (${JSON.stringify(limitedBy.label)}) ` +
				`shrinks to ${size.toFixed(1)}px` +
				(fits >= CEILING ? '  — nothing shrinks' : '')
		)
	}

	const rewrapped = captioned.filter((x) => x.sample !== x.before)
	for (const x of rewrapped) console.log(`  ${x.row}/${x.column}  ${JSON.stringify(x.before)} -> ${JSON.stringify(x.sample)}`)
	for (const line of report) console.log(`  ${line}`)

	const file = path.join(outDir, `page-${number}-${name.replace(/\W+/g, '-').toLowerCase()}.companionconfig`)
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
	console.log(`  page ${number} (${name}) -> ${path.basename(file)}\n`)
}
