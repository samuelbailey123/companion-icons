/**
 * The two Stream Deck Neo pages: booth audio, and the presenter's timers and clears.
 *
 * A Neo is 8 keys (4 x 2), a 248 x 58 info screen and two touch points. Companion 5.1 maps it
 * onto the page grid as rows 0-1, columns 0-3 for the keys, and row 2 for the rest: column 0 is
 * the left touch point, column 1 the info screen (it spans columns 1-2 on the hardware), and
 * column 3 the right touch point. The touch points light with the key's background colour only.
 *
 * EIGHT KEYS IS TOO FEW FOR FIXED JOBS, so the keys show state rather than labels, and warnings
 * take over the info screen only when they are needed:
 *
 *   - a mic battery that is low turns the info screen amber, critical turns it red, flashing,
 *     with the mic's name and bars; otherwise it shows the track (audio) or scene (scenes);
 *   - a timer turns amber at halfway, red and flashing near the end, solid red once it overruns;
 *   - mute keys say what is muted, not what pressing does.
 *
 * Every warning is a Companion feedback on a variable. Nothing here fires anything at the
 * desk, ProPresenter or the router except the key a person presses.
 */
import { GRID_SIZE } from './layout.js'
import { FOLDERS } from './navrow.js'
import { battery, isLive, worstOf } from './shure.js'
import { cv, exec, expr, logicIf, override, overrideExpr, v, when } from './ptz/actions.js'
import { key, layers, strip } from './ptz/controls.js'
import { restylePage } from './rounded-bold.js'

/** Where each Neo control sits on the page grid. */
export const NEO = {
	keys: [0, 1].flatMap((row) => [0, 1, 2, 3].map((col) => ({ row, col }))),
	touchLeft: { row: 2, col: 0 },
	lcd: { row: 2, col: 1 },
	touchRight: { row: 2, col: 3 },
}

export const PAGE_NAMES = { audio: 'Neo Audio', scenes: 'Neo Scenes', timers: 'Neo Timers', clears: 'Neo Clears' }

/** Solid red of a muted channel, the colour every SQ7 key on the deck already uses. */
export const MUTED = 0xcc0000
export const AMBER = 0xb45309
export const AMBER_BRIGHT = 0xf59e0b
export const RED = 0xb91c1c
export const RED_BRIGHT = 0xef4444
export const GREEN = 0x15803d
/** Clear keys at rest: dark red, so they read as dangerous before anything is on the layer. */
export const DANGER_REST = 0x4c0d0d

const SQ7 = FOLDERS.SQ7
const PP1 = FOLDERS.PP1
const TRACKS_BG = 0x1f2937

/* ------------------------------------------------------------------ SQ7 ------------------ */

/**
 * Scenes on the desk's current patch, from the showfile copy of 2026-11-08 (console number =
 * file number + 1). The scenes after them in the list (85 GP 1, 300 Recording scene) are on the
 * old patch and would put processing on the wrong channels, so they are left off on purpose.
 */
export const TCB_SAM = { number: 81, name: 'TCB Sam' }
export const SCENES = [
	{ number: 82, name: 'Devan' },
	{ number: 71, name: 'Sunday service' },
	{ number: 79, name: 'EsD Working' },
	{ number: 68, name: 'Triumph New Patch' },
	{ number: 69, name: 'VBS' },
]

/** In scene 81: DCA 4 "Lead V" and DCA 5 "BGV". Strips are 0-based. */
export const VOCAL_DCAS = [3, 4]
/** FX returns 1-4, 0-based. */
export const FX_RETURNS = [0, 1, 2, 3]
/** Main LR level: MSB 79, LSB 0 on the SQ's NRPN map. */
export const MAIN_LEVEL = '$(SQ:level_79.0)'
export const CURRENT_SCENE = '$(SQ:currentScene)'

const SQ_UPGRADE = 9
const MUTE = { toggle: 0, on: 1, off: 2 }

