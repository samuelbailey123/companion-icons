/**
 * The custom variables the PTZ page runs on.
 *
 * Two kinds live here. OPERATOR STATE — drive speed, the dialled preset, whether save is
 * armed — is written by the deck and persists across a Companion restart, so the knobs come
 * back where they were left. CAMERA STATE — position, zoom, focus mode and the rest — is
 * written by the poller in `poller.js` as one JSON document and deliberately does NOT
 * persist: a stale pan angle restored after a reboot would be worse than a blank one.
 *
 * The module publishes no variables of its own, which is why the camera's state has to be
 * read by the poller rather than simply referenced.
 */

/** Where the pan/tilt drive speed lives, 1..24. The module's own default is 12. */
export const SPEED = 'ptz_speed'
/**
 * Derived from SPEED whenever it changes: tilt is capped at the camera's 20, and zoom and
 * focus run on a 0..7 scale. Kept as their own variables because the module's custom-command
 * parameters take a variable but not an expression.
 */
export const TILT_SPEED = 'ptz_tspeed'
export const ZOOM_SPEED = 'ptz_zspeed'
export const FOCUS_SPEED = 'ptz_fspeed'
/** The preset number the dial is showing, 1..254. */
export const PRESET = 'ptz_preset'
/** The preset most recently recalled or saved from the deck; lights that key. */
export const LAST_PRESET = 'ptz_last'
/** 1 while the next preset press will SAVE rather than recall. */
export const ARMED = 'ptz_armed'
/** The camera's AI-tracking settings as one JSON document, from `ptz_web.py` (see web.js). */
export const TRACK = 'ptz_track'
/** The ATEM input the camera is plugged into, so the stop key can show its tally. */
export const ATEM_INPUT = 'ptz_atem_input'

/**
 * The camera's state as one JSON document from the poller. Captions and conditions read
 * fields straight out of it with `jsonpath()` rather than through per-field variables: a
 * trigger does not wait for `exec` to finish before running its next action, so anything
 * unpacked in the same chain would lag the JSON by a whole poll — and a key that branches
 * on a stale reading toggles the wrong way.
 */
export const STATE = 'ptz_state'

/** Field names inside STATE, as the poller writes them. */
export const FIELDS = ['online', 'pan', 'tilt', 'zoom', 'focus', 'ae', 'wb', 'backlight', 'power', 'menu']

export const DEFAULT_SPEED = 12

/**
 * Definitions in Companion's `custom_variables` export shape, keyed by name.
 *
 * @returns {Record<string, {description: string, defaultValue: string, persistCurrentValue: boolean}>}
 */
export function definitions() {
	const persistent = (description, defaultValue) => ({ description, defaultValue, persistCurrentValue: true })
	const live = (description) => ({ description, defaultValue: '', persistCurrentValue: false })
	return {
		[SPEED]: persistent('PTZ pan/tilt drive speed 1-24, set by the Speed knob', String(DEFAULT_SPEED)),
		[TILT_SPEED]: persistent('PTZ tilt drive speed 1-20, derived from ptz_speed', String(DEFAULT_SPEED)),
		[ZOOM_SPEED]: persistent('PTZ zoom speed 0-7, derived from ptz_speed', '3'),
		[FOCUS_SPEED]: persistent('PTZ focus speed 0-7, derived from ptz_speed', '3'),
		[PRESET]: persistent('PTZ preset number on the Preset dial, 1-254', '1'),
		[LAST_PRESET]: persistent('PTZ preset most recently recalled or saved from the deck', ''),
		[ARMED]: persistent('1 while the next PTZ preset press saves instead of recalling', '0'),
		[TRACK]: live('PTZ AI-tracking settings as JSON from the camera web API: tracking, body, mode, speed, sensitivity, placement, headroom, lost'),
		[ATEM_INPUT]: persistent('ATEM input number the PTZ camera is on, for tally on the Stop key', '8'),
		[STATE]: live('PTZ camera state as JSON, polled every second: online, pan, tilt, zoom, focus, ae, wb, backlight, power, menu'),
	}
}

/**
 * Merge the page's variables into an export's `custom_variables`, keeping sort order stable
 * and leaving every existing variable exactly as it was.
 */
export function mergeDefinitions(existing = {}) {
	const out = structuredClone(existing)
	let sortOrder = Math.max(0, ...Object.values(out).map((c) => c.sortOrder ?? 0))
	for (const [name, def] of Object.entries(definitions())) {
		out[name] = { ...def, sortOrder: out[name]?.sortOrder ?? ++sortOrder }
	}
	return out
}
