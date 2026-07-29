import { SHAPES } from './glyphs/index.js'

/**
 * @typedef {object} Icon
 * @property {string} name       Library name. Becomes `$(image:<name>)` in Companion.
 * @property {string} shape      Key into SHAPES.
 * @property {string} color      Key into COLORS.
 * @property {string} collection Companion image-library folder.
 * @property {string} description Shown in the library UI.
 */

/** @returns {Icon} */
const icon = (name, shape, color, collection, description) => ({
	name,
	shape,
	color,
	collection,
	description,
})

const power = [
	icon('power-on', 'power', 'on', 'power', 'Generic power on'),
	icon('power-off', 'power', 'off', 'power', 'Generic power off'),
	icon('power-toggle', 'bolt', 'warn', 'power', 'Generic power toggle'),
	icon('projector-on', 'projector', 'on', 'power', 'Projectors on'),
	icon('projector-warming', 'projector', 'warn', 'power', 'Projectors warming up'),
	icon('projector-cooling', 'projector', 'warn', 'power', 'Projectors cooling down'),
	icon('projector-off', 'projector', 'off', 'power', 'Turn projectors off'),
	icon('projector-idle', 'projector', 'idle', 'power', 'Projectors currently off'),
	icon('pa-on', 'pa', 'on', 'power', 'PA system on'),
	icon('pa-off', 'pa', 'off', 'power', 'PA system off'),
	icon('amp-on', 'amp', 'on', 'power', 'Amplifiers on'),
	icon('amp-off', 'amp', 'off', 'power', 'Amplifiers off'),
	icon('house-lights-on', 'house-lights', 'on', 'power', 'House lights up'),
	icon('house-lights-off', 'house-lights', 'off', 'power', 'Take house lights down'),
	icon('house-lights-idle', 'house-lights', 'idle', 'power', 'House lights currently down'),
	icon('standby', 'standby', 'warn', 'power', 'Standby'),
	icon('mains-power', 'plug', 'neutral', 'power', 'Mains power'),
]

/**
 * Camera sources in their three bus states.
 *
 * Program is red and preview green: that is the broadcast convention, and getting it
 * backwards on a live rig would be worse than having no colour at all.
 */
const cameras = []
for (let c = 1; c <= 6; c++) {
	cameras.push(icon(`cam${c}-idle`, 'camera', 'idle', 'video', `Camera ${c} idle`))
	cameras.push(icon(`cam${c}-preview`, 'camera', 'on', 'video', `Camera ${c} on preview`))
	cameras.push(icon(`cam${c}-program`, 'camera', 'off', 'video', `Camera ${c} on program`))
}

const video = [
	...cameras,
	icon('program', 'program', 'off', 'video', 'Program bus'),
	icon('preview', 'preview', 'on', 'video', 'Preview bus'),
	icon('cut', 'cut', 'video', 'video', 'Cut transition'),
	icon('auto', 'auto', 'video', 'video', 'Auto transition'),
	icon('ftb', 'ftb', 'off', 'video', 'Fade to black'),
	icon('dsk-on', 'dsk', 'on', 'video', 'Downstream key on'),
	icon('dsk-off', 'dsk', 'idle', 'video', 'Downstream key off'),
	icon('key-on', 'key', 'on', 'video', 'Upstream key on'),
	icon('key-off', 'key', 'idle', 'video', 'Upstream key off'),
	icon('aux', 'aux', 'video', 'video', 'Aux output'),
	icon('tally-live', 'tally', 'off', 'video', 'Tally live'),
	icon('tally-preview', 'tally', 'on', 'video', 'Tally preview'),
	icon('macro-run', 'macro-run', 'video', 'video', 'Run macro'),
	icon('macro-stop', 'macro-stop', 'off', 'video', 'Stop macro'),
	icon('transition', 'transition', 'video', 'video', 'Transition'),
	icon('still', 'still', 'video', 'video', 'Still / background image'),
]

