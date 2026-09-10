/**
 * Emit the PTZ pages: a chooser, and a run and setup page for each of the two cameras.
 *
 * Usage: node tools/ptz2-page.js <live-full.json> <outdir>
 *
 * THE TWO CAMERAS RUN THE SAME PAGE CODE. `buildPage` and `buildSetupPage` already take the
 * connection id and the host as arguments, so the second camera's pages come out of the same
 * calls as the first's rather than out of a copy. Only the custom variables need renaming, and
 * `assertMirrored` then proves the two pages are byte-identical once the connection, host and
 * variable prefix are normalised away. Edit the layout later and both cameras move together, or
 * the build fails.
 *
 * THE FOLDER ROW LANDS ON A CHOOSER. Nine columns for nine pages, and the row was already full,
 * so the four PTZ pages are sub-pages of one column. Pressing PTZ shows both cameras side by
 * side with their tally and state; pressing one drives it. Because the row is on every page and
 * always points back here, the camera pages need no back key — which is why row 1 column 8 is
 * still preset 6 rather than a navigation control.
 *
 * WHICH CAMERA IS WHICH. Pages are named by the camera's ATEM input, not "1 of 2", so the deck
 * and the switcher agree. `visca` is the camera on 10.23.0.181 and `visca2` the one on
 * 10.23.0.196; their ATEM inputs are set below because that mapping lives in the patch.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, folderFor, navRow } from '../src/navrow.js'
import { buildPage, buildSetupPage } from '../src/ptz/page.js'
import { buildHubPage, PAGE_NAME as HUB_NAME, runName, setupName } from '../src/ptz/hub.js'
import { SYNC_TRIGGER_ID, syncTrigger } from '../src/ptz/picture.js'
import { TRIGGER_ID, pollTrigger } from '../src/ptz/poller.js'
import { mergeDefinitions } from '../src/ptz/variables.js'
import { TRIGGER_ID as TRACK_TRIGGER_ID, trackingTrigger } from '../src/ptz/web.js'
import { assertMirrored, definitions2, renameVariables } from '../src/ptz/second.js'

/**
 * The cameras, in the order they appear on the chooser — ascending by ATEM input, matching the
 * ATEM page's own bus.
 *
 * `first` keeps the original `ptz_*` variables: its operator state (drive speed, dialled preset)
 * is already live on the rig and persists across restarts, and renaming it would reset it.
 */
const CAMERAS = {
	second: {
		host: '10.23.0.196', atem: 1, vars: { state: 'ptz2_state', preset: 'ptz2_last' },
		presets: { 1: 'Wide', 2: 'Stage', 3: 'Baptism', 4: 'Keyboard', 5: 'Drums' },
	},
	first: {
		host: '10.23.0.181', atem: 3, vars: { state: 'ptz_state', preset: 'ptz_last' },
		presets: { 1: 'Wide', 2: 'Drums', 3: 'Keys', 4: 'Stage', 5: 'Bass' },
	},
}

/**
 * The preset names as the operator typed them on the deck, read back from the live page.
 *
 * THE DECK IS WHERE NAMES GET CHANGED, AND A REBUILD OVERWRITES THEM. On 2026-09-06 the names
 * above were lost exactly that way, so before rebuilding, every preset caption on the live
 * page is compared with what the table produces, and a difference is printed loudly. Copy it
 * into the table, or accept the overwrite knowingly — but never silently.
 */
function liveNames(page) {
	const out = {}
	for (const control of Object.values(page?.controls ?? {}).flatMap((row) => Object.values(row ?? {}))) {
		const text = control?.style?.layers?.find((l) => l.type === 'text')?.text?.value
		const m = /^(\d+) \((.+)\)$/.exec(text ?? '')
		if (m) out[m[1]] = m[2]
	}
	return out
}

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/ptz2-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))

