/**
 * The Videohub page: the whole router on the + XL, every output over every input.
 *
 * Every output is a key and every input is a key, outputs on the top two rows and inputs on the
 * bottom two. Tap an output to select it, tap an input and it is routed there at once (Sam,
 * 2026-10-26: "tap output, tap input: routes at once"). It lives on the main deck (Sam: "same
 * stream deck"), opened from VW's Videohub key.
 *
 * SELECTING IS SEPARATE FROM ROUTING, AND THAT IS THE SAFETY PROPERTY. An output key only
 * selects; no press on the top half can change what is on a screen. Only an input key sends a
 * route, and only to the output that is visibly lit. Since the 2026-10-26 move the router also
 * feeds the ATEM's inputs (outputs 1-6), so a stray route can take a camera off the switcher.
 *
 * THE SELECTION IS THE MODULE'S OWN, NOT A CUSTOM VARIABLE. VW used to arm a destination
 * through `custom_vh_dest`, and its "this input feeds the armed output" highlight had to build
 * a variable name out of that variable, which Companion's expression parser rejects (rig.md,
 * open fault 2). bmd-videohub keeps a selected destination itself: `select_destination` sets
 * it, `route_source` routes to it, and the `selected_destination` / `selected_source`
 * feedbacks read it. VW's keys now share that selection (src/vw.js).
 *
 * LABELS ARE THE ROUTER'S, LIVE (Sam's choice). Each key shows `$(videohub:input_N)` or
 * `$(videohub:output_N)`, so a port renamed in Videohub Setup is renamed here with no rebuild.
 * The port number sits above it, because a router's own labels are often blank or factory
 * defaults, and the number is what a cable is marked with. An output key also shows what is
 * feeding it, so the top half of the deck is the whole routing table at a glance.
 *
 * NO FOLDER ROW, BECAUSE 32 PORTS NEED ALL FOUR ROWS. With row 0 spent on folders the page has
 * 27 keys. So this one sub-page breaks the deck's rule and carries a single Back key in the
 * spare column instead; the touchstrip and knobs below are left empty.
 */
import { COLUMNS, GRID_SIZE, KEY_ROWS } from './layout.js'

export const PAGE_NAME = 'Videohub'
export const PARENT = 'VW'
export const MODULE_ID = 'bmd-videohub'
export const MARK = 'videohub'

/** The + XL's key grid with no folder row: rows 0-3, nine across. */
export const GRID = { columns: COLUMNS, rows: KEY_ROWS.length + 1 }

/** Back to VW, top right: the column the ports leave free. */
export const BACK_CELL = { row: 0, col: COLUMNS - 1 }

/** Violet is the routing identity on this deck; inputs sit cooler, as on VW. */
export const BG = { output: 0x241a42, input: 0x14243a, nav: 0x1f2937 }
export const SELECTED = 0xa78bfa
export const FEEDING = 0x1f6f3a

export const INK = { name: 0xffffff, port: 0x9ca3af, feed: 0xc4b5fd, selected: 0x111827 }

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/**
 * The one Videohub connection, with the router's size and its variable prefix.
 *
 * Refuses Take mode: with it on, `route_source` queues a route and waits for a Take key this
 * page does not have, so every input press would silently do nothing.
 */
export function findVideohub(full) {
	const found = Object.entries(full.instances ?? {}).filter(([, i]) => i?.moduleId === MODULE_ID)
	if (found.length !== 1) throw new Error(`expected one ${MODULE_ID} connection on this rig, found ${found.length}`)
	const [[connectionId, instance]] = found
	const config = instance.config ?? {}
	if (config.take) throw new Error(`"${instance.label}" has Take enabled; input keys would queue instead of route`)
	const count = (key) => {
		const n = Number(config[key])
		if (!Number.isInteger(n) || n < 1) throw new Error(`"${instance.label}" has no ${key}; connect it to the router first`)
		return n
	}
	return { connectionId, label: instance.label, inputs: count('inputCount'), outputs: count('outputCount') }
}

