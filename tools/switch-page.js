/**
 * The Videohub page on the + XL, and VW repointed at the router's post-move ports.
 *
 * Usage: node tools/switch-page.js <live-full.json> <outdir>
 *   then: node tools/rig.js import-page <outdir>/page-videohub.companionconfig <n>|new
 *         node tools/rig.js import-page <outdir>/page-vw.companionconfig <VW's number>
 *
 * Videohub goes first: VW's new key opens it by number, so it has to exist before that key can
 * be pressed. The router's size comes from the Videohub connection, so a bigger router needs no
 * edit here. Everything that decides anything is in src/switch.js and src/vw.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS } from '../src/layout.js'
import { assertNavCoverage } from '../src/navrow.js'
import { buildConfig } from '../src/switch.js'
import { repointVW } from '../src/vw.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/switch-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { videohub, page, number, existing, vwPage } = buildConfig(full)
assertNavCoverage([...Object.values(full.pages).map((p) => p.name), ...(existing ? [] : [page.name])], COLUMNS)
const vw = repointVW(full.pages[vwPage], videohub, number)

const bundle = (p, n) => ({
	version: full.version,
	type: 'page',
	companionBuild: full.companionBuild,
	page: p,
	instances: full.instances,
	connectionCollections: full.connectionCollections ?? [],
	oldPageNumber: Number(n),
})

await fs.mkdir(outDir, { recursive: true })
const files = { videohub: path.join(outDir, 'page-videohub.companionconfig'), vw: path.join(outDir, 'page-vw.companionconfig') }
await fs.writeFile(files.videohub, JSON.stringify(bundle(page, number)))
await fs.writeFile(files.vw, JSON.stringify(bundle(vw, vwPage)))

console.log(`  connection "${videohub.label}" (${videohub.connectionId}): ${videohub.inputs} in x ${videohub.outputs} out`)
console.log(`  page ${number} "${page.name}" (${existing ? 'replacing' : 'new'}), back to VW on page ${vwPage}`)
console.log(`  1. node tools/rig.js import-page ${files.videohub} ${existing ? number : 'new'}`)
console.log(`  2. node tools/rig.js import-page ${files.vw} ${vwPage}`)