const routing = [
	icon('route', 'route', 'route', 'routing', 'Route a source to a destination'),
	icon('take', 'take', 'route', 'routing', 'Take the pending route'),
	icon('route-lock', 'route-locked', 'warn', 'routing', 'Routing locked'),
	icon('unlock', 'unlock', 'on', 'routing', 'Routing unlocked'),
	icon('source', 'source', 'route', 'routing', 'Router source'),
	icon('destination', 'destination', 'route', 'routing', 'Router destination'),
	icon('matrix', 'matrix', 'route', 'routing', 'Routing matrix'),
]

/**
 * Home-page folders. Colour is the system's identity, matched to how each page already
 * reads on the deck, so the folder and the page it opens agree.
 */
const folders = [
	icon('folder-power', 'folder-power', 'on', 'folders', 'Open the Power page'),
	icon('folder-present', 'folder-present', 'present', 'folders', 'Open the ProPresenter page'),
	icon('folder-lighting', 'folder-lighting', 'warn', 'folders', 'Open the lighting page'),
	icon('folder-video', 'folder-video', 'video', 'folders', 'Open the ATEM page'),
	icon('folder-audio', 'folder-audio', 'audio', 'folders', 'Open the audio page'),
	icon('folder-routing', 'folder-routing', 'route', 'folders', 'Open the router page'),
]

/**
 * Host metrics for the Raspberry Pi that Companion runs on. Colour is neutral here on
 * purpose: these keys are coloured by feedback from the live value, so a fixed hue would
 * fight the state it is meant to show.
 */
const system = [
	icon('cpu', 'cpu', 'neutral', 'system', 'Processor load'),
	icon('temperature', 'thermometer', 'neutral', 'system', 'CPU temperature'),
	icon('memory', 'memory', 'neutral', 'system', 'Memory in use'),
	icon('disk', 'disk', 'neutral', 'system', 'Disk in use'),
	icon('uptime', 'clock', 'neutral', 'system', 'Time since boot'),
	icon('network', 'network', 'neutral', 'system', 'Network address'),
	// The filesystem going read-only is a silent Pi failure: Companion keeps running and
	// nothing it writes survives a restart. Open padlock is healthy, closed is the fault.
	icon('storage-ok', 'unlock', 'on', 'system', 'Filesystem is writable'),
	icon('storage-locked', 'lock', 'off', 'system', 'Filesystem has gone read-only'),
	icon('folder-system', 'folder-system', 'audio', 'folders', 'Open the system page'),
	icon('folder-wireless', 'folder-wireless', 'on', 'folders', 'Open the wireless mics page'),
]

