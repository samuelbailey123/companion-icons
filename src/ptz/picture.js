/**
 * The setup page's values: six knobs with readouts, two cycle keys, one-push white balance,
 * and Match.
 *
 * THE KNOBS ARE THE WEB PAGE'S DROPDOWNS. A mode key can put the camera in Manual exposure;
 * only a knob can say which shutter, and show it. Each knob is a row-4 strip zone (the readout,
 * from the poller's JSON) over a row-5 encoder (the control), the pairing every knob on the
 * deck uses.
 *
 * TWO KINDS OF KNOB. Shutter, iris, sharpness and exposure compensation STEP: the camera has
 * its own up/down command for each (checked on 2026-09-10: 18 → 19 → 18 on shutter, and so
 * on), so a detent sends one command, nothing is remembered on the deck, and nothing can
 * drift. Gain and white balance DIAL: the camera has no step command for either — `0C 02` is
 * the gain LIMIT on this firmware, and colour temperatures are a scrambled code table — so
 * the deck keeps the value in a variable, moves it a step, and sends it. A dial can go stale
 * when the value is changed from the web page, which is what the sync trigger at the bottom
 * is for: whenever the poller's JSON changes, the dials are set from it. A change made from
 * the knob itself round-trips through the camera and comes back equal, so the trigger never
 * fights the operator (a detent can be lost if a poll lands mid-turn; the next detent puts it
 * right).
 *
 * WHY NOT READ THE POLLER ON EVERY DETENT. Its JSON is a second old, so five detents in one
 * second would all compute the same "current + 1" and move the value once. That is the trap
 * `variables.js` describes, and it is why the dials live in their own variables.
 *
 * THE EXPOSURE KNOBS TAKE CONTROL. Turning shutter, iris or gain puts the camera in Manual
 * exposure first, the way the focus knob switches to manual focus: a value the camera is
 * choosing for itself cannot be set, and a knob that turns with no effect reads as broken.
 * The Auto key is one press away to hand control back. Exposure compensation is the opposite
 * case — it only applies while the camera is choosing — so it leaves the mode alone and
 * switches itself on when turned.
 *
 * A PRESS RETURNS TO THE RIG'S STANDARD (`tables.js`): 1/125, gain 0, compensation off,
 * sharpness 0, 4600K. Iris has no standard and its press does nothing. Nothing here homes,
 * resets or moves the camera.
 *
 * READOUTS GO AMBER WHEN THE VALUE IS NOT IN EFFECT: a shutter while exposure is Auto, a
 * colour temperature while white balance is Auto. The number is still the register the knob
 * would move; the colour says the picture is not using it.
 */

import { KNOB_ROW, STRIP_ROW } from '../layout.js'
import { cv, field, logicIf, override, overrideExpr, raw, setVar, v, visca, wait, when } from './actions.js'
import { BG, key, knob, strip } from './controls.js'
import { EXPCOMP_ZERO, RANGE, STANDARD, WB_KELVIN, WB_MAX, WB_MIN, WB_STEP, levelLabel } from './tables.js'
import * as V from './variables.js'
import { look, lookExec, matchExec, matched } from './web.js'

/** Columns of the six pairs, on the strip and encoder rows. Exposure left, colour, then image. */
export const SETUP_KNOBS = { shutter: 0, iris: 2, gain: 3, expcomp: 5, wb: 6, sharp: 8 }

/** Milliseconds between two commands to the camera, which queues two at most. */
const STEP_MS = 100

/** `0p 0q` for a value 0..255, the VISCA way of writing a byte as two nibbles. */
export const pq = (n) => `0${(n >> 4).toString(16).toUpperCase()} 0${(n & 0xf).toString(16).toUpperCase()}`

/**
 * Kelvin → VISCA code as one expression, for the dial: a chain of ternaries over the whole
 * table, written from the table so the two cannot disagree. Anything off the table (a blank
 * dial on a fresh rig) lands on the rig's standard.
 */
