/**
 * Give every ATEM macro key on the rig the symbol the module never shipped with.
 *
 * Usage: node tools/macro-icons.js <live-full.json> <outdir>
 *
 * WHY THIS IS A PATCH AND NOT A REBUILD. Macro keys come from bmd-atem's own `macro_run`
 * preset, which defines a caption, a background and four feedbacks and NO image field. Three
 * reached this rig that way and sat with `base64Image: null` — on keys whose caption band had
 * already been moved down to leave room for an icon, so the top 44% was a reserved hole. All
 * the judgement lives in `applyMacroIcon` in `src/atem.js`, which is unit-tested against a real
 * key lifted off the rig; this file is I/O.
 *
 * IT REWRITES NOTHING ELSE. Every other control on an affected page is asserted byte-identical
 * to the export it was read from, and the tool fails rather than writing a file if that is not
 * true. That assertion is the whole point: these pages are hand-arranged, and a page import
 * replaces the page wholesale, so the only safe patch is a provably surgical one.
 *
 * A key whose icon somebody has deliberately set to something else is left alone and named.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { applyMacroIcon } from '../src/atem.js'

const ICON = 'macro-run'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/macro-icons.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))

const atem = Object.entries(full.instances ?? {}).find(([, i]) => i.moduleId === 'bmd-atem')
if (!atem) throw new Error('no bmd-atem connection on this rig — nothing here runs macros')
const [connectionId, instance] = atem
console.log(`connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}\n`)

const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)

/** A key that runs an ATEM macro, whatever else it does. */
const isMacroKey = (control) =>
	actionsOf(control).some((a) => a.definitionId === 'macrorun' && a.connectionId === connectionId)

const restingIcon = (control) =>
	(control?.style?.layers ?? []).find((l) => l.type === 'image')?.base64Image?.value ?? null

const caption = (control) =>
	((control?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '?')
		.replace(/\s+/g, ' ')
		.slice(0, 32)

const patched = new Map()
const skipped = []

for (const [number, page] of Object.entries(full.pages ?? {})) {
	for (const row of Object.keys(page.controls ?? {})) {
		for (const column of Object.keys(page.controls[row])) {
			const control = page.controls[row][column]
			if (!isMacroKey(control)) continue

			const where = `p${number} ${page.name} ${row}/${column}`
			const current = restingIcon(control)

			/*
			 * Empty is the defect. Already ours is a re-run, and worth redoing so the per-state
			 * overrides are brought up to date. Anything else is somebody's decision.
			 */
			if (current !== null && !current.startsWith(`$(image:${ICON}-`)) {
				skipped.push(`${where}  ${caption(control)}  — already set to ${current}`)
				continue
			}

			page.controls[row][column] = applyMacroIcon(control, { icon: ICON })
			if (!patched.has(number)) patched.set(number, [])
			patched.get(number).push({ row, column, caption: caption(control), was: current })
		}
	}
}

for (const s of skipped) console.log(`  left alone  ${s}`)

if (!patched.size) {
	console.log('\nno macro key needs an icon — nothing to write')
	process.exit(0)
}

/*
 * The safety property, checked before anything is written: on each page this tool touches,
 * every control it did NOT name must be identical to the one it read. A page import replaces
 * the whole page, so this is what stands between a two-key fix and silently reverting a
 * hand-arranged page to whatever the export happened to catch.
 */
const original = JSON.parse(await fs.readFile(src, 'utf8'))
for (const [number, keys] of patched) {
	const touched = new Set(keys.map((k) => `${k.row}/${k.column}`))
	const before = original.pages[number].controls ?? {}
	const after = full.pages[number].controls ?? {}

	const cells = (controls) => Object.entries(controls).flatMap(([r, cs]) => Object.keys(cs).map((c) => `${r}/${c}`))
	const beforeCells = cells(before).sort()
	const afterCells = cells(after).sort()
	if (String(beforeCells) !== String(afterCells)) {
		throw new Error(`page ${number}: the set of occupied keys changed — refusing to write`)
	}

	for (const cell of beforeCells) {
		if (touched.has(cell)) continue
		const [r, c] = cell.split('/')
		if (JSON.stringify(before[r][c]) !== JSON.stringify(after[r][c])) {
			throw new Error(`page ${number}: key ${cell} changed but was never patched — refusing to write`)
		}
	}

	// And the page's own shell: name, id, grid.
	for (const field of ['id', 'name', 'gridSize']) {
		if (JSON.stringify(original.pages[number][field]) !== JSON.stringify(full.pages[number][field])) {
			throw new Error(`page ${number}: ${field} changed — refusing to write`)
		}
	}
}

await fs.mkdir(outDir, { recursive: true })
const written = []

for (const [number, keys] of patched) {
	const page = full.pages[number]
	console.log(`\n${page.name} (page ${number})`)
	for (const k of keys) {
		console.log(`  ${k.row}/${k.column}  ${k.caption.padEnd(32)} ${k.was ?? 'no icon'} -> $(image:${ICON}-paper)`)
	}

	const slug = String(page.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
	const file = path.join(outDir, `page-${number}-${slug}-macro-icons.companionconfig`)
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
	written.push(path.basename(file))
}

console.log(`\nverified: every other key on ${patched.size} page(s) is unchanged`)
for (const w of written) console.log(`wrote ${w}`)
