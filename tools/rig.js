/**
 * Talk to the live Companion over its admin API, the way its own web UI does.
 *
 * Usage:
 *   node tools/rig.js export <out.json>
 *   node tools/rig.js import <bundle.companionconfig> <section>[,<section>...]
 *   node tools/rig.js import-page <page.companionconfig> <targetPage>
 *   node tools/rig.js create-vars <bundle.companionconfig>
 *   node tools/rig.js log [minutes]
 *
 * Sections: buttons, triggers, customVariables, expressionVariables, imageLibrary,
 * surfaces.known, surfaces.instances, surfaces.remote. Everything not named is left
 * `unchanged`, which is the same as leaving its box unticked in the UI — the green
 * "Import preserving unselected" path, never the red full reset.
 *
 * WHY THIS EXISTS. The web UI's import dialog has bitten this rig twice (a destination
 * dropdown that reports one page and imports another; previews that render blank in an
 * automated tab), and driving it needs a browser extension that is not always connected.
 * Companion's admin UI is a thin client over tRPC on a WebSocket at `/trpc`, with no
 * authentication and an explicit allowance for non-browser clients, so the import can be
 * done exactly as the UI does it — upload in chunks, SHA-1 checked, then `importFull` with a
 * per-section selection — with the selection written down in the command instead of clicked.
 *
 * `create-vars` adds the custom variables a bundle defines WITHOUT importing the
 * customVariables section: that section's import replaces every definition and resets
 * every current value to its default, which would blank the MA2 fader readouts and the
 * System page until their next poll.
 *
 * The rig's address is fixed here on purpose: this tool must never be pointed at the wrong
 * Companion by a typo.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import zlib from 'node:zlib'

export const RIG = 'http://10.23.0.242:8000'

const CHUNK = 256 * 1024

/** A minimal tRPC-over-WebSocket client: JSON-RPC 2.0 envelopes, no transformer. */
export function connect(base = RIG) {
	const ws = new WebSocket(base.replace(/^http/, 'ws') + '/trpc')
	let nextId = 1
	const pending = new Map()
	const ready = new Promise((res, rej) => {
		ws.onopen = () => res()
		ws.onerror = () => rej(new Error(`cannot reach ${base}`))
	})
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data)
		const p = pending.get(msg.id)
		if (!p) return
		pending.delete(msg.id)
		if (msg.error) p.rej(new Error(msg.error.message ?? JSON.stringify(msg.error)))
		else p.res(msg.result?.data)
	}
	const call = async (method, path, input) => {
		await ready
		const id = nextId++
		return new Promise((res, rej) => {
			pending.set(id, { res, rej })
			ws.send(JSON.stringify({ id, jsonrpc: '2.0', method, params: { path, input } }))
			setTimeout(() => {
				if (pending.delete(id)) rej(new Error(`timeout: ${path}`))
			}, 180000).unref()
		})
	}
	return {
		query: (path, input) => call('query', path, input),
		mutation: (path, input) => call('mutation', path, input),
		close: () => ws.close(),
	}
}

/** Read the live config: gzipped JSON from the one HTTP path that serves it. */
export async function exportFull(base = RIG) {
	const res = await fetch(`${base}/int/export/full`)
	if (!res.ok) throw new Error(`export failed: HTTP ${res.status}`)
	const raw = Buffer.from(await res.arrayBuffer())
	const json = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw
	return JSON.parse(json.toString('utf8'))
}

/**
 * Upload a bundle so the next import mutation on this client can read it.
 *
 * The upload lives on the WebSocket connection that made it — `pendingImport` is per
 * client — so the same client must issue the import. Returns Companion's summary of what
 * the file offers.
 */
export async function uploadBundle(client, file) {
	const data = await fs.readFile(file)
	const sessionId = await client.mutation('importExport.prepareImport.start', { name: file, size: data.length })
	for (let offset = 0; offset < data.length; offset += CHUNK) {
		await client.mutation('importExport.prepareImport.uploadChunk', {
			sessionId,
			offset,
			data: data.subarray(offset, offset + CHUNK).toString('base64'),
		})
	}
	const [error, summary] = await client.mutation('importExport.prepareImport.complete', {
		sessionId,
		expectedChecksum: crypto.createHash('sha1').update(data).digest('hex'),
		userData: null,
	})
	if (error) throw new Error(`Companion rejected the file: ${error}`)
	return summary
}

/** Upload a bundle and import the named sections. */
export async function importBundle(client, file, sections) {
	const summary = await uploadBundle(client, file)

	const config = selection(sections)
	const offered = {
		buttons: summary.buttons,
		triggers: summary.triggers !== null,
		customVariables: summary.customVariables,
		expressionVariables: summary.expressionVariables,
		imageLibrary: summary.imageLibrary,
		'surfaces.known': summary.surfacesKnown,
		'surfaces.instances': summary.surfacesInstances,
		'surfaces.remote': summary.surfacesRemote,
	}
	for (const s of sections) {
		if (offered[s] === false) throw new Error(`the file carries no "${s}" section to import`)
	}

	await client.mutation('importExport.importFull', { config })
	return { summary, config }
}

