/**
 * ProPresenter / presentation glyphs.
 *
 * The four slide-transport glyphs follow the universal media convention: a bare triangle
 * for step, a triangle plus an end-bar for jump-to-end.
 */

/** Circle-and-slash used by the whole `clear-*` family. */
const BAN_SMALL = [{ circle: [80, 76, 20] }, { line: [66, 62, 94, 90] }]

/** Clock face and hands, shared by the three timer glyphs. */
const CLOCK = [{ circle: [48, 52, 26] }, 'M48 36 V52 L60 60']

export default {
	'slide-next': { paths: ['M38 28 L82 60 L38 92 Z'] },
	'slide-prev': { paths: ['M82 28 L38 60 L82 92 Z'] },
	'slide-last': { paths: ['M32 28 L72 60 L32 92 Z', { line: [88, 28, 88, 92] }] },
	'slide-first': { paths: ['M88 28 L48 60 L88 92 Z', { line: [32, 28, 32, 92] }] },

	clear: {
		paths: [{ circle: [60, 60, 32] }, { line: [37, 37, 83, 83] }],
	},

	'clear-slide': {
		paths: [{ rect: [20, 30, 52, 40, 6] }, ...BAN_SMALL],
	},

	'clear-props': {
		paths: [
			{ d: 'M42 24 L49 44 L70 44 L53 57 L59 78 L42 65 L25 78 L31 57 L14 44 L35 44 Z', fill: true },
			...BAN_SMALL,
		],
	},

	'clear-audio': {
		paths: ['M20 46 H34 L50 32 V80 L34 66 H20 Z', ...BAN_SMALL],
	},

	logo: {
		paths: [{ rect: [22, 28, 76, 64, 8] }, { circle: [60, 60, 16], fill: true }],
	},

	'stage-display': {
		paths: [{ rect: [18, 26, 84, 54, 8] }, { line: [60, 80, 60, 94] }, { line: [40, 94, 80, 94] }],
	},

	message: {
		paths: [
			'M28 26 H92 A8 8 0 0 1 100 34 V70 A8 8 0 0 1 92 78 H52 L34 94 V78 H28 A8 8 0 0 1 20 70 V34 A8 8 0 0 1 28 26 Z',
		],
	},

	'timer-start': {
		paths: [...CLOCK, { d: 'M82 74 L98 84 L82 94 Z', fill: true }],
	},

	'timer-stop': {
		paths: [...CLOCK, { rect: [82, 76, 18, 18, 2], fill: true }],
	},

	'timer-reset': {
		paths: [...CLOCK, { d: 'M74 20 L94 28 L74 36 Z', fill: true }],
	},

	media: {
		paths: [{ rect: [20, 32, 80, 56, 8] }, { d: 'M50 48 L76 60 L50 72 Z', fill: true }],
	},

	prop: {
		paths: [
			{ d: 'M60 22 L71 50 L100 50 L76 68 L86 96 L60 79 L34 96 L44 68 L20 50 L49 50 Z', fill: true },
		],
	},

	playlist: {
		paths: [
			{ line: [20, 36, 72, 36] },
			{ line: [20, 60, 72, 60] },
			{ line: [20, 84, 54, 84] },
			{ d: 'M74 66 L98 80 L74 94 Z', fill: true },
		],
	},
}
