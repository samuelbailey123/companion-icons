/**
 * The Switch page: the whole Videohub on the Switch Stream Deck, every output over every input.
 *
 * Usage: node tools/switch-page.js <live-full.json> <outdir> [surfaceId]
 *   then: node tools/rig.js import-page <outdir>/page-switch.companionconfig <n>|new
 *         node tools/rig.js export <fresh.json>        (for the page's id)
 *         node tools/rig.js pin-surface <surfaceId> <n>
 *
 * The surface is the one named like "Switch" in Companion's Surfaces tab, or the id given.
 * Its grid sets the layout, and the router's size comes from the Videohub connection, so a
 * bigger router or a different deck needs no edit here. Everything that decides anything is in
 * src/switch.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildConfig } from '../src/switch.js'

const [, , src, outDir, surfaceId] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/switch-page.js <live-full.json> <outdir> [surfaceId]')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { videohub, surface, page, number, existing } = buildConfig(full, surfaceId)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'page-switch.companionconfig')
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
	})
)

console.log(`  connection "${videohub.label}" (${videohub.connectionId}): ${videohub.inputs} in x ${videohub.outputs} out`)
console.log(`  surface ${surface.surfaceId} "${surface.name}" ${surface.grid.columns}x${surface.grid.rows}`)
console.log(`  page ${number} "${page.name}" (${existing ? 'replacing' : 'new'})`)
console.log(`  1. node tools/rig.js import-page ${file} ${existing ? number : 'new'}`)
console.log(`  2. node tools/rig.js pin-surface ${surface.surfaceId} ${number}`)
