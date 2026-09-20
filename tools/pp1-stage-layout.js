/**
 * PP1: one key that swaps the stage screen between its two service layouts.
 *
 * Usage: node tools/pp1-stage-layout.js <live-full.json> <outdir>
 *
 * WHAT IT SWAPS. ProPresenter drives the backwall/stage screen from a "stage layout". Two of
 * them matter during a service: "Full" for everything else, and "MultiTracks Chords + Lyrics"
 * for the band. Changing it means finding the stage screen in ProPresenter and picking a
 * layout from a list, on a Sunday with the screens live. This does it in one press.
 *
 * THE KEY SHOWS THE TRUTH, NOT A GUESS. The module publishes the live layout per screen as
 * `stagescreen_<uuid>_layout`, so the key reads what ProPresenter actually has rather than
 * remembering what it last sent. That matters because the layout can also be changed from
 * ProPresenter itself, and a toggle that tracked its own presses would then be inverted — the
 * classic stale-toggle fault, and one you would only discover mid-service.
 *
 * For the same reason the press branches on that variable rather than stepping: Full goes to
 * Chords, anything else goes to Full. Land on some third layout — Blank, say, or "Woship and
 * Sermon 1" — and the key names it in amber and the next press returns you to Full, which is
 * the state you want to get back to in a hurry.
 *
 * NAMES, NOT INDEXES. The screen and both layouts are looked up live against ProPresenter's
 * own API at build time, by the names the operator sees, and their UUIDs written into the key.
 * A UUID survives someone reordering the layout list; the index in ProPresenter's UI (Full is
 * the 3rd, MultiTracks the 4th) does not.
 *
 * NO GLYPH. This key's whole job is to say which layout is live, so the caption IS the
 * information — the same reasoning that took the icon off the timer readouts. A shape would
 * only compete with it for a 112px key.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-stage-layout.js <live-full.json> <outdir>')
	process.exit(1)
}

/** The stage screen and the two layouts, by the names the operator sees in ProPresenter. */
const SCREEN = 'Stage Screen'
const FULL = 'Full'
const CHORDS = 'MultiTracks Chords + Lyrics'

/** What the key says for each, since the real name does not fit a 112px key. */
const SHORT = { [FULL]: 'Full', [CHORDS]: 'Chords' }

/** The key: its cell, beside the other "fire this in ProPresenter" keys on row 2. */
const CELL = { row: 2, column: 5 }
const NAME = 'Stage'

