/**
 * Add the two keys that format the HyperDeck's card. Everything that decides anything is in
 * src/hyperdeck-format.js, which says why there are two.
 *
 * Usage: node tools/hyperdeck-format.js <live-full.json> <outfile>
 *   then: node tools/rig.js import-page <outfile> <the page number it prints>
 */
import fs from 'node:fs/promises'
import { addKeys } from '../src/hyperdeck-format.js'

const [, , src, out] = process.argv
if (!src || !out) {
	console.error('usage: node tools/hyperdeck-format.js <live-full.json> <outfile>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { number, page } = addKeys(full)
await fs.writeFile(
	out,
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
console.log(`page ${number} ${page.name}: wrote ${out}`)