const sqAction = (id, sq, definitionId, options) => ({
	id,
	definitionId,
	connectionId: sq,
	options: Object.fromEntries(Object.entries(options).map(([k, value]) => [k, v(value)])),
	upgradeIndex: SQ_UPGRADE,
	type: 'action',
})

const sqMuted = (id, sq, definitionId, channel, styleOverrides = []) => ({
	id,
	type: 'feedback',
	definitionId,
	connectionId: sq,
	options: { channel: v(channel) },
	isInverted: v(false),
	styleOverrides,
	upgradeIndex: SQ_UPGRADE,
	children: {},
})

const logicOp = (id, operation, children, styleOverrides) => ({
	id,
	type: 'feedback',
	definitionId: 'logic_operator',
	connectionId: 'internal',
	options: { operation: v(operation) },
	isInverted: v(false),
	styleOverrides,
	children: { default: children },
})

/** The scene name for the desk's current scene, or "Scene N" for one not listed here. */
export const sceneNameExpr = () =>
	[TCB_SAM, ...SCENES].reduceRight(
		(rest, s) => `${CURRENT_SCENE} == ${s.number} ? "${s.name}" : (${rest})`,
		`concat("Scene ", ${CURRENT_SCENE})`
	)

/** Recall one scene. Green while it is the desk's current scene. */
export const sceneKey = (sq, scene) =>
	key({
		style: { icon: 'scene-recall', label: `${scene.number} ${scene.name}`, bg: SQ7.bg },
		notes: `Recall SQ7 scene ${scene.number} "${scene.name}". Green while it is the scene the desk last recalled.`,
		feedbacks: [when(`neo-scene-${scene.number}-live`, `${CURRENT_SCENE} == ${scene.number}`, [override(`neo-scene-${scene.number}-bg`, 'box0', 'color', GREEN)])],
		actionSets: { down: [sqAction(`neo-scene-${scene.number}`, sq, 'scene_recall', { scene: scene.number })], up: [] },
	})

/**
 * A group mute: press to mute every channel in it, press again to open them all.
 *
 * Amber with "part" when only some are muted, so a half-muted group cannot pass for open; the
 * press then mutes the rest, because the safe direction for a hot mute is closed.
 */
export const groupMuteKey = (sq, { id, title, definitionId, strips, icon, mutedIcon }) => {
	const each = (tag, styleOverrides = []) => strips.map((s) => sqMuted(`${id}-${tag}-${s}`, sq, definitionId, s, styleOverrides))
	return key({
		style: { icon, label: `${title} live`, bg: SQ7.bg },
		notes: `Mutes ${definitionId} ${strips.map((s) => s + 1).join(', ')} together; press again to unmute them all. Red with "${title} muted" when all are muted, amber when only some are.`,
		feedbacks: [
			logicOp(`${id}-some`, 'or', each('some'), [
				override(`${id}-some-bg`, 'box0', 'color', AMBER),
				override(`${id}-some-text`, 'text0', 'text', `${title} part`),
			]),
			logicOp(`${id}-all`, 'and', each('all'), [
				override(`${id}-all-bg`, 'box0', 'color', MUTED),
				override(`${id}-all-icon`, 'image0', 'base64Image', `$(image:${mutedIcon})`),
				override(`${id}-all-text`, 'text0', 'text', `${title} muted`),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					`${id}-press`,
					each('cond'),
					strips.map((s) => sqAction(`${id}-open-${s}`, sq, definitionId, { strip: s, mute: MUTE.off })),
					strips.map((s) => sqAction(`${id}-close-${s}`, sq, definitionId, { strip: s, mute: MUTE.on }))
				),
			],
			up: [],
		},
	})
}

export const hotMuteKey = (sq) =>
	groupMuteKey(sq, { id: 'neo-hot', title: 'Vox', definitionId: 'mute_dca', strips: VOCAL_DCAS, icon: 'mic-on', mutedIcon: 'mic-muted-paper' })

