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
	icon('folder-system', 'folder-system', 'audio', 'folders', 'Open the system page'),
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
const CONTRAST_SHAPES = ['projector', 'pa', 'clear-slide', 'clear-audio', 'camera', 'media', 'macro-run']

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
	return shape.levels(Number(entry.name.slice(entry.name.lastIndexOf('-') + 1)))
}
