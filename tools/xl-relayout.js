/**
 * Rebuild every page for the Stream Deck + XL: folder row on top, everything else relocated.
 *
 * Usage: node tools/xl-relayout.js <live-full.json> <outdir> [--skip=PP1,ATEM]
 *
 * All the judgement lives in `src/layout.js` and `src/navrow.js`, which are unit-tested. This
 * file is I/O: read the export, run each page through them, write one importable
 * `.companionconfig` per page.
 *
 * `--skip` exists because pages are imported one at a time against a LIVE rig. A page somebody
 * is actively editing must be left out of the run and done later off a fresh export, or their
 * work is silently overwritten by whatever this read minutes earlier.
 *
 * Connections are carried through with their ORIGINAL ids so Companion matches them to the
 * existing ones on import instead of creating duplicates.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE, assertPermutation, relocatePage } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'

const [, , src, outDir, ...flags] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/xl-relayout.js <live-full.json> <outdir> [--skip=Name,Name]')
	process.exit(1)
}

const namesFrom = (prefix) =>
	new Set(
		flags
			.filter((f) => f.startsWith(prefix))
			.flatMap((f) => f.slice(prefix.length).split(','))
			.filter(Boolean)
	)

const skip = namesFrom('--skip=')

/**
 * Pages authored directly on the + XL, which must NOT be relocated.
 *
 * Naming one is a promise that its controls are already on the cells they belong on. Get it
 * wrong in either direction and working buttons move somewhere they do not work — so it is
 * declared here, not sniffed at run time.
 */
const gridded = namesFrom('--gridded=')

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))

assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

for (const [flag, names] of [
	['--skip', skip],
	['--gridded', gridded],
]) {
	for (const name of names) {
		if (!(name in pageNumbers)) throw new Error(`${flag} names "${name}", which is not a page on this rig`)
	}
}

await fs.mkdir(outDir, { recursive: true })

let written = 0
let moved = 0
let removed = 0

for (const [number, source] of Object.entries(full.pages)) {
	const name = source.name

	if (skip.has(name)) {
		console.log(`  page ${number} (${name}) — SKIPPED, rebuild it later off a fresh export`)
		continue
	}

	const isGridded = gridded.has(name)
	const result = relocatePage(source, name, { alreadyGridded: isGridded })
	const counts = assertPermutation(source, result, name)

	// The folder row is added AFTER the permutation check, so it can never mask a lost control.
	const page = structuredClone(source)
	page.gridSize = { ...GRID_SIZE }
	page.controls = result.controls
	page.controls[0] = navRow(name, pageNumbers)

	const file = path.join(outDir, `page-${number}-${name.replace(/\W+/g, '-').toLowerCase()}.companionconfig`)
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

	written++
	moved += counts.after
	removed += counts.dropped

	const relocated = result.moves.filter((m) => m.from !== m.to)
	console.log(
		`  page ${number} (${name.padEnd(6)}) ${String(counts.after).padStart(2)} kept, ` +
			`${counts.dropped} redundant nav removed -> ${path.basename(file)}`
	)
	for (const m of relocated) {
		console.log(`      ${m.from} -> ${m.to}  ${m.kind}${m.overridden ? '  (page override)' : ''}`)
	}
	const stayed = result.moves.length - relocated.length
	if (stayed) console.log(`      ${stayed} already in place`)
}

console.log(
	`\nwrote ${written} page${written === 1 ? '' : 's'} -> ${outDir}` +
		`\n${moved} controls relocated intact, ${removed} redundant nav keys removed` +
		(skip.size ? `\nskipped: ${[...skip].join(', ')}` : '')
)
