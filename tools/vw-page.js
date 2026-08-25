/**
 * Rename VH to VW, and give the LED wall a brightness encoder.
 *
 * Usage: node tools/vw-page.js <live-full.json> <outdir>
 *
 * WHY THIS TOUCHES ALL NINE PAGES TO RENAME ONE. The folder row is row 0 of every page, and
 * each key is captioned with its destination page's name, baked in at build time (see
 * `src/navrow.js` — the marking is deliberately static so nothing can be wrong at showtime).
 * A page rename is therefore not a one-page edit: leave the other eight alone and eight
 * folder keys still read "VH" while the page they open is called VW. Rebuilding row 0
 * everywhere is what actually completes the rename.
 *
 * Nothing else on any page is touched. Rows 1 and below are carried across by reference from
 * the live export, so the router keys, the shortcuts and the output readouts come out exactly
 * as they went in — the change is row 0 on nine pages, plus two new controls on one.
 *
 * OUTPUT IS ONE `type: full` BUNDLE, matching how this rig's previous page changes were
 * delivered. Companion's import lets pages and the image library be toggled independently, so
 * a bundle carrying only pages cannot disturb connections, custom variables or surfaces.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'
import { WALL_COLUMN, addWallBrightness } from '../src/novastar.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/vw-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const OLD_NAME = 'VH'
const NEW_NAME = 'VW'

const full = JSON.parse(await fs.readFile(src, 'utf8'))

const target = Object.entries(full.pages).find(([, p]) => p.name === OLD_NAME || p.name === NEW_NAME)
if (!target) throw new Error(`no page named "${OLD_NAME}" or "${NEW_NAME}" on this rig`)
const [pageNumber] = target

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'novastar-controller')
if (!found) throw new Error('no novastar-controller connection on this rig — add it in Connections first')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId}  ${connectionId}`)

// Rename first: the folder row is built from the page names, so it has to see the new one.
const pages = structuredClone(full.pages)
const wasNamed = pages[pageNumber].name
pages[pageNumber].name = NEW_NAME
console.log(`  page ${pageNumber}  "${wasNamed}" -> "${NEW_NAME}"`)

const pageNumbers = Object.fromEntries(Object.entries(pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(pages).map((p) => p.name), COLUMNS)

pages[pageNumber] = addWallBrightness(pages[pageNumber], connectionId, WALL_COLUMN)
pages[pageNumber].gridSize = { ...GRID_SIZE }
console.log(`  page ${pageNumber}  + brightness readout and encoder at column ${WALL_COLUMN}`)

for (const [n, page] of Object.entries(pages)) {
	page.controls ??= {}
	page.controls[0] = navRow(page.name, pageNumbers)
	console.log(`  page ${n}  (${page.name.padEnd(6)}) folder row rebuilt`)
}

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, '2-pages-vw-brightness.companionconfig')
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)

console.log(`\nwrote ${path.basename(file)} — ${Object.keys(pages).length} pages`)