/**
 * Where every key goes: outputs fill the top half of the grid, inputs the bottom half.
 *
 * Both halves use the same row width, so input N sits in the same column as output N. Sixteen
 * and sixteen on four rows is eight a row, which leaves the last column for the Back key rather
 * than wrapping port 9 onto the first row.
 *
 * @throws when the router does not fit beside the Back key, rather than silently dropping ports
 */
export function plan({ inputs, outputs }, grid = GRID) {
	const half = Math.floor(grid.rows / 2)
	const perRow = half ? Math.ceil(Math.max(inputs, outputs) / half) : Infinity
	if (perRow > grid.columns - 1) {
		throw new Error(`${outputs} outputs and ${inputs} inputs do not fit a ${grid.columns}x${grid.rows} deck beside a Back key`)
	}
	const cell = (n, firstRow) => ({ n, row: firstRow + Math.floor((n - 1) / perRow), col: (n - 1) % perRow })
	const ports = (count, firstRow) => Array.from({ length: count }, (_, i) => cell(i + 1, firstRow))
	return { perRow, outputs: ports(outputs, 0), inputs: ports(inputs, half) }
}

const text = (id, y, height, value, color, fontsize) => ({
	id, name: id, usage: 'auto', type: 'text',
	enabled: v(true), opacity: v(100),
	x: v(2), y: v(y), width: v(96), height: v(height), rotation: v(0),
	text: value, color: v(color),
	halign: v('center'), valign: v('center'),
	fontsize: v(fontsize), fontsizeAllowShrink: v(true), font: v('companion-sans'),
	outlineColor: v(0xff000000),
})

const layers = (bg, lines) => [
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
	...lines,
]

