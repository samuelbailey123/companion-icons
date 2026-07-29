/**
 * Rebuild the ATEM page as a proper switcher surface on the Stream Deck + XL.
 *
 * Usage: node tools/atem-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row
 *   row 1   PROGRAM bus, 8 sources, CUT at column 8
 *   row 2   PREVIEW bus, same 8 sources, AUTO at column 8
 *   row 3   everything else the page already had, packed left to right
 *   row 4   the existing program/preview readouts, on the touchstrip
 *
 * This SUPERSEDES the four old source keys rather than moving them. They were direct-to-
 * program selects with no preview equivalent; the bus rows do that job and more, so carrying
 * them over would leave two ways to take a camera sitting one row apart and behaving
 * differently. They are the only controls this tool discards, and it names each one as it goes.
 *
 * Anything it does not recognise is carried across untouched. That is the safe default: a
 * button whose purpose this tool cannot infer keeps working, in a slightly different place.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE, KNOB_COLS, STRIP_ROW } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'
import { busRows } from '../src/atem.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/atem-page.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

const number = pageNumbers.ATEM
const source = full.pages[number]
if (!source) throw new Error('no ATEM page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'bmd-atem')
if (!found) throw new Error('no bmd-atem connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)

const isPureNav = (c) => {
	const a = actionsOf(c)
	return a.length === 1 && a[0].definitionId === 'set_page'
}

/**
 * A key the new rows rebuild from scratch, and must therefore not also carry over.
 *
 * Both the bus selects AND the transition keys: on a re-run this tool sees the CUT and AUTO it
 * built last time, and without this they would be carried into row 3 as unrecognised leftovers
 * while `busRows` built fresh ones — two CUTs on the page, one of them somewhere nobody expects.
 */
const REBUILT = ['program', 'preview', 'cut', 'auto']
const isRebuilt = (c) => {
	const a = actionsOf(c)
	return a.length === 1 && a[0].connectionId === connectionId && REBUILT.includes(a[0].definitionId)
}

const label = (c) =>
	((c?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '?').replace(/\s+/g, ' ').slice(0, 28)

const page = structuredClone(source)
page.gridSize = { ...GRID_SIZE }
page.controls = {}

const rows = busRows(connectionId)
page.controls[1] = rows[1]
page.controls[2] = rows[2]

const carried = []
const dropped = []
const strip = {}
let nextColumn = 0

for (const r of Object.keys(source.controls ?? {}).sort((a, b) => a - b)) {
	for (const c of Object.keys(source.controls[r]).sort((a, b) => a - b)) {
		const control = source.controls[r][c]

		if (isPureNav(control)) {
			dropped.push(`${r}/${c}  ${label(control)}  — the folder row covers it`)
			continue
		}
		if (isRebuilt(control)) {
			dropped.push(`${r}/${c}  ${label(control)}  — superseded by the bus rows`)
			continue
		}

		/*
		 * Touchstrip content, from a page in either state — which is what makes this tool safe
		 * to re-run. On the ORIGINAL page the strip is row 2 with four zones, so its column is
		 * a slot index that has to be mapped through KNOB_COLS. On a page this tool has already
		 * converted, the strip is row 4 and its columns are already real ones. Reading row 2 as
		 * a strip on an already-converted page would grab the preview bus by mistake.
		 */
		const converted = Boolean(source.controls?.[STRIP_ROW])
		if (Number(r) === (converted ? STRIP_ROW : 2)) {
			const column = converted ? Number(c) : KNOB_COLS[Number(c)]
			if (column === undefined || !KNOB_COLS.includes(column)) {
				throw new Error(`strip zone ${r}/${c} has no slot on this deck`)
			}
			strip[column] = control
			carried.push(`${r}/${c} -> ${STRIP_ROW}/${column}   ${label(control)}`)
			continue
		}

		if (nextColumn >= COLUMNS) throw new Error(`more leftover keys than row 3 can hold`)
		page.controls[3] ??= {}
		page.controls[3][nextColumn] = control
		carried.push(`${r}/${c} -> 3/${nextColumn}   ${label(control)}`)
		nextColumn++
	}
}

if (Object.keys(strip).length) page.controls[STRIP_ROW] = strip
page.controls[0] = navRow('ATEM', pageNumbers)

for (const d of dropped) console.log(`  dropped  ${d}`)
for (const m of carried) console.log(`  carried  ${m}`)
console.log(`  built    row 1 PROGRAM + CUT, row 2 PREVIEW + AUTO — ${Object.keys(rows[1]).length} keys each`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-atem.companionconfig`)
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
console.log(`\nwrote ${path.basename(file)}`)
