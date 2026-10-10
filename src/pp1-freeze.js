/**
 * Freeze on PP1: hold the audience screens on the slide that is up.
 *
 * The I/O half is `tools/pp1-freeze.js`; everything that decides anything is here, tested.
 *
 * WHAT FREEZE IS. ProPresenter has no freeze button, but its Slide Destination action does the
 * job: set to Stage Only it stops slide clicks reaching the audience screens, and whatever was up
 * stays up while the operator clicks on. That is this rig's "Stage Notes" macro without its Clear —
 * so Freeze is a ProPresenter macro holding that one action, and the "All Screens" key that was
 * already on PP1 is the release. Releasing does not push a slide: the next click does.
 *
 * THE MACRO IS MADE BY HAND. ProPresenter's API can rename, recolour and delete a macro but
 * cannot create one or give it actions, so somebody adds "Freeze" in ProPresenter once and this
 * build refuses to run until it is there. The API reports a macro's action types and not their
 * settings: the build can prove the macro has a Slide Destination and no Clear, and cannot prove
 * the destination is Stage Only. That last part is checked on the wall.
 *
 * NO LIT STATE. ProPresenter does not report the slide destination and the operator can flip it
 * from the keyboard (Cmd-0), so a "frozen" light on the deck would be a guess, and a guess that
 * says "live" over a held wall is worse than no light. ProPresenter shows a red "Stage Only" under
 * its transport controls; that is the indicator.
 *
 * WHERE. r1c8 on PP1: free when this was written (2026-10-09), directly above Stage Notes and
 * diagonal to All Screens, so the three slide-destination keys sit together. The build refuses to
 * run if somebody else's key is there.
 *
 * IDEMPOTENT. The key carries `options.notes` beginning with MARK and deterministic ids, so a
 * rebuild replaces its own key and two builds of the same rig are byte-identical.
 */
import { makeImageLayer } from './wiring.js'

/** Companion's id for the ProPresenter module this rig runs. */
export const MODULE_ID = 'renewedvision-propresenter-api'
/** The ProPresenter macro this key fires, by the name it must carry there. */
export const MACRO_NAME = 'Freeze'
/** Prefix of `options.notes` on the key this file writes. */
export const MARK = 'pp1-freeze'
export const PAGE = 'PP1'
export const CELL = { row: 1, column: 8 }

/**
 * Ice blue: no other PP1 key is cyan (the clears are dark red, All Screens violet, Stage Notes
 * red), and white on it measures 5.4:1.
 */
export const ICE = 0x0e7490
const WHITE = 0xffffff
const OUTLINE_BLACK = 0xff000000

/** The band split every other PP1 key uses: icon over a two-line caption. */
const GEOMETRY = { image: { y: 2, height: 44 }, text: { y: 46, height: 52 } }
const FONT_SIZE = 51

const v = (value) => ({ value, isExpression: false })

