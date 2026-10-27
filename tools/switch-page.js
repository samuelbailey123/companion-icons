/**
 * VW as the whole Videohub router: every output over every input, on VW's own page.
 *
 * Usage: node tools/switch-page.js <live-full.json> <outdir>
 *   then: node tools/rig.js import-page <outdir>/page-vw.companionconfig <VW's number>
 *
 * The router's size comes from the Videohub connection, so a bigger router needs no edit here.
 * Everything that decides anything is in src/switch.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildConfig } from '../src/switch.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/switch-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { videohub, page, number, homePage } = buildConfig(full)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'page-vw.companionconfig')
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	}),
)

console.log(`  connection "${videohub.label}" (${videohub.connectionId}): ${videohub.inputs} in x ${videohub.outputs} out`)
console.log(`  page ${number} "${page.name}", Home key to page ${homePage}`)
console.log(`  -> node tools/rig.js import-page ${file} ${number}`)
