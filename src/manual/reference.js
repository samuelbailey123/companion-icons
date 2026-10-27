/**
 * The Reference book's generated chapters, and the `{{directives}}` the hand-written books use
 * to show the same things. Everything here is drawn from the export and the routers' dumps, so
 * a rebuild after any rig change keeps every page true.
 */
import { SOURCES, inputsText } from '../dante.js'
import { entityLines } from './describe.js'
import { audioInputs, controlMap, videoCabling } from './diagrams.js'
import { CREDENTIALS, DEVICE, PAGE_PURPOSE, PROTOCOL, SCRIPTED } from './facts.js'
import { callout, code, escape, keyGrid, keyTable, table } from './html.js'

const setting = (c, k) => c.settings.find(([key]) => key === k)?.[1]

/** Where a connection points, from its own settings: a discovered address wins over a stale typed one. */
export function address(c) {
	const discovered = setting(c, 'bonjourHost')
	const host = setting(c, 'host') ?? setting(c, 'ip')
	const port = setting(c, 'port') ?? setting(c, 'targetPort')
	if (discovered) return discovered
	if (host) return port ? `${host}:${port}` : host
	return '—'
}

/** One line per Companion connection and per Pi script, for the control drawing. */
export function controlLinks(model) {
	const fromConnections = model.connections.map((c) => {
		const where = address(c)
		const device = c.module === 'ptzoptics-visca' ? `PTZ camera ${where.split(':')[0]}` : (DEVICE[c.module] ?? c.module)
		return { from: `${c.label} (${c.module})`, device, address: where, via: PROTOCOL[c.module] ?? '' }
	})
	return [...fromConnections, ...SCRIPTED.map((s) => ({ from: s.from, device: s.device, address: s.address, via: s.via }))]
}

const list = (items) => (items.length ? items.map(escape).join('<br>') : '—')
const lines = (ds) => `<pre class="act">${escape(ds.flatMap((d) => entityLines(d)).join('\n'))}</pre>`

export function overviewChapter(model) {
	const links = controlLinks(model)
	return {
		title: 'How it fits together',
		lead: 'One Raspberry Pi runs Companion; every key, trigger and readout reaches its device from there, over the AV LAN (10.23.0.x).',
		html: `${controlMap(links)}${table(
			['From the Pi', 'Device', 'Address', 'How'],
			links.map((l) => [escape(l.from), escape(l.device), code(l.address), escape(l.via)]),
		)}${callout(
			'note',
			'Addresses drift',
			'<p>Most devices take their address from DHCP, and several have moved more than once. The ATEM, Videohub and HyperDeck are found by Bonjour, so they follow; everything else is a typed address. When a page goes quiet, check the address first.</p>',
		)}`,
	}
}

export function videoChapter(vh, atem) {
	const routes = vh.outputs.map((label, out) => [
		String(out + 1),
		escape(label),
		vh.inputs[vh.routing[out]] !== undefined ? `IN ${vh.routing[out] + 1} · ${escape(vh.inputs[vh.routing[out]])}` : '—',
	])
	const atemRoutes = (atem?.outputs ?? []).map((label, out) => [escape(label), escape(atem.inputs[atem.routing[out]] ?? '—')])
	return {
		title: 'Video cabling and routing',
		lead: 'Every picture passes through the Videohub: cameras and the PP1 iMac go in, and the router feeds the ATEM, the screens, the LED wall and the recorder.',
		html: `${videoCabling(vh, atem)}${callout(
			'todo',
			'Dashed lines are known from port labels only',
			'<p>The router reports what each port is <em>called</em>, not what is plugged into it. Grey lines are the router’s live crosspoints (which input each output is showing right now). Confirm each dashed cable on the site walk (last chapter) before relying on it.</p>',
		)}<h2>Videohub routing right now</h2>${table(['OUT', 'Label', 'Showing'], routes)}<h2>ATEM</h2><p>${escape(atem?.model ?? '')}, video mode <b>${escape(
			atem?.mode ?? '?',
		)}</b>. Inputs 1–6 are the Videohub's OUT 1–6.</p>${table(
			['ATEM input', 'Label'],
			(atem?.inputs ?? []).slice(1, 9).map((l, i) => [String(i + 1), escape(l)]),
		)}${atemRoutes.length ? table(['ATEM output', 'Showing'], atemRoutes) : ''}`,
	}
}