export const fxMuteKey = (sq) =>
	groupMuteKey(sq, { id: 'neo-fx', title: 'FX', definitionId: 'mute_fx_return', strips: FX_RETURNS, icon: 'fx-return', mutedIcon: 'fx-paper' })

export const mainLevelKey = () =>
	strip({
		style: { icon: 'mains', label: `Main ${MAIN_LEVEL}`, bg: SQ7.bg },
		notes: 'Main LR fader level in dB, as the SQ7 reports it. Display only.',
	})

/* ------------------------------------------------------------------ Mic batteries -------- */

/** The four Shure receivers as `src/shure.js` and the old Mics page named their connections. */
export const RACKS = [
	{ label: 'shure1', name: 'BGV' },
	{ label: 'shure2', name: 'Lead' },
	{ label: 'shure3', name: 'Lav' },
	{ label: 'shure4', name: 'Host' },
]
const CHANNELS = [1, 2, 3, 4]

/** Battery bars (of 5) at or under which a mic warns, and at or under which it is critical. */
export const BATTERY_LOW = 2
export const BATTERY_CRITICAL = 1

export const worstBattery = () => worstOf(battery, RACKS, CHANNELS)

/** "Lead 2 1/5": the first mic at or under `bars`, named by the receiver if it has a name. */
export const lowMicExpr = (bars) =>
	RACKS.flatMap((r) => CHANNELS.map((c) => [r, c])).reduceRight((rest, [r, c]) => {
		const ref = (f) => `$(${r.label}:ch_${c}_${f})`
		const name = `(${ref('name')} != "" ? ${ref('name')} : "${r.name} ${c}")`
		return `(${isLive(r.label, c)} && ${ref('battery_bars')} <= ${bars}) ? concat(${name}, " ", ${ref('battery_bars')}, "/5") : (${rest})`
	}, '""')

/** On the even second, so a warning flashes once a second without a trigger. */
const FLASH = '$(internal:time_s) % 2 == 0'

/**
 * Battery warnings for an info screen. Amber when any live mic is low, red when one is critical,
 * both flashing; the text becomes the mic and its bars. Nothing shows when no pack is on.
 */
export const batteryWarnings = (id) => {
	const worst = worstBattery()
	const warn = (tag, bars, dim, bright, icon) => [
		when(`${id}-${tag}`, `${worst} <= ${bars}`, [
			override(`${id}-${tag}-bg`, 'box0', 'color', dim),
			override(`${id}-${tag}-icon`, 'image0', 'base64Image', `$(image:${icon})`),
			overrideExpr(`${id}-${tag}-text`, 'text0', 'text', `concat("Battery ", ${lowMicExpr(bars)})`),
		]),
		when(`${id}-${tag}-flash`, `${worst} <= ${bars} && ${FLASH}`, [override(`${id}-${tag}-flash-bg`, 'box0', 'color', bright)]),
	]
	return [...warn('low', BATTERY_LOW, AMBER, AMBER_BRIGHT, `battery-${BATTERY_LOW}-paper`), ...warn('crit', BATTERY_CRITICAL, RED, RED_BRIGHT, 'battery-0-paper')]
}

/**
 * The info screen: icon on the left, text across the rest. A 248 x 58 strip has no room for the
 * key's icon-over-caption stack, so this is the one layer stack that differs from a key.
 */
export const lcd = ({ icon, text, bg, notes, feedbacks = [] }) => {
	const [canvas, box, image, label] = layers({ icon, label: text.value, bg, labelIsExpression: text.isExpression })
	return {
		...strip({ style: { icon, label: '', bg }, notes, feedbacks }),
		style: {
			layers: [
				canvas,
				box,
				{ ...image, x: v(2), y: v(4), width: v(22), height: v(92) },
				{ ...label, x: v(26), y: v(0), width: v(72), height: v(100), fontsize: v(44) },
			],
		},
	}
}

/* ------------------------------------------------------------------ Tracks ---------------- */

