/**
 * Signal-flow drawings as plain SVG: columns of boxes joined by curves.
 *
 * One layout covers every drawing in the manual. Sources sit on the left, things they feed to the
 * right, each column a stack of equal-height boxes, and an edge is a curve from the right side of
 * one box to the left side of another. No layout engine, no dependency: the drawings are small and
 * their order is meaningful (port numbers top to bottom), so placing boxes by index is the layout.
 *
 * Styles a box or edge can carry: `dashed` (not verified: a TODO), `muted` (spare), `live` (a
 * crosspoint the router reported at build time), `accent` (the box the drawing is about).
 */
import { escape } from './markdown.js'

const ROW = 26
const GAP = 6
const PAD = 16
const TITLE = 22

/** Fit text to a box: about 6.2 px per character at 11 px. */
export const fit = (text, width) => {
	const max = Math.max(4, Math.floor((width - 12) / 6.2))
	const s = String(text ?? '')
	return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/**
 * @param {{ title?: string, width?: number, columns: Array<{ x?: number, width: number, heading?: string, boxes: Array<{ id: string, text: string, sub?: string, style?: string, gapBefore?: boolean }> }>, edges: Array<{ from: string, to: string, label?: string, style?: string }>, frames?: Array<{ columns: number[], label: string }> }} spec
 * @returns {string} an <svg> element
 */
export function columns(spec) {
	const gutter = spec.gutter ?? 70
	let x = PAD
	const placed = new Map()
	const cols = spec.columns.map((col) => {
		const left = col.x ?? x
		x = left + col.width + gutter
		let y = PAD + TITLE + (col.heading ? 18 : 0)
		const boxes = col.boxes.map((b) => {
			if (b.gapBefore) y += ROW / 2
			const h = b.sub ? ROW + 12 : ROW
			const box = { ...b, x: left, y, w: col.width, h }
			placed.set(b.id, box)
			y += h + GAP
			return box
		})
		return { ...col, left, boxes, bottom: y }
	})
	const width = spec.width ?? x - gutter + PAD
	const height = Math.max(...cols.map((c) => c.bottom)) + PAD

	const out = []
	out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="diagram" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escape(spec.title ?? 'diagram')}">`)
	if (spec.title) out.push(`<text class="d-title" x="${PAD}" y="${PAD + 12}">${escape(spec.title)}</text>`)
	for (const f of spec.frames ?? []) {
		const inside = f.columns.map((i) => cols[i])
		const fx = Math.min(...inside.map((c) => c.left)) - 8
		const fr = Math.max(...inside.map((c) => c.left + c.width)) + 8
		const fy = PAD + TITLE - 4
		const fb = Math.max(...inside.map((c) => c.bottom))
		out.push(`<rect class="d-frame" x="${fx}" y="${fy}" width="${fr - fx}" height="${fb - fy}" rx="8"/>`)
		out.push(`<text class="d-frame-label" x="${(fx + fr) / 2}" y="${fb - 6}" text-anchor="middle">${escape(f.label)}</text>`)
	}
	for (const c of cols) {
		if (c.heading) out.push(`<text class="d-heading" x="${c.left}" y="${PAD + TITLE + 8}">${escape(c.heading)}</text>`)
	}
	for (const e of spec.edges) {
		const a = placed.get(e.from)
		const b = placed.get(e.to)
		if (!a || !b) continue
		const x1 = a.x + a.w
		const y1 = a.y + a.h / 2
		const x2 = b.x
		const y2 = b.y + b.h / 2
		const mid = (x1 + x2) / 2
		out.push(`<path class="d-edge ${e.style ?? ''}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"/>`)
		if (e.label) out.push(`<text class="d-edge-label" x="${mid}" y="${(y1 + y2) / 2 - 3}" text-anchor="middle">${escape(e.label)}</text>`)
	}
	for (const c of cols) {
		for (const b of c.boxes) {
			out.push(`<g class="d-box ${b.style ?? ''}">`)
			out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="5"/>`)
			out.push(`<text x="${b.x + 6}" y="${b.y + 17}">${escape(fit(b.text, b.w))}</text>`)
			if (b.sub) out.push(`<text class="d-sub" x="${b.x + 6}" y="${b.y + 30}">${escape(fit(b.sub, b.w))}</text>`)
			out.push('</g>')
		}
	}
	out.push('</svg>')
	return out.join('\n')
}

/** A port label the router still carries from the factory: "Input 5", "Output 12". */
export const isDefaultLabel = (label, n) => label === `Input ${n}` || label === `Output ${n}`

/**
 * The video drawing: what feeds each Videohub input, the live crosspoints, and what each output
 * feeds. The ATEM appears on both sides, because it is: it takes OUT 1–6 and sends its outputs
 * back to IN 1–4.
 */
export function videoDiagram(hub, sources, destinations) {
	const n = Math.max(hub.inputs.size, hub.outputs.size)
	const ports = Array.from({ length: n }, (_, i) => i + 1)
	const far = (table, port, label, side) => {
		const fact = table[port]
		if (fact) return { text: fact.device, sub: fact.port ? `${fact.port}` : 'connector: TODO', style: fact.port ? '' : 'dashed' }
		if (isDefaultLabel(label, port)) return { text: 'spare', style: 'muted' }
		return { text: `TODO: what is on ${side} ${port}`, style: 'dashed' }
	}
	const left = ports.map((p) => ({ id: `s${p}`, ...far(sources, p, hub.inputs.get(p), 'IN') }))
	const ins = ports.map((p) => ({ id: `i${p}`, text: `IN ${p} · ${hub.inputs.get(p) ?? ''}`, style: isDefaultLabel(hub.inputs.get(p), p) ? 'muted' : 'accent' }))
	const outs = ports.map((p) => ({ id: `o${p}`, text: `OUT ${p} · ${hub.outputs.get(p) ?? ''}`, style: isDefaultLabel(hub.outputs.get(p), p) ? 'muted' : 'accent' }))
	const right = ports.map((p) => ({ id: `d${p}`, ...far(destinations, p, hub.outputs.get(p), 'OUT') }))
	const edges = [
		...ports.filter((p) => sources[p]).map((p) => ({ from: `s${p}`, to: `i${p}` })),
		...[...hub.routing].map(([out, inp]) => ({ from: `i${inp}`, to: `o${out}`, style: 'live' })),
		...ports.filter((p) => destinations[p]).map((p) => ({ from: `o${p}`, to: `d${p}` })),
	]
	return columns({
		title: `Video: ${hub.model}, live crosspoints at build time`,
		columns: [
			{ width: 200, heading: 'Cabled into', boxes: left },
			{ width: 150, heading: 'Inputs', boxes: ins },
			{ width: 165, heading: 'Outputs', boxes: outs },
			{ width: 200, heading: 'Cabled to', boxes: right },
		],
		edges,
		frames: [{ columns: [1, 2], label: 'Videohub 10.23.0.21' }],
		gutter: 44,
	})
}

/** The audio drawing: each Dante source into the SQ7's card, with the desk inputs it lands on. */
export function audioDiagram(sources, inputsText) {
	const left = sources.map((s) => ({
		id: s.key,
		text: `${s.name} → ${s.away === 'On XLR' ? 'XLR' : inputsText(s.routes)}`,
		sub: s.device,
		style: s.away === 'On XLR' ? 'dashed' : s.required ? '' : 'muted',
	}))
	const desk = [
		{ id: 'card', text: 'SQ7 Dante card, 64×64', sub: 'AllenHth-0e0184 · 10.23.0.70', style: 'accent' },
		{ id: 'xlr', text: 'SQ7 XLR inputs', sub: 'which inputs: TODO', style: 'dashed', gapBefore: true },
	]
	const outputs = [
		{ id: 'pa', text: 'PA: 6× JBL VRX932LAP', sub: 'from main LR: route TODO', style: 'dashed' },
		{ id: 'stream', text: 'Stream / recording audio', sub: 'which output: TODO', style: 'dashed' },
		{ id: 'foyer', text: 'Foyer', sub: 'which output: TODO', style: 'dashed' },
		{ id: 'iem', text: 'In-ears (Shure P9T)', sub: 'which mixes: TODO', style: 'dashed' },
	]
	return columns({
		title: 'Audio: Dante sources into the SQ7, and the desk’s outputs',
		columns: [
			{ width: 250, heading: 'Source (Dante device)', boxes: left },
			{ width: 230, heading: 'Desk', boxes: [...desk, { id: 'sq7', text: 'Allen & Heath SQ7', sub: '10.23.0.191', style: 'accent', gapBefore: true }] },
			{ width: 230, heading: 'Outputs', boxes: outputs },
		],
		edges: [
			...sources.map((s) => (s.away === 'On XLR' ? { from: s.key, to: 'xlr', style: 'dashed' } : { from: s.key, to: 'card' })),
			...outputs.map((o) => ({ from: 'sq7', to: o.id, style: 'dashed' })),
		],
	})
}

/** What controls what: the Pi's programs on the left, each device it reaches on the right. */
export function controlDiagram(controllers, devices, links) {
	return columns({
		title: 'Control: what on the Pi talks to each device',
		columns: [
			{ width: 250, heading: 'On the Companion Pi', boxes: controllers },
			{ width: 330, heading: 'Device', boxes: devices },
		],
		edges: links,
	})
}

/**
 * The deck's page map: folder-row pages across, the sub-pages each one opens beneath it.
 * @param {Array<{ number: number, name: string }>} folder pages on the folder row, in order
 * @param {Map<number, number[]>} children page -> sub-pages first reached from it
 * @param {Map<number, string>} names
 */
export function navDiagram(folder, children, names) {
	const W = 104
	const out = []
	const H = 30
	let maxY = 0
	const boxes = []
	folder.forEach((p, i) => {
		const x = PAD + i * (W + 12)
		boxes.push({ x, y: PAD, text: `${p.number} ${p.name}`, style: 'accent' })
		let y = PAD + H + 22
		for (const c of children.get(p.number) ?? []) {
			boxes.push({ x: x + 10, y, text: `${c} ${names.get(c)}`, style: '', from: { x: x + 4, y: PAD + H } })
			y += H + 10
		}
		maxY = Math.max(maxY, y)
	})
	const width = PAD * 2 + folder.length * (W + 12) - 12
	out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="diagram" viewBox="0 0 ${width} ${maxY + PAD}" width="100%" role="img" aria-label="Page map">`)
	for (const b of boxes) {
		if (b.from) out.push(`<path class="d-edge" d="M${b.from.x},${b.from.y} V${b.y + H / 2} H${b.x}"/>`)
	}
	for (const b of boxes) {
		out.push(`<g class="d-box ${b.style}"><rect x="${b.x}" y="${b.y}" width="${b.from ? W - 10 : W}" height="${H}" rx="5"/><text x="${b.x + 6}" y="${b.y + 19}">${escape(fit(b.text, b.from ? W - 10 : W))}</text></g>`)
	}
	out.push('</svg>')
	return out.join('\n')
}
