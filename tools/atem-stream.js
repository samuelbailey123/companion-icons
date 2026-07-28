/**
 * Add guarded Stream and Record keys to the ATEM page.
 *
 * Usage: node tools/atem-stream.js <prod-full.json> <atemPageNumber> <outfile>
 *
 * The desk is a Television Studio HD8, whose model spec in the bmd-atem module declares
 * `streaming: true` and `recording: true` — so `streamStartStop` / `recordStartStop` and the
 * `streamStatus` / `recordStatus` feedbacks all exist for it. The ATEM already publishes
 * $(atem:stream_duration_hm) and $(atem:record_duration_hm), which is what the keys display.
 *
 * THE GUARD. Going live from a single keypress is the wrong default on a live rig, and a
 * hold gesture was ruled out. So Stream is a two-step button: the first press only arms it
 * (the key turns amber and says GO LIVE?), and the second press actually toggles the stream.
 *
 * Stopping ALSO takes two presses. That differs from what was first proposed — a single-press
 * stop would need the key's action to depend on current stream state, and the only way to do
 * that here leaves the button sitting in its armed step afterwards, where one more press
 * would start streaming again. A symmetric arm-then-confirm is both simpler and safer, and an
 * accidental stop mid-service is not much better than an accidental start.
 *
 * Step numbering: steps are keyed 0 and 1 in the config, but `$(this:step)` is ONE-based, so
 * the armed step reads as 2. Verified by reading b_step_5_0_0 off a live single-step button,
 * which reports 1 rather than 0.
 *
 * Record is a plain single-press toggle. Starting or stopping a recording by mistake costs a
 * file, not a broadcast, so it does not earn the extra press.
 */
import fs from 'node:fs/promises'

const [, , src, pageArg, out] = process.argv
if (!src || !pageArg || !out) {
	console.error('usage: node tools/atem-stream.js <prod-full.json> <atemPage> <outfile>')
	process.exit(1)
}
const PAGE = String(Number(pageArg))

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

/** atem-connection's StreamingStatus is a bitfield, not 0..3. Read from the module, not guessed. */
const STREAMING = 4

const IDLE_BG = 0x14161c
const ARMED_AMBER = 0xa16207
const LIVE_RED = 0xb91c1c
const REC_RED = 0xb91c1c

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages[PAGE])
if (!page) throw new Error(`no page ${PAGE}`)

const atemId = Object.entries(full.instances).find(([, i]) => i?.moduleId === 'bmd-atem')?.[0]
if (!atemId) throw new Error('no ATEM connection found')

const layers = ({ image, label, valueText, bg }) => [
	{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
	},
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		// 42x34 rather than the original 28x26. At the smaller size the badge measured
		// 33.6 x 31.2px against a 120 x 67.2px deck standard — present but not actually
		// readable. This is 50.4 x 40.8px, which reads at arm's length, and costs the label
		// nothing because it only takes width the label was not using.
		enabled: v(true), opacity: v(100), x: v(56), y: v(2), width: v(42), height: v(34), rotation: v(0),
		base64Image: v(`$(image:${image})`),
	},
	{
		id: 'text0', name: 'Label', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100), x: v(3), y: v(4), width: v(52), height: v(34), rotation: v(0),
		text: v(label), color: v(0xffffff), halign: v('left'), valign: v('center'),
		fontsize: v(100), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
	},
	{
		id: 'text1', name: 'Value', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100), x: v(2), y: v(40), width: v(96), height: v(56), rotation: v(0),
		text: v(valueText), color: v(0xffffff), halign: v('center'), valign: v('center'),
		fontsize: v(100), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
	},
]

const streamAction = (mode) => ({
	id: id('act'),
	definitionId: 'streamStartStop',
	connectionId: atemId,
	options: { stream: v(mode) },
	upgradeIndex: null,
	type: 'action',
})

/** Armed: the key is one press from changing the broadcast, so it says so. */
const armedFeedback = {
	id: id('fb'),
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr('$(this:step) == 2') },
	type: 'feedback',
	isInverted: v(false),
	styleOverrides: [
		{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(ARMED_AMBER) },
		{ overrideId: id('ovr'), elementId: 'text0', elementProperty: 'text', override: v('GO LIVE?') },
	],
	children: {},
}

/** Live wins over armed, so it is listed last. Red is the on-air convention. */
const liveFeedback = {
	id: id('fb'),
	definitionId: 'streamStatus',
	connectionId: atemId,
	options: { state: v(STREAMING) },
	type: 'feedback',
	isInverted: v(false),
	styleOverrides: [
		{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(LIVE_RED) },
		{ overrideId: id('ovr'), elementId: 'text0', elementProperty: 'text', override: v('ON AIR') },
	],
	children: {},
}

const streamButton = {
	type: 'button-layered',
	style: { layers: layers({ image: 'tally-live', label: 'Stream', valueText: '$(atem:stream_duration_hm)', bg: IDLE_BG }) },
	options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
	feedbacks: [armedFeedback, liveFeedback],
	steps: {
		// First press arms only — no action at all, so a stray press cannot reach the desk.
		0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } },
		// Second press toggles, then stepProgression returns the key to step 0.
		1: { action_sets: { down: [streamAction('toggle')], up: [] }, options: { runWhileHeld: [] } },
	},
}

const recordButton = {
	type: 'button-layered',
	style: { layers: layers({ image: 'still', label: 'Record', valueText: '$(atem:record_duration_hm)', bg: IDLE_BG }) },
	options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
	feedbacks: [
		{
			id: id('fb'),
			definitionId: 'recordStatus',
			connectionId: atemId,
			options: { state: v(STREAMING) },
			type: 'feedback',
			isInverted: v(false),
			styleOverrides: [
				{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(REC_RED) },
			],
			children: {},
		},
	],
	steps: {
		0: {
			action_sets: {
				down: [{
					id: id('act'), definitionId: 'recordStartStop', connectionId: atemId,
					options: { record: v('toggle') }, upgradeIndex: null, type: 'action',
				}],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
}

/** Only ever land on a key that is free and physically on the deck. */
const PLACEMENT = [
	['1', '0', 'Stream', streamButton],
	['1', '2', 'Record', recordButton],
]

for (const [row, col, name, control] of PLACEMENT) {
	if (page.controls[row]?.[col]) {
		throw new Error(`${row}/${col} is already occupied — refusing to overwrite it for ${name}`)
	}
	page.controls[row] ??= {}
	page.controls[row][col] = control
	console.log(`  ${row}/${col}  ${name}`)
}

await fs.writeFile(
	out,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(PAGE),
	})
)

console.log(`\nStream: press 1 arms (no action fires), press 2 toggles`)
console.log(`Record: single press toggles`)
console.log(`wrote ${out}`)
