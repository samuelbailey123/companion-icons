/**
 * PCO LIVE on the deck: the Planning Center Services LIVE step keys and readouts.
 *
 * The I/O half is `tools/pco-live-pages.js`; everything that decides anything is here, tested.
 *
 * WHY THESE KEYS. Planning Center's LIVE view is the one timeline every team can see — the
 * ProPresenter operator, FOH, lighting and the pastor on their phones all watch the same
 * "current item" and its countdown — but it only moves when somebody holding control presses
 * Next. On this rig nobody does, so it sits on "Rehearsal" all morning. The switcher seat already
 * runs the deck through the whole service, so the deck gets the step keys.
 *
 * WHERE. NEXT at r2c4 and PREV at r3c3 on BOTH camera pages (Worship, Sermon), the same cell on
 * each so the hand learns one place; r3c5 beside them is a copy of the NOW readout so the time
 * left sits next to the key that answers it. Those three cells were free on both pages when this
 * was written (2026-10-06) and the build refuses to run if that changes. Home row 3 carries
 * read-only readouts — now, time left, next, ends at — and NO actions: rig.md says Home is status
 * only, and that rule holds here.
 *
 * ONE ACTION PER KEY. The module's "… of Next Plan in Selected Service Type" actions resolve the
 * plan (the service type's next future plan) and TAKE CONTROL before stepping — read in the
 * module's api.js, `nextitem_inservicetype` → `takeControl` → `controlLive` — so a separate Take
 * Control key would be a second way to do what NEXT already does, and it was left out.
 *
 * COLOURS. The step keys sit on teal: no other system on this rig is teal (orange is
 * ProPresenter, purple routing, pink cameras), so a PCO key can never be mistaken for the
 * ProPresenter Next that lives on PP1. The `cue-next`/`cue-back` glyphs are the library's amber
 * step arrows, and amber (#FBBF24) on this teal (#115E59) measures 4.3:1 against `MIN_CONTRAST`
 * of 3. When the current item overruns, the module's `item_overrun` feedback turns every NOW
 * readout red and the NEXT key amber: the deck nudges, it does not decide.
 *
 * IDEMPOTENT. Every key written here carries `options.notes` beginning with MARK, so a rebuild
 * replaces its own keys and refuses anyone else's. Ids are deterministic for the same reason —
 * two builds of the same rig are byte-identical.
 */
import { DEFAULT_BG } from './palette.js'
import { makeImageLayer } from './wiring.js'

/** Companion's id for the Bitfocus "Planning Center Online: Services Live" module. */
export const MODULE_ID = 'planningcenter-serviceslive'
/** Prefix of `options.notes` on every key this file writes. */
export const MARK = 'pco-live'

/** Step keys: teal, used by nothing else on the rig. */
export const TEAL = 0x115e59
/** The NEXT key while the current item overruns. */
export const AMBER = 0xd97706
/** A readout while the current item overruns. */
export const RED = 0xb91c1c
const GROUND = parseInt(DEFAULT_BG.slice(1), 16)
const WHITE = 0xffffff
const OUTLINE_BLACK = 0xff000000

const v = (value) => ({ value, isExpression: false })

/** The cells, by page name. Companion rows: 0 is the folder row. */
const CAMERA_KEYS = [
	{ key: 'next', row: 2, column: 4 },
	{ key: 'prev', row: 3, column: 3 },
	{ key: 'now-left', row: 3, column: 5 },
]
export const PLACEMENT = {
	Home: [
		{ key: 'now', row: 3, column: 0 },
		{ key: 'left', row: 3, column: 1 },
		{ key: 'next-up', row: 3, column: 2 },
		{ key: 'ends', row: 3, column: 3 },
	],
	Worship: CAMERA_KEYS,
	Sermon: CAMERA_KEYS,
}

/**
 * What each key shows and does. `$(L:…)` is replaced with the connection's label, because a
 * module's variables are published under whatever the connection is called.
 *
 * `fontsize` is a percentage of the text layer's height with shrink left on, so a long item
 * title ("Salvation Invite / Altar Ministry") wraps and shrinks instead of being clipped.
 */
const KEYS = {
	next: {
		icon: 'cue-next',
		text: 'NEXT\n$(L:plan_nextitem)',
		bg: TEAL,
		fontsize: 26,
		action: 'nextitem_inservicetype',
		overrun: AMBER,
	},
	prev: { icon: 'cue-back', text: 'PREV', bg: TEAL, fontsize: 40, action: 'previousitem_inservicetype' },
	'now-left': {
		text: '$(L:plan_currentitem)\n$(L:plan_currentitem_time_remaining)',
		bg: GROUND,
		fontsize: 24,
		overrun: RED,
	},
	now: { text: 'NOW\n$(L:plan_currentitem)', bg: GROUND, fontsize: 24, overrun: RED },
	left: { text: '$(L:plan_currentitem_time_remaining)\nleft', bg: GROUND, fontsize: 34, overrun: RED },
	'next-up': { text: 'NEXT\n$(L:plan_nextitem)', bg: GROUND, fontsize: 24 },
	ends: { text: 'ends\n$(L:plan_currentitem_time_shouldfinish)', bg: GROUND, fontsize: 28 },
}

/** Icon keys split the face 40/56; readouts give the whole face to the text. */
const ICON_GEOMETRY = { image: { y: 2, height: 40 }, text: { y: 44, height: 54 } }
const FULL_FACE = { y: 0, height: 100 }

