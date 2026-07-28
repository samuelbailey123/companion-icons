/**
 * Build the Shure wireless page, and the connections behind it.
 *
 * Usage: node tools/shure-page.js <prod-full.json> <shurePage> <homePage> <outfile>
 *
 * EVERY KEY ON THIS PAGE IS READ-ONLY. Nothing here has an action, so nothing can be changed
 * by pressing it — including the touchstrip. That is deliberate: this is the page you look at
 * when something sounds wrong, and a control that both reports and acts is a control you
 * press by accident. Only Home navigates.
 *
 * FOUR ULXD4Q QUAD RECEIVERS = 16 CHANNELS AGAINST 8 KEYS. Per-channel does not fit on the
 * keys, so the layout answers three questions at three levels of detail:
 *
 *   row 0/1  one key per rack, reporting its WORST channel's battery — "is anything low?"
 *   row 1    three summary keys across all 16 channels — RF, muted, and packs powered on
 *   row 2    the touchstrip, per-channel battery for each rack — "which one?"
 *
 * The touchstrip sits in the same COLUMN as the rack key it details, so the eye travels
 * straight down from the alarm to the channel causing it.
 *
 * WHAT IS NOT HERE, AND WHY. Battery runtime and charge percentage would be far more
 * actionable than bars, and the module publishes both — but this rig runs alkaline packs,
 * which report neither, so both variables read "Unknown" on every channel. Signal quality and
 * battery health are Axient-family variables and read "Not found" on ULXD/QLXD. All four were
 * checked against the live receivers before being dropped rather than assumed available.
 *
 * The expressions themselves live in src/shure.js so the test suite covers them; the
 * three-state readings they guard against are documented there.
 */
import fs from 'node:fs/promises'
import {
	battery,
	channelStrip,
	countOf,
	hasInterference,
	isMuted,
	isOn,
	rfBars,
	rfIconOverrides,
	worstOf,
	worstText,
	OFF,
} from '../src/shure.js'

const [, , src, pageArg, homeArg, out] = process.argv
if (!src || !pageArg || !homeArg || !out) {
	console.error('usage: node tools/shure-page.js <prod-full.json> <shurePage> <homePage> <outfile>')
	process.exit(1)
}
const PAGE = String(Number(pageArg))
const HOME = String(Number(homeArg))

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

/**
 * The four racks.
 *
 * Names come from what each rack actually holds, read off the receivers' own channel names
 * rather than invented. "Rack 3" tells you nothing at two minutes to service; "Lav 1-2" tells
 * you whose pack is flat.
 */
const RECEIVERS = [
	{ label: 'shure1', name: 'BGV 1-4', host: '10.23.0.18' },
	{ label: 'shure2', name: 'Lead 1-4', host: '10.23.0.22' },
	{ label: 'shure3', name: 'Lav 1-2', host: '10.23.0.212' },
	{ label: 'shure4', name: 'Host+BGV', host: '10.23.0.253' },
]

const CHANNELS = [1, 2, 3, 4]
const TOTAL = RECEIVERS.length * CHANNELS.length

const CARD_BG = 0x14161c
const NAV_BG = 0x1f2937
const WARN_AMBER = 0xa16207
const BAD_RED = 0xb91c1c

// ------------------------------------------------------------------ layers

const canvas = () => ({
	id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
	decoration: v('default'), showStatusIcons: v('default'),
})

const box = (bg) => ({
	id: 'box0', name: 'Background', usage: 'auto', type: 'box',
	enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
	color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
})

const text = (idName, name, geometry, content, color) => ({
	id: idName, name, usage: 'auto', type: 'text',
	enabled: v(true), opacity: v(100), ...geometry, rotation: v(0),
	...(typeof content === 'object' ? { text: content } : { text: v(content) }),
	color: v(color), halign: v('center'), valign: v('center'),
	fontsize: v(100), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
})

/** A square key: small icon badged top-right, label along the top, reading filling the rest. */
const cardLayers = ({ image, label, valueText, bg }) => [
	canvas(),
	box(bg),
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		// 42x34 rather than 28x26. At the smaller size the badge measured 33.6 x 31.2px against
		// a 120 x 67.2px key — present, but not readable. This is 50.4 x 40.8px, and costs the
		// label nothing because it only takes width the label was not using.
		enabled: v(true), opacity: v(100), x: v(56), y: v(2), width: v(42), height: v(34), rotation: v(0),
		base64Image: v(`$(image:${image})`),
	},
	{
		...text('text0', 'Label', { x: v(3), y: v(4), width: v(52), height: v(34) }, label, 0x9aa4b2),
		halign: v('left'),
	},
	text('text1', 'Value', { x: v(2), y: v(40), width: v(96), height: v(56) }, valueText, 0xffffff),
]

