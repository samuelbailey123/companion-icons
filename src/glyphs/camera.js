/**
 * PTZ camera glyphs.
 *
 * The page these serve is the only one on the deck where the operator is steering a physical
 * object in real time, so the set leans on the plainest possible signs: arrows for the eight
 * drive directions, a stop sign for stop, a magnifier for zoom. Nothing here should need
 * learning — by the time someone is reaching for the tilt knob mid-service there is no time
 * for a caption.
 *
 * THE ARROWS ARE ONE FAMILY. All eight share a shaft length and head size, authored from the
 * same two measurements, so the D-pad reads as a single control rather than nine keys that
 * happen to be adjacent. The diagonals are rotated copies of the cardinals in spirit but drawn
 * directly in absolute coordinates — the renderer has no transform primitive, and a test
 * requires every number to land inside the 0..120 viewBox.
 *
 * `ptz` is the four-way move symbol, and doubles as the emblem on this page's folder key so
 * it cannot be confused with the ATEM folder, which already carries the camera body.
 */

/** The cardinal arrows share one shaft and one head. */
const UP = ['M60 98 V24', 'M36 48 L60 24 L84 48']
const DOWN = ['M60 22 V96', 'M36 72 L60 96 L84 72']
const LEFT = ['M98 60 H24', 'M48 36 L24 60 L48 84']
const RIGHT = ['M22 60 H96', 'M72 36 L96 60 L72 84']

/**
 * Diagonals: shaft from the far corner to the near one, with an L-shaped head whose two legs
 * are axis-aligned. Same ink as the cardinals to within a few units, so the pad stays even.
 */
const UP_LEFT = ['M94 94 L30 30', 'M30 64 V30 H64']
const UP_RIGHT = ['M26 94 L90 30', 'M56 30 H90 V64']
const DOWN_LEFT = ['M94 26 L30 90', 'M30 56 V90 H64']
const DOWN_RIGHT = ['M26 26 L90 90', 'M56 90 H90 V56']

/** Viewfinder corners: the frame every focus mark sits inside. */
const CORNERS = [
	'M22 44 V30 A8 8 0 0 1 30 22 H44',
	'M76 22 H90 A8 8 0 0 1 98 30 V44',
	'M98 76 V90 A8 8 0 0 1 90 98 H76',
	'M44 98 H30 A8 8 0 0 1 22 90 V76',
]

export default {
	'arrow-up': { paths: UP },
	'arrow-down': { paths: DOWN },
	'arrow-left': { paths: LEFT },
	'arrow-right': { paths: RIGHT },
	'arrow-up-left': { paths: UP_LEFT },
	'arrow-up-right': { paths: UP_RIGHT },
	'arrow-down-left': { paths: DOWN_LEFT },
	'arrow-down-right': { paths: DOWN_RIGHT },

	/** Four-way move: pan and tilt together. Also the folder emblem. */
	ptz: {
		paths: [
			'M60 22 V98',
			'M22 60 H98',
			'M46 36 L60 22 L74 36',
			'M46 84 L60 98 L74 84',
			'M36 46 L22 60 L36 74',
			'M84 46 L98 60 L84 74',
		],
	},

	/** Horizontal double arrow: the pan axis. */
	pan: {
		paths: ['M22 60 H98', 'M40 40 L22 60 L40 80', 'M80 40 L98 60 L80 80'],
	},

	/** Vertical double arrow: the tilt axis. */
	tilt: {
		paths: ['M60 22 V98', 'M40 40 L60 22 L80 40', 'M40 80 L60 98 L80 80'],
	},

	/**
	 * A stop sign rather than a filled square: the square already means "stop macro" on the
	 * ATEM page, and this key also carries tally, so its silhouette has to survive a red or
	 * green background without relying on colour at all.
	 */
	stop: {
		paths: ['M44 22 H76 L98 44 V76 L76 98 H44 L22 76 V44 Z'],
	},

	'zoom-in': {
		paths: [{ circle: [52, 52, 30] }, 'M74 74 L98 98', 'M52 38 V66', 'M38 52 H66'],
	},

	'zoom-out': {
		paths: [{ circle: [52, 52, 30] }, 'M74 74 L98 98', 'M38 52 H66'],
	},

	/** Corners with a solid point: focus on THIS. One-push autofocus uses it. */
	focus: {
		paths: [...CORNERS, { circle: [60, 60, 10], fill: true }],
	},

	/** Corners with an open ring: the camera is choosing the point itself. */
	'focus-auto': {
		paths: [...CORNERS, { circle: [60, 60, 16] }],
	},

	/**
	 * Corners with an A: the camera choosing for itself — focus and exposure together. The
	 * letter is the mark every camera body uses for its auto modes, and it sits in the same
	 * viewfinder frame as the focus marks so the key reads as one of that family.
	 */
	'ptz-auto': {
		paths: [...CORNERS, 'M42 84 L60 36 L78 84', 'M49 68 H71'],
	},

	/** A gauge: arc, needle, hub. */
	speed: {
		paths: ['M24 82 A40 40 0 1 1 96 82', 'M60 82 L82 50', { circle: [60, 82, 7], fill: true }],
	},

	/** A bookmark: a position worth coming back to. */
	preset: {
		paths: ['M36 22 H84 V98 L60 80 L36 98 Z'],
	},

	'preset-save': {
		paths: ['M36 22 H84 V98 L60 80 L36 98 Z', 'M60 38 V62', 'M48 50 H72'],
	},

	/** A figure inside a frame: the camera is following someone. */
	tracking: {
		paths: [{ rect: [18, 18, 84, 84, 10] }, { circle: [60, 48, 13] }, 'M38 88 A22 22 0 0 1 82 88'],
	},

	/** The half-filled disc is the conventional exposure-compensation mark. */
	exposure: {
		paths: [{ circle: [60, 60, 34] }, { d: 'M60 26 A34 34 0 0 1 60 94 Z', fill: true }],
	},

	/** A figure lit from behind: rays past the shoulders, not in front of the face. */
	backlight: {
		paths: [
			{ circle: [60, 46, 14] },
			'M34 98 A26 26 0 0 1 86 98',
			'M20 58 H32',
			'M88 58 H100',
			'M30 28 L39 37',
			'M90 28 L81 37',
		],
	},

	menu: {
		paths: ['M24 34 H96', 'M24 60 H96', 'M24 86 H96'],
	},

	/**
	 * Tracking framings: how much of the person the camera keeps in shot. The figure grows
	 * as the framing tightens, so the three read as one scale rather than three pictures.
	 */
	'frame-close': {
		paths: [...CORNERS, { circle: [60, 60, 22] }],
	},

	'frame-half': {
		paths: [...CORNERS, { circle: [60, 46, 13] }, 'M36 94 A24 24 0 0 1 84 94'],
	},

	'frame-full': {
		paths: [...CORNERS, { circle: [60, 34, 9] }, 'M44 54 H76 M60 43 V66 L48 92 M60 66 L72 92'],
	},
}