/** A button's caption reduced to its words, for the cell guard's error message. */
export function labelOf(control) {
	const text = (control?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? ''
	return text.replace(/\\n|\n/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when a control was written by this file and may be rebuilt. */
export function isOurs(control) {
	return typeof control?.options?.notes === 'string' && control.options.notes.startsWith(`${MARK}:`)
}

/** The one ProPresenter connection on the rig. */
export function findProPresenterConnection(full) {
	const found = Object.entries(full.instances ?? {}).filter(([, i]) => i?.moduleId === MODULE_ID)
	if (found.length !== 1) {
		throw new Error(`expected one ${MODULE_ID} connection on this rig, found ${found.length}`)
	}
	return found[0]
}

/**
 * Pick the Freeze macro out of ProPresenter's `GET /v1/macros` and check it can only hold.
 *
 * @param {Array<{id: {uuid: string, name: string}, actions?: Array<{type: string}>}>} macros
 * @returns {{uuid: string, name: string}}
 */
export function findFreezeMacro(macros) {
	const named = macros.filter((m) => m?.id?.name?.trim().toLowerCase() === MACRO_NAME.toLowerCase())
	if (named.length === 0) {
		throw new Error(
			`ProPresenter has no macro called "${MACRO_NAME}". Add one with a single action, ` +
				`Slide Destination set to Stage Only, then run this again`
		)
	}
	if (named.length > 1) throw new Error(`ProPresenter has ${named.length} macros called "${MACRO_NAME}"; keep one`)
	const [macro] = named
	const types = (macro.actions ?? []).map((a) => a.type)
	if (!types.includes('slide_destination')) {
		throw new Error(`the "${MACRO_NAME}" macro has no Slide Destination action (it has: ${types.join(', ') || 'nothing'})`)
	}
	// A Clear is what turns "hold the slide" into "blank the screens": that is Stage Notes, not Freeze.
	if (types.includes('clear')) {
		throw new Error(`the "${MACRO_NAME}" macro has a Clear action, which would blank the screens instead of holding them`)
	}
	return { uuid: macro.id.uuid, name: macro.id.name }
}

/**
 * Build the Freeze key.
 *
 * @param {{connectionId: string, macro: {uuid: string, name: string}}} target
 */
export function buildFreezeKey({ connectionId, macro }) {
	const id = (part) => `${MARK}:${part}`
	return {
		type: 'button-layered',
		style: {
			layers: [
				{
					id: 'canvas',
					name: 'Canvas',
					usage: 'auto',
					type: 'canvas',
					decoration: v('default'),
					showStatusIcons: v('default'),
				},
				{
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
					color: v(ICE),
					borderWidth: v(0),
					borderColor: v(0),
					borderPosition: v('inside'),
				},
				{ ...makeImageLayer('still'), y: v(GEOMETRY.image.y), height: v(GEOMETRY.image.height) },
				{
					id: 'text0',
					name: 'Text',
					usage: 'auto',
					type: 'text',
					enabled: v(true),
					opacity: v(100),
					x: v(0),
					y: v(GEOMETRY.text.y),
					width: v(100),
					height: v(GEOMETRY.text.height),
					rotation: v(0),
					text: v('Freeze\nSlide'),
					color: v(WHITE),
					halign: v('center'),
					valign: v('center'),
					fontsize: v(FONT_SIZE),
					fontsizeAllowShrink: v(true),
					font: v('companion-sans'),
					outlineColor: v(OUTLINE_BLACK),
				},
			],
		},
		options: {
			stepProgression: 'auto',
			stepExpression: '',
			rotaryActions: false,
			canModifyStyleInApis: false,
			notes:
				`${MARK}: fires the ProPresenter macro "${macro.name}" (Slide Destination, Stage Only), which holds the ` +
				`audience screens on the current slide. "All Screens" releases it. Built by tools/pp1-freeze.js — ` +
				`rerun it rather than editing here.`,
		},
		feedbacks: [],
		steps: {
			0: {
				action_sets: {
					down: [
						{
							type: 'action',
							id: id('action'),
							connectionId,
							definitionId: 'marcoIdTrigger',
							options: { macro_id_dropdown: v(macro.uuid) },
							upgradeIndex: -1,
						},
					],
					up: [],
				},
				options: { runWhileHeld: [] },
			},
		},
		localVariables: [],
	}
}

/**
 * Place the Freeze key on PP1 of a full export.
 *
 * Returns a page bundle importable with `tools/rig.js import-page`. Nothing outside CELL is
 * touched, and CELL holding anybody else's key stops the build.
 *
 * @param {object} full A full Companion export (`tools/rig.js export`).
 * @param {{uuid: string, name: string}} macro From `findFreezeMacro`.
 * @returns {{number: number, cell: string, bundle: object}}
 */
export function buildFreezePage(full, macro) {
	const [connectionId] = findProPresenterConnection(full)
	const entry = Object.entries(full.pages ?? {}).find(([, p]) => p.name === PAGE)
	if (!entry) throw new Error(`the rig has no "${PAGE}" page`)
	const [number, source] = entry
	const page = structuredClone(source)
	page.controls ??= {}
	const { row, column } = CELL
	const occupant = page.controls[row]?.[column]
	if (occupant && !isOurs(occupant)) {
		throw new Error(`r${row}c${column} on ${PAGE} is taken by "${labelOf(occupant)}"; the Freeze key was not written`)
	}
	page.controls[row] ??= {}
	page.controls[row][column] = buildFreezeKey({ connectionId, macro })
	return {
		number: Number(number),
		cell: `r${row}c${column}`,
		bundle: {
			version: full.version,
			type: 'page',
			companionBuild: full.companionBuild,
			page,
			instances: full.instances,
			connectionCollections: full.connectionCollections ?? [],
			oldPageNumber: Number(number),
		},
	}
}
