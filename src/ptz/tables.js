/**
 * The camera's own value lists, read out of the FoMaKo UV602's web UI (`GetEnv VideoParam`,
 * the `st*List` arrays) and its VISCA list (`/img/Visca_Command_ListV1.0-2025.07.07.pdf`), on
 * 2026-09-10. They are here, in one place, because the poller prints the labels and the setup
 * page's knobs and keys step through the codes, and the two must agree exactly or a caption
 * will name a value the key cannot reach.
 *
 * THESE ARE NOT THE MODULE'S TABLES. `ptzoptics-visca` ships Sony's iris and shutter scales
 * (`0x11` = F1.8, `0x04` = 1/100). This camera answers the same inquiries with its OWN indexes:
 * iris 12 is F1.8 here, not F4.0, and shutter 18 is 1/60. Measured against the web UI on
 * 2026-09-10; the module's labels would have been wrong on every value.
 */

/**
 * Shutter: index → speed. The camera keeps two lists in one index space, 0-16 for 50 Hz
 * output formats and 17-33 for 60 Hz ones. At 1080p59.94 the 60 Hz half applies, and a value
 * from the other half is mapped across by the camera (4 → 21, measured), so the knob only ever
 * walks 17..33.
 */
export const SHUTTER = {
	0: '1/25', 1: '1/50', 2: '1/75', 3: '1/100', 4: '1/120', 5: '1/150', 6: '1/215', 7: '1/300',
	8: '1/425', 9: '1/600', 10: '1/1000', 11: '1/1250', 12: '1/1750', 13: '1/2500', 14: '1/3500',
	15: '1/6000', 16: '1/10000',
	17: '1/30', 18: '1/60', 19: '1/90', 20: '1/100', 21: '1/125', 22: '1/180', 23: '1/250',
	24: '1/350', 25: '1/500', 26: '1/725', 27: '1/1000', 28: '1/1500', 29: '1/2000', 30: '1/3000',
	31: '1/4000', 32: '1/6000', 33: '1/10000',
}

/** Iris: index → f-stop. 0 is closed, 12 is wide open. */
export const IRIS = {
	0: 'Close', 1: 'F11', 2: 'F9.6', 3: 'F8', 4: 'F6.8', 5: 'F5.6', 6: 'F4.8', 7: 'F4', 8: 'F3.4',
	9: 'F2.8', 10: 'F2.4', 11: 'F2', 12: 'F1.8',
}

/**
 * White balance colour temperatures: VISCA mode code → kelvin. The codes are NOT in
 * temperature order — the whole-hundred presets got the low codes first and the in-between
 * steps were added later — which is why this is a table and not arithmetic.
 */
export const WB_KELVIN = {
	0x0c: 2400, 0x0d: 2500, 0x0e: 2600, 0x0f: 2700, 0x10: 2800, 0x11: 2900,
	0x01: 3000, 0x12: 3100, 0x13: 3200, 0x14: 3300, 0x15: 3400,
	0x07: 3500, 0x16: 3600, 0x17: 3700, 0x18: 3800, 0x19: 3900,
	0x02: 4000, 0x1a: 4100, 0x1b: 4200, 0x1c: 4300, 0x1d: 4400,
	0x08: 4500, 0x1e: 4600, 0x1f: 4700, 0x21: 4800, 0x22: 4900,
	0x04: 5000, 0x23: 5100, 0x24: 5200, 0x25: 5300, 0x26: 5400,
	0x09: 5500, 0x27: 5600, 0x28: 5700, 0x29: 5800, 0x2a: 5900,
	0x0a: 6000, 0x2b: 6100, 0x2c: 6200, 0x2d: 6300, 0x2e: 6400,
	0x06: 6500, 0x2f: 6600, 0x30: 6700, 0x31: 6800, 0x32: 6900,
	0x0b: 7000, 0x33: 7100,
}

/** The white balance modes that are not a temperature. */
export const WB_MODES = { 0x00: 'Auto', 0x05: 'Manual', 0x03: '1-Push' }

export const WB_MIN = 2400
export const WB_MAX = 7100
export const WB_STEP = 100

/** Kelvin → VISCA code, the inverse of WB_KELVIN. */
export const WB_CODE = Object.fromEntries(Object.entries(WB_KELVIN).map(([code, k]) => [k, Number(code)]))

/** The label the poller prints for a temperature, and the captions compare against. */
export const kelvinLabel = (k) => `${k}K`

/**
 * Value ranges, measured on 2026-09-10 by setting past the end and reading back what the
 * camera kept. Every one is inclusive.
 */
export const RANGE = {
	shutter: [17, 33],
	iris: [0, 12],
	gain: [0, 15],
	sharp: [0, 15],
	expcomp: [0, 14],
	wdr: [0, 8],
	nr: [0, 8],
}

/** Exposure compensation is centred: level 7 is 0 EV. */
export const EXPCOMP_ZERO = 7

/**
 * The rig's standard values, from docs/production/cameras.md: 180° at 59.94 — 1/125 is the
 * nearest this camera has to 1/120 — no gain, no exposure compensation, no sharpening, and the
 * stage's 4600K. Knob presses return to these.
 */
export const STANDARD = { shutter: 21, gain: 0, expcomp: EXPCOMP_ZERO, sharp: 0, wbk: 4600 }

/** Labels for the two noise reducers and WDR: 0 is off; NR 8 is the camera's auto. */
export const levelLabel = (n, auto = false) => (n === 0 ? 'Off' : auto && n === 8 ? 'Auto' : String(n))

/** Exposure compensation as a signed offset from centre, or Off. */
export const expcompLabel = (on, level) => (on ? (level > EXPCOMP_ZERO ? `+${level - EXPCOMP_ZERO}` : String(level - EXPCOMP_ZERO)) : 'Off')