/** Volume step key; the caption carries the current volume so the key is its own readout. */
export const volumeKey = (tracks, dir) =>
	key({
		style: { icon: `volume-${dir}`, label: `${dir === 'up' ? '+' : '−'} ${cv(tracks.VOLUME_VARIABLE)}`, bg: TRACKS_BG },
		notes: `One step ${dir} on YouTube Music's volume on the PP1 iMac, via ${tracks.SCRIPT_PATH}. The number is the volume now.`,
		actionSets: { down: [exec(`tracks-volume-${dir}`, `${tracks.SCRIPT_PATH} ${dir}`, tracks.VOLUME_VARIABLE, 8000)], up: [] },
	})

/** Refresh what the audio page shows about the tracks: run on the way into the page. */
export const refreshTracks = (tracks) => [
	exec('neo-tracks-state', `${tracks.SCRIPT_PATH} state`, tracks.VARIABLE, 8000),
	exec('neo-tracks-volume', `${tracks.SCRIPT_PATH} volume`, tracks.VOLUME_VARIABLE, 8000),
	exec('neo-tracks-title', `${tracks.SCRIPT_PATH} title`, tracks.TITLE_VARIABLE, 8000),
]

/* ------------------------------------------------------------------ Paging --------------- */

const setPage = (id, page) => ({
	id,
	definitionId: 'set_page',
	connectionId: 'internal',
	options: { surfaceId: v('self'), page: v(String(page)) },
	upgradeIndex: null,
	type: 'action',
	children: {},
})

/** A touch point: lights in the page's accent, and moves to the other page. */
export const touch = ({ id, page, name, accent, icon, extra = [] }) =>
	key({
		style: { icon, label: name, bg: accent },
		notes: `Touch point: go to page ${page} (${name}).`,
		actionSets: { down: [setPage(id, page), ...extra], up: [] },
	})

/* ------------------------------------------------------------------ ProPresenter --------- */

/** The clocks the rig uses. Speaker and Hosting share Main Timer; Worship has its own. */
export const CLOCKS = {
	main: { uuid: '8F66EEB4-82F2-4BFF-A8A6-DAC0B3EA7AAE', name: 'Main Timer' },
	segment: { uuid: '28FAF666-E93E-4396-B603-1F8B4330DAE5', name: 'Segment Countdown' },
}
export const MAIN_LABEL = 'pp1_main_label'
export const PRESETS = [
	{ label: 'Speaker', clock: 'main', seconds: 2700 },
	{ label: 'Hosting', clock: 'main', seconds: 420 },
	{ label: 'Worship', clock: 'segment', seconds: 1500 },
]

const timerVar = (clock, suffix = '') => `$(propresenter:timer_${CLOCKS[clock].uuid.replaceAll('-', '')}${suffix})`
const hms = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':')

/** The name a clock is running under right now. */
export const clockLabel = (clock) => (clock === 'main' ? cv(MAIN_LABEL) : 'Worship')

/** Seconds the clock was set to: Main Timer's comes from which preset last named it. */
export const clockTotal = (clock) =>
	clock === 'main' ? `(${cv(MAIN_LABEL)} == "Hosting" ? 420 : 2700)` : '1500'

/** Seconds left at which a clock goes red: five minutes, or one on a clock under 20 minutes. */
export const nearEnd = (clock) => `(${clockTotal(clock)} >= 1200 ? 300 : 60)`

/** The four phases of a running clock, as expressions, in rising order of urgency. */
export const phases = (clock) => {
	const state = timerVar(clock, '_state')
	const left = timerVar(clock, '_seconds')
	const running = `${state} == "running"`
	return {
		running,
		half: `${running} && ${left} <= ${clockTotal(clock)} / 2`,
		near: `${running} && ${left} <= ${nearEnd(clock)}`,
		overran: `${state} == "overran"`,
	}
}