const control = ({ bg, lines, notes, feedbacks, action }) => ({
	type: 'button-layered',
	style: { layers: layers(bg, lines) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes,
	},
	feedbacks,
	steps: { 0: { action_sets: { down: [action], up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

const recolour = (id, element, property, value) => ({
	overrideId: `${id}-${element}`, elementId: element, elementProperty: property, override: v(value),
})

/** The module's "this output is selected" feedback, restyling the key with `styleOverrides`. */
export const selectedOutput = (connectionId, id, n, styleOverrides) => ({
	id,
	type: 'feedback',
	definitionId: 'selected_destination',
	connectionId,
	options: { output: v(n) },
	isInverted: v(false),
	styleOverrides,
})

/** The module's "this input feeds the selected output" feedback. */
export const feedingSelected = (connectionId, id, n, styleOverrides) => ({
	id,
	type: 'feedback',
	definitionId: 'selected_source',
	connectionId,
	options: { input: v(n) },
	isInverted: v(false),
	styleOverrides,
})

export const selectAction = (connectionId, id, n) => ({
	id,
	definitionId: 'select_destination',
	connectionId,
	options: { destination: v(n) },
	upgradeIndex: null,
	type: 'action',
})

/**
 * Route input `n` to the selected output. Locks are ignored, as VW always did: nothing on this
 * rig sets them, and a lock nobody remembers setting would make a key look broken mid-service.
 */
export const routeAction = (connectionId, id, n) => ({
	id,
	definitionId: 'route_source',
	connectionId,
	options: { source: v(n), ignore_lock: v(true) },
	upgradeIndex: null,
	type: 'action',
})

/** An output key: shows its name and what feeds it, and selects it. It routes nothing. */
export function outputKey({ connectionId, label }, n) {
	const id = `${MARK}-out-${n}`
	return control({
		bg: BG.output,
		lines: [
			text('port', 2, 20, v(`OUT ${n}`), INK.port, 80),
			text('name', 22, 46, expr(`$(${label}:output_${n})`), INK.name, 51),
			text('feed', 70, 28, expr(`$(${label}:output_${n}_input)`), INK.feed, 60),
		],
		notes: `${MARK}: select output ${n} as the destination`,
		feedbacks: [
			selectedOutput(connectionId, id, n, [
				recolour(id, 'box0', 'color', SELECTED),
				...['port', 'name', 'feed'].map((line) => recolour(id, line, 'color', INK.selected)),
			]),
		],
		action: selectAction(connectionId, `${id}-select`, n),
	})
}

/**
 * An input key: routes this input to the selected output, at once.
 *
 * It lights when it is already what the selected output is showing, so the two lit keys read
 * as "that screen is getting this picture".
 */
export function inputKey({ connectionId, label }, n) {
	const id = `${MARK}-in-${n}`
	return control({
		bg: BG.input,
		lines: [
			text('port', 2, 20, v(`IN ${n}`), INK.port, 80),
			// The same band as an output's name: font size is a share of the band, so a taller one
			// set "Program" so large that it broke mid-word (seen on the rig 2026-10-26).
			text('name', 36, 46, expr(`$(${label}:input_${n})`), INK.name, 51),
		],
		notes: `${MARK}: route input ${n} to the selected output`,
		// The grey port number is too faint on green, so it goes white with the name.
		feedbacks: [feedingSelected(connectionId, id, n, [recolour(id, 'box0', 'color', FEEDING), recolour(id, 'port', 'color', INK.name)])],
		action: routeAction(connectionId, `${id}-route`, n),
	})
}

/**
 * A key that opens page `pageNumber`, with an icon over a caption like every other key here.
 * Navigation is `internal: set_page` on the surface that pressed it, as on the folder row.
 */
export function pageKey({ id, icon, label, pageNumber, notes }) {
	return control({
		bg: BG.nav,
		lines: [
			{
				id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(2), width: v(100), height: v(44), rotation: v(0),
				base64Image: v(`$(image:${icon})`),
				halign: v('center'), valign: v('center'), fillMode: v('fit'),
			},
			text('text0', 46, 52, v(label), INK.name, 51),
		],
		notes,
		feedbacks: [],
		action: {
			id: `${id}-open`,
			definitionId: 'set_page',
			connectionId: 'internal',
			options: { surfaceId: v('self'), page: v(String(pageNumber)) },
			upgradeIndex: null,
			type: 'action',
		},
	})
}

/** The Videohub page for a router, with its Back key pointing at VW's page number. */
export function buildVideohubPage(videohub, vwPage) {
	const layout = plan(videohub)
	const controls = {}
	const place = ({ row, col }, key) => {
		controls[row] ??= {}
		controls[row][col] = key
	}
	for (const cell of layout.outputs) place(cell, outputKey(videohub, cell.n))
	for (const cell of layout.inputs) place(cell, inputKey(videohub, cell.n))
	place(
		BACK_CELL,
		pageKey({ id: `${MARK}-back`, icon: 'back', label: PARENT, pageNumber: vwPage, notes: `${MARK}: back to ${PARENT} (page ${vwPage})` })
	)
	return { name: PAGE_NAME, gridSize: { ...GRID_SIZE }, controls }
}

/**
 * The Videohub page from a live export, and the page number it lands on.
 *
 * Rebuilding replaces the existing page in place, keeping its id. A first build lands after the
 * last page, which is where Companion's "import to a new page" puts it.
 */
export function buildConfig(full) {
	const videohub = findVideohub(full)
	const numbers = Object.keys(full.pages ?? {}).map(Number)
	if (Math.max(...numbers) !== numbers.length) {
		throw new Error(`pages are not numbered 1..${numbers.length}; a new page would not land after the last`)
	}
	const numberOf = (name) => Object.entries(full.pages).find(([, p]) => p.name === name)?.[0]
	const vwPage = numberOf(PARENT)
	if (!vwPage) throw new Error(`no ${PARENT} page on this rig to open the ${PAGE_NAME} page from`)
	const existing = numberOf(PAGE_NAME)
	const page = buildVideohubPage(videohub, vwPage)
	if (existing) page.id = full.pages[existing].id
	return { videohub, page, number: existing ?? String(numbers.length + 1), existing: Boolean(existing), vwPage }
}
