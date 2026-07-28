/**
 * Build the Shure wireless page, one key per receiver, and the connections behind it.
 *
 * Usage: node tools/shure-page.js <prod-full.json> <shurePage> <homePage> <outfile>
 *
 * FOUR ULXD4Q QUAD RECEIVERS = 16 CHANNELS, AND A PAGE HAS 8 VISIBLE KEYS. Per-channel does
 * not fit, so each key covers one receiver and reports its WORST channel. That answers the
 * only question worth asking mid-service — "is any pack about to die?" — without needing to
 * know which slot it is in. The receiver's own display tells you that once you have walked
 * over to it.
 *
 * THE TRAP THIS AVOIDS. A channel's battery reading has THREE states, not one:
 *
 *   - a number 0..5, when a transmitter is powered and reporting
 *   - the STRING "Unknown", when the transmitter is switched off:
 *         i = 255 == s.batteryBars ? "Unknown" : s.batteryBars
 *   - EMPTY, when that channel has never reported at all — observed live on rack 3
 *     channels 3 and 4, which stay empty indefinitely rather than settling to "Unknown"
 *
 * A plain `min()` breaks on both non-numeric states: "Unknown" poisons the result, and an
 * empty string coerces to 0, which is worse — it pins the key to red on a rack whose mics
 * are simply not in use. Either way the page would cry wolf every service until ignored.
 *
 * So every channel goes through a guard substituting an OFF sentinel above any real bar
 * count, and only genuinely powered transmitters can be the worst case.
 *
 * When no channel on a receiver is live the key reads "—" and stays neutral: nothing is
 * wrong, there is just nothing to report.
 *
 * Concatenation uses concat(). In Companion expressions `&` is bitwise AND and `+` on a
 * string yields NaN — both fail silently, which is worse than erroring.
 */
import fs from 'node:fs/promises'

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

/** The four racks, in the order they sit in the building. */
const RECEIVERS = [
	{ label: 'shure1', name: 'Rack 1', host: '10.23.0.18' },
	{ label: 'shure2', name: 'Rack 2', host: '10.23.0.22' },
	{ label: 'shure3', name: 'Rack 3', host: '10.23.0.212' },
	{ label: 'shure4', name: 'Rack 4', host: '10.23.0.253' },
]

const CHANNELS = [1, 2, 3, 4]

/** Above any real bar count, so an off transmitter can never be the worst case. */
const OFF = 9

const CARD_BG = 0x14161c
const NAV_BG = 0x1f2937
const WARN_AMBER = 0xa16207
const BAD_RED = 0xb91c1c

/**
 * Worst battery bars across the powered channels of one receiver.
 * Each channel is guarded so "Unknown" (transmitter off) cannot win.
 */
const worstBattery = (label) =>
	`min(${CHANNELS.map((c) => {
		const ref = `$(${label}:ch_${c}_battery_bars)`
		// Both non-numeric states must be excluded — see the note at the top of this file.
		return `(${ref} == "Unknown" || ${ref} == "" ? ${OFF} : ${ref})`
	}).join(', ')})`

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages[PAGE])
if (!page) throw new Error(`no page ${PAGE} — create it in Companion first`)

const layers = ({ image, label, valueText, bg }) => [
	{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
	},
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100), x: v(70), y: v(3), width: v(28), height: v(26), rotation: v(0),
		base64Image: v(`$(image:${image})`),
	},
	{
		id: 'text0', name: 'Label', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100), x: v(3), y: v(4), width: v(64), height: v(34), rotation: v(0),
		text: v(label), color: v(0x9aa4b2), halign: v('left'), valign: v('center'),
		fontsize: v(100), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
	},
	{
		id: 'text1', name: 'Value', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100), x: v(2), y: v(40), width: v(96), height: v(56), rotation: v(0),
		...(typeof valueText === 'object' ? { text: valueText } : { text: v(valueText) }),
		color: v(0xffffff), halign: v('center'), valign: v('center'),
		fontsize: v(100), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
	},
]

const threshold = (expression, colour) => ({
	id: id('fb'),
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	type: 'feedback',
	isInverted: v(false),
	styleOverrides: [
		{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(colour) },
	],
	children: {},
})

function receiverButton(rx) {
	const worst = worstBattery(rx.label)
	return {
		type: 'button-layered',
		style: {
			layers: layers({
				image: 'mic-on',
				label: rx.name,
				// "—" while every transmitter is off, otherwise "3/5".
				valueText: expr(`${worst} == ${OFF} ? "—" : concat(${worst}, "/5")`),
				bg: CARD_BG,
			}),
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
		// Worse state last so it wins. Both exclude OFF, so an idle rack stays neutral.
		feedbacks: [
			threshold(`${worst} <= 2 && ${worst} != ${OFF}`, WARN_AMBER),
			threshold(`${worst} <= 1 && ${worst} != ${OFF}`, BAD_RED),
		],
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
	}
}

const homeButton = () => ({
	type: 'button-layered',
	style: { layers: layers({ image: 'home', label: '', valueText: 'Home', bg: NAV_BG }) },
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
 * These are new instances, so the import dialog will offer to create them.
 */
const instances = structuredClone(full.instances)
let sortOrder = Math.max(0, ...Object.values(instances).filter((i) => i?.moduleId).map((i) => i.sortOrder ?? 0))

for (const rx of RECEIVERS) {
	const existing = Object.entries(instances).find(
		([, i]) => i?.moduleId === 'shure-wireless' && i?.config?.host === rx.host,
	)
	if (existing) {
		console.log(`  connection ${rx.label} already exists for ${rx.host} — reusing`)
		rx.connectionId = existing[0]
		continue
	}
	const key = `shure-${rx.host.replace(/\./g, '-')}`
	instances[key] = {
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
			host: rx.host,
			port: '2202',
			modelID: 'ulxd4q',
			meteringOn: true,
			meteringInterval: 5000,
			variableFormat: 'units',
		},
	}
	rx.connectionId = key
	console.log(`  connection ${rx.label.padEnd(7)} ${rx.host}  model=ulxd4q port=2202`)
}

// ------------------------------------------------------------------ the page

const CELLS = [['0', '1'], ['0', '2'], ['0', '3'], ['1', '1']]

page.controls['0'] ??= {}
if (page.controls['0']['0'] && page.controls['0']['0'].type !== 'pageup') {
	console.log('  0/0 already occupied — replacing with Home')
}
page.controls['0']['0'] = homeButton()

for (const [i, rx] of RECEIVERS.entries()) {
	const [row, col] = CELLS[i]
	page.controls[row] ??= {}
	page.controls[row][col] = receiverButton(rx)
	console.log(`  ${row}/${col}  ${rx.name}  worst-of-4 battery`)
}

// Clear the auto-created nav keys the new page shipped with.
for (const [row, cells] of Object.entries(page.controls)) {
	for (const [col, ctl] of Object.entries(cells)) {
		if (ctl?.type === 'pageup' || ctl?.type === 'pagedown' || ctl?.type === 'pagenum') {
			delete page.controls[row][col]
			console.log(`  removed default ${ctl.type} at ${row}/${col}`)
		}
	}
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

console.log(`\nworst-battery expression per receiver:\n  ${worstBattery('shure1')}`)
console.log(`\nwrote ${out}`)