const present = [
	icon('slide-next', 'slide-next', 'present', 'present', 'Next slide'),
	icon('slide-prev', 'slide-prev', 'present', 'present', 'Previous slide'),
	icon('slide-first', 'slide-first', 'present', 'present', 'Jump to first slide'),
	icon('slide-last', 'slide-last', 'present', 'present', 'Jump to last slide'),
	icon('clear-all', 'clear', 'off', 'present', 'Clear everything'),
	icon('clear-slide', 'clear-slide', 'off', 'present', 'Clear the slide layer'),
	icon('clear-props', 'clear-props', 'off', 'present', 'Clear props'),
	icon('clear-audio', 'clear-audio', 'off', 'present', 'Clear audio'),
	icon('logo', 'logo', 'present', 'present', 'Show logo'),
	icon('stage-display', 'stage-display', 'present', 'present', 'Stage display'),
	icon('message', 'message', 'present', 'present', 'Stage message'),
	icon('timer-start', 'timer-start', 'on', 'present', 'Start timer'),
	icon('timer-stop', 'timer-stop', 'off', 'present', 'Stop timer'),
	icon('timer-reset', 'timer-reset', 'warn', 'present', 'Reset timer'),
	icon('media', 'media', 'present', 'present', 'Play media'),
	icon('prop', 'prop', 'present', 'present', 'Trigger prop'),
	icon('playlist', 'playlist', 'present', 'present', 'Playlist'),
	icon('focus-next', 'focus-next', 'present', 'present', 'Focus the next presentation'),
	icon('focus-prev', 'focus-prev', 'present', 'present', 'Focus the previous presentation'),

	/*
	 * Stage looks. Colour is the SECOND signal here, behind silhouette — see the glyphs.
	 *
	 * The two water looks share a hue on purpose. They are one subject in two states, and
	 * giving them separate colours would claim a distinction that is not there while making
	 * the pair harder to group at a glance.
	 */
	/*
	 * The MA2 page. Its transport reuses the slide-triangle geometry under lighting names,
	 * because a triangle pointing forward is the same idea whether it is a slide or a cue —
	 * but the NAME has to say cue, or a future reader wires a lighting desk to a slide icon
	 * and quietly builds a page that lies about what it drives.
	 */
	icon('cue-next', 'slide-next', 'warn', 'present', 'Advance the lighting cue'),
	icon('cue-back', 'slide-prev', 'warn', 'present', 'Step the lighting cue back'),
	icon('executor', 'executor', 'warn', 'present', 'Lighting executor'),

	icon('clear-messages', 'clear-messages', 'off', 'present', 'Clear the messages layer'),
	icon('clear-announce', 'clear-announce', 'off', 'present', 'Clear the announcements layer'),
	icon('clear-media', 'clear-media', 'off', 'present', 'Clear the media layer'),
	icon('clear-video', 'clear-video', 'off', 'present', 'Clear the video input layer'),

	icon('green-wall', 'green-wall', 'on', 'present', 'Foliage wall look'),
	icon('water-calm', 'water-calm', 'audio', 'present', 'Calm water look'),
	icon('water-storm', 'water-storm', 'audio', 'present', 'Storm water look'),
	icon('thunder', 'thunder', 'warn', 'present', 'Thunder sting'),
]

const audio = [
	icon('mute-on', 'mute', 'off', 'audio', 'Muted'),
	icon('mute-off', 'speaker', 'on', 'audio', 'Unmuted'),
	icon('fader', 'fader', 'audio', 'audio', 'Fader'),
	icon('mix', 'mix', 'audio', 'audio', 'Mix'),
	icon('scene-recall', 'scene-recall', 'audio', 'audio', 'Recall a scene'),
	icon('gain', 'gain', 'audio', 'audio', 'Gain'),
	icon('aux-send', 'aux-send', 'audio', 'audio', 'Aux send'),
	icon('talkback', 'talkback', 'audio', 'audio', 'Talkback'),
	icon('pfl', 'pfl', 'audio', 'audio', 'Pre-fade listen'),
	icon('phantom', 'phantom', 'warn', 'audio', 'Phantom power'),
	icon('meter', 'meter', 'audio', 'audio', 'Level meter'),
	icon('dca', 'dca', 'audio', 'audio', 'DCA group'),
	icon('mono', 'mono', 'audio', 'audio', 'Mono output'),
	icon('mains', 'mains', 'audio', 'audio', 'Main outputs'),
]

/** Colour grades with level, so a glance reads healthy/low/flat without reading the bars. */
const BATTERY_COLORS = ['off', 'warn', 'warn', 'on', 'on']
const RF_COLORS = ['off', 'warn', 'on', 'on']

const wireless = [
	icon('mic-on', 'mic', 'on', 'wireless', 'Microphone live'),
	icon('mic-off', 'mic', 'idle', 'wireless', 'Microphone off'),
	icon('mic-muted', 'mic-muted', 'off', 'wireless', 'Microphone muted'),
	icon('mic-alert', 'mic', 'warn', 'wireless', 'Microphone needs attention'),
	...BATTERY_COLORS.map((color, n) =>
		icon(`battery-${n}`, 'battery', color, 'wireless', `Transmitter battery ${n} of 4`)
	),
	...RF_COLORS.map((color, n) => icon(`rf-${n}`, 'rf', color, 'wireless', `RF signal ${n} of 3`)),
	// Bare antenna, no bars: nothing is transmitting, which is not a signal failure.
	icon('rf-idle', 'rf', 'idle', 'wireless', 'No transmitter on air'),
	icon('tx-fault', 'tx-fault', 'off', 'wireless', 'Transmitter fault'),
]

