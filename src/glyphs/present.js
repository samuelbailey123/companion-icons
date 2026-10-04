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
	'slide-next': { paths: ['M34 22 L86 60 L34 98 Z'] },
	'slide-prev': { paths: ['M86 22 L34 60 L86 98 Z'] },
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

	/*
	 * The rest of ProPresenter's layers, each clearable in its own right.
	 *
	 * They share the circle-and-slash and differ only in the thing being struck out, because
	 * on a row of eight red keys the shared mark is what says "this clears something" and the
	 * base drawing is the only part worth reading. The five they replace were separate 25-33px
	 * bitmaps upscaled onto a 112px key.
	 */

	'clear-messages': {
		paths: [
			'M24 26 H68 A6 6 0 0 1 74 32 V56 A6 6 0 0 1 68 62 H44 L32 74 V62 H24 A6 6 0 0 1 18 56 V32 A6 6 0 0 1 24 26 Z',
			...BAN_SMALL,
		],
	},

	/* A bullhorn, not the `clear-audio` speaker: announcements are a layer, not a volume. */
	'clear-announce': {
		paths: ['M18 46 H30 L60 24 V72 L30 58 H18 Z', { line: [36, 60, 40, 76] }, ...BAN_SMALL],
	},

	'clear-media': {
		paths: [{ rect: [16, 28, 56, 40, 6] }, { d: 'M38 40 L56 48 L38 56 Z', fill: true }, ...BAN_SMALL],
	},

	/* A screen with a feed arriving: the video INPUT layer, not the media that plays on it. */
	'clear-video': {
		paths: [{ rect: [32, 28, 40, 36, 5] }, { line: [16, 46, 32, 46] }, 'M24 38 L32 46 L24 54', ...BAN_SMALL],
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

	/*
	 * Moving the FOCUS through the playlist is not the same as stepping a slide, and the two
	 * sit next to each other on the deck — so these must not read as the slide arrows.
	 *
	 * The list strokes say "playlist" and the vertical triangle says "move through it".
	 * Vertical is the whole point: `slide-next`/`slide-prev` are bare horizontal triangles
	 * and `playlist` is a horizontal one, so nothing else in the set points up or down.
	 */
	'focus-next': {
		paths: [
			{ line: [16, 32, 62, 32] },
			{ line: [16, 60, 62, 60] },
			{ line: [16, 88, 62, 88] },
			{ d: 'M72 50 L104 50 L88 90 Z', fill: true },
		],
	},

	'focus-prev': {
		paths: [
			{ line: [16, 32, 62, 32] },
			{ line: [16, 60, 62, 60] },
			{ line: [16, 88, 62, 88] },
			{ d: 'M72 70 L104 70 L88 30 Z', fill: true },
		],
	},

	/*
	 * Stage looks, triggered from the focused presentation.
	 *
	 * These replace three buttons that shared ONE 20x26 PNG between them, told apart only by
	 * their label — which is no help at a glance in a dark booth, and is the exact defect this
	 * library exists to remove.
	 *
	 * So silhouette does the work here, not colour: a leaf, a smooth wave stack and a jagged
	 * wave stack are different shapes at any size, and stay different if someone later recolours
	 * them or the key sits on a lit background. Colour is the second signal, never the only one.
	 * The two water looks deliberately SHARE a hue, because they are the same subject; calm
	 * versus storm is carried entirely by curve against corner.
	 */

	/**
	 * A lighting executor: a fader with its button beneath.
	 *
	 * Deliberately not the audio `fader` glyph. On this deck a fader means a level you ride;
	 * an executor key is a look you put in or take out, and the button under the slot is the
	 * part being pressed.
	 */
	executor: {
		paths: [
			{ rect: [38, 22, 44, 48, 6] },
			{ line: [60, 31, 60, 61] },
			{ line: [46, 44, 74, 44] },
			{ rect: [38, 76, 44, 23, 6] },
		],
	},

	/** Foliage wall. A single bold leaf: nothing else in the set is an organic shape. */
	'green-wall': {
		paths: [
			'M28 92 C28 46 52 24 94 24 C94 68 70 92 28 92 Z',
			{ line: [32, 88, 88, 30] },
			{ line: [52, 68, 46, 50] },
			{ line: [68, 52, 74, 70] },
		],
	},

	/*
	 * The two water looks are the SAME three swells at the same three baselines. Only the
	 * joins differ — curve against corner. Keeping the layout identical is what makes the
	 * difference read instantly instead of having to be hunted for.
	 */

	/** Calm water: shallow, wide, unbroken swells. */
	'water-calm': {
		paths: [
			'M16 40 C31 26 41 54 56 40 C71 26 81 54 96 40',
			'M16 66 C31 52 41 80 56 66 C71 52 81 80 96 66',
			'M16 92 C31 78 41 106 56 92 C71 78 81 106 96 92',
		],
	},

	/** Storm water: the same swells, broken into corners and driven harder. */
	'water-storm': {
		paths: [
			'M16 50 L36 30 L56 50 L76 30 L96 50',
			'M16 76 L36 56 L56 76 L76 56 L96 76',
			'M16 102 L36 82 L56 102 L76 82 L96 102',
		],
	},

	/*
	 * Thunder. A bare bolt would collide with `bolt` (power-toggle) two pages away, so the
	 * cloud is load-bearing, not decoration — it is what makes this read as weather rather
	 * than as power.
	 */
	thunder: {
		paths: [
			'M36 62 H80 A15 15 0 0 0 80 32 A21 21 0 0 0 42 30 A15 15 0 0 0 36 62 Z',
			{ d: 'M62 60 L48 86 H58 L52 106 L74 78 H62 Z', fill: true },
		],
	},
}
