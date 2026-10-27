/**
 * The manual's drawings, as SVG: boxes with labelled ports in columns, and a curve per cable.
 *
 * Every drawing is made from what the devices report (router labels and crosspoints, the Dante
 * patch the deck checks, Companion's connections). Where the far end of a cable is only known
 * from a port's label it is drawn dashed and says so: a label is what someone typed, not proof
 * of where the cable goes.
 */
import { escape } from './markdown.js'

const PORT = 20
const HEAD = 40
const GAP = 16
const TONES = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#4d7c0f', '#be185d']

/**
 * A block diagram. `columns` is a list of node lists, left to right; a node is
 * { id, title, sub?, ports: [{ id, label }] }. An edge joins `node.port` (or a bare node id)
 * on its right side to another on its left side; `dashed` marks a cable known only by label,
 * `faint` a router crosspoint rather than a cable.
 */
export function blockDiagram({ columns, edges, width = 1000, nodeWidth = 210 }) {
	const step = columns.length > 1 ? (width - nodeWidth - 20) / (columns.length - 1) : 0
	const place = {}
	let height = 0
	columns.forEach((nodes, ci) => {
		let y = 10
		for (const n of nodes) {
			const h = HEAD + Math.max(n.ports?.length ?? 0, 0) * PORT + (n.ports?.length ? 6 : 0)
			place[n.id] = { x: 10 + ci * step, y, w: nodeWidth, h, node: n }
			y += h + GAP
		}
		height = Math.max(height, y)
	})
	const anchor = (ref, side) => {
		const [nid, pid] = ref.split('.')
		const p = place[nid]
		if (!p) throw new Error(`diagram: no node "${nid}"`)
		const x = side === 'out' ? p.x + p.w : p.x
		if (pid === undefined) return { x, y: p.y + p.h / 2 }
		const i = p.node.ports.findIndex((port) => String(port.id) === pid)
		if (i < 0) throw new Error(`diagram: no port "${ref}"`)
		return { x, y: p.y + HEAD + i * PORT + PORT / 2 }
	}
	const curves = edges.map((e, i) => {
		const a = anchor(e.from, 'out')
		const b = anchor(e.to, 'in')
		const dx = Math.max(30, (b.x - a.x) / 2)
		const colour = e.faint ? '#9ca3af' : (e.colour ?? TONES[i % TONES.length])
		const dash = e.dashed ? ' stroke-dasharray="5 4"' : ''
		const label = e.label
			? `<text class="el" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 3}" text-anchor="middle">${escape(e.label)}</text>`
			: ''
		return `<path d="M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}" stroke="${colour}" stroke-width="${e.faint ? 1 : 1.8}" fill="none"${dash}/>${label}`
	})
	const boxes = Object.values(place).map(({ x, y, w, h, node }) => {
		const ports = (node.ports ?? [])
			.map(
				(p, i) =>
					`<text class="pl" x="${x + 8}" y="${y + HEAD + i * PORT + 14}">${escape(p.label)}</text>${i ? `<line x1="${x}" x2="${x + w}" y1="${y + HEAD + i * PORT}" y2="${y + HEAD + i * PORT}" class="sep"/>` : ''}`,
			)
			.join('')
		return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="${node.muted ? 'nb muted' : 'nb'}"/><text class="nt" x="${x + 8}" y="${y + 17}">${escape(node.title)}</text>${
			node.sub ? `<text class="ns" x="${x + 8}" y="${y + 32}">${escape(node.sub)}</text>` : ''
		}${ports}</g>`
	})
	return `<svg class="diagram" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${boxes.join('')}${curves.join('')}</svg>`
}

const unlabelled = (label) => /^(Input|Output) \d+$/.test(label)

/** Where the device on the far side of a router port is, by the port's label. */
const SOURCE_GROUPS = [
	{ id: 'atemout', title: 'ATEM HD8 outputs', sub: 'by label: Aux 1, Aux 2, Program, Multiview', test: /^(aux|program|multiview)/i },
	{ id: 'cams', title: 'Cameras', sub: 'PTZs, SDI', test: /cam/i },
	{ id: 'pp1', title: 'PP1 iMac (ProPresenter)', sub: '10.23.0.204', test: /pp1|words|overlay/i },
]
const DEST_GROUPS = [
	{ id: 'atemin', title: 'ATEM HD8 inputs', sub: '10.23.0.34', test: /^atem/i },
	{ id: 'screens', title: 'Projectors and screens', sub: 'Panasonic projectors, mini screens', test: /projector|screen/i },
	{ id: 'wall', title: 'LED wall', sub: 'NovaStar VX6S, 10.23.0.23', test: /led|wall/i },
	{ id: 'rec', title: 'HyperDeck Studio Mini', sub: 'records the service, 10.23.0.206', test: /record|deck/i },
]

/**
 * The SDI cabling around the Videohub, from its own dump: a cable into every labelled input, a
 * cable out of every labelled output, and the router's current crosspoints between them.
 * Ports still carrying the router's default name are spares and get no cable.
 */
export function videoCabling(vh, atem) {
	const group = (groups, label, other) => groups.find((g) => g.test.test(label)) ?? other
	const otherIn = { id: 'otherin', title: 'Other sources', sub: 'by label only' }
	const otherOut = { id: 'otherout', title: 'Other destinations', sub: 'by label only' }
	const left = new Map()
	const right = new Map()
	const edges = []
	vh.inputs.forEach((label, i) => {
		if (unlabelled(label)) return
		const g = group(SOURCE_GROUPS, label, otherIn)
		if (!left.has(g.id)) left.set(g.id, { ...g, ports: [] })
		left.get(g.id).ports.push({ id: String(i), label })
		edges.push({ from: `${g.id}.${i}`, to: `vin.${i}`, dashed: true })
	})
	vh.outputs.forEach((label, i) => {
		if (unlabelled(label)) return
		const g = group(DEST_GROUPS, label, otherOut)
		if (!right.has(g.id)) right.set(g.id, { ...g, ports: [] })
		const atemIn = g.id === 'atemin' ? atem?.inputs?.[Number(label.match(/\d+/)?.[0])] : undefined
		right.get(g.id).ports.push({ id: String(i), label: atemIn ? `${label} — "${atemIn}"` : label })
		edges.push({ from: `vout.${i}`, to: `${g.id}.${i}`, dashed: true })
	})
	vh.routing.forEach((input, out) => {
		if (Number.isInteger(input) && vh.inputs[input] !== undefined) edges.push({ from: `vin.${input}`, to: `vout.${out}`, faint: true })
	})
	// Array.from, not map: a dump that skips an index leaves a hole, and map would keep it.
	const ports = (labels) => Array.from(labels, (label, i) => ({ id: String(i), label: `${i + 1}  ${label ?? ''}` }))
	return blockDiagram({
		width: 900,
		nodeWidth: 190,
		columns: [
			[...left.values()],
			[{ id: 'vin', title: 'Videohub IN', sub: vh.model, ports: ports(vh.inputs) }],
			[{ id: 'vout', title: 'Videohub OUT', sub: '10.23.0.21', ports: ports(vh.outputs) }],
			[...right.values()],
		],
		edges,
	})
}

/**
 * The audio inputs into the SQ7, from the Dante patch the deck's Dante page checks
 * (`SOURCES` in src/dante.js). A source the desk takes over XLR is drawn dashed.
 */
export function audioInputs(sources, inputsText) {
	const runs = sources.map((s) => ({ id: s.key, label: `${inputsText(s.routes)}  ${s.name}` }))
	return blockDiagram({
		width: 860,
		nodeWidth: 240,
		columns: [
			sources.map((s) => ({ id: s.key, title: s.name, sub: s.device, ports: [] })),
			[{ id: 'dante', title: 'Dante network', sub: 'AV LAN; SQ7 card is clock leader', ports: runs }],
			[{ id: 'sq7', title: 'Allen & Heath SQ7', sub: 'Dante 64x64 card, 10.23.0.191', ports: runs }],
		],
		edges: sources.flatMap((s) => [
			{ from: s.key, to: `dante.${s.key}`, dashed: s.away === 'On XLR', label: s.away === 'On XLR' ? 'XLR, not Dante' : '' },
			{ from: `dante.${s.key}`, to: `sq7.${s.key}` },
		]),
	})
}

/**
 * How Companion reaches every device: one port per connection or script on the Pi, a cable
 * (network, not copper) to the device it controls, labelled with the protocol.
 */
export function controlMap(links) {
	const devices = [...new Map(links.map((l) => [l.device, l])).values()]
	return blockDiagram({
		width: 820,
		nodeWidth: 300,
		columns: [
			[{ id: 'pi', title: 'Companion Pi', sub: '10.23.0.242 · Companion :8000 · Service Health :80', ports: links.map((l, i) => ({ id: String(i), label: l.from })) }],
			devices.map((d, i) => ({ id: `d${i}`, title: d.device, sub: d.address, ports: [] })),
		],
		edges: links.map((l, i) => ({ from: `pi.${i}`, to: `d${devices.findIndex((d) => d.device === l.device)}` })),
	})
}
