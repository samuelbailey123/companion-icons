/**
 * Turn linear page navigation into a home page with one folder per page.
 *
 * Usage: node tools/home-hub.js <prod-full.json> <homePageNumber> <outdir>
 *
 * Before: every page spent two of its eight visible keys on page up and page down, and
 * reaching a page meant stepping through the ones in between.
 *
 * After: a home page of folders jumps straight to any page, and each page carries a single
 * Home key. That is one key back on every page, and no more stepping.
 *
 * THE KEY BUDGET IS THE POINT. The Stream Deck + surface window is 4 columns wide, so only
 * rows 0-1, columns 0-3 — eight keys — are physically on the deck. PP1 was over budget: its
 * Clear Slide and Thunder buttons sit at column 5 and have never been reachable. The key
 * freed here brings one of them back.
 *
 * Navigation uses `internal: set_page` with `surfaceId: "self"`. Companion resolves that
 * option through `getPageInfo(Number(page)).id`, so `page` is the destination page NUMBER as
 * a string. Never pass "0" — Companion reads 0 as "the current page".
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, homeArg, outdir] = process.argv
if (!src || !homeArg || !outdir) {
	console.error('usage: node tools/home-hub.js <prod-full.json> <homePageNumber> <outdir>')
	process.exit(1)
}
const HOME = String(Number(homeArg))

const v = (value) => ({ value, isExpression: false })

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

/** Folder art and background per page, keyed by the page's name in Companion. */
const FOLDERS = {
	Power: { image: 'folder-power', bg: 0x14361f },
	PP1: { image: 'folder-present', bg: 0x3a1e06 },
	MA2: { image: 'folder-lighting', bg: 0x3a2e06 },
	ATEM: { image: 'folder-video', bg: 0x0e2742 },
	SQ7: { image: 'folder-audio', bg: 0x062b3a },
	VH: { image: 'folder-routing', bg: 0x241a42 },
	System: { image: 'folder-system', bg: 0x1c2b2b },
	Mics: { image: 'folder-wireless', bg: 0x143026 },
}

/** Slate, matching the nav chrome elsewhere on the deck. */
const HOME_BG = 0x1f2937

const full = JSON.parse(await fs.readFile(src, 'utf8'))

const surface = Object.values(full.surfaces ?? {})[0]
const GRID = surface?.gridSize ?? { columns: 4, rows: 4 }

const layers = ({ image, label, bg, labelColour = 0xffffff }) => [
	{
		id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
		decoration: v('default'), showStatusIcons: v('default'),
	},
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
	},
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(2), width: v(100), height: v(56), rotation: v(0),
		base64Image: v(`$(image:${image})`),
	},
	{
		id: 'text0', name: 'Label', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(60), width: v(100), height: v(38), rotation: v(0),
		text: v(label), color: v(labelColour),
		halign: v('center'), valign: v('center'),
		fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

const jumpTo = (pageNumber) => ({
	id: id('act'),
	definitionId: 'set_page',
	connectionId: 'internal',
	options: { surfaceId: v('self'), page: v(String(pageNumber)) },
	upgradeIndex: null,
	type: 'action',
})

const button = (style, actions) => ({
	type: 'button-layered',
	style: { layers: layers(style) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes: '',
	},
	feedbacks: [],
	steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
})

/**
 * Is this control page navigation?
 *
 * Three shapes have to be recognised, because this tool runs against configs at different
 * stages of conversion:
 *   - Companion's built-in keys, which serialise as `{"type":"pageup"}`.
 *   - Pages converted to plain buttons, carrying a single `inc_page` / `dec_page`.
 *   - Pages already converted to the hub, carrying a single `set_page` Home key.
 *
 * The third case matters for re-runs. Renumbering the pages — moving Home to page 1, say —
 * leaves every Home key pointing at the wrong page, and this tool is how they get repointed.
 * Without it every page reports "no nav keys" and is silently skipped.
 *
 * The rule is that the control's ENTIRE behaviour is one page-navigation action. That is what
 * keeps it from matching a button which navigates as part of doing something else.
 */
const NAV_ACTIONS = ['inc_page', 'dec_page', 'set_page']

function isNav(control) {
	if (control?.type === 'pageup' || control?.type === 'pagedown') return true
	if (control?.type !== 'button-layered') return false
	const actions = []
	for (const step of Object.values(control.steps ?? {})) {
		for (const set of Object.values(step.action_sets ?? {})) {
			if (Array.isArray(set)) actions.push(...set)
		}
	}
	return actions.length === 1 && NAV_ACTIONS.includes(actions[0].definitionId)
}

/** Keys physically on the deck, in reading order. */
function* visibleCells() {
	for (let row = 0; row < 2; row++) {
		for (let col = 0; col < GRID.columns; col++) yield [String(row), String(col)]
	}
}

// ---------------------------------------------------------------- the home page

const order = Object.keys(full.pages).sort((a, b) => Number(a) - Number(b))
const targets = order.filter((n) => n !== HOME)

/**
 * A page is not just a name and some controls: it also carries `gridSize`, the bounds
 * Companion uses to lay the page out. Built from scratch without it, the page imports as
 * blank — the import preview renders an empty grid, which is how this was caught. Copy the
 * bounds from an existing page so the new one matches the rest of the config exactly.
 */
const templatePage = full.pages[order[0]]
if (!templatePage?.gridSize) throw new Error('could not read gridSize from an existing page')

const homePage = { name: 'Home', gridSize: structuredClone(templatePage.gridSize), controls: {} }
const cells = [...visibleCells()]

if (targets.length > cells.length) {
	throw new Error(`${targets.length} pages but only ${cells.length} visible keys on the home page`)
}

for (const [i, pageNumber] of targets.entries()) {
	const name = full.pages[pageNumber].name
	const folder = FOLDERS[name]
	if (!folder) throw new Error(`no folder art defined for page "${name}" — add it to FOLDERS`)

	const [row, col] = cells[i]
	homePage.controls[row] ??= {}
	homePage.controls[row][col] = button(
		{ image: folder.image, label: name, bg: folder.bg },
		[jumpTo(pageNumber)]
	)
	console.log(`  home ${row}/${col}  ${name.padEnd(6)} -> page ${pageNumber}  ($(image:${folder.image}))`)
}

await fs.mkdir(outdir, { recursive: true })
await fs.writeFile(
	path.join(outdir, `page-${HOME}-home.companionconfig`),
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page: homePage,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(HOME),
	})
)
console.log(`  wrote home page ${HOME}\n`)