/**
 * A touchstrip segment: label over reading, both full width.
 *
 * The strip is 200x100 rather than square, so there is no room to badge an icon beside the
 * label — and no need, since the key above it already carries one. This is the same two-band
 * geometry the ProPresenter timer segments use, which is known to render correctly here.
 */
const stripLayers = ({ label, valueText, bg }) => [
	canvas(),
	box(bg),
	text('text0', 'Label', { x: v(2), y: v(2), width: v(96), height: v(42) }, label, 0x9aa4b2),
	text('text1', 'Value', { x: v(2), y: v(46), width: v(96), height: v(52) }, valueText, 0xffffff),
]

/** The Home key matches every other page rather than the card layout. */
const homeLayers = () => [
	canvas(),
	box(NAV_BG),
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100), x: v(0), y: v(2), width: v(100), height: v(56), rotation: v(0),
		base64Image: v('$(image:home)'),
	},
	{
		...text('text0', 'Label', { x: v(0), y: v(60), width: v(100), height: v(38) }, 'Home', 0xffffff),
		fontsize: v(70),
	},
]

// ------------------------------------------------------------------ feedbacks

/** Recolour the background when `expression` holds. */
const tint = (expression, colour) => ({
	id: id('fb'), definitionId: 'check_expression', connectionId: 'internal',
	options: { expression: expr(expression) },
	type: 'feedback', isInverted: v(false),
	styleOverrides: [{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(colour) }],
	children: {},
})

/** Swap the icon when `expression` holds. */
const swapIcon = (expression, image) => ({
	id: id('fb'), definitionId: 'check_expression', connectionId: 'internal',
	options: { expression: expr(expression) },
	type: 'feedback', isInverted: v(false),
	styleOverrides: [
		{ overrideId: id('ovr'), elementId: 'image0', elementProperty: 'base64Image', override: v(`$(image:${image})`) },
	],
	children: {},
})

const readOnly = (layers, feedbacks = []) => ({
	type: 'button-layered',
	style: { layers },
	options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
	feedbacks,
	// No actions at all — see the note at the top of this file.
	steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
})

// ------------------------------------------------------------------ the keys

/*
 * ICONS START NEUTRAL AND ARE LIT BY FEEDBACK, never the other way round.
 *
 * Every icon in the wireless family carries a colour as well as a shape — `rf-0` is red,
 * `mic-muted` is red — so a key whose BASE image is one of those shows a fault whenever the
 * rig is simply switched off. The base is therefore always the grey idle variant, and the
 * coloured ones arrive only when a live reading justifies them.
 */
const IDLE_MIC = 'mic-off'
const LIVE_MIC = 'mic-on'

/** One rack: worst battery of its four channels. */
function rackKey(rx) {
	const worst = worstOf(battery, [rx], CHANNELS)
	const on = countOf(isOn, [rx], CHANNELS)
	return readOnly(
		cardLayers({ image: IDLE_MIC, label: rx.name, valueText: expr(worstText(worst)), bg: CARD_BG }),
		[
			// Green mic as soon as anything in the rack is transmitting, grey while it sleeps.
			swapIcon(`${on} > 0`, LIVE_MIC),
			// Worse state last so it wins. Both exclude OFF, so an idle rack stays neutral.
			tint(`${worst} <= 2 && ${worst} != ${OFF}`, WARN_AMBER),
			tint(`${worst} <= 1 && ${worst} != ${OFF}`, BAD_RED),
		]
	)
}

/** Worst RF across every live channel, with the antenna icon tracking it. */
function rfKey() {
	const worst = worstOf(rfBars, RECEIVERS, CHANNELS)
	const interference = countOf(hasInterference, RECEIVERS, CHANNELS)
	return readOnly(
		cardLayers({ image: 'rf-idle', label: 'Signal', valueText: expr(worstText(worst)), bg: CARD_BG }),
		[
			...rfIconOverrides(worst).map((o) => swapIcon(o.expression, o.image)),
			tint(`${worst} <= 2 && ${worst} != ${OFF}`, WARN_AMBER),
			// Interference is a fault wherever it appears, not a matter of degree.
			tint(`(${worst} <= 1 && ${worst} != ${OFF}) || ${interference} > 0`, BAD_RED),
		]
	)
}

/** How many live channels are muted at the receiver. */
function mutedKey() {
	const muted = countOf(isMuted, RECEIVERS, CHANNELS)
	return readOnly(
		cardLayers({
			image: IDLE_MIC, label: 'Muted',
			// "None" rather than "0": the reassuring answer should read as a word, not a count.
			valueText: expr(`${muted} == 0 ? "None" : ${muted}`),
			bg: CARD_BG,
		}),
		[swapIcon(`${muted} > 0`, 'mic-muted'), tint(`${muted} > 0`, WARN_AMBER)]
	)
}

