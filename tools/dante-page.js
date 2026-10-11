/**
 * The Dante page, a read-only SQ7 sub-page, and the SQ7 key that opens it.
 *
 * Usage: node tools/dante-page.js <live-full.json> <outdir>
 *   then: node tools/rig.js import-page <outdir>/page-dante.companionconfig <n>|new
 *         node tools/rig.js import-page <outdir>/page-<sq7>-sq7.companionconfig <sq7>
 *
 * Import the Dante page first: the SQ7 key points at the number it will land on. Each page goes in
 * through `import-page`, which resets that page alone, so no other page on the deck is touched.
 *
 * The `dante` connection (Bitfocus audinate-dantecontroller) must already be on the rig: a page
 * import never creates one. Everything that decides anything is in src/dante.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ENTRY_CELL, FOLDER_NAME, PARENT, buildConfig } from '../src/dante.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/dante-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { sq7, parent, number, existing, page, connectionId } = buildConfig(full)

const bundle = (p, n) =>
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page: p,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(n),
	})

await fs.mkdir(outDir, { recursive: true })
const parentFile = path.join(outDir, `page-${sq7}-sq7.companionconfig`)
const danteFile = path.join(outDir, 'page-dante.companionconfig')
await fs.writeFile(parentFile, bundle(parent, sq7))
await fs.writeFile(danteFile, bundle(page, number))

console.log(`  connection ${connectionId}`)
console.log(`  page ${number} "${FOLDER_NAME}" (${existing ? 'replacing' : 'new'})`)
console.log(`  page ${sq7} "${PARENT}": Dante key at ${ENTRY_CELL.row}/${ENTRY_CELL.col} -> opens page ${number}`)
console.log(`  1. node tools/rig.js import-page ${danteFile} ${existing ? number : 'new'}`)
console.log(`  2. node tools/rig.js import-page ${parentFile} ${sq7}`)
