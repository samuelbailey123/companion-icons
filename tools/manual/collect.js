/**
 * Read everything the manual is drawn from off the live rig, and write it to a snapshot folder.
 *
 * Usage:
 *   node tools/manual/collect.js [snapshotDir]      (default: .snapshot, gitignored)
 *
 * READ-ONLY. Every call here is one Companion's own web UI or a Blackmagic client makes to look,
 * never to change: the config export, the key previews the button grid draws, and the status dump
 * a Videohub-protocol device sends the moment you connect (nothing is sent back). Safe to run on a
 * Sunday, though a build during a service gains nothing.
 *
 * THE SNAPSHOT HOLDS PASSWORDS. `export.json` is Companion's full export, which carries every
 * connection's credentials in clear text, so the folder is gitignored and the file is written 0600.
 * The build reads it, masks every credential, and refuses to write a book that still contains one.
 *
 * Writes:
 *   export.json            Companion's full config export
 *   keys/<p>-<r>-<c>.png   each used key as Companion renders it right now, live state included
 *   definitions.json       every module's action and feedback definitions (labels, option choices)
 *   videohub.txt, atem.txt the routers' status dumps on TCP 9990: labels, routing, video mode
 *   board.json             the Service Health board's own reading of every device
 *   meta.json              when this was read, and from where
 */
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { RIG, exportFull } from '../rig.js'

const VIDEOHUB = '10.23.0.21'
const ATEM = '10.23.0.34'
const BOARD = 'http://10.23.0.242:8080/api/board'

/** The status dump a Blackmagic routing-protocol device sends on connect. Sends nothing. */
function dump9990(host, ms = 2000) {
	return new Promise((resolve, reject) => {
		let text = ''
		const s = net.connect(9990, host)
		s.setEncoding('utf8')
		s.on('data', (d) => (text += d))
		s.on('error', reject)
		setTimeout(() => {
			s.destroy()
			resolve(text)
		}, ms)
	})
}

/**
 * A tRPC-over-WebSocket client that takes the first value of a subscription and stops it.
 * Companion serves key previews and module definitions only as subscriptions; the first message
 * after `started` is the current state, which is all a snapshot wants.
 */
async function subscriber() {
	const ws = new WebSocket(RIG.replace(/^http/, 'ws') + '/trpc')
	await new Promise((res, rej) => {
		ws.onopen = res
		ws.onerror = () => rej(new Error(`cannot reach ${RIG}`))
	})
	const pending = new Map()
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data)
		if (msg.result?.type !== 'data') return
		const done = pending.get(msg.id)
		if (!done) return
		pending.delete(msg.id)
		ws.send(JSON.stringify({ id: msg.id, jsonrpc: '2.0', method: 'subscription.stop' }))
		done(msg.result.data)
	}
	let nextId = 1
	const first = (path, input) =>
		new Promise((resolve, reject) => {
			const id = nextId++
			pending.set(id, resolve)
			ws.send(JSON.stringify({ id, jsonrpc: '2.0', method: 'subscription', params: { path, input } }))
			setTimeout(() => pending.delete(id) && reject(new Error(`no answer from ${path} ${JSON.stringify(input ?? '')}`)), 15000)
		})
	return { first, close: () => ws.close() }
}

/**
 * Every module's action and feedback definitions — the labels and option choices Companion's
 * own editor shows — so the manual can say "Set input on Program: Cam 1" instead of `program`.
 */
async function definitions(client) {
	const [actions, feedbacks] = await Promise.all(
		['actions', 'feedbacks'].map((kind) => client.first(`instances.definitions.${kind}`).then((d) => d.definitions)),
	)
	return { actions, feedbacks }
}

/**
 * Every key's rendered image, through the subscription Companion's button grid uses
 * (`preview.graphics.location`), live state included.
 */
async function keyImages(client, exported, dir) {
	const preview = (location) => client.first('preview.graphics.location', { location })
	const jobs = []
	for (const [pageNumber, page] of Object.entries(exported.pages)) {
		for (const [row, cols] of Object.entries(page.controls ?? {})) {
			for (const column of Object.keys(cols)) {
				jobs.push({ pageNumber: Number(pageNumber), row: Number(row), column: Number(column) })
			}
		}
	}
	let written = 0
	for (let i = 0; i < jobs.length; i += 40) {
		await Promise.all(
			jobs.slice(i, i + 40).map(async (location) => {
				const { image } = await preview(location)
				const png = Buffer.from(image.replace(/^data:image\/png;base64,/, ''), 'base64')
				await fs.writeFile(path.join(dir, `${location.pageNumber}-${location.row}-${location.column}.png`), png)
				written++
			}),
		)
	}
	return written
}

async function main() {
	const out = path.resolve(process.argv[2] ?? '.snapshot')
	await fs.mkdir(path.join(out, 'keys'), { recursive: true })

	const exported = await exportFull()
	await fs.writeFile(path.join(out, 'export.json'), JSON.stringify(exported), { mode: 0o600 })
	await fs.chmod(path.join(out, 'export.json'), 0o600)

	const [videohub, atem, board] = await Promise.all([
		dump9990(VIDEOHUB),
		dump9990(ATEM),
		fetch(BOARD).then((r) => (r.ok ? r.text() : null)),
	])
	await fs.writeFile(path.join(out, 'videohub.txt'), videohub)
	await fs.writeFile(path.join(out, 'atem.txt'), atem)
	if (board) await fs.writeFile(path.join(out, 'board.json'), board)

	const client = await subscriber()
	await fs.writeFile(path.join(out, 'definitions.json'), JSON.stringify(await definitions(client)))
	const keys = await keyImages(client, exported, path.join(out, 'keys'))
	client.close()
	const meta = { readAt: new Date().toISOString(), companion: RIG, build: exported.companionBuild, keys }
	await fs.writeFile(path.join(out, 'meta.json'), JSON.stringify(meta, null, '\t'))
	console.log(`snapshot: ${out} — Companion ${exported.companionBuild}, ${keys} keys`)
}

main().catch((e) => {
	console.error(e.message)
	process.exit(1)
})