/** Feedbacks colouring a control by a clock's phase; later ones win, so urgency rises. */
export const clockColours = (id, clock) => {
	const p = phases(clock)
	const bg = (tag, colour) => [override(`${id}-${tag}-bg`, 'box0', 'color', colour)]
	return [
		when(`${id}-running`, p.running, bg('running', GREEN)),
		when(`${id}-half`, p.half, bg('half', AMBER)),
		when(`${id}-near`, p.near, bg('near', RED)),
		when(`${id}-near-flash`, `${p.near} && ${FLASH}`, bg('near-flash', RED_BRIGHT)),
		when(`${id}-overran`, p.overran, bg('overran', MUTED)),
	]
}

const timerOp = (id, pp, clock, operation, extra = {}) => ({
	id,
	definitionId: 'timerOperation',
	connectionId: pp,
	options: {
		timer_id_dropdown: v(CLOCKS[clock].uuid),
		timer_id_text: v(''),
		timer_operation: v(operation),
		timer_increment_value: v('60'),
		timer_type: v('countdown'),
		timer_duration: v('00:05:00'),
		timer_time_of_day: v('09:00:00'),
		timer_timeperiod: v('am'),
		timer_start_time: v('00:00:00'),
		timer_end_time: v(''),
		timer_allows_overrun: v(true),
		timer_optional_operation: v('none'),
		timer_new_name: v(''),
		...Object.fromEntries(Object.entries(extra).map(([k, value]) => [k, v(value)])),
	},
	upgradeIndex: null,
	type: 'action',
})

const nameMain = (id, label) => ({
	id,
	definitionId: 'custom_variable_set_value',
	connectionId: 'internal',
	options: { name: v(MAIN_LABEL), create: v(true), value: v(label) },
	type: 'action',
	children: {},
})

/** Select a preset: set the clock to it and reset it, without starting. Green while chosen. */
export const presetKey = (pp, preset) => {
	const id = `neo-preset-${preset.label.toLowerCase()}`
	const chosen = preset.clock === 'main' ? [when(`${id}-chosen`, `${cv(MAIN_LABEL)} == "${preset.label}"`, [override(`${id}-bg`, 'box0', 'color', 0x14361f)])] : []
	return key({
		style: { icon: 'countdown', label: `${preset.label} ${preset.seconds / 60}m`, bg: PP1.bg },
		notes: `Set ProPresenter "${CLOCKS[preset.clock].name}" to ${preset.seconds / 60} minutes for ${preset.label}, reset and ready; Start runs it.`,
		feedbacks: chosen,
		actionSets: {
			down: [
				timerOp(`${id}-set`, pp, preset.clock, 'set', { timer_duration: hms(preset.seconds), timer_optional_operation: 'reset' }),
				...(preset.clock === 'main' ? [nameMain(`${id}-name`, preset.label)] : []),
			],
			up: [],
		},
	})
}

/** Start or stop a clock; the caption is the clock itself, coloured by its phase. */
export const startStopKey = (pp, clock) => {
	const id = `neo-run-${clock}`
	const p = phases(clock)
	return key({
		style: { icon: 'timer-start', label: `${clockLabel(clock)} ${timerVar(clock)}`, bg: PP1.bg },
		notes: `Start ProPresenter "${CLOCKS[clock].name}", or stop it while it runs. Green running, amber past halfway, red flashing in the last ${clock === 'main' ? 'five minutes (one for Hosting)' : 'five minutes'}, solid red once it overruns.`,
		feedbacks: [
			...clockColours(id, clock),
			when(`${id}-icon`, `${p.running} || ${p.overran}`, [override(`${id}-icon-img`, 'image0', 'base64Image', '$(image:timer-stop-paper)')]),
		],
		actionSets: { down: [timerOp(`${id}-toggle`, pp, clock, 'toggle')], up: [] },
	})
}

