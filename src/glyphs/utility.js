/**
 * Navigation and surface-utility glyphs.
 *
 * `page-up` / `page-down` use a double chevron deliberately: a single chevron reads as a
 * generic direction arrow, and these sit next to directional buttons on every page.
 */

export default {
	'page-up': {
		paths: ['M34 60 L60 34 L86 60', 'M34 86 L60 60 L86 86'],
	},

	'page-down': {
		paths: ['M34 34 L60 60 L86 34', 'M34 60 L60 86 L86 60'],
	},

	home: {
		paths: ['M26 60 L60 28 L94 60', 'M38 56 V92 H82 V56'],
	},

	back: {
		paths: [{ line: [92, 60, 34, 60] }, 'M56 38 L34 60 L56 82'],
	},

	macro: {
		paths: [{ rect: [24, 24, 72, 72, 12] }, { d: 'M50 46 L74 60 L50 74 Z', fill: true }],
	},

	lock: {
		paths: [{ rect: [30, 56, 60, 40, 8] }, 'M44 56 V42 A16 16 0 0 1 76 42 V56'],
	},

	blank: {
		paths: [{ rect: [24, 24, 72, 72, 12] }],
	},

	/**
	 * Sliders. A circle-with-radials gear approximation was tried first and read as a
	 * crosshair, and would have collided with the `house-lights` sun.
	 */
	settings: {
		paths: [
			{ line: [24, 38, 96, 38] },
			{ line: [24, 60, 96, 60] },
			{ line: [24, 82, 96, 82] },
			{ circle: [42, 38, 7], fill: true },
			{ circle: [74, 60, 7], fill: true },
			{ circle: [54, 82, 7], fill: true },
		],
	},

	alert: {
		paths: ['M60 26 L98 92 H22 Z', { line: [60, 50, 60, 68] }, { circle: [60, 80, 4], fill: true }],
	},
}
