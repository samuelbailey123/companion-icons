/**
 * Write one bundle per page with rounded keys and bold captions. See src/rounded-bold.js.
 *
 * Usage: node tools/rounded-bold.js <live-full.json> <outdir> [radius]
 *   then, one page at a time: node tools/rig.js import-page <outdir>/page-<n>-<name>.companionconfig <n>
 *
 * BUILD FROM A FRESH EXPORT, and take that export as the rollback. Never during a service. Start with
 * Home, look at it on the deck, and only then do the rest: a page imports on its own, so the first
 * look costs nothing, and re-importing the export's page puts it back.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { CORNER_RADIUS, restylePage } from '../src/rounded-bold.js'

const [, , src, outDir, radiusArg] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/rounded-bold.js <live-full.json> <outdir> [radius]')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

const radius = radiusArg === undefined ? CORNER_RADIUS : Number(radiusArg)
if (!(radius >= 0 && radius <= 100)) throw new Error(`corner radius ${radiusArg} is not 0 to 100`)

await fs.mkdir(outDir, { recursive: true })
const all = { keys: 0, rounded: 0, bolded: 0 }
for (const [number, page] of Object.entries(full.pages)) {
	const totals = restylePage(page, radius)
	for (const k of Object.keys(all)) all[k] += totals[k]
	const file = path.join(outDir, `page-${number}-${page.name.replace(/\W+/g, '-').toLowerCase()}.companionconfig`)
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
	console.log(`  page ${number} (${page.name}): ${totals.keys} keys -> ${path.basename(file)}`)
}
console.log(`\n${all.keys} keys: ${all.rounded} backgrounds rounded at ${radius}%, ${all.bolded} captions bold`)