export function audioChapter() {
	return {
		title: 'Audio',
		lead: 'Wireless mics and the computers reach the SQ7 over Dante; the Dante page on the deck checks this exact patch.',
		html: `${audioInputs(SOURCES, inputsText)}${table(
			['Source', 'Dante device', 'SQ7 inputs', 'Required'],
			SOURCES.map((s) => [escape(s.name), code(s.device), escape(inputsText(s.routes)), s.required ? 'yes' : escape(s.away ?? 'no, comes and goes')]),
		)}${callout(
			'todo',
			'Not readable over the network',
			'<p>The SQ7’s outputs (PA, stream feed, foyer, in-ears), the stage box on its SLink port, and how programme audio reaches the ATEM for the stream and the recorder. Fill these in on the site walk.</p>',
		)}`,
	}
}

export function connectionsChapter(model) {
	return {
		title: 'Connections',
		lead: 'Each Companion connection is one device or service. Passwords are never printed: each is named by its 1Password entry in the Recovery Guide.',
		html: table(
			['Connection', 'Module', 'Settings', 'Credentials', 'Status', 'Used by'],
			model.connections.map((c) => [
				`<b>${escape(c.label)}</b>`,
				`${code(c.module)}<br><small>${escape(c.version)}</small>`,
				c.settings.map(([k, v]) => `${escape(k)}: ${code(v)}`).join('<br>') || '—',
				c.credentials.length ? escape(c.credentials.join(', ')) : 'none',
				escape(c.status),
				`<small>${list((model.usage[c.label] ?? []).slice(0, 12))}${(model.usage[c.label]?.length ?? 0) > 12 ? `<br>and ${model.usage[c.label].length - 12} more` : ''}</small>`,
			]),
		),
	}
}

export function pageChapter(page) {
	return {
		title: `Page ${page.number} · ${page.name}`,
		lead: PAGE_PURPOSE[page.name] ?? `${page.keys.length} keys.`,
		html: `${keyGrid(page)}${keyTable(page)}`,
	}
}

export function triggersChapter(model) {
	const html = model.triggers
		.map(
			(t) =>
				`<h3>${escape(t.name)}${t.enabled ? '' : ' <small>(disabled)</small>'}</h3>${t.notes ? `<p class="notes">${escape(t.notes)}</p>` : ''}${table(
					['When', 'Only if', 'Does'],
					[[list(t.events), t.conditions.length ? lines(t.conditions) : 'always', lines(t.actions)]],
				)}`,
		)
		.join('')
	return { title: 'Triggers', lead: 'What Companion does on its own: polls that keep the readouts fresh, and the Sunday schedule.', html }
}

/** The time-of-day triggers as one table, earliest first. */
export function schedule(model) {
	const rows = model.triggers
		.flatMap((t) => t.events.filter((e) => e.startsWith('At ')).map((e) => ({ t, when: e.replace(/^At /, '') })))
		.sort((a, b) => a.when.localeCompare(b.when))
		.map(({ t, when }) => [`<b>${escape(when)}</b>`, `${escape(t.name)}${t.enabled ? '' : ' (disabled)'}`, `${t.notes ? `<p class="notes">${escape(t.notes)}</p>` : ''}${lines(t.actions)}`])
	return table(['When', 'Trigger', 'What it does'], rows)
}

export function variablesChapter(model) {
	return {
		title: 'Custom variables',
		lead: 'Named values the scripts and triggers fill and the keys read. Persisting ones survive a Companion restart.',
		html: table(
			['Variable', 'What it holds', 'Default', 'Persists'],
			model.variables.map((v) => [code(`$(custom:${v.name})`), escape(v.description), v.default ? code(v.default) : '—', v.persists ? 'yes' : 'no']),
		),
	}
}

export function surfacesChapter(model) {
	return {
		title: 'Surfaces',
		lead: 'The physical decks, and the web decks the Service Health board opens.',
		html: `${table(['Deck', 'Serial'], model.surfaces.physical.map((s) => [escape(s.name), code(s.id.split(':')[1] ?? s.id)]))}${table(
			['Other surface', 'Entries'],
			model.surfaces.others.map((o) => [escape(o.name), String(o.count)]),
		)}<p>Each browser that opens the board’s deck page adds a "Service Health deck" entry. They are harmless; delete stale ones in Companion → Surfaces if the list gets long.</p>`,
	}
}