export const wbCodeExpression = (kelvin) => {
	const fallback = Object.entries(WB_KELVIN).find(([, k]) => k === STANDARD.wbk)[0]
	return Object.entries(WB_KELVIN)
		.sort(([, a], [, b]) => a - b)
		.reduceRight((tail, [code, k]) => `${kelvin} == ${k} ? ${Number(code)} : ${tail}`, String(Number(fallback)))
}

/** Exposure Manual, sent before a value the camera would otherwise be choosing. */
const manualFirst = (id, conn) => visca(id, conn, 'expM', { val: v('1') })

const isManualExposure = `${field('ae')} == "Manual"`
const isTemperature = `includes(${field('wb')}, "K")`

/** A readout zone. `off` is the expression under which the value is not in effect. */
const readout = ({ prefix, icon, caption, fieldName, notes, off, down = false }) =>
	strip({
		style: { icon, label: `concat('${caption} ', ${field(fieldName)})`, bg: BG.strip, labelIsExpression: true },
		notes,
		feedbacks: [
			...(off
				? [when(`${prefix}-off`, off, [override(`${prefix}-off-bg`, 'box0', 'color', BG.notice)])]
				: []),
			...(down
				? [
						when(`${prefix}-down`, `${field('online')} != "OK"`, [
							override(`${prefix}-down-bg`, 'box0', 'color', BG.armed),
							override(`${prefix}-down-text`, 'text0', 'text', 'Camera DOWN'),
						]),
					]
				: []),
		],
	})

/**
 * A knob that steps with the camera's own up/down commands.
 *
 * @param {object} args
 * @param {string} args.prefix
 * @param {string} args.conn
 * @param {string} args.icon
 * @param {string} args.label
 * @param {string} args.notes
 * @param {string} args.up      VISCA bytes for one step up
 * @param {string} args.down    VISCA bytes for one step down
 * @param {object[]} [args.before]   actions sent before each step (a mode change)
 * @param {object[]} [args.press]    what a press does; nothing by default
 */
const stepKnob = ({ prefix, conn, icon, label, notes, up, down, before = [], press = [] }) =>
	knob({
		style: { icon, label, bg: BG.knob },
		notes,
		actionSets: {
			down: press,
			up: [],
			rotate_left: [...before.map((a) => ({ ...a, id: `${prefix}-l-${a.id}` })), raw(`${prefix}-l-go`, conn, down)],
			rotate_right: [...before.map((a) => ({ ...a, id: `${prefix}-r-${a.id}` })), raw(`${prefix}-r-go`, conn, up)],
		},
	})

/**
 * Build the six pairs.
 *
 * @param {string} conn  the ptzoptics-visca connection id
 * @returns {{strips: Record<number, object>, knobs: Record<number, object>}} keyed by column
 */