/**
 * Replace ONE page on the rig with the page a page bundle carries.
 *
 * `importFull` refuses a page bundle outright ("Invalid import object"), and had it not, a
 * buttons import would first delete every control on every page. A page bundle goes through
 * `importSinglePage` instead — the mutation behind the UI's "import to page N" — which resets
 * the target page alone.
 *
 * TWO GUARDS, BOTH FROM READING THAT MUTATION. The connection mapping is not optional: a
 * connection in the bundle that the mapping does not point at an existing connection is
 * CREATED, disabled, as a duplicate. So every connection is mapped to itself and must already
 * exist on the rig — true of any bundle built from this rig's own export. And the target page
 * must carry the same name as the page in the file, so a typo cannot land PP1 on ATEM.
 */
export async function importPage(client, file, bundle, live, targetPage) {
	if (bundle.type !== 'page') throw new Error(`${file} is a "${bundle.type}" bundle, not a page`)
	const target = live.pages?.[targetPage]
	if (!target) throw new Error(`the rig has no page ${targetPage}`)
	if (target.name !== bundle.page.name) {
		throw new Error(`page ${targetPage} on the rig is "${target.name}" but the file holds "${bundle.page.name}"`)
	}
	const connectionIdRemapping = {}
	for (const id of Object.keys(bundle.instances ?? {})) {
		if (!live.instances?.[id]) {
			throw new Error(`connection ${id} is in the file but not on the rig; importing would create a duplicate`)
		}
		connectionIdRemapping[id] = id
	}
	const summary = await uploadBundle(client, file)
	await client.mutation('importExport.importSinglePage', {
		targetPage,
		sourcePage: bundle.oldPageNumber ?? 1,
		connectionIdRemapping,
	})
	return { summary, connectionIdRemapping }
}

/** The UI's selection object with the named sections set to import and the rest untouched. */
export function selection(sections) {
	const config = {
		buttons: 'unchanged',
		surfaces: { known: 'unchanged', instances: 'unchanged', remote: 'unchanged' },
		triggers: 'unchanged',
		customVariables: 'unchanged',
		expressionVariables: 'unchanged',
		connections: 'unchanged',
		userconfig: 'unchanged',
		imageLibrary: 'unchanged',
	}
	for (const s of sections) {
		if (s.startsWith('surfaces.')) config.surfaces[s.slice('surfaces.'.length)] = 'reset-and-import'
		else if (s in config && s !== 'connections' && s !== 'userconfig') config[s] = 'reset-and-import'
		else throw new Error(`unknown section "${s}"`)
	}
	return config
}

/** Create the custom variables a bundle defines that the rig does not have yet. */
export async function createMissingVariables(client, bundle, live) {
	const created = []
	for (const [name, def] of Object.entries(bundle.custom_variables ?? {})) {
		if (live.custom_variables?.[name]) continue
		const err = await client.mutation('customVariables.create', { name, defaultVal: def.defaultValue ?? '' })
		if (err) throw new Error(`creating ${name}: ${err}`)
		await client.mutation('customVariables.setDescription', { name, description: def.description ?? '' })
		await client.mutation('customVariables.setPersistence', { name, value: Boolean(def.persistCurrentValue) })
		created.push(name)
	}
	return created
}

const [, , command, ...args] = process.argv

if (command === 'export') {
	const full = await exportFull()
	await fs.writeFile(args[0], JSON.stringify(full))
	console.log(`exported ${Object.keys(full.pages).length} pages, ${Object.keys(full.instances).length} connections -> ${args[0]}`)
} else if (command === 'import') {
	const sections = (args[1] ?? '').split(',').filter(Boolean)
	if (!args[0] || !sections.length) throw new Error('usage: import <bundle> <section,...>')
	const client = connect()
	try {
		const { summary, config } = await importBundle(client, args[0], sections)
		console.log(`imported ${sections.join(', ')} from ${args[0]}`)
		console.log(`  file offered: ${JSON.stringify({ buttons: summary.buttons, triggers: summary.triggers !== null, customVariables: summary.customVariables, imageLibrary: summary.imageLibrary })}`)
		console.log(`  selection:    ${JSON.stringify(config)}`)
	} finally {
		client.close()
	}
} else if (command === 'import-page') {
	const [file, target] = args
	if (!file || !target) throw new Error('usage: import-page <page-bundle> <targetPage>')
	const bundle = JSON.parse(await fs.readFile(file, 'utf8'))
	const live = await exportFull()
	const client = connect()
	try {
		const { connectionIdRemapping } = await importPage(client, file, bundle, live, Number(target))
		console.log(`imported "${bundle.page.name}" from ${file} onto page ${target}`)
		console.log(`  connections kept as themselves: ${Object.keys(connectionIdRemapping).length}`)
	} finally {
		client.close()
	}
} else if (command === 'create-vars') {
	const bundle = JSON.parse(await fs.readFile(args[0], 'utf8'))
	const live = await exportFull()
	const client = connect()
	try {
		const created = await createMissingVariables(client, bundle, live)
		console.log(created.length ? `created ${created.length}: ${created.join(', ')}` : 'nothing to create')
	} finally {
		client.close()
	}
} else if (command === 'log') {
	const minutes = Number(args[0] ?? 10)
	const res = await fetch(`${RIG}/int/log`)
	console.log(res.ok ? (await res.text()).slice(-8000) : `log unavailable over HTTP (${res.status}); use journalctl on the Pi for the last ${minutes} minutes`)
} else {
	console.error('usage: node tools/rig.js export <out.json> | import <bundle> <sections> | import-page <page-bundle> <targetPage> | create-vars <bundle> | log [minutes]')
	process.exit(1)
}
