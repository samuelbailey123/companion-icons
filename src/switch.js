/**
 * The Switch deck: a Stream Deck of its own, given over entirely to the Videohub.
 *
 * Every output is a key and every input is a key, outputs in the top half of the deck and
 * inputs in the bottom half. Tap an output to select it, tap an input and it is routed there
 * at once (Sam, 2026-10-26: "tap output, tap input: routes at once").
 *
 * SELECTING IS SEPARATE FROM ROUTING, AND THAT IS THE SAFETY PROPERTY. An output key only
 * selects; no press on the top half can change what is on a screen. Only an input key sends a
 * route, and only to the output that is visibly lit.
 *
 * THE SELECTION IS THE MODULE'S OWN, NOT A CUSTOM VARIABLE. The VW page arms a destination
 * through `custom_vh_dest`, and its "this input feeds the armed output" highlight has to build
 * a variable name out of that variable, which Companion's expression parser rejects (rig.md,
 * open fault 2). bmd-videohub keeps a selected destination itself: `select_destination` sets
 * it, `route_source` routes to it, and the `selected_destination` / `selected_source`
 * feedbacks read it. Nothing here parses an expression, so nothing here can fail to.
 *
 * LABELS ARE THE ROUTER'S, LIVE (Sam's choice). Each key shows `$(videohub:input_N)` or
 * `$(videohub:output_N)`, so a port renamed in Videohub Setup is renamed here with no rebuild.
 * The port number sits above it, because a router's own labels are often blank or factory
 * defaults, and the number is what a cable is marked with. An output key also shows what is
 * feeding it, so the top half of the deck is the whole routing table at a glance.
 *
 * The page has no folder row. It belongs to one surface, which is pinned to it, and it is
 * never reached from the main deck's row (see SURFACE_PAGES in src/navrow.js).
 */
import { GRID_SIZE } from './layout.js'

export const PAGE_NAME = 'Switch'
export const MODULE_ID = 'bmd-videohub'
export const MARK = 'switch'

/** How the surface is recognised when no id is given: by the name it carries in Companion. */
export const SURFACE_NAME = /switch/i

/** Violet is the routing identity on this deck; inputs sit cooler, as on VW. */
export const BG = { output: 0x241a42, input: 0x14243a }
export const SELECTED = 0xa78bfa
export const FEEDING = 0x1f6f3a

export const INK = { name: 0xffffff, port: 0x9ca3af, feed: 0xc4b5fd, selected: 0x111827 }

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/**
 * The one Videohub connection, with the router's size and its variable prefix.
 *
 * Refuses Take mode: with it on, `route_source` queues a route and waits for a Take key this
 * deck does not have, so every input press would silently do nothing.
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
 * The surface this page is for: the one with `surfaceId`, or the one named like "Switch".
 *
 * @throws naming every surface on the rig, so the right id can be passed instead
 */
export function findSurface(full, surfaceId) {
	const surfaces = Object.entries(full.surfaces ?? {})
	const matches = surfaceId
		? surfaces.filter(([id]) => id === surfaceId)
		: surfaces.filter(([, s]) => SURFACE_NAME.test(s?.name ?? ''))
	if (matches.length !== 1) {
		const known = surfaces.map(([id, s]) => `${id} "${s?.name ?? ''}" ${s?.type ?? ''}`).join('; ') || 'none'
		const wanted = surfaceId ? `surface ${surfaceId}` : `one surface named like ${SURFACE_NAME}`
		throw new Error(`expected ${wanted}, found ${matches.length}. Surfaces: ${known}`)
	}
	const [[id, surface]] = matches
	const { columns, rows } = surface.gridSize ?? {}
	if (!(columns > 0 && rows > 0)) throw new Error(`surface ${id} has no grid size`)
	return { surfaceId: id, name: surface.name ?? '', grid: { columns, rows } }
}

/**
 * Where every key goes: outputs fill the top half of the deck, inputs the bottom half.
 *
 * Both halves use the same row width, so input N sits in the same column as output N. Sixteen
 * and sixteen on a four-row deck is eight a row, which leaves column 8 of a nine-wide deck
 * empty rather than wrapping port 9 onto the first row.
 *
 * @throws when the router does not fit the deck, rather than silently dropping ports
 */
