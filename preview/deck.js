/**
 * Draw a generated page as the Stream Deck + XL will physically present it.
 *
 * Usage: node preview/deck.js <pagesDir> <outDir>
 *
 * A grid dump tells you which cell a button landed in. It does not tell you whether the row of
 * folders reads as a row of folders, or whether four knob captions still line up under the
 * strip they describe. This draws the real thing: 36 keys at 112x112, the touchstrip as ONE bar
 * cut into six 200x100 zones, and six encoders beneath it — the geometry Companion's own driver
 * declares, not a tidy 9-wide approximation of it.
 *
 * Icons come from `dist/svg`, so this is the artwork the deck will draw. Text layers are shown
 * with their variable references collapsed to `~`, because their values live on the rig.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { KNOB_COLS, COLUMNS, KEY_ROWS, STRIP_ROW, KNOB_ROW } from '../src/layout.js'

const requireCompanion = createRequire('/Applications/Companion.app/Contents/Resources/')
const { Canvas, loadImage } = requireCompanion('@napi-rs/canvas')

const [, , pagesDir, outDir, varsFile] = process.argv
if (!pagesDir || !outDir) {
	console.error('usage: node preview/deck.js <pagesDir> <outDir> [variables.json]')
	process.exit(1)
}

/**
 * Real variable values, so labels can be judged at their real length.
 *
 * Without this a key reading `$(atem:long_3010)` previews as a tidy placeholder and the fact
 * that it says "Media Player 1" on a 112px key never surfaces until it is on the deck.
 * Optional: a JSON map of "connection:variable" to value.
 */
const VARIABLES = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : {}

const KEY = 112
const GAP = 8
const STRIP_H = 100
const KNOB_R = 26
const M = 24
const TITLE = 34

const WIDTH = M * 2 + COLUMNS * KEY + (COLUMNS - 1) * GAP
const STRIP_W = COLUMNS * KEY + (COLUMNS - 1) * GAP
const ZONE_W = STRIP_W / KNOB_COLS.length
const HEIGHT = TITLE + M * 2 + (KEY_ROWS.length + 1) * (KEY + GAP) + STRIP_H + GAP + KNOB_R * 2 + GAP

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6)
const layer = (control, type) => control?.style?.layers?.find((l) => l.type === type)

/**
 * Resolve what we have a value for; collapse the rest, whose values live on the rig.
 *
 * Literal backslash-n becomes a real line break, because that is what Companion does with it and
 * several buttons on this rig use it to push their caption below the icon. Rendering it verbatim
 * makes the preview lie about how much room the label takes.
 */
const captionOf = (text) => {
	const raw = text?.text?.value ?? ''
	return String(raw)
		.replace(/\$\(([^)]*)\)/g, (whole, name) => VARIABLES[name] ?? whole)
		.replace(/\$\([^)]*\)/g, '~')
		.replace(/\\n/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{2,}/g, '\n')
		.trim()
}

const svgCache = new Map()
async function artFor(control) {
	const raw = layer(control, 'image')?.base64Image?.value
	if (!raw) return null

	if (raw.startsWith('data:')) return loadImage(raw) // an embedded bitmap, drawn as-is

	const name = /^\$\(image:(.+)\)$/.exec(raw)?.[1]
	if (!name) return null
	if (!svgCache.has(name)) {
		const file = path.resolve('dist/svg', `${name}.svg`)
		svgCache.set(name, fs.existsSync(file) ? await loadImage(fs.readFileSync(file)) : null)
	}
	return svgCache.get(name)
}

/** Draw one control into a box, honouring its background, border, icon and caption. */
async function drawControl(ctx, control, x, y, w, h) {
	const box = layer(control, 'box')
	ctx.fillStyle = box ? hex(box.color.value) : '#0D0D0F'
	ctx.fillRect(x, y, w, h)

	const border = box?.borderWidth?.value ?? 0
	if (border > 0) {
		ctx.strokeStyle = hex(box.borderColor.value)
		ctx.lineWidth = Math.max(2, (border / 100) * h)
		ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
	}

	const texts = (control?.style?.layers ?? []).filter((l) => l.type === 'text')
	const art = await artFor(control)

	if (art) {
		// Icons are square and letterboxed, exactly as Companion draws them into a wide zone.
		const iconH = (layer(control, 'image')?.height?.value ?? 56) / 100
		const side = Math.min(w, h * (texts.length ? iconH : 1))
		ctx.drawImage(art, x + (w - side) / 2, y + h * 0.02, side, side)
	}

	/*
	 * EVERY text layer, not just the first. A control with two — a name over a live reading, the
	 * shape the touchstrip readouts and the DCA keys both use — would otherwise preview with its
	 * value missing, which is precisely the half you want to check.
	 */
	for (const text of texts) drawText(ctx, control, text, x, y, w, h)
}