export const resetKey = (pp, clock) =>
	key({
		style: { icon: 'timer-reset', label: `${clockLabel(clock)} reset`, bg: PP1.bg },
		notes: `Reset ProPresenter "${CLOCKS[clock].name}" to its preset, stopped.`,
		actionSets: { down: [timerOp(`neo-reset-${clock}`, pp, clock, 'reset')], up: [] },
	})

export const nudgeKey = (pp, clock, seconds) =>
	key({
		style: { icon: 'timer-start', label: `${clockLabel(clock)} +${seconds / 60}m`, bg: PP1.bg },
		notes: `Add ${seconds / 60} minute to ProPresenter "${CLOCKS[clock].name}". Applies to the running clock.`,
		actionSets: { down: [timerOp(`neo-nudge-${clock}`, pp, clock, 'increment', { timer_increment_value: String(seconds) })], up: [] },
	})

/** Both clocks on the info screen; it takes the colour of whichever is more urgent. */
export const timersLcd = () =>
	lcd({
		icon: 'timer-start',
		text: v(`${clockLabel('main')} ${timerVar('main')}\nWorship ${timerVar('segment')}`),
		bg: PP1.bg,
		notes: 'Main Timer and Segment Countdown. Amber at halfway, red flashing near the end, solid red once over.',
		feedbacks: [...clockColours('neo-lcd-segment', 'segment'), ...clockColours('neo-lcd-main', 'main')],
	})

const CLEAR_ALL_GROUP = '27DDC76F-C385-4E1C-B85F-306238FD8268'

const clearAction = (id, pp, layer) => ({
	id,
	definitionId: 'clearLayerOrGroup',
	connectionId: pp,
	options: layer
		? { clear_layer_or_group_dropdown: v('layer'), clear_layer_dropdown: v(layer) }
		: { clear_layer_or_group_dropdown: v('group'), clear_layer_dropdown: v('slide'), clear_group_id_dropdown: v(CLEAR_ALL_GROUP), clear_group_id_text: v('') },
	upgradeIndex: null,
	type: 'action',
})

const layerActive = (id, pp, layer, styleOverrides) => ({
	id,
	type: 'feedback',
	definitionId: 'Layer',
	connectionId: pp,
	options: { layer: v(layer) },
	isInverted: v(false),
	styleOverrides,
	upgradeIndex: -1,
	children: {},
})

/**
 * A clear. Dark red at rest, bright red while its layer has something on it, so the key says
 * whether pressing it will change anything. Clear All is bright red always.
 */
export const clearKey = (pp, { label, layer, icon, notes }) =>
	key({
		style: { icon: `${icon}-paper`, label, bg: layer ? DANGER_REST : RED },
		notes,
		feedbacks: layer ? [layerActive(`neo-clear-${layer}-on`, pp, layer, [override(`neo-clear-${layer}-bg`, 'box0', 'color', RED_BRIGHT)])] : [],
		actionSets: { down: [clearAction(`neo-clear-${layer ?? 'all'}`, pp, layer)], up: [] },
	})

const macro = (id, pp, uuid) => ({
	id,
	definitionId: 'marcoIdTrigger',
	connectionId: pp,
	options: { macro_id_dropdown: v(uuid) },
	upgradeIndex: null,
	type: 'action',
})

export const freezeKey = (pp) =>
	key({
		style: { icon: 'still', label: 'Freeze', bg: PP1.bg },
		notes: 'Fires the ProPresenter macro "Freeze" (Slide Destination), as the PP1 page does.',
		actionSets: { down: [macro('neo-freeze', pp, '3C693319-8EAC-4499-86C3-DE7A13FABCE9')], up: [] },
	})

export const allScreensKey = (pp) =>
	key({
		style: { icon: 'macro', label: 'All Screens', bg: PP1.bg },
		notes: 'Fires the ProPresenter macro "All Screens", as the PP1 page does.',
		actionSets: { down: [macro('neo-all-screens', pp, '26024D56-D05A-4E62-A0EC-C650B6E7BDD1')], up: [] },
	})

