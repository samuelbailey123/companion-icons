/**
 * SQ7's fader folders: DCAs, the vocal mics and the FX returns, a knob each.
 *
 * Sam, 2026-10-27: "add more options to the SQ7 page, like more faders", "we can make folders for
 * this stuff too". He chose DCA 1-8, the vocal mic inputs and FX returns 1-4, in folders opened
 * from SQ7. The + XL has six knobs, so each folder holds at most six faders: DCA 1-4 and DCA 5-8
 * (four each, so both pages look the same), Leads, BGV, Lav and FX.
 *
 * EACH KNOB IS ONE FADER. Turn it and the level moves 1 dB a click (SQ7's own knobs step 3 dB, too
 * coarse for a vocal). Press it and the fader mutes or unmutes, as SQ7's Stream, Foyer and Main
 * knobs do. The strip above shows the name and the desk's own dB reading, and goes red when muted.
 * Inputs and FX returns are their level into Main (LR), the mix the room hears.
 *
 * THE READING IS THE DESK'S. The allenheath-sq module publishes every level it is told about as
 * `level_<MSB>.<LSB>`, the address in the SQ's MIDI protocol: DCA n is 0x4F 0x1F+n, input n into
 * LR is 0x40 n-1, FX return n into LR is 0x40 0x3B+n. Read off the rig 2026-10-27: DCA 1
 * `level_79.32`, CH 1 `level_64.0`, FX 1 `level_64.60`. With the desk off the module keeps its
 * last values, and Companion marks the keys with its connection warning.
 *
 * Channel numbers are the Dante page's (src/dante.js): Leads on CH 1-4, BGV on 5-8, Lav on 13-14.
 */
import { GRID_SIZE, KNOB_COLS, KNOB_ROW, STRIP_ROW } from './layout.js'
import { folderFor, navRow } from './navrow.js'

export const MODULE_ID = 'allenheath-sq'
export const PARENT = 'SQ7'
export const MARK = 'sq7-faders'
/** One detent, in dB. */
export const STEP = 1
/** SQ7's mute red, as its DCA keys already use it. */
export const MUTED = 0xcc0000
export const REST = { strip: 0x1f2937, knob: 0x000000, folder: 0x1f2937 }

/** What each kind of fader sends and reads: its level action, mute action, mute feedback and level variable. */
export const KINDS = {
	dca: { level: 'dca_level_output', mute: 'mute_dca', lr: false, variable: (n) => `level_79.${0x1f + n}` },
	input: { level: 'chlev_to_mix', mute: 'mute_input', lr: true, variable: (n) => `level_64.${n - 1}` },
	fxr: { level: 'fxrlev_to_mix', mute: 'mute_fx_return', lr: true, variable: (n) => `level_64.${0x3b + n}` },
}

/** The folders, in the order their keys sit on SQ7's bottom row. */
export const FOLDERS = [
	{ name: 'DCA 1-4', kind: 'dca', faders: [1, 2, 3, 4].map((n) => ({ n, label: `DCA ${n}` })) },
	{ name: 'DCA 5-8', kind: 'dca', faders: [5, 6, 7, 8].map((n) => ({ n, label: `DCA ${n}` })) },
	{ name: 'Leads', kind: 'input', faders: [1, 2, 3, 4].map((n) => ({ n, label: `Lead ${n}` })) },
	{ name: 'BGV', kind: 'input', faders: [5, 6, 7, 8].map((n, i) => ({ n, label: `BGV ${i + 1}` })) },
	{ name: 'Lav', kind: 'input', faders: [13, 14].map((n, i) => ({ n, label: `Lav ${i + 1}` })) },
	{ name: 'FX', kind: 'fxr', faders: [1, 2, 3, 4].map((n) => ({ n, label: `FX ${n}` })) },
]

/** SQ7's empty bottom key row holds the folder keys, left to right. */
export const ENTRY_ROW = 3

const v = (value) => ({ value, isExpression: false })

const layer = {
	canvas: { id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
	box: (color) => ({
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(color), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
	}),
	image: (icon, height) => ({
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100), x: v(0), y: v(2), width: v(100), height: v(height), rotation: v(0),
		base64Image: v(`$(image:${icon})`), halign: v('center'), valign: v('center'), fillMode: v('fit'),
	}),
	// 36 for names: Companion shrinks text by breaking words, and at 51 a six-letter name broke
	// across two lines on a knob (rendered on the rig, 2026-10-27).
	text: (id, value, y, height, size = 36) => ({
		id, name: id, usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100), x: v(0), y: v(y), width: v(100), height: v(height), rotation: v(0),
		text: v(value), color: v(0xffffff), halign: v('center'), valign: v('center'),
		fontsize: v(size), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
	}),
}

