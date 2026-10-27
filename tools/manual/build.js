/**
 * Build the three manual PDFs from a snapshot.
 *
 * Usage:
 *   node tools/manual/build.js [snapshotDir]      (default: .snapshot)
 *
 * Reads the snapshot `collect.js` wrote, the hand-written chapters in `manual/`, and the engineering
 * notes in `docs/production/`; writes HTML into `<snapshot>/html/` and the PDFs into `manual/`.
 *
 * REFUSES TO WRITE A BOOK THAT LEAKS. Every credential value in the export is collected first, and
 * each finished book is searched for every one of them before it is written. The repo is public.
 *
 * REFUSES A STALE TIMELINE. The Operator Guide's Sunday table is prose, so the build checks that
 * every time-of-day trigger on the rig appears in it, and stops if one does not.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chapters, documentHtml, gridHtml, navigation, referenceSections } from '../../src/manual/books.js'
import { builders, checkTimeline, connectionCredentials, piFiles } from '../../src/manual/recovery.js'
import { assertNoSecrets, credentials, pages, triggers } from '../../src/manual/rig.js'
import { navDiagram } from '../../src/manual/diagram.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const snapDir = path.resolve(process.argv[2] ?? path.join(ROOT, '.snapshot'))
const read = (p) => fs.readFile(p, 'utf8')
const optional = (p) => read(p).catch(() => null)

const exp = JSON.parse(await read(path.join(snapDir, 'export.json')))
const defs = JSON.parse((await optional(path.join(snapDir, 'definitions.json'))) ?? 'null')
const meta = JSON.parse(await read(path.join(snapDir, 'meta.json')))
const keyFiles = new Set(await fs.readdir(path.join(snapDir, 'keys')).catch(() => []))
const keyCache = new Map()
for (const f of keyFiles) keyCache.set(f, 'data:image/png;base64,' + (await fs.readFile(path.join(snapDir, 'keys', f))).toString('base64'))
const library = new Map((exp.imageLibrary ?? []).map((e) => [e.info?.name, e.originalImage?.startsWith('data:image/svg') ? e.originalImage : e.previewImage]))

const snap = {
	exp,
	defs,
	videohub: await read(path.join(snapDir, 'videohub.txt')),
	atem: await read(path.join(snapDir, 'atem.txt')),
	readAt: new Date(meta.readAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long', timeStyle: 'short' }),
	build: meta.build,
	keyImage: (p, r, c) => keyCache.get(`${p}-${r}-${c}.png`) ?? null,
	libraryImage: (name) => library.get(name) ?? null,
}

const css = await read(path.join(ROOT, 'tools/manual/print.css'))
const docs = []
for (const [file, title] of [
	['rig.md', 'The rig'],
	['cameras.md', 'Cameras'],
	['switcher-atem.md', 'Switcher'],
	['audio.md', 'Audio'],
	['recorder.md', 'Recording'],
	['checklists.md', 'Checklists'],
	['findings/2026-08-23.md', 'Findings, 2026-08-23'],
]) {
	docs.push({ title, md: await read(path.join(ROOT, 'docs/production', file)) })
}

const list = pages(exp)
const nav = navigation(list)
const names = new Map(list.map((p) => [p.number, p.name]))
const grids = Object.fromEntries(list.map((p) => [`grid:${p.number}`, gridHtml(p, snap)]))
const toolFiles = (await fs.readdir(path.join(ROOT, 'tools'))).filter((f) => f.endsWith('.js'))
const tools = await Promise.all(toolFiles.map(async (f) => ({ file: `tools/${f}`, text: await read(path.join(ROOT, 'tools', f)) })))
const piList = (await fs.readdir(path.join(ROOT, 'pi'), { recursive: true, withFileTypes: true }))
	.filter((d) => d.isFile())
	.map((d) => path.relative(path.join(ROOT, 'pi'), path.join(d.parentPath, d.name)))

const operatorMd = await read(path.join(ROOT, 'manual/operator.md'))
const missing = checkTimeline(operatorMd, triggers(exp))
if (missing.length) {
	console.error(`manual/operator.md's Sunday timeline is missing: ${missing.join(', ')}. Update it, then rebuild.`)
	process.exit(1)
}

const common = { readAt: snap.readAt, build: snap.build, css }
const books = [
	{
		file: 'Operator Guide',
		html: documentHtml({
			...common,
			title: 'Operator Guide',
			subtitle: 'Running a Sunday from the Stream Deck, and what to do when something does not work',
			sections: chapters(operatorMd, { 'page-map': navDiagram(nav.onRow.map((n) => ({ number: n, name: names.get(n) })), nav.children, names), ...grids }, 'op-'),
		}),
	},
	{
		file: 'Reference',
		html: documentHtml({
			...common,
			title: 'Reference',
			subtitle: 'Every page, key, trigger, variable, connection and signal path on the rig',
			sections: referenceSections(snap, docs),
		}),
	},
	{
		file: 'Recovery Guide',
		html: documentHtml({
			...common,
			title: 'Recovery Guide',
			subtitle: 'Rebuilding the rig from nothing: the Pi, Companion, its scripts, its backups and its credentials',
			sections: chapters(
				await read(path.join(ROOT, 'manual/recovery.md')),
				{ 'connection-credentials': connectionCredentials(exp), builders: builders(tools), 'pi-files': piFiles(piList) },
				'rc-',
			),
		}),
	},
]

const { values: secrets, weakFields } = credentials(exp)
for (const f of weakFields) console.warn(`warning: ${f} is a short dictionary-style password: change it on the device`)
const htmlDir = path.join(snapDir, 'html')
await fs.mkdir(htmlDir, { recursive: true })
for (const b of books) {
	assertNoSecrets(b.html, secrets)
	await fs.writeFile(path.join(htmlDir, `${b.file}.html`), b.html)
}
execFileSync('python3', ['-I', path.join(ROOT, 'tools/manual/render.py'), htmlDir, path.join(ROOT, 'manual'), snap.readAt], { stdio: 'inherit' })
console.log(`built ${books.length} books from the ${snap.readAt} snapshot into manual/`)