/** Videohub: the back wall is output 8; PP1 is input 16 (the front's picture), PP1B input 15. */
export const BACK_WALL = { output: 8, front: 16, own: 15 }

const route = (id, vh, source, destination) => ({
	id,
	definitionId: 'route',
	connectionId: vh,
	options: { source: v(source), destination: v(destination), ignore_lock: v(true) },
	upgradeIndex: 3,
	type: 'action',
})

/**
 * The back wall: the same picture as the front (PP1), or its own (PP1B). Press to swap. The
 * caption is what it shows now; violet while it differs from the front wall.
 */
export const backWallKey = (vh) => {
	const now = `$(videohub:output_${BACK_WALL.output}_input)`
	return key({
		style: { icon: 'wall-swap', label: `Back ${now}`, bg: PP1.bg },
		notes: 'Swaps the back wall (Videohub output 8) between PP1, the front\'s picture, and PP1B, its own: the same routes as the Booth Routing page\'s Backwall keys.',
		feedbacks: [when('neo-backwall-own', `${now} != $(videohub:output_14_input)`, [override('neo-backwall-bg', 'box0', 'color', 0x3b2a6b)])],
		actionSets: {
			down: [
				logicIf(
					'neo-backwall-press',
					[when('neo-backwall-cond', `${now} == "PP1"`)],
					[route('neo-backwall-own-route', vh, BACK_WALL.own, BACK_WALL.output)],
					[route('neo-backwall-front-route', vh, BACK_WALL.front, BACK_WALL.output)]
				),
			],
			up: [],
		},
	})
}

/* ------------------------------------------------------------------ Pages ---------------- */

const page = (name, controls) => {
	const p = { name, gridSize: { ...GRID_SIZE }, controls }
	restylePage(p)
	return p
}

const place = (cells) => {
	const controls = {}
	for (const [{ row, col }, control] of cells) (controls[row] ??= {})[col] = control
	return controls
}

/**
 * Build the four pages.
 *
 * @param {object} args
 * @param {{audio: number, scenes: number, timers: number, clears: number}} args.numbers
 * @param {{sq: string, pp: string, vh: string}} args.ids  connection ids
 * @param {object} args.tracks  `tools/pp1-tracks.js`: its key builders and names
 */