/** A button's caption reduced to its words, for the cell guard's error message. */
export function labelOf(control) {
	const text = (control?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? ''
	return text.replace(/\\n|\n/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when a control was written by this file and may be rebuilt. */
export function isOurs(control) {
	return typeof control?.options?.notes === 'string' && control.options.notes.startsWith(`${MARK}:`)
}

/** The one Services Live connection on the rig. */
export function findPcoConnection(full) {
	const found = Object.entries(full.instances ?? {}).filter(([, i]) => i?.moduleId === MODULE_ID)
	if (found.length === 0) throw new Error(`no ${MODULE_ID} connection on this rig; add it first`)
	if (found.length > 1) {
		throw new Error(`${found.length} ${MODULE_ID} connections on this rig (${found.map(([, i]) => i.label).join(', ')}); keep one`)
	}
	return found[0]
}

function textLayer(text, fontsize, { y, height }) {
	return {
		id: 'text0',
		name: 'Text',
		usage: 'auto',
		type: 'text',
		enabled: v(true),
		opacity: v(100),
		x: v(0),
		y: v(y),
		width: v(100),
		height: v(height),
		rotation: v(0),
		text: v(text),
		color: v(WHITE),
		halign: v('center'),
		valign: v('center'),
		fontsize: v(fontsize),
		fontsizeAllowShrink: v(true),
		font: v('companion-sans'),
		outlineColor: v(OUTLINE_BLACK),
	}
}

function boxLayer(color) {
	return {
		id: 'box0',
		name: 'Background',
		usage: 'auto',
		type: 'box',
		enabled: v(true),
		opacity: v(100),
		x: v(0),
		y: v(0),
		width: v(100),
		height: v(100),
		rotation: v(0),
		color: v(color),
		borderWidth: v(0),
		borderColor: v(0),
		borderPosition: v('inside'),
	}
}

const CANVAS = {
	id: 'canvas',
	name: 'Canvas',
	usage: 'auto',
	type: 'canvas',
	decoration: v('default'),
	showStatusIcons: v('default'),
}

/**
 * Build one key.
 *
 * @param {string} page Page name, part of every id so keys on two pages never share one.
 * @param {string} name Key name in KEYS.
 * @param {{connectionId: string, label: string, serviceTypeId: string}} pco
 */
export function buildKey(page, name, { connectionId, label, serviceTypeId }) {
	const spec = KEYS[name]
	const id = (part) => `${MARK}:${page}:${name}:${part}`
	const text = spec.text.replaceAll('$(L:', `$(${label}:`)
	const layers = [CANVAS, boxLayer(spec.bg)]
	if (spec.icon) {
		layers.push({
			...makeImageLayer(spec.icon),
			y: v(ICON_GEOMETRY.image.y),
			height: v(ICON_GEOMETRY.image.height),
		})
		layers.push(textLayer(text, spec.fontsize, ICON_GEOMETRY.text))
	} else {
		layers.push(textLayer(text, spec.fontsize, FULL_FACE))
	}

	const feedbacks = []
	if (spec.overrun) {
		feedbacks.push({
			type: 'feedback',
			id: id('overrun'),
			connectionId,
			definitionId: 'item_overrun',
			options: {},
			isInverted: v(false),
			upgradeIndex: -1,
			styleOverrides: [
				{
					overrideId: id('overrun-box'),
					elementId: 'box0',
					elementProperty: 'color',
					override: v(spec.overrun),
				},
			],
		})
	}

	const down = []
	if (spec.action) {
		down.push({
			type: 'action',
			id: id('action'),
			connectionId,
			definitionId: spec.action,
			options: { servicetypeid: v(serviceTypeId) },
			upgradeIndex: -1,
		})
	}

	return {
		type: 'button-layered',
		style: { layers },
		options: {
			stepProgression: 'auto',
			stepExpression: '',
			rotaryActions: false,
			canModifyStyleInApis: false,
			notes: `${MARK}: ${name}. Built by tools/pco-live-pages.js — rerun it rather than editing here.`,
		},
		feedbacks,
		steps: { 0: { action_sets: { down, up: [] }, options: { runWhileHeld: [] } } },
		localVariables: [],
	}
}

/**
 * Place the PCO keys on the Home, Worship and Sermon pages of a full export.
 *
 * Returns one page bundle per page, importable with `tools/rig.js import-page`. Nothing outside
 * the target cells is touched, and a target cell holding anybody else's key stops the build.
 *
 * @param {object} full A full Companion export (`tools/rig.js export`).
 * @param {{connectionId: string, label: string, serviceTypeId: string}} pco
 * @returns {{pages: Array<{number: number, name: string, cells: string[], bundle: object}>}}
 */
export function buildPcoLivePages(full, pco) {
	if (!/^\d+$/.test(pco.serviceTypeId ?? '')) {
		throw new Error(`serviceTypeId must be the numeric id from the PCO URL, got "${pco.serviceTypeId}"`)
	}
	const pages = []
	for (const [name, cells] of Object.entries(PLACEMENT)) {
		const entry = Object.entries(full.pages ?? {}).find(([, p]) => p.name === name)
		if (!entry) throw new Error(`the rig has no "${name}" page`)
		const [number, source] = entry
		const page = structuredClone(source)
		page.controls ??= {}
		const written = []
		for (const { key, row, column } of cells) {
			const occupant = page.controls[row]?.[column]
			if (occupant && !isOurs(occupant)) {
				throw new Error(`r${row}c${column} on ${name} is taken by "${labelOf(occupant)}"; the PCO keys were not written`)
			}
			page.controls[row] ??= {}
			page.controls[row][column] = buildKey(name, key, pco)
			written.push(`r${row}c${column} ${key}`)
		}
		pages.push({
			number: Number(number),
			name,
			cells: written,
			bundle: {
				version: full.version,
				type: 'page',
				companionBuild: full.companionBuild,
				page,
				instances: full.instances,
				connectionCollections: full.connectionCollections ?? [],
				oldPageNumber: Number(number),
			},
		})
	}
	return { pages }
}
