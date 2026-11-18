/**
 * Write the four Stream Deck Neo pages as page exports, one file each, from a live export.
 *
 * Usage: node tools/neo-pages.js <live-full.json> <outdir>
 *
 * The pages are built by `src/neo.js`. A page that already exists keeps its number and is
 * replaced in place; a new one goes after the last page, which is where
 * `node tools/rig.js import-page <file> new` puts it, so import them in the order printed.
 * The rig's library must already hold every icon the pages use: import
 * `dist/library.companionconfig` (section imageLibrary) first.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildNeoPages, connectionIds, PAGE_NAMES, pageNumbers } from '../src/neo.js'
import * as tracks from './pp1-tracks.js'

/** Every `$(image:…)` a page refers to. */
export const iconsUsed = (pages) => [...new Set(JSON.stringify(pages).match(/\$\(image:[a-z0-9-]+\)/g).map((m) => m.slice(8, -1)))]

export function buildConfig(full) {
	const numbers = Object.keys(full.pages).map(Number)
	if (Math.max(...numbers) !== numbers.length) {
		throw new Error(`pages are not numbered 1..${numbers.length}; a new page would not land after the last`)
	}
	const slots = pageNumbers(full)
	const pages = buildNeoPages({ numbers: slots, ids: connectionIds(full), tracks })
	const library = new Set((full.imageLibrary ?? []).map((i) => i.info?.name))
	const missing = iconsUsed(pages).filter((n) => !library.has(n))
	if (missing.length) throw new Error(`the rig library has no ${missing.join(', ')} — import dist/library.companionconfig first`)
	return { slots, pages }
}

if (process.argv[1] && path.basename(process.argv[1]) === 'neo-pages.js') {
	const [, , src, outDir] = process.argv
	if (!src || !outDir) {
		console.error('usage: node tools/neo-pages.js <live-full.json> <outdir>')
		process.exit(1)
	}
	const full = JSON.parse(await fs.readFile(src, 'utf8'))
	const { slots, pages } = buildConfig(full)
	await fs.mkdir(outDir, { recursive: true })
	for (const [slot, number] of Object.entries(slots).sort((a, b) => a[1] - b[1])) {
		const file = path.join(outDir, `page-${number}-neo-${slot}.companionconfig`)
		const page = pages[number]
		if (full.pages[number]) page.id = full.pages[number].id
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
			})
		)
		const target = full.pages[number] ? number : 'new'
		console.log(`  page ${number} "${PAGE_NAMES[slot]}": node tools/rig.js import-page ${file} ${target}`)
	}
}
