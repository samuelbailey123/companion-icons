/**
 * The three books, as HTML ready to print: the Operator Guide, the Reference and the Recovery Guide.
 *
 * Everything here is a pure function of a snapshot (`tools/manual/collect.js`) and the hand-written
 * chapters in `manual/`. The Reference is generated whole from the snapshot, so it cannot drift from
 * the rig it was read off; the other two are prose with generated tables and drawings dropped in
 * where a `{{token}}` paragraph stands.
 *
 * A snapshot is `{ exp, defs, videohub, atem, readAt, build, keyImage(page,row,col) }`, where
 * `keyImage` returns a data URL or null.
 */
import { SOURCES, inputsText } from '../dante.js'
import { parseDump } from './blackmagic.js'
import { describeEntity, describeEvent } from './describe.js'
import { audioDiagram, controlDiagram, navDiagram, videoDiagram } from './diagram.js'
import { escape, markdown, slug } from './markdown.js'
import { NETWORK, POWER, TODO, VIDEOHUB_DESTINATIONS, VIDEOHUB_SOURCES } from './plant.js'
import {
	at,
	backgroundOf,
	connectionLabels,
	connections,
	customVariables,
	folderRow,
	imageLibrary,
	pages,
	stepsOf,
	textOf,
	setName,
	triggers,
} from './rig.js'

const ROW_NAMES = ['Folder row', 'Keys', 'Keys', 'Keys', 'Touchstrip', 'Knobs']
/** Columns the + XL's touchstrip zones and knobs exist at (src/layout.js). */
const KNOB_COLS = [0, 2, 3, 5, 6, 8]

