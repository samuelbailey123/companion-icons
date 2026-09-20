/**
 * PP1: one key that swaps the stage screen between its two service layouts.
 *
 * Usage: node tools/pp1-stage-layout.js <live-full.json> <outdir>
 *   then: node tools/rig.js create-vars <outdir>/page-3-pp1.companionconfig
 *         node tools/rig.js import-page <outdir>/page-3-pp1.companionconfig 3
 *         node tools/rig.js import <outdir>/triggers.companionconfig triggers
 *
 * WHAT IT SWAPS. ProPresenter drives the backwall/stage screen from a "stage layout". Two of
 * them matter during a service: "Full" for everything else, and "MultiTracks Chords + Lyrics"
 * for the band. Changing it means finding the stage screen in ProPresenter and picking a
 * layout from a list, on a Sunday with the screens live. This does it in one press.
 *
 * THE MODULE'S OWN VARIABLE IS A TRAP, AND THIS KEY FELL IN IT. The ProPresenter module
 * publishes `stagescreen_<uuid>_layout`, and the first version of this key branched on it.
 * The module only writes that variable from its `stageScreensUpdated` status callback, and on
 * this rig that callback does not fire: measured with ProPresenter reporting "Full" while the
 * variable sat on "MultiTracks Chords + Lyrics" indefinitely, six seconds apart and minutes
 * after the change. So the condition `== "Full"` was never true, every press fell through to
 * the else branch, and the key only ever set Full — "Chords to Full works, Full to Chords does
 * nothing", which is exactly how it was reported.
 *
 * SO THE STATE IS POLLED, NOT BORROWED. A trigger asks ProPresenter itself every two seconds
 * and writes the layout name into `pp1_stage_layout` — the pattern this rig already uses for
 * the PTZ cameras, the system stats and the projector. The key branches on that, and the
 * caption reads it, so both agree with the machine that actually knows.
 *
 * AND THE KEY WRITES IT TOO, on press, before the poller catches up. Two seconds of a key
 * showing the old layout after you pressed it is two seconds of pressing it again. The poller
 * remains the authority — it will correct an optimistic write that ProPresenter refused — but
 * the common case is instant.
 *
 * NAMES, NOT INDEXES. The screen and both layouts are looked up live against ProPresenter's
 * own API at build time, by the names the operator sees, and their UUIDs written into the key.
 * A UUID survives someone reordering the layout list; the index in ProPresenter's UI (Full is
 * the 3rd, MultiTracks the 4th) does not.
 *
 * NO GLYPH. This key's whole job is to say which layout is live, so the caption IS the
 * information — the same reasoning that took the icon off the timer readouts.
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

/** Where the polled truth lives, and how often the trigger refreshes it. */
const STATE = 'pp1_stage_layout'
const POLL_SECONDS = 2
const TRIGGER_NAME = 'Poll stage layout'

/** The key: its cell, beside the other "fire this in ProPresenter" keys on row 2. */
const CELL = { row: 2, column: 5 }
const NAME = 'Stage'

const BG = 0x1f2937
const CHORDS_BG = 0x0f766e
const OTHER_BG = 0xd97706

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'renewedvision-propresenter-api')
if (!found) throw new Error('no ProPresenter connection on this rig')
const [connectionId, instance] = found
const HOST = `${instance.config.host}:${instance.config.port}`
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}  at ${HOST}`)

/** ProPresenter's own API, at the address the Companion connection uses. GETs need no login. */
async function propresenter(route) {
	const res = await fetch(`http://${HOST}/v1${route}`, { signal: AbortSignal.timeout(6000) })
	if (!res.ok) throw new Error(`ProPresenter ${route}: HTTP ${res.status}`)
	return res.json()
}

