/**
 * MA2: the folder row, BLACKOUT, and one knob for Executor 5.1, the only lighting control.
 *
 * Usage: node tools/ma2-page.js <live-full.json> <outdir>
 *   then: node tools/rig.js import-page <bundle> <pageNumber>
 *
 * Everything that decides anything is in src/ma2.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { EXECUTOR, NAME, findMa2, ma2Page } from '../src/ma2.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/ma2-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { number, page, removed } = ma2Page(full)
console.log(`  connection ${findMa2(full)}`)
console.log(`  knob 1: ${NAME}, Executor ${EXECUTOR}`)
console.log(`  removed: ${removed.join(' ') || 'nothing'}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-ma2.companionconfig`)
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: number,
	}),
)
console.log(`  -> node tools/rig.js import-page ${file} ${number}`)
