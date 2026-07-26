/**
 * Shure wireless glyphs.
 *
 * `battery` and `rf` are not single drawings: each exposes a `levels(n)` function that
 * returns the shape for a given level. That is what lets a button carry a live indicator
 * via `$(image:battery-$(shure:tx1_bars))` and watch it change during a service.
 */

/** Mic capsule and cradle, shared by `mic`, `mic-muted` and `tx-fault`. */
const CAPSULE = { rect: [46, 18, 28, 46, 14] }
const CRADLE = 'M32 56 A28 28 0 0 0 88 56'

const BATTERY_SHELL = [{ rect: [16, 44, 76, 32, 6] }, { rect: [96, 54, 8, 12, 3], fill: true }]

export default {
	mic: {
		paths: [CAPSULE, CRADLE, { line: [60, 84, 60, 98] }],
	},

	'mic-muted': {
		paths: [CAPSULE, CRADLE, { line: [26, 26, 94, 94] }],
	},

	'tx-fault': {
		paths: [
			{ rect: [38, 18, 26, 40, 13] },
			'M26 52 A24 24 0 0 0 74 52',
			{ d: 'M82 58 L102 96 H62 Z', fill: true },
		],
	},

	battery: {
		paths: BATTERY_SHELL,
		/**
		 * @param {number} level Cells filled, 0..4.
		 * @returns {{paths: Array<object|string>}}
		 */
		levels(level) {
			const cells = []
			for (let i = 0; i < level; i++) {
				cells.push({ rect: [22 + i * 17, 50, 13, 20, 2], fill: true })
			}
			return { paths: [...BATTERY_SHELL, ...cells] }
		},
	},

	rf: {
		paths: [{ line: [24, 30, 24, 92] }],
		/**
		 * @param {number} level Bars shown, 0..3.
		 * @returns {{paths: Array<object|string>}}
		 */
		levels(level) {
			const bars = []
			for (let i = 0; i < level; i++) {
				bars.push({ line: [46 + i * 20, 92, 46 + i * 20, 74 - i * 18] })
			}
			return { paths: [{ line: [24, 30, 24, 92] }, ...bars] }
		},
	},
}
