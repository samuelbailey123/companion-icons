/**
 * Render the finished library to a PNG contact sheet, grouped by collection, at real
 * Stream Deck + key size and in each icon's assigned colour.
 *
 * Uses Companion's own Skia, so this is what the deck will actually draw.
 * Run: node preview/contact-sheet.js [outfile]
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { ICONS, resolveShape } from '../src/variants.js'
import { renderIcon } from '../src/render.js'
import { COLORS, DEFAULT_BG } from '../src/palette.js'

const requireCompanion = createRequire('/Applications/Companion.app/Contents/Resources/')
const { Canvas, loadImage } = requireCompanion('@napi-rs/canvas')

const OUT = process.argv[2] ?? 'dist/contact-sheet.png'

const KEY = 120
const GAP = 10
const LABEL = 18
const HEADER = 40
const COLS = 8
const MARGIN = 16

const byCollection = new Map()
for (const icon of ICONS) {
	if (!byCollection.has(icon.collection)) byCollection.set(icon.collection, [])
	byCollection.get(icon.collection).push(icon)
}

const cellH = KEY + LABEL + GAP
let height = MARGIN
for (const icons of byCollection.values()) {
	height += HEADER + Math.ceil(icons.length / COLS) * cellH
}
const width = COLS * (KEY + GAP) - GAP + MARGIN * 2

const canvas = new Canvas(width, height + MARGIN)
const ctx = canvas.getContext('2d')
ctx.fillStyle = '#161618'
ctx.fillRect(0, 0, canvas.width, canvas.height)

let y = MARGIN

for (const [collection, icons] of byCollection) {
	ctx.fillStyle = '#f0f0f4'
	ctx.font = '700 17px sans-serif'
	ctx.textAlign = 'left'
	ctx.fillText(collection, MARGIN, y + 20)

	ctx.fillStyle = '#66666e'
	ctx.font = '600 12px sans-serif'
	ctx.fillText(`${icons.length}`, MARGIN + ctx.measureText(collection).width + 44, y + 20)

	y += HEADER

	for (const [i, icon] of icons.entries()) {
		const cx = MARGIN + (i % COLS) * (KEY + GAP)
		const cy = y + Math.floor(i / COLS) * cellH

		ctx.fillStyle = DEFAULT_BG
		ctx.beginPath()
		ctx.roundRect(cx, cy, KEY, KEY, 14)
		ctx.fill()

		const svg = renderIcon(resolveShape(icon), COLORS[icon.color])
		const img = await loadImage('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
		ctx.drawImage(img, cx, cy, KEY, KEY)

		ctx.fillStyle = '#8e8e96'
		ctx.font = '500 11px sans-serif'
		ctx.textAlign = 'center'
		ctx.fillText(icon.name, cx + KEY / 2, cy + KEY + 13)
		ctx.textAlign = 'left'
	}

	y += Math.ceil(icons.length / COLS) * cellH
}

fs.mkdirSync('dist', { recursive: true })
fs.writeFileSync(OUT, canvas.toBuffer('image/png'))
console.log(`wrote ${OUT} — ${ICONS.length} icons in ${byCollection.size} collections`)
