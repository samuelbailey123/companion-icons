/**
 * Emit the four PTZ pages: a run page and a setup page for each of the two cameras.
 *
 * Usage: node tools/ptz2-page.js <live-full.json> <outdir>
 *
 * Emits:
 *   1-library-<n>-icons.companionconfig   the image library, copied from dist/ (run `npm run build`)
 *   2-pages-ptz2.companionconfig          all twelve pages, the PTZ variables for both cameras,
 *                                         and the four poll triggers, in one `type: full` bundle
 *
 * THE TWO CAMERAS RUN THE SAME PAGE CODE. `buildPage` and `buildSetupPage` already take the
 * connection id and the host as arguments, so camera two's pages come out of the same calls as
 * camera one's rather than out of a copy. Only the custom variables need renaming, and
 * `assertMirrored` then proves the two pages are byte-identical once the connection, host and
 * variable prefix are normalised away. If someone edits the layout later, both cameras move
 * together or the build fails — there is no version of this that drifts.
 *
 * WHICH CAMERA IS WHICH. The deck labels the swap keys with the camera's ATEM input number, not
 * "1 of 2": the operator reads the same number on the deck as on the switcher. `visca` is the
 * camera on 10.23.0.181 and `visca2` the one on 10.23.0.196; their ATEM inputs are passed in
 * below because that mapping lives in the patch, not in the config.
 *
 * Camera two's pages are sub-pages of the PTZ folder rather than folder-row entries of their
 * own. The row is exactly nine columns for nine pages and already full — see src/navrow.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, folderFor, navRow } from '../src/navrow.js'
import { buildPage, buildSetupPage, PAGE_NAME, SETUP_NAME } from '../src/ptz/page.js'
import { TRIGGER_ID, pollTrigger } from '../src/ptz/poller.js'
import { mergeDefinitions } from '../src/ptz/variables.js'
import { TRIGGER_ID as TRACK_TRIGGER_ID, trackingTrigger } from '../src/ptz/web.js'
import {
	RUN_NAME as RUN2,
	SETUP_NAME as SETUP2,
	assertMirrored,
	definitions2,
	renameVariables,
	swapKey,
} from '../src/ptz/second.js'

/** Camera one drives the PTZ page; camera two the PTZ 2 page. ATEM inputs come from the patch. */
const CAMERAS = {
	one: { host: '10.23.0.181', atemInput: 3 },
	two: { host: '10.23.0.196', atemInput: 1 },
}

/** Row 1 column 8 held preset 6 — unnamed, and saved at preset 5's position. It becomes the swap key. */
const SWAP_ROW = 1
const SWAP_COL = 8

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
	if (!found) throw new Error(`no ptzoptics-visca connection for ${cam.host} — found: ${viscas.map(([, i]) => i.config?.host).join(', ')}`)
	cam.conn = found.id
	cam.label = found.label
}

/* Page numbers. Camera one keeps the slots it has; camera two takes the next two. */
const runOne = Object.entries(full.pages).find(([, p]) => p.name === PAGE_NAME)?.[0]
if (!runOne) throw new Error(`no page named "${PAGE_NAME}" on this rig`)
const setupOne = Object.entries(full.pages).find(([, p]) => p.name === SETUP_NAME)?.[0]
if (!setupOne) throw new Error(`no page named "${SETUP_NAME}" on this rig`)
const highest = Math.max(...Object.keys(full.pages).map(Number))
const runTwo = String(highest + 1)
const setupTwo = String(highest + 2)

const numbersOne = { run: runOne, setup: setupOne }
const numbersTwo = { run: runTwo, setup: setupTwo }

/* Camera one, from the existing builders, unchanged. */
const pageOne = buildPage(CAMERAS.one.conn, CAMERAS.one.host, numbersOne)
const setupPageOne = buildSetupPage(CAMERAS.one.conn, CAMERAS.one.host, numbersOne)

/* Camera two, from the SAME builders, then its variables renamed. */
const pageTwoRaw = buildPage(CAMERAS.two.conn, CAMERAS.two.host, numbersTwo)
const setupPageTwoRaw = buildSetupPage(CAMERAS.two.conn, CAMERAS.two.host, numbersTwo)
const pageTwo = renameVariables(pageTwoRaw)
const setupPageTwo = renameVariables(setupPageTwoRaw)

