/**
 * Mics: one key per channel, drawn by the receiver's own status display.
 *
 * Usage: node tools/mics-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row
 *   row 1   Signal / Muted / Packs — the whole-rig summaries, kept
 *   row 2   BGV 1-4 and Lead 1-4
 *   row 3   Lav 1-2 and Host+BGV's four
 *   rows 4-5 empty; the old per-rack touchstrip strings are gone
 *
 * WHAT THIS REPLACES. The page could tell you "the worst channel in this rack is on two bars"
 * and then you read a cramped dot-separated strip underneath to work out WHICH one. Two glances
 * and a decode, for a question — which mic is in trouble — that a key can answer directly.
 *
 * THE MODULE'S OWN "CHANNEL STATUS DISPLAY" WAS TRIED FIRST AND DOES NOT WORK HERE. shure-wireless
 * ships a feedback (id `sample`) that renders a channel the way the receiver's front panel does —
 * name, segmented battery, RF block, live audio meter. It is an ADVANCED feedback: it returns a
 * pre-rendered image buffer plus legacy text properties, which is how buttons worked before
 * Companion v5. On a v5 `button-layered` control nothing composes those, and every key came out
 * blank on the deck. Keep the mechanism in mind if these pages are ever rebuilt as legacy
 * buttons; on layered ones it draws nothing.
 *
 * So each key is built from the receiver's own VARIABLES instead, with the same expression
 * machinery the rest of this page already proved — see src/shure.js. The channel's name comes
 * from `ch_N_name`, so a key relabels itself when someone renames a channel on the receiver
 * rather than drifting out of date.
 *
 * THE THREE-STATE PROBLEM STILL APPLIES. A channel reports "Unknown" or nothing at all when its
 * transmitter is off, and arithmetic swallows both — an empty string reads as zero, which is the
 * alarm value. Every reading here is gated on the channel actually being live, so a pack in its
 * case can never turn a key red.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'
import { battery, isLive, isMuted, worstText } from '../src/shure.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/mics-page.js <live-full.json> <outdir>')
	process.exit(1)
}

/**
 * Which channels to show, by receiver label and channel number.
 *
 * Only channels the receivers have actually named. Each rack is a four-channel ULXD4Q, so
 * shure3 has channels 3 and 4 physically — they are simply unused, and two permanently blank
 * keys would be clutter pretending to be information.
 */
const CHANNELS = [
	{ rack: 'shure1', channel: 1 },
	{ rack: 'shure1', channel: 2 },
	{ rack: 'shure1', channel: 3 },
	{ rack: 'shure1', channel: 4 },
	{ rack: 'shure2', channel: 1 },
	{ rack: 'shure2', channel: 2 },
	{ rack: 'shure2', channel: 3 },
	{ rack: 'shure2', channel: 4 },
	{ rack: 'shure3', channel: 1 },
	{ rack: 'shure3', channel: 2 },
	{ rack: 'shure4', channel: 1 },
	{ rack: 'shure4', channel: 2 },
	{ rack: 'shure4', channel: 3 },
	{ rack: 'shure4', channel: 4 },
]

/** First content row for channel keys; row 1 keeps the summaries. */
const FIRST_ROW = 2

/**
 * Battery thresholds, matching the summaries on the row above so the two agree about "low".
 */
const AMBER_AT = 2
const RED_AT = 1

const REST_BG = 0x143026
const AMBER_BG = 0x7a5a00
const RED_BG = 0xcc0000

const IDLE_ICON = 'mic-off'
const LIVE_ICON = 'mic-on'
const MUTED_ICON = 'mic-muted'

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/** An internal expression feedback that repaints a key when `expression` is true. */
const lit = (id, expression, bg, icon) => ({
	id,
	type: 'feedback',
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	isInverted: v(false),
	styleOverrides: [
		...(bg === null
			? []
			: [{ overrideId: `${id}-bg`, elementId: 'box0', elementProperty: 'color', override: v(bg) }]),
		...(icon
			? [
					{
						overrideId: `${id}-icon`,
						elementId: 'image0',
						elementProperty: 'base64Image',
						override: v(`$(image:${icon})`),
					},
				]
			: []),
	],
})

/**
 * One channel key: the receiver's name for it, and how much battery it has left.
 *
 * FEEDBACK ORDER IS THE PRIORITY ORDER, because later ones win. Live, then low, then flat, then
 * muted — so a muted channel reads as muted even when its battery is also low, which is the
 * state you can actually do something about from the desk.
 */