export function plan({ inputs, outputs }, grid) {
	const half = Math.floor(grid.rows / 2)
	const perRow = half ? Math.ceil(Math.max(inputs, outputs) / half) : Infinity
	if (perRow > grid.columns) {
		throw new Error(`${outputs} outputs and ${inputs} inputs do not fit a ${grid.columns}x${grid.rows} deck`)
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

const control = ({ bg, lines, notes, feedback, action }) => ({
	type: 'button-layered',
	style: { layers: layers(bg, lines) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes,
	},
	feedbacks: [feedback],
	steps: { 0: { action_sets: { down: [action], up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

const recolour = (id, element, property, value) => ({
	overrideId: `${id}-${element}`, elementId: element, elementProperty: property, override: v(value),
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
		feedback: {
			id,
			type: 'feedback',
			definitionId: 'selected_destination',
			connectionId,
			options: { output: v(n) },
			isInverted: v(false),
			styleOverrides: [
				recolour(id, 'box0', 'color', SELECTED),
				...['port', 'name', 'feed'].map((line) => recolour(id, line, 'color', INK.selected)),
			],
		},
		action: {
			id: `${id}-select`,
			definitionId: 'select_destination',
			connectionId,
			options: { destination: v(n) },
			upgradeIndex: null,
			type: 'action',
		},
	})
}

/**
 * An input key: routes this input to the selected output, at once.
 *
 * It lights when it is already what the selected output is showing, so the two lit keys read
 * as "that screen is getting this picture". Locks are ignored, as on VW: nothing on this rig
 * sets them, and a lock nobody remembers setting would make a key look broken mid-service.
 */
export function inputKey({ connectionId, label }, n) {
	const id = `${MARK}-in-${n}`
	return control({
		bg: BG.input,
		lines: [
			text('port', 2, 20, v(`IN ${n}`), INK.port, 80),
			text('name', 24, 72, expr(`$(${label}:input_${n})`), INK.name, 51),
		],
		notes: `${MARK}: route input ${n} to the selected output`,
		feedback: {
			id,
			type: 'feedback',
			definitionId: 'selected_source',
			connectionId,
			options: { input: v(n) },
			isInverted: v(false),
			// The grey port number is too faint on green, so it goes white with the name.
			styleOverrides: [recolour(id, 'box0', 'color', FEEDING), recolour(id, 'port', 'color', INK.name)],
		},
		action: {
			id: `${id}-route`,
			definitionId: 'route_source',
			connectionId,
			options: { source: v(n), ignore_lock: v(true) },
			upgradeIndex: null,
			type: 'action',
		},
	})
}

/** The Switch page for a router on a deck of `grid`. */
export function buildSwitchPage(videohub, grid) {
	const layout = plan(videohub, grid)
	const controls = {}
	const place = ({ row, col }, key) => {
		controls[row] ??= {}
		controls[row][col] = key
	}
	for (const cell of layout.outputs) place(cell, outputKey(videohub, cell.n))
	for (const cell of layout.inputs) place(cell, inputKey(videohub, cell.n))
	return { name: PAGE_NAME, gridSize: { ...GRID_SIZE }, controls }
}

/**
 * Everything the tool writes, from a live export.
 *
 * Rebuilding replaces the existing Switch page in place, keeping its id, so the surface pinned
 * to it stays pinned. A first build lands after the last page.
 */
export function buildConfig(full, surfaceId) {
	const videohub = findVideohub(full)
	const surface = findSurface(full, surfaceId)
	const numbers = Object.keys(full.pages ?? {}).map(Number)
	if (Math.max(...numbers) !== numbers.length) {
		throw new Error(`pages are not numbered 1..${numbers.length}; a new page would not land after the last`)
	}
	const existing = Object.entries(full.pages).find(([, p]) => p.name === PAGE_NAME)?.[0]
	const page = buildSwitchPage(videohub, surface.grid)
	if (existing) page.id = full.pages[existing].id
	return { videohub, surface, page, number: existing ?? String(numbers.length + 1), existing: Boolean(existing) }
}
