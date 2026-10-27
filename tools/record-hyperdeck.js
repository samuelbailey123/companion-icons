/**
 * Move recording from the ATEM to the HyperDeck: the Record keys and the Countdown key.
 *
 * Usage: node tools/record-hyperdeck.js <live-full.json> <outdir>
 *   then, for each page it prints: node tools/rig.js import-page <bundle> <pageNumber>
 *
 * The Sunday countdown trigger copies the Countdown key's actions when it is built, so it does not
 * follow the key by itself: swap its record action on the rig too (docs/production/recorder.md).
 * Everything that decides anything is in src/record-hyperdeck.js.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { convertPages } from '../src/record-hyperdeck.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/record-hyperdeck.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const { hyperdeck, changed } = convertPages(full)
console.log(`  connection "${hyperdeck.label}" (${hyperdeck.connectionId})`)

await fs.mkdir(outDir, { recursive: true })
for (const { number, name, page, cells } of changed) {
	const file = path.join(outDir, `record-hyperdeck-${name.toLowerCase()}.companionconfig`)
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
	console.log(`page ${number} ${name}: ${cells.join(', ')}`)
	console.log(`  -> node tools/rig.js import-page ${file} ${number}`)
}
