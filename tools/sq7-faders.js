/**
 * SQ7's fader folders (DCA 1-4, DCA 5-8, Leads, BGV, Lav, FX) and the SQ7 keys that open them.
 *
 * Usage: node tools/sq7-faders.js <live-full.json> <outdir>
 *   then run the import-page lines it prints, in the order printed: the folder pages first (a
 *   new one lands after the last page, which is the number SQ7's keys point at), then SQ7.
 *
 * Everything that decides anything is in src/sq7-faders.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS } from '../src/layout.js'
import { assertNavCoverage } from '../src/navrow.js'
import { buildConfig } from '../src/sq7-faders.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/sq7-faders.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { connectionId, sq7, parent, pages } = buildConfig(full)
assertNavCoverage([...new Set([...Object.values(full.pages).map((p) => p.name), ...pages.map((p) => p.page.name)])], COLUMNS)

const bundle = (page, number) =>
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	})

await fs.mkdir(outDir, { recursive: true })
console.log(`  connection ${connectionId}`)
for (const { number, existing, page } of pages) {
	const file = path.join(outDir, `page-${number}-${page.name.replace(/\W+/g, '-').toLowerCase()}.companionconfig`)
	await fs.writeFile(file, bundle(page, number))
	console.log(`  -> node tools/rig.js import-page ${file} ${existing ? number : 'new'}    (${page.name}, page ${number})`)
}
const parentFile = path.join(outDir, `page-${sq7}-sq7.companionconfig`)
await fs.writeFile(parentFile, bundle(parent, sq7))
console.log(`  -> node tools/rig.js import-page ${parentFile} ${sq7}    (SQ7, folder keys)`)
