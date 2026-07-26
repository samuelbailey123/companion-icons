/**
 * Generate per-page .companionconfig files with library icons wired onto buttons.
 *
 * Usage: node tools/wire.js <prod-full.json> <outdir> [pageNumbers...]
 *
 * Connections are carried through with their ORIGINAL ids so Companion matches them to the
 * existing ones on import instead of creating duplicates.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { MAPPING } from '../src/mapping.js'
import { wirePage } from '../src/wiring.js'
import { FILE_VERSION } from '../src/companionconfig.js'
import { ICONS } from '../src/variants.js'

const [, , src, outDir, ...only] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/wire.js <prod-full.json> <outdir> [pages...]')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
await fs.mkdir(outDir, { recursive: true })

const known = new Set(ICONS.map((i) => i.name))
const pages = only.length ? only : Object.keys(full.pages)

for (const n of pages) {
	const content = full.pages[n]
	if (!content) {
		console.error(`  page ${n}: NOT FOUND in export`)
		continue
	}

	const mapping = MAPPING[n] ?? {}
	for (const cols of Object.values(mapping)) {
		for (const spec of Object.values(cols)) {
			if (!known.has(spec.icon)) throw new Error(`page ${n}: unknown icon "${spec.icon}"`)
		}
	}

	const { page, wired, missing } = wirePage(content, mapping)

	const out = {
		version: FILE_VERSION,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances ?? {},
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(n),
	}

	const file = path.join(outDir, `page-${n}-${page.name.replace(/\W+/g, '-').toLowerCase()}.companionconfig`)
	await fs.writeFile(file, JSON.stringify(out))
	console.log(`  page ${n} (${page.name}): ${wired.length} wired -> ${path.basename(file)}`)
	for (const w of wired) console.log(`      ${w}`)
	for (const m of missing) console.log(`      !! ${m}`)
}