const screens = await propresenter('/stage/screens')
const screen = screens.find((s) => (s.id?.name ?? s.name) === SCREEN)
if (!screen) {
	throw new Error(`ProPresenter has no stage screen called "${SCREEN}" (has: ${screens.map((s) => s.id?.name ?? s.name).join(', ')})`)
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

/** The polled state, read by the caption, the feedbacks and the branch alike. */
const LIVE = `$(internal:custom_${STATE})`

/**
 * The poll: ProPresenter's own layout endpoint, reduced to the bare name.
 *
 * `sed` rather than a JSON parser so the command depends on nothing installed on the Pi, and
 * `-m 2` so a ProPresenter that is busy or gone cannot back the poller up behind itself.
 */
const POLL = `curl -s -m 2 http://${HOST}/v1/stage/screen/${screenUuid}/layout | sed -n 's/.*"name" *: *"\\([^"]*\\)".*/\\1/p'`

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

/** Optimistic local write, so the key does not lag a press by a poll interval. */
const noteLayout = (id, layoutName) => ({
	id,
	definitionId: 'custom_variable_set_value',
	connectionId: 'internal',
	options: { name: v(STATE), create: v(true), value: v(layoutName) },
	type: 'action',
	children: {},
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
			`State comes from the "${TRIGGER_NAME}" trigger, which polls ProPresenter every ` +
			`${POLL_SECONDS}s into ${STATE} — NOT from the module's own stagescreen_<uuid>_layout ` +
			`variable, which never updates on this rig and made an earlier version of this key ` +
			`only ever set "${FULL}". The press also writes ${STATE} itself so the caption does not ` +
			`lag a press. On any other layout the key names it in amber and the next press returns ` +
			`to "${FULL}".`,
	},
	/*
	 * The caption is the raw variable, shortened by a feedback rather than by an expression.
	 * Both layout names are too long for a 112px key, but a ternary in the text layer is a
	 * parse waiting to go wrong on a Sunday; a style override is the mechanism this rig
	 * already uses elsewhere and it cannot fail to render. An unrecognised layout matches
	 * neither override, so it keeps its real name and turns amber.
	 */
	feedbacks: [
		when('pp1-stage-other', `${LIVE} != "${FULL}" && ${LIVE} != "${CHORDS}"`, [
			override('pp1-stage-other-bg', 'box0', 'color', OTHER_BG),
		]),
		when('pp1-stage-full', `${LIVE} == "${FULL}"`, [
			override('pp1-stage-full-text', 'text1', 'text', SHORT[FULL]),
		]),
		when('pp1-stage-chords', `${LIVE} == "${CHORDS}"`, [
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
							actions: [setLayout('pp1-stage-to-chords', CHORDS), noteLayout('pp1-stage-note-chords', CHORDS)],
							else_actions: [setLayout('pp1-stage-to-full', FULL), noteLayout('pp1-stage-note-full', FULL)],
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

console.log(`  ${CELL.row}/${CELL.column}  ${NAME}  "${FULL}" <-> "${CHORDS}"  via $(internal:custom_${STATE})`)

/*
 * The poller. Companion's import has no "add one trigger" — the section is reset-and-import —
 * so every trigger the rig already has comes out untouched alongside this one, and a re-run
 * replaces this one by name rather than stacking a second copy.
 */
const existing = full.triggers ?? {}
const mine = Object.entries(existing).find(([, t]) => t.options?.name === TRIGGER_NAME)
const triggers = Object.fromEntries(Object.entries(existing).filter(([tid]) => tid !== mine?.[0]))
const sortOrder = Math.max(-1, ...Object.values(existing).map((t) => t.options?.sortOrder ?? 0)) + 1

triggers[mine?.[0] ?? 'pp1-stage-layout-poll'] = {
	type: 'trigger',
	options: {
		name: TRIGGER_NAME,
		enabled: true,
		sortOrder: mine?.[1]?.options?.sortOrder ?? sortOrder,
		notes:
			`Writes the "${SCREEN}" stage layout name into ${STATE} every ${POLL_SECONDS}s. ` +
			`Exists because the ProPresenter module's own stagescreen_<uuid>_layout variable does ` +
			`not update on this rig. Rebuild with tools/pp1-stage-layout.js.`,
	},
	actions: [
		{
			id: 'pp1-stage-layout-poll-exec',
			definitionId: 'exec',
			connectionId: 'internal',
			options: { path: v(POLL), cwd: v(''), timeout: v(5000), targetVariable: v(STATE) },
			type: 'action',
			children: {},
		},
	],
	condition: [],
	events: [{ id: 'pp1-stage-layout-poll-event', type: 'interval', enabled: true, options: { seconds: POLL_SECONDS } }],
	localVariables: [],
}
console.log(`  trigger "${TRIGGER_NAME}" every ${POLL_SECONDS}s -> ${STATE}`)
console.log(`    ${POLL}`)
console.log(`  ${Object.keys(triggers).length} triggers in the bundle (${Object.keys(existing).length} were on the rig)`)

// The state variable must exist before the key can resolve it; `create-vars` reads this.
const custom_variables = {
	...(full.custom_variables ?? {}),
	[STATE]: {
		description: `ProPresenter "${SCREEN}" stage layout name, polled every ${POLL_SECONDS}s`,
		defaultValue: FULL,
		persistCurrentValue: true,
		sortOrder: Math.max(0, ...Object.values(full.custom_variables ?? {}).map((c) => c.sortOrder ?? 0)) + 1,
	},
}

await fs.mkdir(outDir, { recursive: true })

const pageFile = path.join(outDir, `page-${number}-pp1.companionconfig`)
await fs.writeFile(
	pageFile,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		custom_variables,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	})
)

const triggerFile = path.join(outDir, 'triggers.companionconfig')
await fs.writeFile(
	triggerFile,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages: full.pages,
		triggers,
		triggerCollections: full.triggerCollections ?? [],
		custom_variables,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)

console.log(`\nwrote ${path.basename(pageFile)} and ${path.basename(triggerFile)}`)
