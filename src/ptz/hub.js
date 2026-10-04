/**
 * The PTZ chooser: the page the folder row's PTZ key lands on.
 *
 * WHY A CHOOSER RATHER THAN A BADGE. The first attempt put a camera badge in the corner of
 * each run page and let it swap between them. It was rejected in use, and the reason is worth
 * keeping: a label in the corner of a page full of other controls is something you have to
 * notice and then read, and the moment you need it is the moment you are not reading anything.
 * Choosing the camera as a deliberate step means you already know which one you are driving by
 * the time you are driving it — the knowledge comes from the act, not from a caption.
 *
 * It costs one press. It buys back the sixth preset the badge had taken, and it gives the two
 * cameras somewhere to be seen side by side, which nothing else on the deck offers.
 *
 * GETTING BACK IS FREE. Row 0's PTZ key is on every page and already points here, so the run
 * pages need no back key of their own — which is what returns preset 6 to row 1.
 */

import { cv, v, when, override } from './actions.js'
import { BG, key } from './controls.js'
import { navKey } from './keys.js'

export const PAGE_NAME = 'PTZ'

/** Page names for a camera's pair, keyed by its ATEM input. */
export const runName = (atem) => `CAM ${atem}`
export const setupName = (atem) => `CAM ${atem} Setup`

/** Columns for the two camera blocks: wide apart, so neither is hit by accident. */
const COLUMN = { first: 2, second: 6 }
const ROW = { enter: 1, state: 2, setup: 3 }

/** Border weight on a camera's entry key, in percent. */
const BORDER = 8

/** A camera's identity. CAM 3 keeps the PTZ page's pink; CAM 1 takes a cyan far from it. */
export const LOOK = {
	1: { bg: 0x0e3038, accent: 0x22d3ee },
	3: { bg: 0x3b1230, accent: 0xf472b6 },
	default: { bg: 0x1f2937, accent: 0xe9e9ee },
}

const layersFor = ({ atem, bg, accent }) => [
	{
		id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
		decoration: v('default'), showStatusIcons: v('default'),
	},
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg), borderWidth: v(BORDER), borderColor: v(accent), borderPosition: v('inside'),
	},
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(4), width: v(100), height: v(46), rotation: v(0),
		base64Image: v(`$(image:cam${atem}-idle)`),
		halign: v('center'), valign: v('center'), fillMode: v('fit'),
	},
	{
		id: 'text0', name: 'Camera', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(50), width: v(100), height: v(46), rotation: v(0),
		text: v(`CAM ${atem}`), color: v(0xffffff),
		halign: v('center'), valign: v('center'),
		fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

/**
 * A camera's entry key.
 *
 * Carries the ATEM tally, because the question "which camera am I about to move" and the
 * question "is that camera on air" are the same question asked half a second apart. The
 * colours are the ATEM page's own, so red and green mean here what they mean there.
 */
function enterKey({ atem, page, stateVar }) {
	const look = LOOK[atem] ?? LOOK.default
	return {
		type: 'button-layered',
		style: { layers: layersFor({ atem, ...look }) },
		options: {
			stepProgression: 'auto', stepExpression: '', rotaryActions: false,
			canModifyStyleInApis: false,
			notes:
				`Drive CAM ${atem}, the PTZ on ATEM input ${atem}. Goes red when that input is on program ` +
				`and green when it is on preview, so you can see what moving it would cost before you move it.`,
		},
		feedbacks: [
			when(`hub-cam${atem}-pgm`, `$(atem:pgm1_input_id) == ${atem}`, [
				override(`hub-cam${atem}-pgm-bg`, 'box0', 'color', BG.program),
			]),
			when(`hub-cam${atem}-pvw`, `$(atem:pvw1_input_id) == ${atem}`, [
				override(`hub-cam${atem}-pvw-bg`, 'box0', 'color', BG.preview),
			]),
			when(`hub-cam${atem}-down`, `jsonpath(${cv(stateVar)}, '$.online') != "OK"`, [
				override(`hub-cam${atem}-down-bg`, 'box0', 'color', BG.armed),
				override(`hub-cam${atem}-down-text`, 'text0', 'text', `CAM ${atem} DOWN`),
			]),
		],
		steps: {
			0: {
				action_sets: {
					down: [
						{
							id: `hub-cam${atem}-go`,
							definitionId: 'set_page',
							connectionId: 'internal',
							options: { surfaceId: v('self'), page: v(String(page)) },
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
	}
}

/** A camera's live state, under its entry key: zoom and preset, or DOWN. */
const stateKey = ({ atem, stateVar, presetVar }) =>
	key({
		style: {
			icon: 'ptz',
			label: `concat(jsonpath(${cv(stateVar)}, '$.zoom'), '  P', ${cv(presetVar)})`,
			bg: BG.key,
			labelIsExpression: true,
		},
		notes: `CAM ${atem} zoom and the preset it was last sent to, polled every second. Display only.`,
		feedbacks: [
			when(`hub-cam${atem}-state-down`, `jsonpath(${cv(stateVar)}, '$.online') != "OK"`, [
				override(`hub-cam${atem}-state-down-bg`, 'box0', 'color', BG.armed),
				override(`hub-cam${atem}-state-down-text`, 'text0', 'text', 'no answer'),
			]),
		],
		actionSets: { down: [], up: [] },
	})

/**
 * The chooser page, rows 1-3. Row 0 is the folder row, added by the caller.
 *
 * @param {Array<{atem: number, runPage: number|string, setupPage: number|string,
 *                stateVar: string, presetVar: string}>} cameras  left to right
 */
export function buildHubPage(cameras) {
	if (cameras.length !== 2) throw new Error(`the chooser is laid out for two cameras, got ${cameras.length}`)
	const controls = { [ROW.enter]: {}, [ROW.state]: {}, [ROW.setup]: {} }
	const columns = [COLUMN.first, COLUMN.second]

	cameras.forEach((cam, i) => {
		const column = columns[i]
		controls[ROW.enter][column] = enterKey({ atem: cam.atem, page: cam.runPage, stateVar: cam.stateVar })
		controls[ROW.state][column] = stateKey(cam)
		controls[ROW.setup][column] = navKey(
			`hub-cam${cam.atem}-setup`,
			{
				icon: 'ptz-setup',
				label: `CAM ${cam.atem} Setup`,
				notes: `Exposure, white balance, backlight, power and tracking for CAM ${cam.atem}.`,
			},
			cam.setupPage
		)
	})

	return controls
}