const control = ({ layers, notes, feedbacks = [], actionSets, rotary = false }) => ({
	type: 'button-layered',
	style: { layers: [layer.canvas, ...layers] },
	options: { stepProgression: 'auto', stepExpression: '', rotaryActions: rotary, canModifyStyleInApis: false, notes },
	feedbacks,
	steps: { 0: { action_sets: { down: [], up: [], ...actionSets }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

const action = (id, connectionId, definitionId, options) => ({
	id, definitionId, connectionId, options, upgradeIndex: null, type: 'action',
})

/** Red while the fader is muted, read from the module's own mute feedback. */
const mutedFeedback = (id, connectionId, kind, n) => ({
	id, type: 'feedback', definitionId: KINDS[kind].mute, connectionId,
	options: { channel: v(n - 1) },
	isInverted: v(false),
	styleOverrides: [{ overrideId: `${id}-bg`, elementId: 'box0', elementProperty: 'color', override: v(MUTED) }],
	upgradeIndex: null,
})

const levelOptions = (kind, n, leveldb) => ({
	input: v(n - 1),
	...(KINDS[kind].lr ? { assign: v('lr') } : {}),
	leveldb: v(leveldb),
	fade: v(0),
})

/** The knob for one fader: turn for level, press to mute. */
export function knob(connectionId, kind, { n, label }) {
	const id = `${MARK}-${kind}-${n}`
	return control({
		layers: [layer.box(REST.knob), layer.image('fader', 56), layer.text('text0', label, 60, 38)],
		notes: `${MARK}: ${label}. Turn: ${STEP} dB a click. Press: mute or unmute.`,
		feedbacks: [mutedFeedback(`${id}-muted`, connectionId, kind, n)],
		rotary: true,
		actionSets: {
			down: [action(`${id}-mute`, connectionId, KINDS[kind].mute, { strip: v(n - 1), mute: v(0) })],
			rotate_left: [action(`${id}-down`, connectionId, KINDS[kind].level, levelOptions(kind, n, `step-${STEP}`))],
			rotate_right: [action(`${id}-up`, connectionId, KINDS[kind].level, levelOptions(kind, n, `step+${STEP}`))],
		},
	})
}

/** The strip segment above it: the name and the desk's dB reading, red when muted. */
export function strip(connectionId, kind, { n, label }) {
	const id = `${MARK}-${kind}-${n}-strip`
	return control({
		layers: [layer.box(REST.strip), layer.text('text0', label, 2, 48), layer.text('text1', `$(SQ:${KINDS[kind].variable(n)}) dB`, 50, 48, 44)],
		notes: `${MARK}: ${label}, the desk's own level reading. Red when muted.`,
		feedbacks: [mutedFeedback(`${id}-muted`, connectionId, kind, n)],
	})
}

/** The key on SQ7 that opens a folder. */
export function entryKey(folder, pageNumber) {
	return control({
		layers: [layer.box(REST.folder), layer.image('folder-audio', 44), layer.text('text0', folder.name, 46, 52)],
		notes: `${MARK}: opens the ${folder.name} faders (page ${pageNumber}).`,
		actionSets: {
			down: [action(`${MARK}-${folder.name}-open`, 'internal', 'set_page', { surfaceId: v('self'), page: v(String(pageNumber)) })],
		},
	})
}

/** One folder's page: the folder row with SQ7 marked, and a knob and strip per fader. */
export function folderPage(connectionId, folder, pageNumbers) {
	if (folder.faders.length > KNOB_COLS.length) throw new Error(`${folder.name} has ${folder.faders.length} faders but the deck has ${KNOB_COLS.length} knobs`)
	const controls = { 0: navRow(folderFor(folder.name), pageNumbers), [STRIP_ROW]: {}, [KNOB_ROW]: {} }
	folder.faders.forEach((fader, i) => {
		controls[STRIP_ROW][KNOB_COLS[i]] = strip(connectionId, folder.kind, fader)
		controls[KNOB_ROW][KNOB_COLS[i]] = knob(connectionId, folder.kind, fader)
	})
	return { name: folder.name, gridSize: { ...GRID_SIZE }, controls }
}

/** The SQ connection, which must already be on the rig. */
export function findSq(full) {
	const found = Object.entries(full.instances).filter(([, i]) => i?.moduleId === MODULE_ID)
	if (found.length !== 1) throw new Error(`expected one ${MODULE_ID} connection on this rig, found ${found.length}`)
	return found[0][0]
}

/** Is this control one this file wrote? */
const isOurs = (control) => String(control.options?.notes).startsWith(`${MARK}:`)

/**
 * Every folder page, and SQ7 with a key for each, from a live export.
 *
 * A folder page keeps its number and id if the rig has it, and is otherwise numbered after the
 * last page, in FOLDERS order, which is where successive `import-page … new` calls put them. So
 * import the new pages in the order returned, then SQ7. SQ7's keys refuse a cell holding a key
 * this file did not write.
 */
export function buildConfig(full) {
	const connectionId = findSq(full)
	const numberOf = (name) => Object.entries(full.pages).find(([, p]) => p.name === name)?.[0]
	const sq7 = numberOf(PARENT)
	if (!sq7) throw new Error(`no page named "${PARENT}" on this rig`)
	const numbers = Object.keys(full.pages).map(Number)
	if (Math.max(...numbers) !== numbers.length) throw new Error(`pages are not numbered 1..${numbers.length}; new pages would not land after the last`)

	let next = numbers.length
	const placed = FOLDERS.map((folder) => {
		const existing = numberOf(folder.name)
		return { folder, existing: Boolean(existing), number: existing ?? String(++next) }
	})
	const pageNumbers = {
		...Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)])),
		...Object.fromEntries(placed.map((p) => [p.folder.name, Number(p.number)])),
	}

	const pages = placed.map(({ folder, existing, number }) => {
		const page = folderPage(connectionId, folder, pageNumbers)
		if (existing) page.id = full.pages[number].id
		return { number, existing, page }
	})

	const parent = structuredClone(full.pages[sq7])
	parent.controls[ENTRY_ROW] ??= {}
	placed.forEach(({ folder, number }, col) => {
		const there = parent.controls[ENTRY_ROW][col]
		if (there && !isOurs(there)) throw new Error(`${PARENT} ${ENTRY_ROW}/${col} already holds a different key`)
		parent.controls[ENTRY_ROW][col] = entryKey(folder, number)
	})

	return { connectionId, sq7, parent, pages }
}
