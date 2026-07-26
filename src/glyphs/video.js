/**
 * ATEM / video-switching glyphs.
 *
 * `program` and `preview` are deliberately the same square in solid and outline form: on a
 * switcher these are a matched pair, and a solid/hollow distinction reads faster at key
 * size than two unrelated symbols would.
 */

export default {
	/**
	 * Camera with a centred lens ring. An early sketch put the lens offset in the upper
	 * left, which read as a record indicator rather than a lens.
	 */
	camera: {
		paths: [
			{ rect: [22, 42, 52, 40, 8] },
			{ circle: [48, 62, 12] },
			'M80 52 L98 44 L98 80 L80 72 Z',
		],
	},

	program: {
		paths: [{ rect: [26, 26, 68, 68, 10], fill: true }],
	},

	preview: {
		paths: [{ rect: [26, 26, 68, 68, 10] }],
	},

	/** A solid block hard against an outlined one: an instant swap, no transition. */
	cut: {
		paths: [{ rect: [24, 28, 32, 64, 4], fill: true }, { rect: [64, 28, 32, 64, 4] }],
	},

	/**
	 * A diagonally-filled square: a dissolve. Two buses with an arrow between them was
	 * tried first and read as a dumbbell. This also makes cut/auto/ftb a coherent family —
	 * hard blocks, diagonal fade, circular fade.
	 */
	auto: {
		paths: [{ rect: [26, 26, 68, 68, 10] }, { d: 'M26 94 L94 26 L94 94 Z', fill: true }],
	},

	ftb: {
		paths: [{ circle: [60, 60, 30] }, { d: 'M30 60 A30 30 0 0 0 90 60 Z', fill: true }],
	},

	dsk: {
		paths: [{ rect: [22, 26, 52, 44, 8] }, { rect: [46, 50, 52, 44, 8] }],
	},

	key: {
		paths: [{ rect: [22, 32, 76, 56, 8] }, { rect: [46, 50, 28, 20, 4] }],
	},

	aux: {
		paths: [
			{ line: [20, 60, 50, 60] },
			{ circle: [50, 60, 7], fill: true },
			'M58 56 L96 32',
			'M58 64 L96 88',
		],
	},

	tally: {
		paths: [{ circle: [60, 60, 28] }, { circle: [60, 60, 10], fill: true }],
	},

	/** No enclosing square: utility `macro` owns that form. */
	'macro-run': {
		paths: [{ d: 'M38 24 L96 60 L38 96 Z', fill: true }],
	},

	'macro-stop': {
		paths: [{ rect: [30, 30, 60, 60, 6], fill: true }],
	},

	transition: {
		paths: ['M24 40 H84 M74 30 L84 40 L74 50', 'M96 80 H36 M46 70 L36 80 L46 90'],
	},

	still: {
		paths: [{ rect: [20, 30, 80, 60, 8] }, 'M32 76 L50 56 L64 72 L76 62 L90 76'],
	},
}