const channelKey = (rack, channel) => {
	const live = isLive(rack, channel)
	const bars = battery(rack, channel)

	return {
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
					color: v(REST_BG), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
				},
				{
					id: 'image0', name: 'Image', usage: 'auto', type: 'image',
					enabled: v(true), opacity: v(100),
					x: v(0), y: v(2), width: v(100), height: v(40), rotation: v(0),
					base64Image: v(`$(image:${IDLE_ICON})`),
					halign: v('center'), valign: v('center'), fillMode: v('fit'),
				},
				{
					// The receiver's own name for the channel, so a rename on the desk follows here.
					id: 'text0', name: 'Name', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100),
					x: v(0), y: v(42), width: v(100), height: v(30), rotation: v(0),
					text: v(`$(${rack}:ch_${channel}_name)`), color: v(0xffffff),
					halign: v('center'), valign: v('center'),
					fontsize: v(80), fontsizeAllowShrink: v(true), font: v('companion-sans'),
					outlineColor: v(0xff000000),
				},
				{
					id: 'text1', name: 'Battery', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100),
					x: v(0), y: v(70), width: v(100), height: v(28), rotation: v(0),
					text: expr(worstText(bars)), color: v(0xbcd8e6),
					halign: v('center'), valign: v('center'),
					fontsize: v(80), fontsizeAllowShrink: v(true), font: v('companion-sans'),
					outlineColor: v(0xff000000),
				},
			],
		},
		options: {
			stepProgression: 'auto', stepExpression: '', rotaryActions: false,
			canModifyStyleInApis: false,
			notes: `${rack} channel ${channel}: name, battery, and mute state`,
		},
		feedbacks: [
			lit(`mics-${rack}-${channel}-live`, `${live}`, null, LIVE_ICON),
			lit(`mics-${rack}-${channel}-low`, `${live} && ${bars} <= ${AMBER_AT}`, AMBER_BG, null),
			lit(`mics-${rack}-${channel}-flat`, `${live} && ${bars} <= ${RED_AT}`, RED_BG, null),
			lit(`mics-${rack}-${channel}-muted`, isMuted(rack, channel) + ' == 1', RED_BG, MUTED_ICON),
		],
		// Read-only, like the rest of this page: pressing a channel does nothing.
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
		localVariables: [],
	}
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

const connectionByLabel = Object.fromEntries(
	Object.entries(full.instances)
		.filter(([, i]) => i.moduleId === 'shure-wireless')
		.map(([id, i]) => [i.label, id])
)
for (const { rack } of CHANNELS) {
	if (!connectionByLabel[rack]) throw new Error(`no shure-wireless connection labelled "${rack}" on this rig`)
}

const number = pageNumbers.Mics
const original = full.pages[number]

const page = structuredClone(original)
page.gridSize = { ...GRID_SIZE }
page.controls = {}

const actionsOf = (c) =>
	Object.values(c?.steps ?? {})
		.flatMap((s) => Object.values(s.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)
const isPureNav = (c) => actionsOf(c).length === 1 && actionsOf(c)[0].definitionId === 'set_page'
const labelOf = (c) =>
	((c?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '').replace(/\s+/g, ' ').slice(0, 12)

/*
 * Keep the three whole-rig summaries on row 1 and DROP everything else the page had — the four
 * rack keys and the four touchstrip strings existed only to narrow down which channel was in
 * trouble, which is now answered directly. Keeping them would leave two ways to read the same
 * thing, disagreeing whenever one is refreshed and the other is not.
 */
const SUMMARIES = ['Signal', 'Muted', 'Packs']
const kept = []
const dropped = []
page.controls[1] = {}
let summaryColumn = 0
for (const r of Object.keys(original.controls ?? {}).sort((a, b) => a - b)) {
	for (const c of Object.keys(original.controls[r]).sort((a, b) => a - b)) {
		const ctl = original.controls[r][c]
		if (Number(r) === 0 || isPureNav(ctl)) continue

		const label = labelOf(ctl)
		const summary = SUMMARIES.find((s) => label.startsWith(s))
		if (summary) {
			page.controls[1][summaryColumn] = ctl
			kept.push(`${r}/${c} -> 1/${summaryColumn}  ${summary}`)
			summaryColumn++
		} else {
			dropped.push(`${r}/${c}  ${label || '(rack readout)'}`)
		}
	}
}
if (summaryColumn !== SUMMARIES.length) {
	throw new Error(`expected ${SUMMARIES.length} summary keys, found ${summaryColumn}`)
}

/*
 * Lay the channels out RACK BY RACK, never splitting a receiver across two rows.
 *
 * Filling the grid cell by cell would put Lav 1 at the end of row 2 and Lav 2 at the start of
 * row 3 — the two channels of one receiver at opposite ends of the page, which is exactly the
 * kind of layout that gets misread at speed. A rack that will not fit in what is left of a row
 * starts the next one instead.
 */
const placed = []
let row = FIRST_ROW
let column = 0
let previous = null
for (const { rack, channel } of CHANNELS) {
	if (rack !== previous) {
		const size = CHANNELS.filter((c) => c.rack === rack).length
		if (column > 0 && column + size > COLUMNS) {
			row++
			column = 0
		}
		previous = rack
	}
	if (row > 3) throw new Error(`${CHANNELS.length} channels need more key rows than this page has`)

	page.controls[row] ??= {}
	page.controls[row][column] = channelKey(rack, channel)
	placed.push(`${row}/${column}  ${rack} ch${channel}`)
	column++
	if (column >= COLUMNS) {
		row++
		column = 0
	}
}

page.controls[0] = navRow('Mics', pageNumbers)

for (const k of kept) console.log(`  kept    ${k}`)
for (const d of dropped) console.log(`  dropped ${d}  — the per-channel keys answer this directly now`)
console.log(`  ${CHANNELS.length} channel keys: name from the receiver, battery bars, amber at ${AMBER_AT} / red at ${RED_AT}`)
for (const p of placed) console.log(`    ${p}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-mics.companionconfig`)
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
