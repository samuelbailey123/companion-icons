/**
 * MA2: an executor row across the top, and an icon on every key.
 *
 * Usage: node tools/ma2-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row
 *   row 1   executors 101-109, one per column
 *   row 2   Go Next            (shifted down one to make room)
 *   row 3   Go Back, BLACKOUT  (shifted down one)
 *   row 4   the fader readouts on the touchstrip, untouched
 *   row 5   the four encoders, untouched
 *
 * Existing keys move down a row and keep their column, so Go Next stays directly above Go Back
 * and BLACKOUT stays where the hand expects it relative to them. Nothing is rearranged beyond
 * the shift; the only new controls are the executors.
 *
 * THE EXECUTOR COMMAND IS A JUDGEMENT CALL, AND A DOCUMENTED ONE. grandMA2's command line has
 * no "press this executor's button as assigned" verb — its keywords each do one specific thing
 * (Go+, Toggle, Temp, Flash, On, Off), and which one matches a given executor depends on how
 * that executor's button was assigned on the desk. The desk does not report its assignments:
 * the whole grandma2 connection exposes exactly one variable, the last telnet response.
 *
 * So EXEC_VERB below is a choice, not a discovery. Toggle is the reversible one and suits a
 * look-per-executor rig; change this single constant to re-aim all nine keys.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'
import { COLORS, MIN_CONTRAST } from '../src/palette.js'
import { contrastRatio, contrastVariant } from '../src/wiring.js'
import { ICONS } from '../src/variants.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/ma2-page.js <live-full.json> <outdir>')
	process.exit(1)
}

/** The command each executor key sends. See the note above — this is a choice. */
const EXEC_VERB = 'Toggle'

/** Executors to lay across row 1, and the console page they live on. */
const EXEC_PAGE = 1
const EXECUTORS = [101, 102, 103, 104, 105, 106, 107, 108, 109]

/** Dark amber, the MA2 identity, so the row reads as belonging to this page. */
const EXEC_BG = 0x3a2e06

/** Existing keys, by label: the shape that belongs on them. */
const SHAPES = { 'Go Next': 'slide-next', 'Go Back': 'slide-prev', BLACKOUT: 'ftb' }

/**
 * Where each existing key lands, stated outright rather than shifted.
 *
 * The three keys currently sit stacked in one column on rows 1, 2 and 3. The executor row takes
 * row 1, which leaves two rows for three keys — a blanket shift would push BLACKOUT onto row 4,
 * the TOUCHSTRIP, on top of the House readout. So the transport pair stays stacked and BLACKOUT
 * moves to the far end of the bottom row.
 *
 * That is a deliberate change to muscle memory and the only one here. BLACKOUT kills every light
 * in the building; having it directly below the key you press repeatedly to advance cues is the
 * arrangement worth losing. At the opposite end of the row it cannot be reached by a hand going
 * for Go.
 */
const DESTINATIONS = {
	'Go Next': [2, 0],
	'Go Back': [3, 0],
	BLACKOUT: [3, COLUMNS - 1],
}

