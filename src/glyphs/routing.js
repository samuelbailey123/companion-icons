/**
 * VideoHub / signal-routing glyphs.
 *
 * `route` puts a box between source and destination rather than using a plain fork, which
 * would have been indistinguishable from video's `aux`.
 */

/** Padlock shackle, shared by `unlock` and `route-locked`. */
const SHACKLE_OPEN = 'M44 56 V40 A16 16 0 0 1 76 40'

export default {
	route: {
		paths: [
			{ rect: [42, 42, 36, 36, 6] },
			{ line: [16, 60, 42, 60] },
			'M78 60 H100 M92 52 L100 60 L92 68',
		],
	},

	take: {
		paths: ['M24 60 H86 M74 48 L86 60 L74 72', { line: [98, 28, 98, 92] }],
	},

	unlock: {
		paths: [{ rect: [30, 56, 60, 40, 8] }, SHACKLE_OPEN],
	},

	source: {
		paths: [{ circle: [32, 60, 12], fill: true }, { line: [50, 60, 98, 60] }],
	},

	destination: {
		paths: [{ line: [22, 60, 70, 60] }, { circle: [88, 60, 12], fill: true }],
	},

	matrix: {
		paths: [
			{ rect: [22, 22, 76, 76, 6] },
			{ line: [47, 22, 47, 98] },
			{ line: [73, 22, 73, 98] },
			{ line: [22, 47, 98, 47] },
			{ line: [22, 73, 98, 73] },
		],
	},

	'route-locked': {
		paths: [
			{ line: [16, 46, 60, 46] },
			'M60 46 H96 M88 38 L96 46 L88 54',
			{ rect: [44, 74, 32, 22, 4], fill: true },
			'M52 74 V66 A8 8 0 0 1 68 66 V74',
		],
	},
}
