/**
 * Replace Companion's built-in page up/down keys with styled buttons that name their
 * destination.
 *
 * Usage: node tools/nav-buttons.js <prod-full.json> <outdir>
 *
 * WHY REPLACE THEM AT ALL. `pageup` and `pagedown` are special control types that serialise
 * to exactly `{"type":"pageup"}` — they carry no style, so there is nothing to restyle. Their
 * appearance is hard-coded in Companion: a near-black #0F0F0F key, a chevron drawn from two
 * 2.5px-wide lines, and the word UP or DOWN in amber. At 120px that chevron is very thin and
 * the amber word dominates a control nobody needs to read.
 *
 * A plain button can do the same job. Companion's own `convertControl()` converts these keys
 * to `internal: inc_page` / `dec_page` with `surfaceId: "self"`, and both paths end at the
 * same `setCurrentPage("+1")` / `("-1")` call — so navigation behaviour is unchanged.
 *
 * WHAT THE LABEL SAYS. Rather than "Page Up", each button names the page it takes you to.
 * Destinations are computed from the real page order with wrapping, matching Companion's
 * `getOffsetPageId` (`o < 0 ? length + o : o % length`) — so from the last page, up wraps to
 * the first.
 *
 * MAINTENANCE: the destination names are baked in at build time. Re-run this tool after
 * adding, removing or reordering pages, or a label will point at the wrong place. It is safe
 * to re-run: it reads the live config and only ever rewrites nav keys.
 *
 * ASSUMPTIONS, both verified against the live surface config before this was written:
 *   - `restrict_pages` is false, so navigation cycles through every page.
 *   - `page_direction_flipped` is unset, so up means +1.
 * If either changes on the surface, the labels stop matching and this tool needs revisiting.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outdir] = process.argv
if (!src || !outdir) {
	console.error('usage: node tools/nav-buttons.js <prod-full.json> <outdir>')
	process.exit(1)
}

const v = (value) => ({ value, isExpression: false })

/** Slate background, distinct from the content keys so navigation reads as chrome. */
const NAV_BG = 0x1f2937

const NAV = {
	pageup: { definitionId: 'inc_page', image: 'page-up', offset: +1 },
	pagedown: { definitionId: 'dec_page', image: 'page-down', offset: -1 },
}

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

const full = JSON.parse(await fs.readFile(src, 'utf8'))

/** Page order as Companion sees it, so offsets and wrapping line up with the real deck. */
const order = Object.keys(full.pages).sort((a, b) => Number(a) - Number(b))

/** Companion's own wrap: negative wraps to the end, overflow wraps to the start. */
function destination(pageNumber, offset) {
	const i = order.indexOf(pageNumber)
	if (i === -1) throw new Error(`page ${pageNumber} not in page order`)
	let o = i + offset
	o = o < 0 ? order.length + o : o % order.length
	const target = order[o]
	return { number: target, name: full.pages[target]?.name || `Page ${target}` }
}

function navButton(kind, pageNumber) {
	const spec = NAV[kind]
	const dest = destination(pageNumber, spec.offset)

	return {
		control: {
			type: 'button-layered',
			style: {
				layers: [
					{
						id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
						decoration: v('default'), showStatusIcons: v('default'),
					},
					{
						id: 'box0', name: 'Background', usage: 'auto', type: 'box',
						enabled: v(true), opacity: v(100),
						x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
						color: v(NAV_BG), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
					},
					{
						id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
						enabled: v(true), opacity: v(100),
						x: v(0), y: v(2), width: v(100), height: v(56), rotation: v(0),
						base64Image: v(`$(image:${spec.image})`),
					},
					{
						id: 'text0', name: 'Destination', usage: 'auto', type: 'text',
						enabled: v(true), opacity: v(100),
						x: v(0), y: v(60), width: v(100), height: v(38), rotation: v(0),
						text: v(dest.name), color: v(0xffffff),
						halign: v('center'), valign: v('center'),
						fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
						outlineColor: v(0xff000000),
					},
				],
			},
			options: {
				stepProgression: 'auto', stepExpression: '', rotaryActions: false,
				canModifyStyleInApis: false, notes: '',
			},
			feedbacks: [],
			steps: {
				0: {
					action_sets: {
						down: [
							{
								id: id('act'),
								definitionId: spec.definitionId,
								connectionId: 'internal',
								// "self" is the surface that pressed the button, matching what
								// Companion's own convertControl() emits for these keys.
								options: { surfaceId: v('self') },
								upgradeIndex: null,
								type: 'action',
							},
						],
						up: [],
					},
					options: { runWhileHeld: [] },
				},
			},
		},
		dest,
	}
}

await fs.mkdir(outdir, { recursive: true })

let total = 0
for (const pageNumber of order) {
	const page = structuredClone(full.pages[pageNumber])
	let changed = 0

	for (const [row, cells] of Object.entries(page.controls ?? {})) {
		for (const [col, control] of Object.entries(cells)) {
			const kind = control?.type
			if (!NAV[kind]) continue

			const { control: replacement, dest } = navButton(kind, pageNumber)
			page.controls[row][col] = replacement
			changed++
			console.log(
				`  page ${pageNumber} (${page.name})  ${row}/${col}  ${kind.padEnd(8)} -> ${NAV[kind].definitionId.padEnd(9)} "${dest.name}" (page ${dest.number})`
			)
		}
	}

	if (!changed) {
		console.log(`  page ${pageNumber} (${page.name}) has no nav keys — skipped`)
		continue
	}
	if (changed !== 2) throw new Error(`page ${pageNumber}: expected 2 nav keys, found ${changed}`)

	const out = path.join(outdir, `page-${pageNumber}-nav.companionconfig`)
	await fs.writeFile(
		out,
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
	total += changed
}

console.log(`\nrewrote ${total} nav keys across ${order.length} pages -> ${outdir}`)
