/**
 * Improve the ATEM page: preview tally, and a program/preview readout on the touchstrip.
 *
 * Usage: node tools/atem-page.js <prod-full.json> <outfile>
 *
 * What this does NOT do: it adds no new actions. The source buttons keep doing exactly what
 * they did (direct `program` selects), and no transition controls are invented — that would
 * be guessing at how the desk is operated.
 *
 * 1. PREVIEW TALLY. The source buttons already carry an `atem: program` feedback that turns
 *    them red when that input is live. There was no preview equivalent, so nothing on the
 *    deck showed what was cued. Each source button now also carries `atem: preview`, in
 *    green. Preview is listed BEFORE program so that if a source somehow sits on both,
 *    program wins — being live matters more than being cued.
 *
 * 2. TOUCHSTRIP READOUT. All four strip segments were unused. Two of them now show the live
 *    program and preview source names from the ATEM's own variables, so what is on air can
 *    be read directly instead of inferred from which key happens to be red.
 *
 * The icon on each state is chosen for contrast against that state's background, the same
 * paper/ink rule used everywhere else: dark icon on the light green preview, light icon on
 * the dark red program.
 */
import fs from 'node:fs/promises'

const [, , src, out] = process.argv
if (!src || !out) {
	console.error('usage: node tools/atem-page.js <prod-full.json> <outfile>')
	process.exit(1)
}

const v = (value) => ({ value, isExpression: false })

const PREVIEW_GREEN = 0x00a651
const PROGRAM_RED = 0xff0000

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages['4'])

const atemId = Object.entries(full.instances).find(([, i]) => i?.moduleId === 'bmd-atem')?.[0]
if (!atemId) throw new Error('no ATEM connection found')

/** Every button that selects a source, identified by having a `program` feedback. */
const SOURCE_CELLS = [
	['0', '1'],
	['0', '2'],
	['0', '3'],
	['1', '1'],
]

for (const [row, col] of SOURCE_CELLS) {
	const control = page.controls[row]?.[col]
	if (!control) throw new Error(`no control at ${row},${col}`)

	const program = (control.feedbacks ?? []).find((f) => f.definitionId === 'program')
	if (!program) throw new Error(`${row},${col} has no program feedback to mirror`)

	// Reuse the program feedback's own options so mixeffect/input stay in lockstep with it.
	const imageOverride = (program.styleOverrides ?? []).find(
		(o) => o.elementProperty === 'base64Image'
	)
	const inkIcon = String(imageOverride?.override?.value ?? '').replace('-paper', '-ink')

	const preview = {
		id: id('fb'),
		definitionId: 'preview',
		connectionId: atemId,
		options: structuredClone(program.options),
		type: 'feedback',
		isInverted: v(false),
		styleOverrides: [
			{ overrideId: id('ovr'), elementId: 'text0', elementProperty: 'color', override: v(0xffffff) },
			{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(PREVIEW_GREEN) },
			...(inkIcon
				? [
						{
							overrideId: id('ovr'),
							elementId: 'image0',
							elementProperty: 'base64Image',
							override: v(inkIcon),
						},
					]
				: []),
		],
		children: {},
	}

	// Preview first, program last: later feedbacks win, and live must beat cued.
	control.feedbacks = [preview, ...(control.feedbacks ?? [])]
}

/** A touchstrip readout: a fixed caption over a live source name. */
function readout(caption, variable, colour) {
	return {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
				{
					id: 'box0', name: 'Background', usage: 'auto', type: 'box',
					enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
					color: v(colour), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
				},
				{
					id: 'text0', name: 'Caption', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(4), y: v(4), width: v(92), height: v(30), rotation: v(0),
					text: v(caption), color: v(0xffffff), halign: v('left'), valign: v('center'),
					fontsize: v(22), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
				{
					id: 'text1', name: 'Source', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(4), y: v(34), width: v(92), height: v(60), rotation: v(0),
					text: v(`$(atem:${variable})`), color: v(0xffffff), halign: v('center'), valign: v('center'),
					fontsize: v(56), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
			],
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
		feedbacks: [],
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
	}
}

page.controls['2'] ??= {}
page.controls['2']['0'] = readout('PROGRAM', 'pgm1_input', PROGRAM_RED)
page.controls['2']['1'] = readout('PREVIEW', 'pvw1_input', PREVIEW_GREEN)

await fs.writeFile(
	out,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: 4,
	})
)

console.log(`wrote ${out}`)
console.log(`  preview tally added to ${SOURCE_CELLS.length} source buttons (green, program still wins)`)
console.log(`  touchstrip: PROGRAM -> $(atem:pgm1_input), PREVIEW -> $(atem:pvw1_input)`)
