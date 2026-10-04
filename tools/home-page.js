/**
 * Home: the page you land on, showing what is happening without pressing anything.
 *
 * Usage: node tools/home-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row, with Home itself marked
 *   row 1   Projectors, PA, program, preview, mic batteries, muted, packs, internet, CPU temp
 *   rows 2-5 empty
 *
 * WHY HOME NEEDED REPLACING. Every page now carries the folder row, so Home's grid of nine
 * folder keys had become a duplicate of the row directly above it — a page with nothing on it
 * you could not already do from anywhere else. The deck resumes on its last page, so Home is
 * where you arrive after a restart; that is the moment a glance at the whole rig is worth most.
 *
 * TILES ARE COPIED, NOT RE-AUTHORED. Each one is a structural clone of the read-only button
 * that already exists on its own page, with its expressions and feedbacks intact. Rewriting the
 * Shure liveness logic or the CPU thresholds here would create a second copy to keep in step,
 * and the day they disagreed the dashboard would be the one lying. Copying means Home cannot
 * drift: fix a threshold on the System page, rebuild, and Home follows.
 *
 * NOTHING HERE ACTS. Every source tile is verified to have no actions before it is copied, so
 * the dashboard cannot fire anything — you can put a hand on it while finding your place.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/home-page.js <live-full.json> <outdir>')
	process.exit(1)
}

/**
 * What the dashboard shows, left to right, each named by the page and cell it is copied from.
 *
 * Ordered by how quickly it would ruin a service: the things that must be ON first (projectors,
 * PA), then what is going out (program, preview), then the mics, then the machine itself. The
 * caption is rewritten where the original's label only made sense in the context of its own
 * page — "Signal" means something on the Mics page and nothing here.
 */
const TILES = [
	{ page: 'Power', cell: '1/0', caption: 'Projectors', readOnly: true },
	{ page: 'Power', cell: '1/1', caption: 'PA', readOnly: true },
	{ page: 'ATEM', cell: '4/0', caption: null },
	{ page: 'ATEM', cell: '4/2', caption: null },
	{ page: 'Mics', cell: '1/2', caption: 'Mic\nPacks' },
	{ page: 'Mics', cell: '1/0', caption: 'Mic\nSignal' },
	{ page: 'Mics', cell: '1/1', caption: 'Mics\nMuted' },
	{ page: 'System', cell: '2/2', caption: 'Internet' },
	{ page: 'System', cell: '1/1', caption: 'CPU\nTemp' },
]

const v = (value) => ({ value, isExpression: false })

const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

if (TILES.length > COLUMNS) throw new Error(`${TILES.length} tiles but only ${COLUMNS} columns`)

const number = pageNumbers.Home
const page = structuredClone(full.pages[number])
page.gridSize = { ...GRID_SIZE }
page.controls = {}
page.controls[1] = {}

const report = []
for (const [column, tile] of TILES.entries()) {
	const from = pageNumbers[tile.page]
	const [r, c] = tile.cell.split('/')
	const source = full.pages[from]?.controls?.[r]?.[c]
	if (!source) throw new Error(`no control at ${tile.page} ${tile.cell} to copy`)

	/*
	 * The guarantee that makes this page safe to lean on. A tile that could act would make the
	 * dashboard dangerous to touch, and copying is exactly the operation that could bring an
	 * action along by accident.
	 */
	const actions = actionsOf(source)
	if (actions.length && !tile.readOnly) {
		throw new Error(
			`${tile.page} ${tile.cell} carries ${actions.length} action(s) (${actions.map((a) => a.definitionId).join(', ')}) — ` +
				`the dashboard must be read-only, so mark the tile readOnly if its actions should be stripped`
		)
	}

	const control = structuredClone(source)

	/*
	 * The Power keys both ACT — pressing one switches projectors or the PA. Their state colours
	 * come from self-contained feedbacks reading `custom:pa_state` and `custom:projector_state`,
	 * which a trigger polls, so the indication survives having the actions removed while the
	 * switching does not. Stripping rather than re-authoring keeps the four state colours
	 * exactly as the Power page defines them.
	 */
	if (tile.readOnly) {
		for (const step of Object.values(control.steps ?? {})) {
			for (const key of Object.keys(step.action_sets ?? {})) step.action_sets[key] = []
		}
	}
	/*
	 * Normalise the geometry the copy brought with it.
	 *
	 * Each source button was laid out for its own page — the Mics summaries put their caption
	 * across the top with the reading below, the System tiles use a different split again. Copied
	 * verbatim onto one row those disagree, and captions land on top of icons. The bands here
	 * match every other key on the deck: icon over caption, one shared type size.
	 */
	const texts = (control.style?.layers ?? []).filter((l) => l.type === 'text')
	const image = (control.style?.layers ?? []).find((l) => l.type === 'image')
	if (image) {
		image.y = v(2)
		image.height = v(44)
		texts[0].y = v(46)
		texts[0].height = v(52)
	} else if (texts.length >= 2) {
		// A two-line readout with no icon: name on top, value filling the rest.
		texts[0].y = v(4)
		texts[0].height = v(34)
		texts[1].y = v(38)
		texts[1].height = v(58)
	}
	for (const t of texts) {
		t.fontsize = v(51)
		t.fontsizeAllowShrink = v(true)
	}

	if (tile.caption !== null) {
		if (!texts.length) throw new Error(`${tile.page} ${tile.cell} has no text layer to recaption`)
		texts[0].text = v(tile.caption)
	}

	if (actionsOf(control).length) throw new Error(`${tile.page} ${tile.cell} still carries an action after stripping`)

	page.controls[1][column] = control
	const shown = (texts.at(-1)?.text?.value ?? '').replace(/\s+/g, ' ').slice(0, 34)
	report.push(`  c${column}  ${tile.page.padEnd(7)} ${tile.cell.padEnd(5)} ${(tile.caption ?? '(as-is)').replace('\n', ' ').padEnd(12)} ${shown}`)
}

page.controls[0] = navRow('Home', pageNumbers)

console.log(`  copied ${TILES.length} read-only tiles onto row 1:`)
for (const line of report) console.log(line)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-home.companionconfig`)
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