/** Both camera connections, matched by host so a relabel cannot mis-assign a camera. */
const viscas = Object.entries(full.instances ?? {}).filter(([, i]) => i?.moduleId === 'ptzoptics-visca')
const byHost = Object.fromEntries(viscas.map(([id, i]) => [i.config?.host, { id, label: i.label }]))
for (const cam of Object.values(CAMERAS)) {
	const found = byHost[cam.host]
	if (!found) throw new Error(`no ptzoptics-visca connection for ${cam.host}`)
	cam.conn = found.id
	cam.label = found.label
}

/*
 * The chooser takes the slot the PTZ page already has; the camera pages follow it contiguously.
 *
 * Pages left behind by an earlier layout are dropped BEFORE the new ones are numbered, so the
 * numbering closes up rather than leaving holes where the old pages were. Companion inserts
 * pages up to the highest number in a bundle, and a gap is a blank page on the deck.
 */
const hubNumber = Object.entries(full.pages).find(([, p]) => p.name === HUB_NAME)?.[0]
if (!hubNumber) throw new Error(`no page named "${HUB_NAME}" on this rig`)
/*
 * Every page this tool owns is dropped and rebuilt, including the ones it produced last run.
 * Listing only the legacy names was a bug: a second run kept the previous CAM pages and added a
 * duplicate set after them, so the deck grew four pages every time.
 */
const OWNED = [
	'PTZ Setup', 'PTZ 2', 'PTZ 2 Setup',
	...[CAMERAS.first, CAMERAS.second].flatMap((c) => [runName(c.atem), setupName(c.atem)]),
]
const surviving = Object.fromEntries(
	Object.entries(full.pages).filter(([, p]) => p.name === HUB_NAME || !OWNED.includes(p.name))
)
const highest = Math.max(...Object.keys(surviving).map(Number))
let next = Math.max(highest, Number(hubNumber)) + 1
for (const cam of [CAMERAS.second, CAMERAS.first]) {
	cam.runPage = String(next++)
	cam.setupPage = String(next++)
	cam.numbers = { run: cam.runPage, setup: cam.setupPage }
}

/* Each camera's pages, from the same builders. The second camera's variables are then renamed. */
const built = {}
for (const [which, cam] of Object.entries(CAMERAS)) {
	const live = liveNames(Object.values(full.pages).find((p) => p.name === runName(cam.atem)))
	for (const n of Object.keys({ ...live, ...cam.presets })) {
		if ((live[n] ?? '') !== (cam.presets[n] ?? '')) {
			console.warn(`  WARNING CAM ${cam.atem} preset ${n}: the deck says "${live[n] ?? ''}", this build says "${cam.presets[n] ?? ''}" — the build wins`)
		}
	}
	const other = which === 'first' ? CAMERAS.second : CAMERAS.first
	const run = buildPage(cam.conn, cam.host, cam.numbers, cam.presets)
	const setup = buildSetupPage(cam.conn, cam.host, cam.numbers, { host: other.host, atem: other.atem })
	built[which] = which === 'first' ? { run, setup } : { run: renameVariables(run), setup: renameVariables(setup) }
}

const mirror = {
	connOne: CAMERAS.first.conn, connTwo: CAMERAS.second.conn,
	hostOne: CAMERAS.first.host, hostTwo: CAMERAS.second.host,
	pagesOne: CAMERAS.first.numbers, pagesTwo: CAMERAS.second.numbers,
	namesOne: CAMERAS.first.presets, namesTwo: CAMERAS.second.presets,
	otherOne: { host: CAMERAS.second.host, atem: CAMERAS.second.atem },
	otherTwo: { host: CAMERAS.first.host, atem: CAMERAS.first.atem },
}
assertMirrored(built.first.run, built.second.run, { ...mirror, name: 'run page' })
assertMirrored(built.first.setup, built.second.setup, { ...mirror, name: 'setup page' })
console.log('  mirror check: the two cameras are the same page, modulo connection, host and variable prefix')

/* Named only after the check, so the check compares two pages rather than two names. */
for (const [which, cam] of Object.entries(CAMERAS)) {
	built[which].run.name = runName(cam.atem)
	built[which].setup.name = setupName(cam.atem)
}