/** How many transmitters are powered on, against how many the racks can hold. */
function packsKey() {
	const on = countOf(isOn, RECEIVERS, CHANNELS)
	return readOnly(
		cardLayers({
			image: IDLE_MIC, label: 'Packs',
			valueText: expr(`concat(${on}, " of ${TOTAL}")`),
			bg: CARD_BG,
		}),
		// No tint: how many packs are on is a fact about the service, not a fault.
		[swapIcon(`${on} > 0`, LIVE_MIC)]
	)
}

/** One touchstrip segment: every channel in a rack, idle ones dashed. */
function rackStrip(rx) {
	return readOnly(stripLayers({ label: rx.name, valueText: expr(channelStrip(rx.label, CHANNELS)), bg: CARD_BG }))
}

const homeButton = () => ({
	type: 'button-layered',
	style: { layers: homeLayers() },
	options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
	feedbacks: [],
	steps: {
		0: {
			action_sets: {
				down: [{
					id: id('act'), definitionId: 'set_page', connectionId: 'internal',
					options: { surfaceId: v('self'), page: v(HOME) }, upgradeIndex: null, type: 'action',
				}],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
})

// ------------------------------------------------------------------ connections

/**
 * One connection per receiver — the module speaks to a single rack at a time.
 *
 * `variableFormat: "units"` is what makes rf_level read "-39 dBm"; src/shure.js strips the
 * suffix rather than reconfiguring four live receivers to get a bare number.
 */
const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages[PAGE])
if (!page) throw new Error(`no page ${PAGE} — create it in Companion first`)

const instances = structuredClone(full.instances)
let sortOrder = Math.max(0, ...Object.values(instances).filter((i) => i?.moduleId).map((i) => i.sortOrder ?? 0))

for (const rx of RECEIVERS) {
	const existing = Object.entries(instances).find(
		([, i]) => i?.moduleId === 'shure-wireless' && i?.config?.host === rx.host
	)
	if (existing) {
		console.log(`  connection ${rx.label} already exists for ${rx.host} — reusing`)
		continue
	}
	instances[`shure-${rx.host.replace(/\./g, '-')}`] = {
		moduleInstanceType: 'connection',
		moduleId: 'shure-wireless',
		moduleVersionId: '2.3.1',
		updatePolicy: 'stable',
		sortOrder: ++sortOrder,
		label: rx.label,
		isFirstInit: false,
		secrets: {},
		enabled: true,
		config: {
			host: rx.host, port: '2202', modelID: 'ulxd4q',
			meteringOn: true, meteringInterval: 5000, variableFormat: 'units',
		},
	}
	console.log(`  connection ${rx.label.padEnd(7)} ${rx.host}  model=ulxd4q port=2202`)
}

// ------------------------------------------------------------------ the page

/**
 * Row 2 is the touchstrip. Each rack's detail segment sits in the same column as its key, so
 * the eye travels straight down from an amber rack to the channel that caused it.
 */
const PLACEMENT = [
	['0', '0', 'Home', homeButton()],
	['0', '1', RECEIVERS[0].name, rackKey(RECEIVERS[0])],
	['0', '2', RECEIVERS[1].name, rackKey(RECEIVERS[1])],
	['0', '3', RECEIVERS[2].name, rackKey(RECEIVERS[2])],
	['1', '0', RECEIVERS[3].name, rackKey(RECEIVERS[3])],
	['1', '1', 'Signal', rfKey()],
	['1', '2', 'Muted', mutedKey()],
	['1', '3', 'Packs', packsKey()],
	['2', '0', `${RECEIVERS[3].name} detail`, rackStrip(RECEIVERS[3])],
	['2', '1', `${RECEIVERS[0].name} detail`, rackStrip(RECEIVERS[0])],
	['2', '2', `${RECEIVERS[1].name} detail`, rackStrip(RECEIVERS[1])],
	['2', '3', `${RECEIVERS[2].name} detail`, rackStrip(RECEIVERS[2])],
]

for (const [row, col, name, control] of PLACEMENT) {
	page.controls[row] ??= {}
	page.controls[row][col] = control
	console.log(`  ${row}/${col}  ${name}`)
}

// Clear any default nav keys the page shipped with.
for (const [row, cells] of Object.entries(page.controls)) {
	for (const [col, ctl] of Object.entries(cells)) {
		if (['pageup', 'pagedown', 'pagenum'].includes(ctl?.type)) {
			delete page.controls[row][col]
			console.log(`  removed default ${ctl.type} at ${row}/${col}`)
		}
	}
}

const actionCount = Object.values(page.controls)
	.flatMap((r) => Object.values(r))
	.flatMap((c) => Object.values(c.steps ?? {}))
	.flatMap((s) => s.action_sets?.down ?? []).length
if (actionCount !== 1) {
	throw new Error(`expected exactly one action on this page (Home), found ${actionCount}`)
}

await fs.writeFile(
	out,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(PAGE),
	})
)

console.log(`\n${actionCount} action on the page (Home). Every other key is read-only.`)
console.log(`wrote ${out}`)