export function buildSetupKnobs(conn) {
	const strips = {}
	const knobs = {}
	const manual = { id: 'manual', ...manualFirst('manual', conn) }

	strips[SETUP_KNOBS.shutter] = readout({
		prefix: 's-shutter', icon: 'shutter', caption: 'Shutter', fieldName: 'shutter', down: true,
		notes: 'Shutter speed as the camera reports it. Amber while exposure is not Manual or Shutter priority, when the value is not in effect. Red if the camera stops answering.',
		off: `${field('ae')} != "Manual" && ${field('ae')} != "Shutter"`,
	})
	knobs[SETUP_KNOBS.shutter] = stepKnob({
		prefix: 'k-shutter', conn, icon: 'shutter', label: 'Shutter',
		notes: `Turn to step the shutter (switches exposure to Manual). Press returns it to 1/125, the rig's 180° at 59.94.`,
		up: '81 01 04 0A 02 FF', down: '81 01 04 0A 03 FF', before: [manual],
		press: [manualFirst('k-shutter-p-manual', conn), wait('k-shutter-p-wait', STEP_MS), raw('k-shutter-p-set', conn, `81 01 04 4A 00 00 ${pq(STANDARD.shutter)} FF`)],
	})

	strips[SETUP_KNOBS.iris] = readout({
		prefix: 's-iris', icon: 'iris', caption: 'Iris', fieldName: 'iris',
		notes: 'Iris as the camera reports it. Amber while exposure is not Manual or Iris priority, when the value is not in effect.',
		off: `${field('ae')} != "Manual" && ${field('ae')} != "Iris"`,
	})
	knobs[SETUP_KNOBS.iris] = stepKnob({
		prefix: 'k-iris', conn, icon: 'iris', label: 'Iris',
		notes: 'Turn clockwise to open the iris, anticlockwise to close it (switches exposure to Manual). Press does nothing: there is no standard iris.',
		up: '81 01 04 0B 02 FF', down: '81 01 04 0B 03 FF', before: [manual],
	})

	strips[SETUP_KNOBS.gain] = readout({
		prefix: 's-gain', icon: 'ptz-gain', caption: 'Gain', fieldName: 'gain',
		notes: 'Gain 0-15 as the camera reports it. Amber while exposure is not Manual, when the value is not in effect.',
		off: `!(${isManualExposure})`,
	})
	const sendGain = (id) => raw(id, conn, '81 01 04 4C 00 00 00 00 FF', '13,15', [cv(V.GAIN)])
	knobs[SETUP_KNOBS.gain] = knob({
		style: { icon: 'ptz-gain', label: 'Gain', bg: BG.knob },
		notes: 'Turn to change gain 0-15 (switches exposure to Manual). Press returns it to 0. The camera has no gain step command, so the deck keeps the dial and sends the value.',
		actionSets: {
			down: [setVar('k-gain-p-dial', V.GAIN, String(STANDARD.gain)), manualFirst('k-gain-p-manual', conn), wait('k-gain-p-wait', STEP_MS), sendGain('k-gain-p-set')],
			up: [],
			rotate_left: [setVar('k-gain-l-dial', V.GAIN, `max(${RANGE.gain[0]}, ${cv(V.GAIN)} - 1)`, true), manualFirst('k-gain-l-manual', conn), wait('k-gain-l-wait', STEP_MS), sendGain('k-gain-l-set')],
			rotate_right: [setVar('k-gain-r-dial', V.GAIN, `min(${RANGE.gain[1]}, ${cv(V.GAIN)} + 1)`, true), manualFirst('k-gain-r-manual', conn), wait('k-gain-r-wait', STEP_MS), sendGain('k-gain-r-set')],
		},
	})

	strips[SETUP_KNOBS.expcomp] = readout({
		prefix: 's-comp', icon: 'exp-comp', caption: 'Comp', fieldName: 'expcomp',
		notes: 'Exposure compensation as the camera reports it: Off, or an offset in steps either side of 0. Amber while exposure is Manual, when it has no effect.',
		off: isManualExposure,
	})
	const compOn = raw('on', conn, '81 01 04 3E 02 FF')
	knobs[SETUP_KNOBS.expcomp] = stepKnob({
		prefix: 'k-comp', conn, icon: 'exp-comp', label: 'Comp',
		notes: 'Turn to bias the automatic exposure darker or brighter (switches compensation on). Press switches it off and recentres it. Only applies while exposure is automatic.',
		up: '81 01 04 0E 02 FF', down: '81 01 04 0E 03 FF', before: [compOn],
		press: [raw('k-comp-p-off', conn, '81 01 04 3E 03 FF'), wait('k-comp-p-wait', STEP_MS), raw('k-comp-p-set', conn, `81 01 04 4E 00 00 ${pq(EXPCOMP_ZERO)} FF`)],
	})

	strips[SETUP_KNOBS.wb] = readout({
		prefix: 's-wb', icon: 'white-balance', caption: 'WB', fieldName: 'wb',
		notes: 'White balance as the camera reports it: a colour temperature, or Auto, Manual or 1-Push. Amber while it is not a temperature, when the dial is not in effect.',
		off: `!(${isTemperature})`,
	})
	const wbCode = (id) => setVar(id, V.WB_CODE, wbCodeExpression(cv(V.WB_K)), true)
	const sendWb = (id) => raw(id, conn, '81 01 04 35 00 FF', '8,9', [cv(V.WB_CODE)])
	knobs[SETUP_KNOBS.wb] = knob({
		style: { icon: 'white-balance', label: 'WB', bg: BG.knob },
		notes: `Turn to step the colour temperature ${WB_STEP}K at a time, ${WB_MIN}-${WB_MAX}K (takes white balance off Auto). Press returns it to ${STANDARD.wbk}K, the stage light.`,
		actionSets: {
			down: [setVar('k-wb-p-dial', V.WB_K, String(STANDARD.wbk)), wbCode('k-wb-p-code'), sendWb('k-wb-p-set')],
			up: [],
			rotate_left: [setVar('k-wb-l-dial', V.WB_K, `max(${WB_MIN}, ${cv(V.WB_K)} - ${WB_STEP})`, true), wbCode('k-wb-l-code'), sendWb('k-wb-l-set')],
			rotate_right: [setVar('k-wb-r-dial', V.WB_K, `min(${WB_MAX}, ${cv(V.WB_K)} + ${WB_STEP})`, true), wbCode('k-wb-r-code'), sendWb('k-wb-r-set')],
		},
	})

	strips[SETUP_KNOBS.sharp] = readout({
		prefix: 's-sharp', icon: 'sharpness', caption: 'Sharp', fieldName: 'sharp',
		notes: 'Sharpness 0-15 as the camera reports it.',
	})
	knobs[SETUP_KNOBS.sharp] = stepKnob({
		prefix: 'k-sharp', conn, icon: 'sharpness', label: 'Sharp',
		notes: 'Turn to change sharpness 0-15. Press returns it to 0, which is where the reference settings keep it.',
		up: '81 01 04 02 02 FF', down: '81 01 04 02 03 FF',
		press: [raw('k-sharp-p-set', conn, `81 01 04 42 00 00 ${pq(STANDARD.sharp)} FF`)],
	})

	return { strips, knobs }
}

