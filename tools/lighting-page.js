/**
 * Rebuild the grandMA2 lighting page's knobs and touchstrip.
 *
 * Usage: node tools/lighting-page.js <prod-full.json> <outfile>
 *
 * What changes, and why:
 *
 * 1. The knobs sent `Executor 1.N At + 10` — relative, open-loop and unclamped, which is
 *    why the level could climb past 100. They now compute an absolute value, clamp it to
 *    0..100, send `Executor 1.N At <value>`, and store the same number in a variable so the
 *    strip can display it.
 *
 * 2. Pressing a knob selects that executor on the desk, so the existing Go / Go Back keys
 *    (which emulate the console's GO+ / GO- hardware buttons, and therefore act on the
 *    desk's *selected* executor) apply to whichever fader you last touched.
 *
 * 3. The touchstrip above each knob now shows the name, the level as a number, and a bar
 *    gauge — and highlights when that executor is the selected one.
 *
 * HONEST LIMITATION: nothing here is closed-loop. The grandMA2 Companion module exposes a
 * single variable (the last Telnet echo) and the OSC connection has never received a
 * message, so the desk cannot currently tell Companion anything. These values track what
 * Companion *sent*. Move a fader on the console and the display will be stale until the
 * knob is next turned. Clamping removes the runaway; only OSC feedback would make it true.
 */
import fs from 'node:fs/promises'

const [, , src, out] = process.argv
if (!src || !out) {
	console.error('usage: node tools/lighting-page.js <prod-full.json> <outfile>')
	process.exit(1)
}

const STEP = 10

/** The four executors, in knob order. */
const FADERS = [
	{ exec: '1.1', name: 'House', variable: 'fader1_level' },
	{ exec: '1.2', name: 'Stage', variable: 'fader2_level' },
	{ exec: '1.3', name: 'Background', variable: 'fader3_level' },
	{ exec: '1.4', name: 'Colors', variable: 'fader4_level' },
]

/** Which executor the desk is pointed at, so the strip can highlight it. */
const SELECTED = 'selected_exec'

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

/** Clamped new level, as a Companion expression over the variable's current value. */
const nextLevel = (variable, dir) =>
	dir === 'up'
		? `min(100, $(internal:custom_${variable}) + ${STEP})`
		: `max(0, $(internal:custom_${variable}) - ${STEP})`

function rotateActions(fader, dir, connectionId) {
	// ORDER MATTERS. The variable is clamped and stored FIRST, then the command reads it
	// back by plain interpolation.
	//
	// The grandMA2 module declares module-API 1.8.0, which predates expression-typed
	// options — it cannot evaluate `isExpression: true`, so an expression here is simply
	// never formed and the desk receives nothing at all. Plain `$(...)` interpolation is
	// handled by Companion core before the module ever sees the value, so it works on any
	// module regardless of API version.
	return [
		{
			id: id('act'),
			definitionId: 'custom_variable_set_value',
			connectionId: 'internal',
			options: {
				name: v(fader.variable),
				value: expr(dir === 'up' ? `min(100, $(this:current) + ${STEP})` : `max(0, $(this:current) - ${STEP})`),
			},
			upgradeIndex: null,
			type: 'action',
		},
		{
			id: id('act'),
			definitionId: 'command',
			connectionId,
			options: { command: v(`Executor ${fader.exec} At $(internal:custom_${fader.variable})`) },
			upgradeIndex: null,
			type: 'action',
		},
	]
}

function pressActions(fader, index, connectionId) {
	return [
		{
			id: id('act'),
			definitionId: 'command',
			connectionId,
			options: { command: v(`Select Executor ${fader.exec}`) },
			upgradeIndex: null,
			type: 'action',
		},
		{
			id: id('act'),
			definitionId: 'custom_variable_set_value',
			connectionId: 'internal',
			options: { name: v(SELECTED), value: v(String(index + 1)) },
			upgradeIndex: null,
			type: 'action',
		},
	]
}

/** A knob: rotate to set level, press to select. */
function knob(fader, index, connectionId) {
	return {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
				{
					id: 'text0', name: 'Text', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
					text: v(fader.name), color: v(0xffffff), halign: v('center'), valign: v('center'),
					fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
			],
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: true, canModifyStyleInApis: false, notes: '' },
		feedbacks: [],
		steps: {
			0: {
				action_sets: {
					down: pressActions(fader, index, connectionId),
					up: [],
					rotate_left: rotateActions(fader, 'down', connectionId),
					rotate_right: rotateActions(fader, 'up', connectionId),
				},
				options: { runWhileHeld: [] },
			},
		},
	}
}

/** A touchstrip segment: name, level, gauge, and a highlight when selected. */
function strip(fader, index) {
	const selected = `$(internal:custom_${SELECTED}) == ${index + 1}`
	return {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
				{
					id: 'box0', name: 'Background', usage: 'auto', type: 'box',
					enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
					// Blue when this executor is the one Go / Go Back will drive.
					color: expr(`${selected} ? 2970272 : 1184274`),
					borderWidth: expr(`${selected} ? 6 : 0`),
					borderColor: v(0x38bdf8),
					borderPosition: v('inside'),
				},
				// A level bar built from two boxes rather than the `gauge` element.
				// The gauge rendered at full width regardless of its `value`, and after
				// several attempts I could not get it to track the variable; a box whose
				// width is an expression is a primitive that demonstrably works.
				{
					id: 'track0', name: 'Track', usage: 'auto', type: 'box',
					enabled: v(true), opacity: v(100), x: v(6), y: v(64), width: v(88), height: v(22), rotation: v(0),
					color: v(0x1f2937), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
				},
				{
					id: 'fill0', name: 'Level', usage: 'auto', type: 'box',
					enabled: v(true), opacity: v(100), x: v(6), y: v(64),
					// 88% of the button is the full track, so scale the 0..100 level into it.
					width: expr(`max(0, min(100, $(internal:custom_${fader.variable}))) * 0.88`),
					height: v(22), rotation: v(0),
					color: v(0x38bdf8), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
				},
				{
					id: 'text0', name: 'Name', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(4), y: v(4), width: v(60), height: v(50), rotation: v(0),
					text: v(fader.name), color: v(0xffffff), halign: v('left'), valign: v('center'),
					fontsize: v(30), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
				{
					id: 'text1', name: 'Level', usage: 'auto', type: 'text',
					enabled: v(true), opacity: v(100), x: v(58), y: v(4), width: v(38), height: v(50), rotation: v(0),
					text: v(`$(internal:custom_${fader.variable})%`),
					color: v(0x38bdf8), halign: v('right'), valign: v('center'),
					fontsize: v(34), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
				},
			],
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
		feedbacks: [],
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
	}
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages['3'])

const ma2 = Object.entries(full.instances).find(([, i]) => i?.moduleId === 'malighting-grandma2')?.[0]
if (!ma2) throw new Error('no grandMA2 connection found in the export')

for (const [index, fader] of FADERS.entries()) {
	page.controls['2'][String(index)] = strip(fader, index)
	page.controls['3'][String(index)] = knob(fader, index, ma2)
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
		oldPageNumber: 3,
	})
)

console.log(`wrote ${out}`)
for (const [i, f] of FADERS.entries()) {
	console.log(`  knob ${i + 1}  Executor ${f.exec}  ${f.name.padEnd(11)} turn: At 0-100 (step ${STEP})   press: Select Executor ${f.exec}`)
}