const BG = 0x1f2937
const CHORDS_BG = 0x0f766e
const OTHER_BG = 0xd97706

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'renewedvision-propresenter-api')
if (!found) throw new Error('no ProPresenter connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

/** ProPresenter's own API, at the address the Companion connection uses. GETs need no login. */
async function propresenter(route) {
	const url = `http://${instance.config.host}:${instance.config.port}/v1${route}`
	const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
	if (!res.ok) throw new Error(`ProPresenter ${route}: HTTP ${res.status}`)
	return res.json()
}

const screens = await propresenter('/stage/screens')
const screen = screens.find((s) => (s.id?.name ?? s.name) === SCREEN)
if (!screen) {
	const names = screens.map((s) => s.id?.name ?? s.name).join(', ')
	throw new Error(`ProPresenter has no stage screen called "${SCREEN}" (has: ${names})`)
}
const screenUuid = screen.id?.uuid ?? screen.uuid

const layouts = await propresenter('/stage/layouts')
const byName = Object.fromEntries(layouts.map((l) => [l.id.name, l.id.uuid]))
for (const wanted of [FULL, CHORDS]) {
	if (!byName[wanted]) {
		throw new Error(`ProPresenter has no stage layout called "${wanted}" (has: ${Object.keys(byName).join(', ')})`)
	}
}
console.log(`  screen "${SCREEN}" ${screenUuid}`)
for (const wanted of [FULL, CHORDS]) console.log(`  layout "${wanted}" ${byName[wanted]}`)

/** The module names its per-screen variable with the dashes stripped out of the uuid. */
const LIVE = `$(propresenter:stagescreen_${screenUuid.replace(/-/g, '')}_layout)`

const setLayout = (id, layoutName) => ({
	id,
	definitionId: 'stageDisplayOperation',
	connectionId,
	options: {
		stagedisplay_operation: v('set_layout'),
		stage_message_text: v(''),
		stagescreen_id_dropdown: v(screenUuid),
		stagescreen_id_text: v(''),
		stagescreenlayout_id_dropdown: v(byName[layoutName]),
		stagescreenlayout_id_text: v(''),
	},
	upgradeIndex: null,
	type: 'action',
})

const when = (id, expression, styleOverrides = []) => ({
	id,
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	type: 'feedback',
	isInverted: v(false),
	styleOverrides,
	children: {},
})

const override = (overrideId, elementId, elementProperty, value) => ({
	overrideId,
	elementId,
	elementProperty,
	override: v(value),
})

const page = structuredClone(full.pages[number])

/** A control's name line, so the cell guard can recognise this tool's own key. */
const nameOf = (control) =>
	((control?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '')
		.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const occupant = page.controls[CELL.row]?.[CELL.column]
if (occupant && nameOf(occupant) !== NAME) {
	throw new Error(`${CELL.row}/${CELL.column} on PP1 is taken by "${nameOf(occupant)}"; move CELL`)
}

page.controls[CELL.row] ??= {}
page.controls[CELL.row][CELL.column] = {
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
				color: v(BG), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
			},
			{
				id: 'text0', name: 'Name', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(4), width: v(100), height: v(34), rotation: v(0),
				text: v(NAME), color: v(0xffffff),
				halign: v('center'), valign: v('center'),
				fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
			{
				id: 'text1', name: 'Layout', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(38), width: v(100), height: v(58), rotation: v(0),
				text: v(LIVE), color: v(0xffffff),
				halign: v('center'), valign: v('center'),
				fontsize: v(90), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
		],
	},
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false,
		notes:
			`Swaps the "${SCREEN}" (${screenUuid}) stage layout between "${FULL}" and "${CHORDS}". ` +
			`The caption is the layout ProPresenter reports, not what this key last sent, so a change ` +
			`made in ProPresenter shows here too. On any other layout the key names it in amber and the ` +
			`next press returns to "${FULL}". Layout UUIDs read live from ProPresenter; re-run ` +
			`tools/pp1-stage-layout.js if a layout is deleted and recreated.`,
	},
	/*
	 * The caption is the raw variable, shortened by a feedback rather than by an expression.
	 * Both layout names are too long for a 112px key, but a ternary in the text layer is a
	 * parse waiting to go wrong on a Sunday; a style override is the mechanism this rig
	 * already uses elsewhere and it cannot fail to render. An unrecognised layout matches
	 * neither override, so it keeps its real name and turns amber.
	 */
	feedbacks: [
		when(`pp1-stage-other`, `${LIVE} != "${FULL}" && ${LIVE} != "${CHORDS}"`, [
			override('pp1-stage-other-bg', 'box0', 'color', OTHER_BG),
		]),
		when(`pp1-stage-full`, `${LIVE} == "${FULL}"`, [
			override('pp1-stage-full-text', 'text1', 'text', SHORT[FULL]),
		]),
		when(`pp1-stage-chords`, `${LIVE} == "${CHORDS}"`, [
			override('pp1-stage-chords-bg', 'box0', 'color', CHORDS_BG),
			override('pp1-stage-chords-text', 'text1', 'text', SHORT[CHORDS]),
		]),
	],
	steps: {
		0: {
			action_sets: {
				down: [
					{
						id: 'pp1-stage-if-full',
						definitionId: 'logic_if',
						connectionId: 'internal',
						options: {},
						upgradeIndex: null,
						type: 'action',
						children: {
							condition: [when('pp1-stage-cond-full', `${LIVE} == "${FULL}"`)],
							actions: [setLayout('pp1-stage-to-chords', CHORDS)],
							else_actions: [setLayout('pp1-stage-to-full', FULL)],
						},
					},
				],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
	localVariables: [],
}

console.log(`  ${CELL.row}/${CELL.column}  ${NAME}  "${FULL}" <-> "${CHORDS}"`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-pp1.companionconfig`)
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