/* Prove camera two is camera one before anything else touches either. */
assertMirrored(pageOne, pageTwo, {
	connOne: CAMERAS.one.conn, connTwo: CAMERAS.two.conn,
	hostOne: CAMERAS.one.host, hostTwo: CAMERAS.two.host,
	pagesOne: numbersOne, pagesTwo: numbersTwo,
	name: 'run page',
})
assertMirrored(setupPageOne, setupPageTwo, {
	connOne: CAMERAS.one.conn, connTwo: CAMERAS.two.conn,
	hostOne: CAMERAS.one.host, hostTwo: CAMERAS.two.host,
	pagesOne: numbersOne, pagesTwo: numbersTwo,
	name: 'setup page',
})
console.log('  mirror check: camera two is camera one, modulo connection, host and variable prefix')

/* Named only after the check, so the check compares two pages rather than two names. */
pageTwo.name = RUN2
setupPageTwo.name = SETUP2

/* The swap keys, added after the mirror check because they are the one place the pages differ. */
pageOne.controls[SWAP_ROW][SWAP_COL] = swapKey(runTwo, CAMERAS.two.atemInput)
pageTwo.controls[SWAP_ROW][SWAP_COL] = swapKey(runOne, CAMERAS.one.atemInput)

const pages = structuredClone(full.pages)
pages[runOne] = pageOne
pages[setupOne] = setupPageOne
pages[runTwo] = pageTwo
pages[setupTwo] = setupPageTwo
for (const n of [runTwo, setupTwo]) pages[n].gridSize = { ...GRID_SIZE }

/* Row 0 everywhere: a new page name means every page's folder row is rebuilt. */
const pageNumbers = Object.fromEntries(Object.entries(pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(pages).map((p) => p.name), COLUMNS)
for (const page of Object.values(pages)) {
	page.controls ??= {}
	page.controls[0] = navRow(folderFor(page.name), pageNumbers)
}

/* Variables: camera one's as they are, camera two's alongside. */
let custom_variables = mergeDefinitions(full.custom_variables)
let sortOrder = Math.max(0, ...Object.values(custom_variables).map((c) => c.sortOrder ?? 0))
for (const [name, def] of Object.entries(definitions2())) {
	custom_variables[name] = { ...def, sortOrder: custom_variables[name]?.sortOrder ?? ++sortOrder }
}

/* Triggers: one poll pair per camera. Camera two's are renamed the same way its pages were. */
const triggers = structuredClone(full.triggers ?? {})
const second = (trigger, suffix) => {
	const t = renameVariables(structuredClone(trigger))
	t.options = { ...t.options, name: `${t.options.name.replace(/^Poll PTZ/, 'Poll PTZ 2')}` }
	t.actions = (t.actions ?? []).map((a) => ({ ...a, id: `${a.id}-${suffix}` }))
	return t
}
const wanted = {
	[TRIGGER_ID]: pollTrigger(CAMERAS.one.host),
	[TRACK_TRIGGER_ID]: trackingTrigger(CAMERAS.one.host),
	[`${TRIGGER_ID.replace('ptz', 'ptz2')}`]: second(pollTrigger(CAMERAS.two.host), 'cam2'),
	[`${TRACK_TRIGGER_ID.replace('ptz', 'ptz2')}`]: second(trackingTrigger(CAMERAS.two.host), 'cam2'),
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

console.log(`  camera one: ${CAMERAS.one.label} (${CAMERAS.one.host}, ATEM ${CAMERAS.one.atemInput})  pages ${runOne} + ${setupOne}`)
console.log(`  camera two: ${CAMERAS.two.label} (${CAMERAS.two.host}, ATEM ${CAMERAS.two.atemInput})  pages ${runTwo} + ${setupTwo}`)
console.log(`  swap keys at ${SWAP_ROW},${SWAP_COL} on both run pages, replacing preset 6`)
console.log(`  ${Object.keys(pages).length} pages, ${Object.keys(custom_variables).length} custom variables, ${Object.keys(triggers).length} triggers`)
console.log(`\nwrote ${path.basename(libraryFile)}, ${path.basename(pagesFile)}`)
