/**
 * The PTZ setup page: everything about the camera that is set before a service, not during.
 *
 *   col:   0         1         2            3          4         5         6        7        8
 *   row 1: Exposure  WB        Backlight    Power      Track     Close-up  Half     Full     ◂ PTZ
 *   row 2: Mode      AT speed  Sensitivity  Placement  Headroom  Lost      —        —        —
 *   row 3: Auto      —         —            —          —         —         —        —        —
 *
 * A SUB-PAGE, NOT A TENTH FOLDER. The folder row is nine keys for nine pages and that fit is
 * what makes it affordable; this page is reached from the run page's Setup key and leaves by
 * the ◂ PTZ key or the folder row, which on this page marks the PTZ folder as current so the
 * deck still says where you are. Nothing on the other eight pages points here.
 *
 * Tracking on/off and the framing keys are repeated from the run page on purpose: the
 * tracking parameters are only worth adjusting while watching tracking work, and flipping
 * back to the run page to switch it on would make every adjustment a three-press trip. Auto
 * is repeated for the same reason, under Exposure: it is the key pressed after the exposure
 * mode has been stepped somewhere unhelpful.
 */

import { autoKey, backlightKey, exposureKey, powerKey, whiteBalanceKey } from './image.js'
import { navKey } from './keys.js'
import { SETTINGS, cycleKey, framingKey, trackKey } from './tracking.js'

export const PAGE_NAME = 'PTZ Setup'

/**
 * Build rows 1-3 of the setup page.
 *
 * @param {string} conn   the ptzoptics-visca connection id
 * @param {string} host   the camera address, for the web-API keys
 * @param {{run: number|string}} pages  page numbers the jumps land on
 * @returns {Record<number, Record<number, object>>} row → column → control
 */
export function buildSetupKeys(conn, host, pages) {
	const settings = Object.fromEntries(SETTINGS.map((spec, i) => [i, cycleKey(spec, host)]))
	return {
		1: {
			0: exposureKey(conn),
			1: whiteBalanceKey(conn),
			2: backlightKey(conn),
			3: powerKey(conn),
			4: trackKey(host, 'setup-track'),
			5: framingKey(host, 'close', 'setup-frame-close'),
			6: framingKey(host, 'half', 'setup-frame-half'),
			7: framingKey(host, 'full', 'setup-frame-full'),
			8: navKey('back', { icon: 'ptz-back', label: 'PTZ', notes: 'Back to the PTZ run page.' }, pages.run),
		},
		2: settings,
		3: { 0: autoKey(conn) },
	}
}
