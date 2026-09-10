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
 * The setup page's two dials: values the knob has to know to step, because the camera has no
 * up/down command for them. Gain is 0..15; the white balance dial is in kelvin, 2400..7100 in
 * hundreds. Both are operator state and persist; both are also kept in step with the camera by
 * the sync trigger (`picture.js`), so a change from the web page does not leave the dial stale.
 */
export const GAIN = 'ptz_gain'
export const WB_K = 'ptz_wbk'
/**
 * The VISCA code for WB_K. The camera's temperature codes are not in temperature order, and
 * the module's custom-command parameters take a variable but not an expression, so the code is
 * worked out into its own variable the moment the dial moves and sent from there.
 */
export const WB_CODE = 'ptz_wbcode'
/** What the last Match press did, as JSON from `ptz_web.py match` (see web.js). */
export const MATCH = 'ptz_match'

/**
 * The camera's state as one JSON document from the poller. Captions and conditions read
 * fields straight out of it with `jsonpath()` rather than through per-field variables: a
 * trigger does not wait for `exec` to finish before running its next action, so anything
 * unpacked in the same chain would lag the JSON by a whole poll — and a key that branches
 * on a stale reading toggles the wrong way.
 */
export const STATE = 'ptz_state'

/** Field names inside STATE, as the poller writes them. */
export const FIELDS = [
	'online', 'pan', 'tilt', 'zoom', 'focus', 'ae', 'wb', 'backlight', 'power', 'menu',
	// The setup page's values, added 2026-09-10 so its knobs and keys can show what they set.
	'shutter', 'iris', 'gain', 'sharp', 'expcomp', 'wdr', 'nr',
]

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
		[GAIN]: persistent('PTZ gain dial 0-15, set by the Gain knob and kept in step with the camera', '0'),
		[WB_K]: persistent('PTZ white balance dial in kelvin, 2400-7100, set by the WB knob and kept in step with the camera', '4600'),
		[WB_CODE]: persistent('PTZ VISCA white balance code for ptz_wbk, derived whenever the dial moves', '30'),
		[MATCH]: live('PTZ result of the last Match press as JSON from ptz_web.py: online, from, copied, left'),
		[STATE]: live(`PTZ camera state as JSON, polled every second: ${FIELDS.join(', ')}`),
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