const pages = structuredClone(surviving)
pages[hubNumber] = {
	name: HUB_NAME,
	controls: buildHubPage(
		[CAMERAS.second, CAMERAS.first].map((cam) => ({
			atem: cam.atem,
			runPage: cam.runPage,
			setupPage: cam.setupPage,
			stateVar: cam.vars.state,
			presetVar: cam.vars.preset,
		}))
	),
	gridSize: { ...GRID_SIZE },
}
for (const [which, cam] of Object.entries(CAMERAS)) {
	pages[cam.runPage] = { ...built[which].run, gridSize: { ...GRID_SIZE } }
	pages[cam.setupPage] = { ...built[which].setup, gridSize: { ...GRID_SIZE } }
}
/* Row 0 everywhere: a new page name means every page's folder row is rebuilt. */
const pageNumbers = Object.fromEntries(Object.entries(pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(pages).map((p) => p.name), COLUMNS)
for (const page of Object.values(pages)) {
	page.controls ??= {}
	page.controls[0] = navRow(folderFor(page.name), pageNumbers)
}

const custom_variables = mergeDefinitions(full.custom_variables)
let sortOrder = Math.max(0, ...Object.values(custom_variables).map((c) => c.sortOrder ?? 0))
for (const [name, def] of Object.entries(definitions2())) {
	custom_variables[name] = { ...def, sortOrder: custom_variables[name]?.sortOrder ?? ++sortOrder }
}

const triggers = structuredClone(full.triggers ?? {})
const second = (trigger, suffix) => {
	const t = renameVariables(structuredClone(trigger))
	t.options = { ...t.options, name: t.options.name.replace(/^(Poll|Sync) PTZ/, '$1 PTZ 2') }
	t.actions = (t.actions ?? []).map((a) => ({ ...a, id: `${a.id}-${suffix}` }))
	t.events = (t.events ?? []).map((e) => ({ ...e, id: `${e.id}-${suffix}` }))
	return t
}
const wanted = {
	[TRIGGER_ID]: pollTrigger(CAMERAS.first.host),
	[TRACK_TRIGGER_ID]: trackingTrigger(CAMERAS.first.host),
	[SYNC_TRIGGER_ID]: syncTrigger(),
	[TRIGGER_ID.replace('ptz', 'ptz2')]: second(pollTrigger(CAMERAS.second.host), 'cam2'),
	[TRACK_TRIGGER_ID.replace('ptz', 'ptz2')]: second(trackingTrigger(CAMERAS.second.host), 'cam2'),
	[SYNC_TRIGGER_ID.replace('ptz', 'ptz2')]: second(syncTrigger(), 'cam2'),
}
for (const [id, trigger] of Object.entries(wanted)) {
	for (const [existing, t] of Object.entries(triggers)) {
		if (t?.options?.name === trigger.options.name) delete triggers[existing]
	}
	triggers[id] = trigger
}

await fs.mkdir(outDir, { recursive: true })
const library = JSON.parse(await fs.readFile(path.resolve('dist/library.companionconfig'), 'utf8'))
const libraryFile = path.join(outDir, `1-library-${library.imageLibrary.length}-icons.companionconfig`)
await fs.copyFile(path.resolve('dist/library.companionconfig'), libraryFile)

const pagesFile = path.join(outDir, '2-pages-ptz2.companionconfig')
await fs.writeFile(
	pagesFile,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages,
		custom_variables,
		customVariablesCollections: full.customVariablesCollections ?? [],
		triggers,
		triggerCollections: full.triggerCollections ?? [],
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)

console.log(`  chooser: page ${hubNumber} "${HUB_NAME}"`)
for (const cam of [CAMERAS.second, CAMERAS.first]) {
	console.log(`  CAM ${cam.atem}: ${cam.label} (${cam.host})  run ${cam.runPage}, setup ${cam.setupPage}`)
}
console.log(`  ${Object.keys(pages).length} pages, ${Object.keys(custom_variables).length} variables, ${Object.keys(triggers).length} triggers`)
console.log(`\nwrote ${path.basename(libraryFile)}, ${path.basename(pagesFile)}`)
