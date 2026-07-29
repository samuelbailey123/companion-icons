/**
 * VH: a destination row over a source row, the way a router is actually operated.
 *
 * Usage: node tools/vh-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row
 *   row 1   destinations — tap one to arm it
 *   row 2   sources      — tap one to route it to the armed destination
 *   row 3   the existing both-projector shortcuts, kept
 *   row 4   the output readouts on the touchstrip, kept
 *
 * WHY A SELECTION AT ALL. The page this replaces had one hard-wired button per route ("PGM to
 * Proj", "Aux1 to Proj"). That works until you want a combination nobody built a button for,
 * and there are five destinations and four sources here — twenty routes, which will not fit on
 * a page and would be unreadable if they did. Destination-then-source covers all twenty in nine
 * keys, and the two existing shortcuts stay for the routes done every week.
 *
 * ARMING IS SEPARATE FROM ROUTING, AND THAT IS THE SAFETY PROPERTY. A destination key only
 * writes a variable — no press on row 1 can change what is on a screen. Only a source key sends
 * a route. Arming is free, reversible, and visible before it does anything.
 *
 * The armed destination lives in the custom variable `vh_dest`, the same pattern MA2 already
 * uses with `selected_exec`. It is created on the rig, not by this tool: a page import cannot
 * carry custom variables, and importing them wholesale would reset live values like fader
 * levels to whatever snapshot the file happened to hold.
 *
 * INDEXING IS TAKEN FROM A WORKING BUTTON, NOT FROM THE MODULE'S INTERNALS. The existing
 * "PGM to Proj" sends source 1 to destinations 1 and 2, and its own feedback compares
 * `output_1_input_id` to 1 — so source N is input N and destination N is output N, one-based.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE, KNOB_COLS, STRIP_ROW } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/vh-page.js <live-full.json> <outdir>')
	process.exit(1)
}

/** The custom variable holding the armed destination. Must already exist on the rig. */
const ARMED = 'vh_dest'

/**
 * Destinations and sources.
 *
 * Captions are short and written here rather than read from `$(videohub:output_N)`. The desk's
 * own names are things like "Backwall Projector" — eighteen characters, which shrinks to about
 * 10px on a 112px key and is unreadable at arm's length. The full name goes in the button's
 * notes so nothing is lost, and the touchstrip underneath still shows the router's live names.
 */
const DESTINATIONS = [
	{ output: 1, label: 'Right\nProj', full: 'Right Projector' },
	{ output: 2, label: 'Left\nProj', full: 'Left Projector' },
	{ output: 8, label: 'LED\nWall', full: 'LED Wall' },
	{ output: 10, label: 'Backwall', full: 'Backwall Projector' },
	{ output: 11, label: 'Mini\nScreen', full: 'Mini Screen 1' },
]

const SOURCES = [
	{ input: 1, label: 'Program', full: 'Program Out' },
	{ input: 2, label: 'Aux 1', full: 'Aux 1' },
	{ input: 3, label: 'Aux 2', full: 'Aux 2' },
	{ input: 4, label: 'Multi\nview', full: 'SDI Multiview' },
]

/** Violet is the routing identity everywhere else on this deck; the source row sits cooler. */
const REST = { destination: 0x241a42, source: 0x14243a }
const ARMED_BG = 0xa78bfa
const LIVE_BG = 0x1f6f3a

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