function drawText(ctx, control, text, x, y, w, h) {
	const label = captionOf(text)
	if (!label) return

	/*
	 * Draw at the layer's OWN font size, not a preview default. The whole point of the caption
	 * pass is that every key shares one measured size; a preview that renders them all at 15px
	 * would show that as fixed whether it was or not.
	 */
	/*
	 * Model Companion's shrink-to-fit, or the preview lies. `fontsize` is a percentage of the
	 * band, and with shrink on Companion reduces it until the text fits. A preview that skips
	 * that step shows overflow where the deck will show a slightly smaller, perfectly fine key.
	 */
	const lines = label.split('\n')
	const bandPx = ((text?.height?.value ?? 38) / 100) * h
	let size = ((text?.fontsize?.value ?? 40) / 100) * bandPx
	if (text?.fontsizeAllowShrink?.value !== false) {
		const fits = (s) => {
			ctx.font = `${s}px sans-serif`
			return lines.every((l) => ctx.measureText(l).width <= w - 8) && lines.length * s * 1.18 <= bandPx
		}
		while (size > 6 && !fits(size)) size -= 0.5
	}
	const top = ((text?.y?.value ?? 60) / 100) * h
	const bandHeight = bandPx
	const lineHeight = size * 1.18
	const start = y + top + (bandHeight - lines.length * lineHeight) / 2 + size * 0.85

	ctx.fillStyle = hex(text?.color?.value ?? 0xffffff)
	ctx.textAlign = 'center'
	ctx.font = `${size}px sans-serif`
	for (const [i, line] of lines.entries()) {
		ctx.fillText(line, x + w / 2, start + i * lineHeight)
	}
}

async function drawPage(config, out) {
	const { page } = config
	const canvas = new Canvas(WIDTH, HEIGHT)
	const ctx = canvas.getContext('2d')

	ctx.fillStyle = '#17171A'
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	ctx.fillStyle = '#E9E9EE'
	ctx.font = 'bold 20px sans-serif'
	ctx.textAlign = 'left'
	ctx.fillText(`page ${config.oldPageNumber} — ${page.name}`, M, 26)

	const cellX = (column) => M + column * (KEY + GAP)

	// Keys: the folder row plus the three content rows.
	for (const row of [0, ...KEY_ROWS]) {
		const y = TITLE + M + row * (KEY + GAP)
		for (let column = 0; column < COLUMNS; column++) {
			const control = page.controls?.[row]?.[column]
			if (!control) {
				ctx.fillStyle = '#1E1E22'
				ctx.fillRect(cellX(column), y, KEY, KEY)
				continue
			}
			await drawControl(ctx, control, cellX(column), y, KEY, KEY)
		}
	}

	// Touchstrip: one continuous bar, cut into six zones.
	const stripY = TITLE + M + (KEY_ROWS.length + 1) * (KEY + GAP)
	ctx.fillStyle = '#0A0A0C'
	ctx.fillRect(M, stripY, STRIP_W, STRIP_H)
	for (const [slot, column] of KNOB_COLS.entries()) {
		const x = M + slot * ZONE_W
		const control = page.controls?.[STRIP_ROW]?.[column]
		if (control) await drawControl(ctx, control, x, stripY, ZONE_W, STRIP_H)
		ctx.strokeStyle = '#3A3A42'
		ctx.lineWidth = 1
		ctx.strokeRect(x + 0.5, stripY + 0.5, ZONE_W - 1, STRIP_H - 1)
	}

	// Encoders, centred under their zones.
	const knobY = stripY + STRIP_H + GAP + KNOB_R
	for (const [slot, column] of KNOB_COLS.entries()) {
		const cx = M + slot * ZONE_W + ZONE_W / 2
		const control = page.controls?.[KNOB_ROW]?.[column]
		ctx.beginPath()
		ctx.arc(cx, knobY, KNOB_R, 0, Math.PI * 2)
		ctx.fillStyle = control ? '#2E2E36' : '#1E1E22'
		ctx.fill()
		ctx.strokeStyle = control ? '#8A8A96' : '#2A2A30'
		ctx.lineWidth = 2
		ctx.stroke()
		if (!control) continue
		ctx.fillStyle = '#E9E9EE'
		ctx.font = '13px sans-serif'
		ctx.textAlign = 'center'
		const label = captionOf(layer(control, 'text'))
		ctx.fillText(label.length > 10 ? label.slice(0, 9) + '…' : label, cx, knobY + 4)
	}

	fs.writeFileSync(out, canvas.toBuffer('image/png'))
}

fs.mkdirSync(outDir, { recursive: true })
for (const file of fs.readdirSync(pagesDir).sort()) {
	if (!file.endsWith('.companionconfig')) continue
	const config = JSON.parse(fs.readFileSync(path.join(pagesDir, file), 'utf8'))
	const out = path.join(outDir, file.replace('.companionconfig', '.png'))
	await drawPage(config, out)
	console.log(`  ${config.page.name.padEnd(7)} -> ${path.basename(out)}`)
}
