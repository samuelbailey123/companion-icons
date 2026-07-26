/**
 * Improve the VideoHub page: show which route is actually live.
 *
 * Usage: node tools/vh-page.js <prod-full.json> <outfile>
 *
 * The two routing buttons were fire-and-forget — nothing indicated which source was
 * currently feeding the projectors, so the only way to know was to look at a screen.
 *
 * 1. The buttons now light green when their source is the one currently routed, using the
 *    router's own `output_1_input_id` variable. That is real state read back from the
 *    VideoHub, not an assumption about what was last pressed.
 *
 * 2. All four touchstrip segments now show a destination and the source feeding it, using
 *    the router's own labels. This is the part that scales: the same pattern extends to
 *    every destination as more keys become available.
 *
 * No routing actions are added or changed. The page keeps exactly the two routes it had.
 */
import fs from 'node:fs/promises'

const [, , src, out] = process.argv
if (!src || !out) {
	console.error('usage: node tools/vh-page.js <prod-full.json> <outfile>')
	process.exit(1)
}

const v = (value) => ({ value, isExpression: false })

const ACTIVE_GREEN = 0x00a651

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages['6'])

/**
 * Destinations worth watching. Outputs 1 and 2 are the projectors these buttons drive;
 * 8 and 10 are the other named destinations on the router, included so the strip shows
 * where video is going rather than only where these two buttons send it.
 */
const DESTINATIONS = [1, 2, 8, 10]

/** Which source each button selects, matched to the button that routes it. */
const BUTTONS = [
	{ cell: ['0', '1'], source: 1 },
	{ cell: ['1', '1'], source: 2 },
]

for (const { cell, source } of BUTTONS) {
	const control = page.controls[cell[0]]?.[cell[1]]
	if (!control) throw new Error(`no control at ${cell}`)

	const image = control.style.layers.find((l) => l.type === 'image')
	const inkIcon = String(image?.base64Image?.value ?? '').replace('-paper', '-ink')

	// Read the router's own state rather than tracking what was last pressed.
	control.feedbacks = [
		{
			id: id('fb'),
			definitionId: 'variable_value',
			connectionId: 'internal',
			options: {
				variable: v('videohub:output_1_input_id'),
				op: v('eq'),
				value: v(String(source)),
			},
			type: 'feedback',
			isInverted: v(false),
			styleOverrides: [
				{ overrideId: id('ovr'), elementId: 'text0', elementProperty: 'color', override: v(0xffffff) },
				{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(ACTIVE_GREEN) },
				...(inkIcon
					? [{ overrideId: id('ovr'), elementId: 'image0', elementProperty: 'base64Image', override: v(inkIcon) }]
					: []),
			],
			children: {},
		},
	]
}

/** A strip segment: destination name on top, the source feeding it underneath. */
function routeReadout(outputNumber) {
	return {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
				{
					id: 'box0', name: 'Background', usage: 'auto', type: 'box',
					enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
					color: v(0x111827), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
				},
				{
					id: 'text0', name: 'Destination', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(2), y: v(2), width: v(96), height: v(42), rotation: v(0),
					text: v(`$(videohub:output_${outputNumber})`),
					color: v(0xa78bfa), halign: v('center'), valign: v('center'),
					fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
				{
					id: 'text1', name: 'Source', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(2), y: v(46), width: v(96), height: v(52), rotation: v(0),
					text: v(`$(videohub:output_${outputNumber}_input)`),
					color: v(0xffffff), halign: v('center'), valign: v('center'),
					fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
			],
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
		feedbacks: [],
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
	}
}

page.controls['2'] ??= {}
for (const [index, output] of DESTINATIONS.entries()) {
	page.controls['2'][String(index)] = routeReadout(output)
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
		oldPageNumber: 6,
	})
)

console.log(`wrote ${out}`)
console.log(`  route buttons now light green when their source is live (via output_1_input_id)`)
console.log(`  touchstrip shows outputs ${DESTINATIONS.join(', ')} and the source feeding each`)
