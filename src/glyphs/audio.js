/**
 * Allen & Heath SQ / audio glyphs.
 *
 * `speaker` and `mute` share a cone so the muted state reads as the same object with
 * something done to it, rather than as a different object.
 */

/** Speaker cone, shared by `speaker` and `mute`. */
const CONE = 'M20 46 H38 L58 28 V92 L38 74 H20 Z'

export default {
	speaker: {
		paths: [CONE, 'M72 44 A22 22 0 0 1 72 76'],
	},

	mute: {
		paths: [CONE, { line: [70, 46, 98, 74] }, { line: [98, 46, 70, 74] }],
	},

	/**
	 * A slot with a knob in it. A bare track plus a wide bar was tried first and read as a
	 * crucifix: the knob has to be narrower than the slot is tall to say "slider".
	 */
	fader: {
		paths: [{ rect: [46, 20, 28, 80, 14] }, { rect: [46, 42, 28, 14, 4], fill: true }],
	},

	mix: {
		paths: [
			{ line: [30, 22, 30, 98] },
			{ line: [60, 22, 60, 98] },
			{ line: [90, 22, 90, 98] },
			{ rect: [18, 40, 24, 12, 3], fill: true },
			{ rect: [48, 62, 24, 12, 3], fill: true },
			{ rect: [78, 32, 24, 12, 3], fill: true },
		],
	},

	'scene-recall': {
		paths: [{ rect: [22, 54, 76, 40, 6] }, 'M60 20 V44 M48 34 L60 46 L72 34'],
	},

	gain: {
		paths: ['M22 92 L86 34', 'M64 30 L90 30 L90 56'],
	},

	/** A branch leaving a bus. The earlier box-and-curve version read as a flag. */
	'aux-send': {
		paths: [
			{ line: [20, 82, 100, 82] },
			{ line: [60, 82, 60, 44] },
			{ d: 'M48 48 L60 26 L72 48 Z', fill: true },
		],
	},

	talkback: {
		paths: [{ rect: [40, 22, 26, 40, 13] }, 'M28 56 A25 25 0 0 0 78 56', 'M90 40 A22 22 0 0 1 90 76'],
	},

	pfl: {
		paths: ['M26 68 V56 A34 34 0 0 1 94 56 V68', { rect: [20, 66, 20, 28, 8] }, { rect: [80, 66, 20, 28, 8] }],
	},

	phantom: {
		paths: [
			{ circle: [60, 52, 28] },
			{ line: [60, 38, 60, 66] },
			{ line: [46, 52, 74, 52] },
			{ line: [38, 92, 82, 92] },
		],
	},

	meter: {
		paths: [
			{ line: [28, 86, 28, 68] },
			{ line: [48, 86, 48, 50] },
			{ line: [68, 86, 68, 32] },
			{ line: [88, 86, 88, 54] },
		],
	},

	/** Several channels feeding one fader, which is what a DCA is. */
	dca: {
		paths: [
			{ circle: [26, 32, 7], fill: true },
			{ circle: [26, 60, 7], fill: true },
			{ circle: [26, 88, 7], fill: true },
			'M40 32 H62 M40 60 H62 M40 88 H62',
			{ line: [80, 24, 80, 96] },
			{ rect: [66, 52, 28, 12, 3], fill: true },
		],
	},

	mono: {
		paths: [{ circle: [42, 60, 20] }, { line: [62, 60, 98, 60] }],
	},

	/** Two master faders. Three bare lines read as a pi symbol. */
	mains: {
		paths: [
			{ rect: [28, 20, 24, 80, 12] },
			{ rect: [68, 20, 24, 80, 12] },
			{ rect: [28, 42, 24, 12, 3], fill: true },
			{ rect: [68, 52, 24, 12, 3], fill: true },
		],
	},
}