/**
 * A key that steps a camera value through its levels with direct VISCA sets, reading the
 * current level from the poller. Green while the feature is on (any level but Off).
 *
 * @param {object} spec
 * @param {string} spec.prefix
 * @param {string} spec.icon
 * @param {string} spec.caption
 * @param {string} spec.field    field in the state JSON
 * @param {Array<[string, string]>} spec.values  [label, VISCA bytes] in cycle order
 * @param {string} spec.notes
 * @param {string} conn
 */
export const levelKey = ({ prefix, icon, caption, field: fieldName, values, notes }, conn) => {
	const set = (i) => raw(`${prefix}-set-${i}`, conn, values[i][1])
	const is = (id, label) => when(id, `${field(fieldName)} == "${label}"`)
	let chain = [set(0)]
	for (let i = values.length - 2; i >= 0; i--) {
		chain = [logicIf(`${prefix}-if-${i}`, [is(`${prefix}-cond-${i}`, values[i][0])], [set(i + 1)], chain)]
	}
	return key({
		style: { icon, label: `concat('${caption} ', ${field(fieldName)})`, bg: BG.key, labelIsExpression: true },
		notes,
		feedbacks: [
			when(`${prefix}-on`, `${field(fieldName)} != "${values[0][0]}" && ${field(fieldName)} != "--"`, [
				override(`${prefix}-on-bg`, 'box0', 'color', BG.engaged),
			]),
		],
		actionSets: { down: chain, up: [] },
	})
}

const levels = (bytes, auto) =>
	Array.from({ length: RANGE.wdr[1] + 1 }, (_, n) => [levelLabel(n, auto), bytes(n)])

/** WDR strength 0-8: the highlight knee. Off, 1..8. */
export const wdrKey = (conn) =>
	levelKey(
		{
			prefix: 'wdr', icon: 'wdr', caption: 'WDR', field: 'wdr',
			values: levels((n) => `81 01 04 51 00 00 00 0${n.toString(16).toUpperCase()} FF`, false),
			notes: 'Steps wide dynamic range Off, 1 … 8, Off: how hard the highlights are rolled off before they clip. Green while on. The white-shirt clipping in the docs is what this is for.',
		},
		conn
	)

