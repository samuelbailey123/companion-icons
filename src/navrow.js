/**
 * The folder row: row 0 of every page, identical everywhere, one key per page.
 *
 * Nine pages, nine columns — the fit is exact, which is what makes a permanent nav row
 * affordable at all. Before this, reaching a page meant going Home and then out again; now
 * every page is one press from every other page, from anywhere.
 *
 * THE CURRENT PAGE IS MARKED WITH A BORDER, NOT A COLOUR SWAP. Recolouring the active key
 * would mean re-checking icon contrast against a second background for all nine folders, and
 * the library only ships contrast pairs for the handful of shapes that need them. A border in
 * the page's own accent colour reads just as clearly from a metre away, changes no pixel the
 * icon sits on, and cannot make a glyph illegible.
 *
 * The marking is baked in AT BUILD TIME. Each page gets its own copy of the row with its own
 * key already marked, so there is no expression, no feedback and no runtime state involved —
 * nothing that can be wrong when it matters.
 */

/** Left-to-right order of the folder row. */
export const NAV_ORDER = ['Home', 'Power', 'PP1', 'MA2', 'ATEM', 'SQ7', 'VW', 'PTZ', 'System']

/**
 * Art, resting background and accent per page.
 *
 * `bg` is a dark tint of the page's identity so the row reads as nine distinct destinations
 * rather than nine grey slabs; `accent` is the same identity at full strength, used only for
 * the active border. Both are Companion's 24-bit integer colours.
 */
export const FOLDERS = {
	Home: { image: 'home', bg: 0x1f2937, accent: 0xe9e9ee },
	Power: { image: 'folder-power', bg: 0x14361f, accent: 0x4ade80 },
	PP1: { image: 'folder-present', bg: 0x3a1e06, accent: 0xfb923c },
	MA2: { image: 'folder-lighting', bg: 0x3a2e06, accent: 0xfbbf24 },
	ATEM: { image: 'folder-video', bg: 0x0e2742, accent: 0x60a5fa },
	SQ7: { image: 'folder-audio', bg: 0x062b3a, accent: 0x38bdf8 },
	// Video World: router destinations, their sources, and the LED wall's brightness. Keeps the
	// routing art and violet identity — routing is still the bulk of what the page does.
	VW: { image: 'folder-routing', bg: 0x241a42, accent: 0xa78bfa },
	// The PTZ camera took the Mics page's slot on 2026-08-23: the wireless page was never used.
	PTZ: { image: 'folder-ptz', bg: 0x3b1230, accent: 0xf472b6 },
	System: { image: 'folder-system', bg: 0x1c2b2b, accent: 0x38bdf8 },
}

/** Border weight on the active page's folder, in percent of the key. */
const ACTIVE_BORDER = 6

/**
 * Caption size, as a PERCENTAGE of the text band — Companion's unit, not pixels.
 *
 * Matches what every other key on the deck uses, so rebuilding a folder row does not quietly
 * reintroduce the size mismatch between pages that took two passes to remove.
 */
const CAPTION_SIZE = 51

const v = (value) => ({ value, isExpression: false })

/**
 * Layer stack for a folder key.
 *
 * Geometry is in percent of the key, not pixels, which is why the same numbers survived the
 * move from a 120px key to a 112px one without a single icon reflowing.
 */
const layers = ({ image, label, bg, accent, active }) => [
	{
		id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
		decoration: v('default'), showStatusIcons: v('default'),
	},
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg),
		borderWidth: v(active ? ACTIVE_BORDER : 0),
		borderColor: v(accent),
		borderPosition: v('inside'),
	},
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(2), width: v(100), height: v(44), rotation: v(0),
		base64Image: v(`$(image:${image})`),
	},
	{
		id: 'text0', name: 'Label', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(46), width: v(100), height: v(52), rotation: v(0),
		text: v(label), color: v(0xffffff),
		halign: v('center'), valign: v('center'),
		fontsize: v(CAPTION_SIZE), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

/**
 * Build one folder key.
 *
 * Navigation is `internal: set_page` with `surfaceId: "self"`. Companion resolves that option
 * through `getPageInfo(Number(page)).id`, so `page` is the destination page NUMBER as a string.
 * Never "0" — Companion reads 0 as "the page you are already on".
 */
const folderKey = (name, pageNumber, active, seq) => ({
	type: 'button-layered',
	style: { layers: layers({ ...FOLDERS[name], label: name, active }) },
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes: '',
	},
	feedbacks: [],
	steps: {
		0: {
			action_sets: {
				down: [
					{
						id: `nav-${seq}`,
						definitionId: 'set_page',
						connectionId: 'internal',
						options: { surfaceId: v('self'), page: v(String(pageNumber)) },
						upgradeIndex: null,
						type: 'action',
					},
				],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
})

/**
 * The folder row for one page.
 *
 * @param {string} currentPage             name of the page this row is being built for
 * @param {Record<string, number|string>} pageNumbers  page name → Companion page number
 * @returns {Record<string, object>}       column → control, ready to drop in at row 0
 * @throws if a page in NAV_ORDER has no number, or has no art defined
 */
export function navRow(currentPage, pageNumbers) {
	const row = {}

	for (const [column, name] of NAV_ORDER.entries()) {
		if (!FOLDERS[name]) throw new Error(`no folder art for "${name}" — add it to FOLDERS`)

		const pageNumber = pageNumbers[name]
		if (pageNumber === undefined) throw new Error(`no page number for "${name}"`)
		if (Number(pageNumber) === 0) throw new Error(`page number for "${name}" is 0, which Companion reads as "current page"`)

		row[column] = folderKey(name, pageNumber, name === currentPage, `${name}-${column}`)
	}

	return row
}

/**
 * Check the deck's pages and the folder row agree, before anything is written.
 *
 * A page missing from NAV_ORDER is unreachable from the row — the exact bug this row exists to
 * prevent — so it is an error rather than a warning.
 *
 * @throws listing whichever side is out of step
 */
export function assertNavCoverage(pageNames, columns) {
	if (NAV_ORDER.length !== columns) {
		throw new Error(`folder row has ${NAV_ORDER.length} entries but the deck is ${columns} columns wide`)
	}

	const missing = pageNames.filter((n) => !NAV_ORDER.includes(n))
	if (missing.length) throw new Error(`pages unreachable from the folder row: ${missing.join(', ')}`)

	const phantom = NAV_ORDER.filter((n) => !pageNames.includes(n))
	if (phantom.length) throw new Error(`folder row points at pages that do not exist: ${phantom.join(', ')}`)
}
