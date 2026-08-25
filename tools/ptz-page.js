/**
 * Replace the Mics page with the PTZ camera page, and rebuild the folder row everywhere.
 *
 * Usage: node tools/ptz-page.js <live-full.json> <outdir>
 *
 * Emits, numbered in the order they are applied:
 *
 *   1-library-<n>-icons.companionconfig   the image library (copied from dist/, run `npm run
 *                                         build` first), imported with imageLibrary only
 *   2-pages-ptz.companionconfig           all nine pages, the PTZ custom variables and the
 *                                         poll trigger, in one `type: full` bundle
 *   ptz_state.py                          the poller, to be copied onto the Pi at the path
 *                                         the trigger runs it from
 *
 * Companion's import toggles pages, custom variables, triggers and the library independently
 * and leaves anything unselected untouched, so neither bundle can disturb the connections,
 * surfaces or the other pages' working controls — every page here outside row 0 is carried
 * across from the live export by reference.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildConfig } from '../src/ptz/page.js'
import { SCRIPT, SCRIPT_PATH } from '../src/ptz/poller.js'
import { CREDENTIALS_FILE, SCRIPT as WEB_SCRIPT, SCRIPT_PATH as WEB_SCRIPT_PATH } from '../src/ptz/web.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/ptz-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { pages, custom_variables, triggers, pageNumber, setupNumber, connection } = buildConfig(full)

console.log(`  connection "${connection.label}"  ptzoptics-visca  ${connection.id}  host ${connection.host}`)
console.log(`  page ${pageNumber}  "${full.pages[pageNumber].name}" -> "${pages[pageNumber].name}"`)
console.log(`  page ${setupNumber}  "${full.pages[setupNumber]?.name ?? '(new)'}" -> "${pages[setupNumber].name}"`)
for (const [n, page] of Object.entries(pages)) console.log(`  page ${n}  (${page.name.padEnd(6)}) folder row rebuilt`)

await fs.mkdir(outDir, { recursive: true })

const library = JSON.parse(await fs.readFile(path.resolve('dist/library.companionconfig'), 'utf8'))
const libraryFile = path.join(outDir, `1-library-${library.imageLibrary.length}-icons.companionconfig`)
await fs.copyFile(path.resolve('dist/library.companionconfig'), libraryFile)

const pagesFile = path.join(outDir, '2-pages-ptz.companionconfig')
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

const scriptFile = path.join(outDir, path.basename(SCRIPT_PATH))
await fs.writeFile(scriptFile, SCRIPT)
const webFile = path.join(outDir, path.basename(WEB_SCRIPT_PATH))
await fs.writeFile(webFile, WEB_SCRIPT)

console.log(`\nwrote ${path.basename(libraryFile)}, ${path.basename(pagesFile)} (${Object.keys(pages).length} pages, ` +
	`${Object.keys(custom_variables).length} custom variables, ${Object.keys(triggers).length} triggers), ` +
	`${path.basename(scriptFile)} -> ${SCRIPT_PATH} and ${path.basename(webFile)} -> ${WEB_SCRIPT_PATH} on the Pi ` +
	`(the latter reads user:pass from ${CREDENTIALS_FILE} beside it)`)