const v = (value) => ({ value, isExpression: false })
const hex = (n) => '#' + ((n ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6)

const NATURAL = new Map(ICONS.filter((i) => i.collection !== 'contrast').map((i) => [i.shape, i]))
const KNOWN = new Set(ICONS.map((i) => i.name))

/**
 * The icon name for a shape on a given background: keep its own colour where that is legible
 * here, fall back to the paper/ink pair where it is not.
 */
function iconFor(shape, background) {
	const natural = NATURAL.get(shape)
	const ratio = natural ? contrastRatio(COLORS[natural.color], hex(background)) : 0
	if (natural && ratio >= MIN_CONTRAST) return { name: natural.name, ratio, recoloured: false }

	const variant = contrastVariant(background)
	const name = `${shape}-${variant}`
	if (!KNOWN.has(name)) throw new Error(`the library has no icon "${name}"`)
	return { name, ratio: contrastRatio(COLORS[variant], hex(background)), recoloured: true }
}

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

const executorKey = (connectionId, number, icon) => ({
	type: 'button-layered',
	style: { layers: layers({ icon, label: String(number), bg: EXEC_BG }) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes: `${EXEC_VERB} Executor ${EXEC_PAGE}.${number}`,
	},
	feedbacks: [],
	steps: {
		0: {
			action_sets: {
				down: [
					{
						id: `ma2-exec-${number}`,
						definitionId: 'command',
						connectionId,
						options: { command: v(`${EXEC_VERB} Executor ${EXEC_PAGE}.${number}`) },
						upgradeIndex: null,
						type: 'action',
					},
				],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
	localVariables: [],
})

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

const number = pageNumbers.MA2
const source = full.pages[number]
const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'malighting-grandma2')
if (!found) throw new Error('no grandMA2 connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

if (EXECUTORS.length > COLUMNS) throw new Error(`${EXECUTORS.length} executors but only ${COLUMNS} columns`)

const page = structuredClone(source)
page.gridSize = { ...GRID_SIZE }
page.controls = {}

const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)
const layerOf = (control, type) => (control?.style?.layers ?? []).find((l) => l.type === type)
const labelOf = (control) =>
	(layerOf(control, 'text')?.text?.value ?? '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()

// Existing content: rows 1-3 shift down one to clear the executor row; strip and knobs stay.
const moved = []
for (const r of Object.keys(source.controls ?? {}).sort((a, b) => a - b)) {
	for (const c of Object.keys(source.controls[r]).sort((a, b) => a - b)) {
		const control = structuredClone(source.controls[r][c])
		const row = Number(r)
		if (row === 0) continue // the old folder row is rebuilt below

		const label = labelOf(control)

		/*
		 * Skip the executor keys this tool built last time — the row is regenerated from scratch
		 * below. Without this, a second run trips over its own output and has nowhere to put it,
		 * which is exactly what happened the first time MA2 was rebuilt after being converted.
		 */
		const actions = actionsOf(control)
		if (actions.length === 1 && actions[0].connectionId === connectionId &&
			actions[0].definitionId === 'command' &&
			String(actions[0].options?.command?.value ?? '').includes('Executor')) {
			continue
		}

		// The touchstrip and encoders stay exactly where they are; keys go where DESTINATIONS says.
		const [toRow, toCol] = row >= 4 ? [row, Number(c)] : (DESTINATIONS[label] ?? [])
		if (toRow === undefined) throw new Error(`${r}/${c} "${label}" has no destination — add it to DESTINATIONS`)
		if (toRow === 1) throw new Error(`${r}/${c} "${label}" would land on the executor row`)
		if (row < 4 && (toRow === 4 || toRow === 5)) {
			throw new Error(`${r}/${c} "${label}" would land on the touchstrip or encoder row`)
		}
		const to = toRow
		const shape = SHAPES[label]
		if (shape) {
			const background = layerOf(control, 'box')?.color?.value ?? 0
			const { name, ratio, recoloured } = iconFor(shape, background)
			const image = layerOf(control, 'image')
			if (image) image.base64Image = v(`$(image:${name})`)
			else {
				// MA2's keys have no image layer at all — this page never had icons.
				const idx = control.style.layers.findIndex((l) => l.type === 'text')
				control.style.layers.splice(idx, 0, layers({ icon: name, label, bg: background })[2])
				const text = layerOf(control, 'text')
				text.y = v(46)
				text.height = v(52)
				text.fontsize = v(51)
				text.fontsizeAllowShrink = v(true)
			}
			moved.push(`${r}/${c} -> ${to}/${toCol}  ${label.padEnd(9)} ${name.padEnd(16)} ${ratio.toFixed(2)}:1${recoloured ? '  (recoloured)' : ''}`)
		} else {
			moved.push(`${r}/${c} -> ${to}/${toCol}  ${label || '(readout)'}`)
		}

		page.controls[to] ??= {}
		if (page.controls[to][toCol]) throw new Error(`two controls both land on ${to}/${toCol}`)
		page.controls[to][toCol] = control
	}
}

// The executor row.
const execIcon = iconFor('executor', EXEC_BG)
page.controls[1] = {}
for (const [column, exec] of EXECUTORS.entries()) {
	page.controls[1][column] = executorKey(connectionId, exec, execIcon.name)
}

page.controls[0] = navRow('MA2', pageNumbers)

for (const m of moved) console.log(`  ${m}`)
console.log(
	`  executors ${EXECUTORS[0]}-${EXECUTORS.at(-1)} on row 1, each sending ` +
		`"${EXEC_VERB} Executor ${EXEC_PAGE}.<n>"  icon ${execIcon.name} ${execIcon.ratio.toFixed(2)}:1`
)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-ma2.companionconfig`)
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