// ------------------------------------------------- every other page gets a Home key

for (const pageNumber of targets) {
	const page = structuredClone(full.pages[pageNumber])

	const navCells = []
	for (const [row, cellMap] of Object.entries(page.controls ?? {})) {
		for (const [col, control] of Object.entries(cellMap)) {
			if (isNav(control)) navCells.push([row, col])
		}
	}
	if (!navCells.length) {
		console.log(`  page ${pageNumber} (${page.name}) has no nav keys — skipped`)
		continue
	}

	// Home takes the top-left slot; everything else the nav used is released.
	for (const [row, col] of navCells) delete page.controls[row][col]
	page.controls['0'] ??= {}
	page.controls['0']['0'] = button(
		{ image: 'home', label: 'Home', bg: HOME_BG },
		[jumpTo(HOME)]
	)

	// Rescue anything stranded outside the deck window into a freed key.
	const freed = []
	for (const [row, col] of visibleCells()) {
		if (!page.controls[row]?.[col]) freed.push([row, col])
	}
	const offscreen = []
	for (const [row, cellMap] of Object.entries(page.controls ?? {})) {
		for (const col of Object.keys(cellMap)) {
			if (Number(col) >= GRID.columns || Number(row) >= GRID.rows) offscreen.push([row, col])
		}
	}
	offscreen.sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[1]) - Number(b[1]))

	const moved = []
	while (freed.length && offscreen.length) {
		const [fr, fc] = freed.shift()
		const [or, oc] = offscreen.shift()
		page.controls[fr] ??= {}
		page.controls[fr][fc] = page.controls[or][oc]
		delete page.controls[or][oc]
		const label = page.controls[fr][fc]?.style?.layers?.find((l) => l.type === 'text')?.text?.value
		moved.push(`${or}/${oc} -> ${fr}/${fc} (${label ?? '?'})`)
	}

	console.log(
		`  page ${pageNumber} (${page.name.padEnd(6)}) nav ${navCells.map((c) => c.join('/')).join(' ')} -> Home at 0/0` +
			(moved.length ? `; rescued ${moved.join(', ')}` : '') +
			(offscreen.length ? `; STILL OFF-DECK: ${offscreen.map((c) => c.join('/')).join(' ')}` : '')
	)

	await fs.writeFile(
		path.join(outdir, `page-${pageNumber}-home.companionconfig`),
		JSON.stringify({
			version: full.version,
			type: 'page',
			companionBuild: full.companionBuild,
			page,
			instances: full.instances,
			connectionCollections: full.connectionCollections ?? [],
			oldPageNumber: Number(pageNumber),
		})
	)
}

console.log(`\nwrote ${targets.length + 1} pages -> ${outdir}`)