/** Text that is an expression or holds variables reads as code; anything else as words. */
export const labelHtml = (text) => (/\$\(|concat\(|jsonpath\(/.test(text) ? `<code>${escape(text)}</code>` : escape(text.replace(/\\n/g, ' ')))

/** The context `describeEntity` needs. */
export const context = (snap) => ({ labels: Object.fromEntries(connectionLabels(snap.exp)), defs: snap.defs })

/** An entity tree as nested list items. */
export function entityHtml(d) {
	const opts = d.options.length ? `: ${d.options.map(([k, v]) => `${escape(k)} <span class="v">${escape(v)}</span>`).join('; ')}` : ''
	const flags = `${d.inverted ? ' <span class="flag">inverted</span>' : ''}${d.disabled ? ' <span class="flag">disabled</span>' : ''}`
	const over = d.overrides.length ? `<div class="over">→ ${escape(d.overrides.join(', '))}</div>` : ''
	const kids = d.children.map((c) => `<li class="group">${escape(c.group)}<ul>${c.items.map(entityHtml).join('')}</ul></li>`).join('')
	return `<li><span class="who">${escape(d.who)}</span> · <b>${escape(d.what)}</b>${opts}${flags}${over}${kids ? `<ul>${kids}</ul>` : ''}</li>`
}

const entityList = (items, ctx) => `<ul class="entities">${items.map((e) => entityHtml(describeEntity(e, ctx))).join('')}</ul>`

/** A page as the deck shows it: six rows of nine, with the touchstrip and knobs where they exist. */
export function gridHtml(page, snap, only = [0, 1, 2, 3, 4, 5]) {
	const byPos = new Map(page.keys.map((k) => [at(k.row, k.column), k]))
	const rows = []
	for (const row of only) {
		const cells = []
		for (let col = 0; col <= 8; col++) {
			const exists = row < 4 || KNOB_COLS.includes(col)
			const key = byPos.get(at(row, col))
			const img = key && snap.keyImage(page.number, row, col)
			const cls = !exists ? 'cell none' : row === 5 ? 'cell knob' : row === 4 ? 'cell strip' : 'cell'
			const inner = img
				? `<img src="${img}" alt="${escape(textOf(key.control))}">`
				: key
					? `<div class="fallback" style="background:${backgroundOf(key.control)}">${escape(textOf(key.control).slice(0, 24))}</div>`
					: ''
			cells.push(`<div class="${cls}${key ? ' used' : ''}">${inner}<span class="pos">${exists ? at(row, col) : ''}</span></div>`)
		}
		rows.push(`<div class="row-label">${ROW_NAMES[row]}</div>${cells.join('')}`)
	}
	return `<div class="grid">${rows.join('')}</div>`
}

/** Every key on a page, in reading order, with what it does and what changes it. */
export function keysHtml(page, snap, skipFolder) {
	const ctx = context(snap)
	const rows = page.keys
		.filter((k) => !(skipFolder && k.row === 0))
		.map((k) => {
			const c = k.control
			const img = snap.keyImage(page.number, k.row, k.column)
			const steps = stepsOf(c)
			const many = steps.length > 1
			const sets = steps
				.flatMap((s, i) => s.sets.map((set) => `<div class="set"><span class="set-name">${many ? `Step ${i + 1} · ` : ''}${setName(set.name)}</span>${entityList(set.actions, ctx)}</div>`))
				.join('')
			const fb = (c.feedbacks ?? []).length ? `<div class="set"><span class="set-name">Changes when</span>${entityList(c.feedbacks, ctx)}</div>` : ''
			const notes = c.options?.notes ? `<p class="notes">${escape(c.options.notes)}</p>` : ''
			return `<tr><td class="k">${img ? `<img src="${img}" alt="">` : ''}<span>${at(k.row, k.column)}</span></td><td><div class="label">${labelHtml(textOf(c)) || '<i>(no label)</i>'}</div>${notes}${sets || '<p class="none">No action: display only.</p>'}${fb}</td></tr>`
		})
	return rows.length ? `<table class="keys"><tbody>${rows.join('')}</tbody></table>` : '<p class="none">No keys besides the folder row.</p>'
}

/** Sub-pages, and which page first opens each, from every `set_page` outside the folder row. */
export function navigation(list) {
	const folder = folderRow(list)
	const onRow = new Set(folder.keys.map((k) => Number(pageTarget(k.control))).filter(Boolean))
	const links = []
	for (const p of list) {
		for (const k of p.keys) {
			if (k.row === 0 && folder.pages.includes(p.number)) continue
			const target = Number(pageTarget(k.control))
			if (target && target !== p.number) links.push({ from: p.number, to: target, at: at(k.row, k.column), label: textOf(k.control) })
		}
	}
	const children = new Map()
	const seen = new Set(onRow)
	const queue = [...onRow]
	while (queue.length) {
		const from = queue.shift()
		for (const l of links.filter((x) => x.from === from && !seen.has(x.to))) {
			seen.add(l.to)
			const root = rootOf(l.from, children, onRow)
			children.set(root, [...(children.get(root) ?? []), l.to])
			queue.push(l.to)
		}
	}
	return { folder, onRow: [...onRow], children, links }
}

/** The folder-row page a reached page hangs under. A page is queued only once it has a parent, so one is always found. */
const rootOf = (page, children, onRow) => (onRow.has(page) ? page : [...children.entries()].find(([, kids]) => kids.includes(page))[0])

/** The page a key jumps to, if it has a `set_page` action. */
export function pageTarget(control) {
	for (const s of stepsOf(control)) {
		for (const set of s.sets) {
			for (const a of set.actions) {
				if (a.definitionId === 'set_page') {
					const v = a.options?.page
					return v && typeof v === 'object' ? v.value : v
				}
			}
		}
	}
	return null
}

/** One book as a standalone HTML document. */
export function documentHtml({ title, subtitle, readAt, build, sections, css }) {
	const toc = sections.map((s) => `<li><a href="#${s.id}">${escape(s.title)}</a></li>`).join('')
	const body = sections.map((s) => `<section id="${s.id}" class="${s.class ?? ''}"><h1>${escape(s.title)}</h1>${s.html}</section>`).join('\n')
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${css}</style></head>
<body>
<section class="cover"><div class="kicker">Triumph Church production rig</div><h1 class="book">${escape(title)}</h1><p class="subtitle">${escape(subtitle)}</p>
<p class="stamp">Read off the live rig ${escape(readAt)} · Companion ${escape(build)}</p></section>
<section class="toc"><h1>Contents</h1><ol>${toc}</ol></section>
${body}
</body></html>`
}

/** Split hand-written Markdown at its `## ` headings into sections, filling `{{token}}` paragraphs. */
export function chapters(md, tokens = {}, prefix = '', intro = 'About this guide') {
	const body = md.replace(/^# .*\n/, '')
	const parts = (/^\s*## /.test(body) ? body : `## ${intro}\n${body}`).split(/^## /m).filter((p) => p.trim())
	return parts.map((part) => {
		const [title, ...rest] = part.split('\n')
		let html = markdown(rest.join('\n').replace(/^###/gm, '##'), { idPrefix: prefix })
		html = html.replace(/<p>\{\{([\w:-]+)\}\}<\/p>/g, (m, name) => {
			if (!(name in tokens)) throw new Error(`no generated block named {{${name}}}`)
			return tokens[name]
		})
		return { id: prefix + slug(title), title: title.trim(), html }
	})
}

/** Tables of the router's ports and the switcher's, with what is cabled to each. */
export function videoTables(hub, atem) {
	const row = (n, label, fact) => `<td>${n}</td><td>${escape(label ?? '')}</td><td>${fact ? escape(`${fact.device}${fact.port ? ` · ${fact.port}` : ''}`) : '<span class="todo">TODO / spare</span>'}</td>`
	const ports = [...hub.inputs.keys()].sort((a, b) => a - b)
	const hubRows = ports.map((p) => `<tr>${row(p, hub.inputs.get(p), VIDEOHUB_SOURCES[p])}${row(p, hub.outputs.get(p), VIDEOHUB_DESTINATIONS[p])}<td>${hub.routing.has(p) ? `IN ${hub.routing.get(p)} · ${escape(hub.inputs.get(hub.routing.get(p)) ?? '')}` : 'unknown'}</td></tr>`)
	const atemIn = [...atem.inputs.entries()].filter(([n]) => n >= 2 && n <= 9)
	const atemRows = atemIn.map(([n, label]) => `<tr><td>${n - 1}</td><td>${escape(label)}</td><td>${n - 1 <= 6 ? `Videohub OUT ${n - 1}, now carrying IN ${hub.routing.get(n - 1)} · ${escape(hub.inputs.get(hub.routing.get(n - 1)) ?? '')}` : '<span class="todo">not fed by the router: TODO, is anything cabled here?</span>'}</td></tr>`)
	const atemOut = [...atem.outputs.entries()].map(([n, label]) => `<tr><td>${escape(label)}</td><td>${escape(atem.inputs.get(atem.routing.get(n)) ?? '')}</td></tr>`)
	return `<h2>Videohub ports</h2>
<table class="data"><thead><tr><th>IN</th><th>Label</th><th>Cabled from</th><th>OUT</th><th>Label</th><th>Cabled to</th><th>Carrying now</th></tr></thead><tbody>${hubRows.join('')}</tbody></table>
<h2>Switcher inputs</h2>
<p>${escape(atem.model)}, running <b>${escape(atem.mode ?? 'unknown')}</b>. The input names are the switcher's own.</p>
<table class="data"><thead><tr><th>Input</th><th>Name</th><th>Fed by</th></tr></thead><tbody>${atemRows.join('')}</tbody></table>
<h2>Switcher outputs</h2>
<table class="data"><thead><tr><th>Output</th><th>Showing now</th></tr></thead><tbody>${atemOut.join('')}</tbody></table>`
}

/** The control drawing's boxes: Companion connections and the Pi's scripts, against the devices. */
export function controlParts(exp) {
	const conns = connections(exp)
	const host = (c) => {
		const s = Object.fromEntries(c.settings)
		const h = s.bonjourHost && s.bonjourHost !== '(empty)' ? s.bonjourHost.split(':')[0] : (s.host ?? s.ip)
		return h && h !== '(empty)' ? h : null
	}
	const devices = NETWORK.filter((d) => !d.device.startsWith('Companion Pi')).map((d, i) => ({ id: `n${i}`, text: d.device, sub: d.address, address: d.address }))
	devices.push({ id: 'cloud', text: 'Planning Center (internet)', sub: 'api.planningcenteronline.com', address: '' })
	const find = (addr) => devices.filter((d) => addr && d.address.split(' ')[0] === addr)
	const scripts = [
		{ id: 'sp', text: 'speaker_power.py', sub: 'Power page, 8:05 trigger', to: ['10.23.0.250'] },
		{ id: 'pp', text: 'projector_power.py', sub: 'Power page, 8:05 trigger', to: ['10.23.0.112', '10.23.0.234', '10.23.0.80'] },
		{ id: 'pz', text: 'ptz_state.py, ptz_web.py', sub: 'PTZ readouts and picture', to: ['10.23.0.181', '10.23.0.196'] },
		{ id: 'ct', text: 'chrome_tracks.sh', sub: 'walk-in music over SSH', to: ['10.23.0.204'] },
	]
	const controllers = [
		...conns.map((c) => ({ id: `c-${c.id}`, text: `${c.label}`, sub: `${c.module} ${c.version}`, host: host(c), module: c.module })),
		...scripts,
	]
	const links = []
	for (const c of controllers) {
		if (c.to) c.to.forEach((a) => find(a).forEach((d) => links.push({ from: c.id, to: d.id })))
		else if (c.module === 'audinate-dantecontroller') devices.filter((d) => /Dante/.test(NETWORK.find((n) => n.device === d.text)?.ports ?? '')).forEach((d) => links.push({ from: c.id, to: d.id }))
		else if (c.module === 'planningcenter-serviceslive') links.push({ from: c.id, to: 'cloud' })
		else find(c.host).forEach((d) => links.push({ from: c.id, to: d.id }))
	}
	return { controllers, devices, links }
}

const table = (head, rows) =>
	`<table class="data"><thead><tr>${head.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows
		.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
		.join('')}</tbody></table>`

/** The Reference: generated end to end from the snapshot, plus the engineering notes. */
export function referenceSections(snap, docs = []) {
	const list = pages(snap.exp)
	const nav = navigation(list)
	const names = new Map(list.map((p) => [p.number, p.name]))
	const hub = parseDump(snap.videohub)
	const atem = parseDump(snap.atem)
	const ctx = context(snap)
	const sections = []

	const counts = { pages: list.length, keys: list.reduce((n, p) => n + p.keys.length, 0), triggers: triggers(snap.exp).length }
	sections.push({
		id: 'about',
		title: 'About this book',
		html: `<p>Everything Companion holds, read off the live rig: ${counts.pages} pages, ${counts.keys} controls, ${counts.triggers} triggers, ${customVariables(snap.exp).length} custom variables, ${connections(snap.exp).length} connections and ${(snap.exp.imageLibrary ?? []).length} library images. It is generated, not written: rebuild it after any change to the rig (<code>node tools/manual/collect.js</code>, then <code>node tools/manual/build.js</code>, on the AV network).</p>
<p><b>Positions</b> are written <code>r1c3</code>: row 1, column 3, counting from 0 at the top left. Row 0 is the folder row, rows 1–3 are keys, row 4 the touchstrip and row 5 the knobs. The touchstrip and knobs exist only at columns 0, 2, 3, 5, 6 and 8.</p>
<p><b>Key pictures</b> are Companion's own renders at the moment of reading, so they show that moment's state (what was live, what was on).</p>
<p><b>Credentials</b> never appear: each is named by its 1Password entry in the Recovery Guide.</p>`,
	})

	sections.push({
		id: 'page-map',
		title: 'The deck at a glance',
		html: `${navDiagram(nav.onRow.map((n) => ({ number: n, name: names.get(n) })), nav.children, names)}
${table(
	['Page', 'Name', 'Controls', 'Reached from'],
	list.map((p) => [
		String(p.number),
		escape(p.name),
		String(p.keys.length),
		nav.onRow.includes(p.number)
			? 'Folder row'
			: escape(
					nav.links
						.filter((l) => l.to === p.number)
						.map((l) => `${names.get(l.from)} ${l.at}`)
						.join(', ') || 'nothing on the deck',
				),
	]),
)}
<h2>The folder row</h2><p>The same on ${nav.folder.pages.length} of ${list.length} pages, so it is listed once here and left out of each page below.</p>
${gridHtml({ number: nav.folder.pages[0], keys: nav.folder.keys }, snap, [0])}`,
	})

	sections.push({
		id: 'signal-video',
		title: 'Signal flow: video',
		html: `<p>Solid lines are cables, by the names on the router's ports; <span class="live-key">coloured lines</span> are the crosspoints the router reported at build time; dashed boxes are things nobody has yet looked at, listed under <a href="#signal-todo">Still to trace</a>.</p>${videoDiagram(hub, VIDEOHUB_SOURCES, VIDEOHUB_DESTINATIONS)}${videoTables(hub, atem)}`,
	})
	sections.push({
		id: 'signal-audio',
		title: 'Signal flow: audio',
		html: `<p>Inputs are the SQ7 Dante card's own subscriptions (<code>src/dante.js</code>), the same ones the Dante page checks. The desk's outputs are not readable over the network.</p>${audioDiagram(SOURCES, inputsText)}${table(
			['Source', 'Dante device', 'Desk inputs', 'Needed every Sunday'],
			SOURCES.map((s) => [escape(s.name), `<code>${escape(s.device)}</code>`, escape(s.away === 'On XLR' ? 'XLR (not Dante)' : inputsText(s.routes)), s.required ? 'yes' : 'no'])
		)}`,
	})
	const parts = controlParts(snap.exp)
	sections.push({
		id: 'signal-control',
		title: 'Signal flow: control and network',
		html: `<p>Every device is on the AV LAN, 10.23.0.0/24. Addresses come from DHCP and have drifted before: check them here first when a page goes quiet.</p>${controlDiagram(parts.controllers, parts.devices, parts.links)}${table(
			['Device', 'Address', 'Ports', 'Talked to by', 'Source'],
			NETWORK.map((d) => [escape(d.device), `<code>${escape(d.address)}</code>`, escape(d.ports), escape(d.by), escape(d.source)])
		)}<h2>Power</h2>${table(
			['What', 'How', 'Switched by'],
			POWER.map((p) => [escape(p.what), escape(p.how), escape(p.by)])
		)}`,
	})
	sections.push({
		id: 'signal-todo',
		title: 'Still to trace',
		html: `<p>Cable runs cannot be read over the network. Each of these needs someone in the room with a torch; record the answer in <code>src/manual/plant.js</code> and rebuild.</p><ul class="todo-list">${TODO.map((t) => `<li><span class="box">☐</span> ${escape(t)}</li>`).join('')}</ul>`,
	})

	for (const p of list) {
		const skip = nav.folder.pages.includes(p.number)
		sections.push({
			id: `page-${p.number}`,
			title: `Page ${p.number}: ${p.name}`,
			class: 'page',
			html: `${gridHtml(p, snap)}${keysHtml(p, snap, skip)}`,
		})
	}

	sections.push({
		id: 'triggers',
		title: 'Triggers',
		html: triggers(snap.exp)
			.map(
				(t) => `<div class="trigger"><h2>${escape(t.name)}${t.enabled ? '' : ' <span class="flag">disabled</span>'}</h2>${t.notes ? `<p class="notes">${escape(t.notes)}</p>` : ''}
<div class="set"><span class="set-name">When</span><ul class="entities">${t.events.map((e) => `<li>${escape(describeEvent(e))}</li>`).join('')}</ul></div>
${t.conditions.length ? `<div class="set"><span class="set-name">Only if</span>${entityList(t.conditions, ctx)}</div>` : ''}
<div class="set"><span class="set-name">Does</span>${entityList(t.actions, ctx)}</div></div>`,
			)
			.join(''),
	})

	sections.push({
		id: 'variables',
		title: 'Custom variables',
		html: `<p>Read in expressions as <code>$(custom:name)</code>. "Kept" values survive a restart.</p>${table(
			['Name', 'What it holds', 'Default', 'Kept'],
			customVariables(snap.exp).map((v) => [`<code>${escape(v.name)}</code>`, escape(v.description), escape(v.defaultValue), v.persist ? 'yes' : ''])
		)}`,
	})

	sections.push({
		id: 'connections',
		title: 'Connections',
		html: connections(snap.exp)
			.map(
				(c) => `<div class="conn"><h2>${escape(c.label)} <span class="dim">${escape(c.module)} ${escape(c.version)}${c.enabled ? '' : ' · disabled'}</span></h2>${table(
					['Setting', 'Value'],
					c.settings.map(([k, v]) => [`<code>${escape(k)}</code>`, escape(v)])
				)}</div>`,
			)
			.join(''),
	})

	sections.push({
		id: 'images',
		title: 'Image library',
		html: `<p>Each is published as <code>$(image:name)</code>; a key's image layer names one, so changing an image here changes every key that uses it. Built by <code>npm run build</code> in this repo.</p>${imageLibrary(snap.exp)
			.map(
				(g) => `<h2>${escape(g.collection)}</h2><div class="library">${g.images
					.map((i) => `<figure>${snap.libraryImage?.(i.name) ? `<img src="${snap.libraryImage(i.name)}" alt="">` : ''}<figcaption>${escape(i.name)}</figcaption></figure>`)
					.join('')}</div>`,
			)
			.join('')}`,
	})

	for (const d of docs) sections.push({ id: `notes-${slug(d.title)}`, title: `Engineering notes: ${d.title}`, class: 'notes-doc', html: markdown(d.md.replace(/^# .*\n/, ''), { idPrefix: `n-${slug(d.title)}-` }) })
	return sections
}