/** 3D noise reduction 0-8: Off, 1..7, Auto. */
export const nrKey = (conn) =>
	levelKey(
		{
			prefix: 'nr', icon: 'nr', caption: 'NR', field: 'nr',
			values: levels((n) => `81 01 04 54 0${n.toString(16).toUpperCase()} FF`, true),
			notes: 'Steps 3D noise reduction Off, 1 … 7, Auto, Off. Green while on. The reference keeps it low: heavy NR smears motion.',
		},
		conn
	)

/** One-push white balance: measure now off a white card, then hold. */
export const onePushKey = (conn) =>
	key({
		style: { icon: 'white-card', label: '1-push WB', bg: BG.key },
		notes: 'Hold a white card at the preaching position, press, and give it a second: the camera measures the white and holds it. The WB readout says 1-Push afterwards. Match the other camera off the same card.',
		feedbacks: [
			when('wb1p-held', `${field('wb')} == "1-Push"`, [override('wb1p-held-bg', 'box0', 'color', BG.engaged)]),
		],
		actionSets: {
			down: [
				visca('wb1p-mode', conn, 'wb', { val: v('onepush') }),
				wait('wb1p-wait', 300),
				visca('wb1p-trigger', conn, 'wbOPT'),
			],
			up: [],
		},
	})

/**
 * Match: copy the other camera's picture settings onto this one.
 *
 * Exposure, colour, image, focus and noise reduction, through the web API — everything but the
 * mounting flips. Colour is included on purpose: two cameras of the same model matched to each
 * other cut together, and that is fault 3 in the production docs. Takes a few seconds; the
 * readouts catch up on the next poll.
 *
 * @param {string} host
 * @param {{host: string, atem: number}} other
 */
export const matchKey = (host, other) =>
	key({
		style: { icon: 'ptz-match', label: `Match ◂ CAM ${other.atem}`, bg: BG.key },
		notes:
			`Copies CAM ${other.atem}'s picture settings (exposure, colour, image, focus, noise reduction; not the flips) onto this camera ` +
			'through the web API. Green and Matched when every setting took, amber with a count if some did not, red if the camera could not be reached. Takes a few seconds.',
		feedbacks: [
			when('match-left', `${matched('online')} == "OK" && ${matched('left')} > 0`, [
				override('match-left-bg', 'box0', 'color', BG.notice),
				overrideExpr('match-left-text', 'text0', 'text', `concat('Match ', ${matched('left')}, ' left')`),
			]),
			when('match-ok', `${matched('online')} == "OK" && ${matched('left')} == 0`, [
				override('match-ok-bg', 'box0', 'color', BG.engaged),
				override('match-ok-text', 'text0', 'text', 'Matched'),
			]),
			when('match-down', `${matched('online')} == "DOWN"`, [
				override('match-down-bg', 'box0', 'color', BG.armed),
				override('match-down-text', 'text0', 'text', 'Match FAILED'),
			]),
		],
		actionSets: { down: [matchExec('match-go', host, other.host)], up: [] },
	})

/**
 * The look: the picture settings the operator has declared right, kept on the Pi.
 *
 * WHY IT EXISTS. On this camera a preset carries the picture settings it was saved with —
 * exposure, colour, image, focus, noise reduction — and recalling it puts them all back,
 * colour included. The operator tunes the colour until it is right, presses a preset to
 * reframe, and the colour goes back to whatever it was the day the preset was saved
 * (2026-09-10). Save look keeps today's settings in a file beside the scripts; Look puts them
 * back. The saved values are the whole picture block, not just colour, because the recall
 * reverts the whole block and half a fix is not a fix.
 *
 * THE KEY SAYS WHETHER THE CAMERA IS ON THE LOOK. The script prints the look's headline values
 * in the poller's own labels, so the key can compare them with what the camera reports: green
 * and "Look set" while white balance, exposure mode, shutter, iris, gain and sharpness all
 * match, plain "Look" as soon as a recall (or a knob) has moved any of them. Amber with a count
 * if an apply left settings behind; red if the camera's web page could not be reached.
 */