const utility = [
	icon('page-up', 'page-up', 'neutral', 'utility', 'Previous page'),
	icon('page-down', 'page-down', 'neutral', 'utility', 'Next page'),
	icon('home', 'home', 'neutral', 'utility', 'Home page'),
	icon('back', 'back', 'neutral', 'utility', 'Back'),
	icon('macro', 'macro', 'neutral', 'utility', 'Run a macro'),
	icon('lock-surface', 'lock', 'warn', 'utility', 'Lock the surface'),
	icon('blank', 'blank', 'idle', 'utility', 'Intentionally blank'),
	icon('settings', 'settings', 'neutral', 'utility', 'Settings'),
	icon('alert', 'alert', 'warn', 'utility', 'Alert'),
]

/**
 * Shapes that land on buttons whose background is feedback-driven, and therefore need
 * high-contrast variants for the per-state swap. See `contrastVariant` in wiring.js.
 */
const CONTRAST_SHAPES = [
	'projector', 'pa', 'clear-slide', 'clear-audio', 'camera', 'media', 'macro-run',
	// The ATEM bus and its transition column: every one of these sits on a key whose background
	// is red when live, green when cued, and near-black when neither. No single icon colour
	// survives all three, so each needs its pair. See src/atem.js.
	'message', 'cut', 'auto',
	// PP1 sits on strong flat colours the operator chose — bright orange transport, red clears,
	// blue looks. A semantic hue on top of those is not reliably legible (the orange transport
	// keys measured 1.31:1), so these need the paper/ink pair to fall back on. The rest of the
	// page keeps its colour, because on the dark backgrounds it clears the threshold easily.
	'clear', 'stage-display', 'slide-prev', 'slide-next',
	'clear-messages', 'clear-props', 'clear-announce', 'clear-media', 'clear-video',
	// MA2's keys sit on saturated green and red, where an amber icon measures about 2:1.
	'ftb', 'executor', 'fader',
	// VH arms a destination by turning its key light violet, where the violet routing icon
	// vanishes into its own background.
	'destination', 'source',
	// A muted DCA turns its key red, where the audio-blue icon drops to about 2:1.
	'dca',
]

const contrast = CONTRAST_SHAPES.flatMap((shape) => [
	icon(`${shape}-paper`, shape, 'paper', 'contrast', `${shape} (light, for dark backgrounds)`),
	icon(`${shape}-ink`, shape, 'ink', 'contrast', `${shape} (dark, for light backgrounds)`),
])

/** @type {Icon[]} */
export const ICONS = [
	...power,
	...video,
	...routing,
	...present,
	...folders,
	...system,
	...audio,
	...wireless,
	...utility,
	...contrast,
]

/**
 * Resolve an icon to concrete geometry, expanding the `battery-N` / `rf-N` level families.
 *
 * @param {Icon} entry
 * @returns {{paths: Array<object|string>}}
 */
export function resolveShape(entry) {
	const shape = SHAPES[entry.shape]
	if (typeof shape.levels !== 'function') return shape
	const level = Number(entry.name.slice(entry.name.lastIndexOf('-') + 1))
	/*
	 * A non-numeric suffix (`rf-idle`) means the family's BASE drawing, with no level marks
	 * at all. That is not the same picture as level zero: `rf-0` is a red antenna reading
	 * "no signal", which is a fault, whereas an idle rig has nothing to report and must not
	 * look like one. Levels are numbers; absence is a word.
	 */
	return Number.isInteger(level) ? shape.levels(level) : shape
}
