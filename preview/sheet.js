/**
 * Render every shape in the library to a single PNG contact sheet at real key size.
 *
 * Uses Companion's own bundled Skia so what you see is what the deck will draw.
 * Run: node preview/sheet.js [outfile] [colorToken]
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { SHAPES } from '../src/glyphs/index.js'
import { renderIcon } from '../src/render.js'
import { COLORS, DEFAULT_BG } from '../src/palette.js'

const requireCompanion = createRequire('/Applications/Companion.app/Contents/Resources/')
const { Canvas, loadImage } = requireCompanion('@napi-rs/canvas')

const OUT = process.argv[2] ?? 'dist/shapes.png'
const TOKEN = process.argv[3] ?? 'neutral'

const KEY = 120
const PAD = 12
const LABEL = 20
const COLS = 8

const names = Object.keys(SHAPES).sort()
const rows = Math.ceil(names.length / COLS)
const cellW = KEY + PAD
const cellH = KEY + PAD + LABEL

const canvas = new Canvas(COLS * cellW + PAD, rows * cellH + PAD)
const ctx = canvas.getContext('2d')
ctx.fillStyle = '#1a1a1c'
ctx.fillRect(0, 0, canvas.width, canvas.height)

for (const [i, name] of names.entries()) {
	const cx = PAD + (i % COLS) * cellW
	const cy = PAD + Math.floor(i / COLS) * cellH

	ctx.fillStyle = DEFAULT_BG
	ctx.beginPath()
	ctx.roundRect(cx, cy, KEY, KEY, 14)
	ctx.fill()

	const shape = typeof SHAPES[name].levels === 'function' ? SHAPES[name].levels(3) : SHAPES[name]
	const svg = renderIcon(shape, COLORS[TOKEN])
	const img = await loadImage('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
	ctx.drawImage(img, cx, cy, KEY, KEY)

	ctx.fillStyle = '#9a9aa2'
	ctx.font = '600 12px sans-serif'
	ctx.textAlign = 'center'
	ctx.fillText(name, cx + KEY / 2, cy + KEY + 14)
}

fs.mkdirSync('dist', { recursive: true })
fs.writeFileSync(OUT, canvas.toBuffer('image/png'))
console.log(`wrote ${OUT} — ${names.length} shapes`)