const layers = ({ icon, label, bg }) => [
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
		id: 'image0', name: 'Image', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(2), width: v(100), height: v(44), rotation: v(0),
		base64Image: v(`$(image:${icon})`),
		halign: v('center'), valign: v('center'), fillMode: v('fit'),
	},
	{
		id: 'text0', name: 'Text', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(46), width: v(100), height: v(52), rotation: v(0),
		text: v(label), color: v(0xffffff),
		halign: v('center'), valign: v('center'),
		fontsize: v(51), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

const control = ({ style, notes, feedbacks, actions }) => ({
	type: 'button-layered',
	style: { layers: layers(style) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes,
	},
	feedbacks,
	steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

/** An internal expression feedback that repaints the key when `expression` is true. */
const lit = (id, expression, bg, iconOverride) => ({
	id,
	type: 'feedback',
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	isInverted: v(false),
	styleOverrides: [
		{ overrideId: `${id}-bg`, elementId: 'box0', elementProperty: 'color', override: v(bg) },
		...(iconOverride
			? [
					{
						overrideId: `${id}-icon`,
						elementId: 'image0',
						elementProperty: 'base64Image',
						override: v(`$(image:${iconOverride})`),
					},
				]
			: []),
	],
})

/** A destination key: arming only. It sets the variable and routes nothing. */
const destinationKey = ({ output, label, full }) =>
	control({
		style: { icon: 'destination', label, bg: REST.destination },
		notes: `Arm ${full} (output ${output}) as the routing destination`,
		feedbacks: [
			lit(`vh-armed-${output}`, `$(internal:custom_${ARMED}) == ${output}`, ARMED_BG, 'destination-ink'),
		],
		actions: [
			{
				id: `vh-arm-${output}`,
				definitionId: 'custom_variable_set_value',
				connectionId: 'internal',
				options: { name: v(ARMED), value: v(String(output)) },
				upgradeIndex: null,
				type: 'action',
			},
		],
	})

/**
 * A source key: routes this input to whatever destination is armed.
 *
 * The destination is an EXPRESSION reading the armed variable, so one key serves every
 * destination. It lights when this source is already feeding the armed one, which is what makes
 * the pair readable as "this is where that screen is getting its picture".
 */
const sourceKey = (connectionId, { input, label, full }) =>
	control({
		style: { icon: 'source', label, bg: REST.source },
		notes: `Route ${full} (input ${input}) to the armed destination`,
		feedbacks: [
			lit(`vh-live-${input}`, `$(videohub:output_$(internal:custom_${ARMED})_input_id) == ${input}`, LIVE_BG),
		],
		actions: [
			{
				id: `vh-route-${input}`,
				definitionId: 'route',
				connectionId,
				options: {
					source: v(input),
					destination: expr(`$(internal:custom_${ARMED})`),
					ignore_lock: v(true),
				},
				upgradeIndex: null,
				type: 'action',
			},
		],
	})

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

if (!(ARMED in (full.custom_variables ?? {}))) {
	throw new Error(`custom variable "${ARMED}" does not exist on this rig — create it in Variables > Custom first`)
}

const number = pageNumbers.VH
const original = full.pages[number]
const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'bmd-videohub')
if (!found) throw new Error('no bmd-videohub connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

if (DESTINATIONS.length > COLUMNS || SOURCES.length > COLUMNS) throw new Error('more entries than columns')

const page = structuredClone(original)
page.gridSize = { ...GRID_SIZE }
page.controls = {}
page.controls[1] = Object.fromEntries(DESTINATIONS.map((d, i) => [i, destinationKey(d)]))
page.controls[2] = Object.fromEntries(SOURCES.map((s, i) => [i, sourceKey(connectionId, s)]))

const actionsOf = (c) =>
	Object.values(c?.steps ?? {})
		.flatMap((s) => Object.values(s.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)
const isPureNav = (c) => actionsOf(c).length === 1 && actionsOf(c)[0].definitionId === 'set_page'
const labelOf = (c) =>
	((c?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '').replace(/\s+/g, ' ').slice(0, 24)

const kept = []
let shortcut = 0
for (const r of Object.keys(original.controls ?? {}).sort((a, b) => a - b)) {
	for (const c of Object.keys(original.controls[r]).sort((a, b) => a - b)) {
		const ctl = original.controls[r][c]
		if (isPureNav(ctl)) continue

		// Row 2 was the old four-zone touchstrip; those readouts belong on the new strip.
		if (Number(r) === 2) {
			const column = KNOB_COLS[Number(c)]
			if (column === undefined) throw new Error(`strip zone ${r}/${c} has no slot on this deck`)
			page.controls[STRIP_ROW] ??= {}
			page.controls[STRIP_ROW][column] = ctl
			kept.push(`${r}/${c} -> ${STRIP_ROW}/${column}  ${labelOf(ctl)}`)
			continue
		}

		if (shortcut >= COLUMNS) throw new Error('more shortcuts than row 3 can hold')
		page.controls[3] ??= {}
		page.controls[3][shortcut] = ctl
		kept.push(`${r}/${c} -> 3/${shortcut}  ${labelOf(ctl)}`)
		shortcut++
	}
}

page.controls[0] = navRow('VH', pageNumbers)

console.log(`  row 1  destinations: ${DESTINATIONS.map((d) => d.full).join(', ')}`)
console.log(`  row 2  sources:      ${SOURCES.map((s) => s.full).join(', ')}`)
for (const k of kept) console.log(`  kept   ${k}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-vh.companionconfig`)
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