export function libraryChapter(model) {
	const groups = [...new Set(model.library.map((i) => i.collection))]
	return {
		title: 'Image library',
		lead: `${model.library.length} icons. A key shows one by name, as $(image:name), so changing an icon here changes every key using it.`,
		html: groups
			.map(
				(g) =>
					`<h3>${escape(g || 'unsorted')}</h3><div class="lib">${model.library
						.filter((i) => i.collection === g)
						.map((i) => `<figure><img src="${i.src}" alt=""><figcaption>${escape(i.name)}</figcaption></figure>`)
						.join('')}</div>`,
			)
			.join(''),
	}
}

/** The physical facts no device reports, as a sheet to fill in on site. */
export const SITE_WALK = [
	['Rack', 'What is in the rack, top to bottom, and what each unit plugs into for power'],
	['Power', 'Which circuits feed the rack, the Pi, the switcher and the projectors; is anything on a UPS (none known)'],
	['Network switch', 'Make, model, where it is, and which port each device uses'],
	['Cameras', 'SDI run from each PTZ to the Videohub: length, route, any converters; how each PTZ is powered'],
	['PP1 iMac', 'Which of its outputs feed Videohub IN 14, 15 and 16, and through what converters'],
	['ATEM', 'Which physical outputs feed Videohub IN 1–4; what is on inputs 7 and 8; where its streaming network cable goes'],
	['Screens', 'Cable and converter from Videohub OUT 8–11 and 14–16 to each projector, mini screen, monitor and the NovaStar'],
	['HyperDeck', 'Where it sits, its SDI from Videohub OUT 13, its audio, and whether its front-panel Remote is on'],
	['SQ7', 'Every output in use (PA left/right/subs, stream, foyer, in-ears) and what each feeds'],
	['Stage box', 'Model on the SQ7 SLink port, and its input patch'],
	['Programme audio', 'How desk audio reaches the ATEM (stream) and the HyperDeck (recording)'],
	['In-ears', 'Shure P9T transmitters: which SQ7 mixes feed them'],
	['PA', 'Amps and speakers (two stacks of three JBL VRX932LAP), and which DLI outlets power them'],
	['Lighting', 'Where the grandMA2 PC is, its DMX output, and the universes it drives'],
]

export function siteWalkChapter() {
	return {
		title: 'Site walk: what only eyes can confirm',
		lead: 'Everything above was read over the network. These are the facts no device reports; fill them in by hand, then add them to the manual.',
		html: table(
			['Area', 'Record', 'Notes'],
			SITE_WALK.map(([a, r]) => [`<b>${escape(a)}</b>`, escape(r), '<div class="write"></div><div class="write"></div><div class="write"></div>']),
		),
	}
}

export function credentialsTable() {
	return table(
		['Credential', 'Used by', '1Password entry'],
		CREDENTIALS.map((c) => [escape(c.what), escape(c.used), `<b>${escape(c.entry)}</b>`]),
	)
}

/** The `{{directives}}` the Operator and Recovery books may use. */
export function directives(model, { vh, atem }) {
	const page = (n) => {
		const p = model.pages.find((x) => x.number === Number(n))
		if (!p) throw new Error(`no page ${n}`)
		return p
	}
	return {
		page: (args) => {
			const [n, keys = ''] = args.split(/\s+/)
			return keyGrid(page(n), { highlight: keys.split(',').filter(Boolean) })
		},
		keys: (n) => keyTable(page(n)),
		schedule: () => schedule(model),
		credentials: () => credentialsTable(),
		connections: () => connectionsChapter(model).html,
		video: () => videoCabling(vh, atem),
		audio: () => audioInputs(SOURCES, inputsText),
		control: () => controlMap(controlLinks(model)),
		pages: () =>
			table(
				['Page', 'Name', 'Keys'],
				model.pages.map((p) => [String(p.number), escape(p.name), String(p.keys.length)]),
			),
	}
}

/** All the Reference book's chapters, in order. */
export function referenceChapters(model, { vh, atem }) {
	return [
		overviewChapter(model),
		videoChapter(vh, atem),
		audioChapter(),
		connectionsChapter(model),
		...model.pages.map(pageChapter),
		triggersChapter(model),
		variablesChapter(model),
		surfacesChapter(model),
		libraryChapter(model),
		siteWalkChapter(),
	]
}