export function buildNeoPages({ numbers, ids, tracks }) {
	const { sq, pp, vh } = ids
	const k = NEO.keys

	const audioLcd = lcd({
		icon: 'playlist',
		text: v(`${cv(tracks.TITLE_VARIABLE)}\n${cv(tracks.VARIABLE)} · Vol ${cv(tracks.VOLUME_VARIABLE)}`),
		bg: TRACKS_BG,
		notes: 'The track and its state, until a mic battery runs low: then amber, or red when critical, with the mic.',
		feedbacks: batteryWarnings('neo-audio-batt'),
	})
	const scenesLcd = lcd({
		icon: 'scene-recall',
		text: expr(`concat(${sceneNameExpr()}, "\\nMain ", ${MAIN_LEVEL})`),
		bg: SQ7.bg,
		notes: 'The scene the desk last recalled and the Main LR level, until a mic battery runs low.',
		feedbacks: batteryWarnings('neo-scenes-batt'),
	})

	const toScenes = (id) => touch({ id, page: numbers.scenes, name: 'Scenes', accent: SQ7.accent, icon: 'page-down' })
	const toAudio = (id, icon) => touch({ id, page: numbers.audio, name: 'Audio', accent: SQ7.accent, icon, extra: refreshTracks(tracks) })
	const toClears = (id) => touch({ id, page: numbers.clears, name: 'Clears', accent: PP1.accent, icon: 'page-down' })
	const toTimers = (id) => touch({ id, page: numbers.timers, name: 'Timers', accent: PP1.accent, icon: 'page-up' })

	const audio = page(PAGE_NAMES.audio, place([
		[k[0], sceneKey(sq, TCB_SAM)],
		[k[1], hotMuteKey(sq)],
		[k[2], fxMuteKey(sq)],
		[k[3], tracks.fadeKey()],
		[k[4], tracks.playPauseKey()],
		[k[5], tracks.skipKey()],
		[k[6], volumeKey(tracks, 'down')],
		[k[7], volumeKey(tracks, 'up')],
		[NEO.touchLeft, toScenes('neo-audio-left')],
		[NEO.lcd, audioLcd],
		[NEO.touchRight, toScenes('neo-audio-right')],
	]))

	const home = touch({ id: 'neo-scenes-home', page: numbers.audio, name: 'Home', accent: TRACKS_BG, icon: 'home', extra: refreshTracks(tracks) })
	const scenes = page(PAGE_NAMES.scenes, place([
		...SCENES.map((s, i) => [k[i], sceneKey(sq, s)]),
		[k[5], hotMuteKey(sq)],
		[k[6], mainLevelKey()],
		[k[7], home],
		[NEO.touchLeft, toAudio('neo-scenes-left', 'page-up')],
		[NEO.lcd, scenesLcd],
		[NEO.touchRight, toAudio('neo-scenes-right', 'page-up')],
	]))

	const timers = page(PAGE_NAMES.timers, place([
		[k[0], presetKey(pp, PRESETS[0])],
		[k[1], presetKey(pp, PRESETS[1])],
		[k[2], startStopKey(pp, 'main')],
		[k[3], resetKey(pp, 'main')],
		[k[4], presetKey(pp, PRESETS[2])],
		[k[5], startStopKey(pp, 'segment')],
		[k[6], resetKey(pp, 'segment')],
		[k[7], nudgeKey(pp, 'main', 60)],
		[NEO.touchLeft, toClears('neo-timers-left')],
		[NEO.lcd, timersLcd()],
		[NEO.touchRight, toClears('neo-timers-right')],
	]))

	const clears = page(PAGE_NAMES.clears, place([
		[k[0], clearKey(pp, { label: 'Clear Audio', layer: 'audio', icon: 'clear-audio', notes: 'Clears ProPresenter\'s audio layer. Bright red while audio is playing.' })],
		[k[1], clearKey(pp, { label: 'Clear Media', layer: 'media', icon: 'clear-media', notes: 'Clears ProPresenter\'s media layer, front and back walls both: media is one layer for every screen. Bright red while media is up.' })],
		[k[2], clearKey(pp, { label: 'Clear All', icon: 'clear', notes: 'ProPresenter\'s "Clear All" group: every layer, every screen.' })],
		[k[3], backWallKey(vh)],
		[k[4], freezeKey(pp)],
		[k[5], allScreensKey(pp)],
		[k[6], startStopKey(pp, 'segment')],
		[k[7], startStopKey(pp, 'main')],
		[NEO.touchLeft, toTimers('neo-clears-left')],
		[NEO.lcd, timersLcd()],
		[NEO.touchRight, toTimers('neo-clears-right')],
	]))

	return { [numbers.audio]: audio, [numbers.scenes]: scenes, [numbers.timers]: timers, [numbers.clears]: clears }
}

/** Connection ids by module, from a live export. Throws if one the pages need is missing. */
export function connectionIds(full) {
	const find = (moduleId) => {
		const hit = Object.entries(full.instances).find(([, i]) => i.moduleId === moduleId)
		if (!hit) throw new Error(`no ${moduleId} connection on this rig`)
		return hit[0]
	}
	return { sq: find('allenheath-sq'), pp: find('renewedvision-propresenter-api'), vh: find('bmd-videohub') }
}

/** Page numbers: an existing Neo page keeps its number, a new one goes after the last page. */
export function pageNumbers(full) {
	const existing = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
	let next = Math.max(...Object.keys(full.pages).map(Number)) + 1
	return Object.fromEntries(Object.entries(PAGE_NAMES).map(([slot, name]) => [slot, existing[name] ?? next++]))
}