const onLook = ['wb', 'ae', 'shutter', 'iris', 'gain', 'sharp'].map((f) => `${field(f)} == ${look(f)}`).join(' && ')

export const lookKey = (host, prefix = 'look') =>
	key({
		style: { icon: 'ptz-look', label: 'Look', bg: BG.key },
		notes:
			'Puts the saved picture settings back (exposure, colour, image, focus, noise reduction) after a preset recall ' +
			'has changed them. Green and "Look set" while the camera is on the saved look. Save look, on the setup page, is what saves it.',
		feedbacks: [
			when(`${prefix}-set`, `${look('online')} == "OK" && ${onLook}`, [
				override(`${prefix}-set-bg`, 'box0', 'color', BG.engaged),
				override(`${prefix}-set-text`, 'text0', 'text', 'Look set'),
			]),
			when(`${prefix}-left`, `${look('online')} == "OK" && ${look('left')} > 0`, [
				override(`${prefix}-left-bg`, 'box0', 'color', BG.notice),
				overrideExpr(`${prefix}-left-text`, 'text0', 'text', `concat('Look ', ${look('left')}, ' left')`),
			]),
			when(`${prefix}-down`, `${look('online')} == "DOWN"`, [
				override(`${prefix}-down-bg`, 'box0', 'color', BG.armed),
				override(`${prefix}-down-text`, 'text0', 'text', 'Look FAILED'),
			]),
		],
		actionSets: { down: [lookExec(`${prefix}-apply`, host, 'apply')], up: [] },
	})

/**
 * Save look: keep the picture as it is now. Lives on the setup page only, where a press is
 * deliberate; the previous look is kept beside it as .prev.json, so a wrong press costs a
 * file rename on the Pi rather than the look.
 */
export const saveLookKey = (host) =>
	key({
		style: { icon: 'ptz-look', label: 'Save look', bg: BG.key },
		notes:
			'Keeps the picture settings exactly as they are now (exposure, colour, image, focus, noise reduction) as the look ' +
			'that Look puts back. Press when the picture is right. The previous look is kept as .prev.json on the Pi.',
		feedbacks: [
			when('savelook-down', `${look('online')} == "DOWN"`, [
				override('savelook-down-bg', 'box0', 'color', BG.armed),
				override('savelook-down-text', 'text0', 'text', 'Save FAILED'),
			]),
		],
		actionSets: { down: [lookExec('savelook-go', host, 'save')], up: [] },
	})

/**
 * The sync trigger: keep the two dials equal to what the camera says, whenever it says
 * something new. Runs on every change of the state JSON, so a value set from the web page
 * (or by Match, or by a preset that carries picture settings) reaches the dial within a poll.
 */
export const SYNC_TRIGGER_ID = 'trigger-ptz-sync'

export function syncTrigger() {
	const gain = field('gain')
	const wb = field('wb')
	return {
		type: 'trigger',
		options: { name: 'Sync PTZ dials', enabled: true, sortOrder: 102, relativeDelay: false },
		actions: [
			setVar('ptz-sync-gain', V.GAIN, `${gain} == "--" || ${gain} == "" ? ${cv(V.GAIN)} : fromRadix(${gain}, 10)`, true),
			setVar('ptz-sync-wbk', V.WB_K, `${isTemperature} ? fromRadix(substr(${wb}, 0, 4), 10) : ${cv(V.WB_K)}`, true),
			setVar('ptz-sync-wbcode', V.WB_CODE, wbCodeExpression(cv(V.WB_K)), true),
		],
		condition: [],
		events: [
			{ id: 'ptz-sync-on-state', type: 'variable_changed', enabled: true, options: { variableId: `internal:custom_${V.STATE}` } },
		],
		localVariables: [],
	}
}

/** Rows the pairs occupy, re-exported so the page assembler does not reach into layout. */
export const ROWS = { strip: STRIP_ROW, knob: KNOB_ROW }
