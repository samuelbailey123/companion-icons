/**
 * Power and switched-load glyphs.
 *
 * Geometry notes that apply to every collection:
 * - Authored in a 0 0 120 120 viewBox.
 * - Stroke is 11 units, so a centreline carries 5.5 units of ink either side. Centrelines
 *   therefore stay within roughly 20..100 to keep rendered ink inside the 14-unit margin.
 * - Small stroked circles become near-solid blobs at this weight, so anything smaller than
 *   about r=10 is drawn as a filled dot instead of a ring.
 */

/** Broken ring of the IEC power mark, shared by `power` and `standby`. */
const POWER_RING = 'M38.8 40.8 A30 30 0 1 0 81.2 40.8'

export default {
	power: {
		paths: [POWER_RING, { line: [60, 24, 60, 54] }],
	},

	/**
	 * Body plus a widening light cone. An earlier attempt used a lens circle abutting the
	 * body, which collided with it at this stroke weight and read as a bowtie.
	 */
	projector: {
		paths: [{ rect: [20, 48, 26, 24, 5] }, 'M50 55 L98 30 L98 94 L50 69 Z'],
	},

	/** Cabinet with a woofer and a solid tweeter, spaced far enough not to merge. */
	pa: {
		paths: [
			{ rect: [36, 22, 48, 76, 8] },
			{ circle: [60, 72, 14] },
			{ circle: [60, 40, 6], fill: true },
		],
	},

	/**
	 * The electronics amplifier triangle. A rack-unit drawing was tried first and read as
	 * an ID badge; the triangle is unambiguous to anyone who works with signal flow.
	 */
	amp: {
		paths: ['M36 26 L94 60 L36 94 Z', { line: [20, 60, 36, 60] }],
	},

	/**
	 * A bulb. Two sun variants were tried and both read as a crosshair: thin rays radiating
	 * from a small disc is simply what a crosshair looks like at this stroke weight.
	 */
	'house-lights': {
		paths: [{ circle: [60, 46, 24] }, { line: [48, 80, 72, 80] }, { line: [52, 92, 68, 92] }],
	},

	standby: {
		paths: [POWER_RING, { circle: [60, 62, 7], fill: true }],
	},

	/** Wide-set prongs and a straight cord, to stay distinct from `lock`. */
	plug: {
		paths: [
			{ line: [44, 20, 44, 42] },
			{ line: [76, 20, 76, 42] },
			{ rect: [34, 42, 52, 24, 6] },
			{ line: [60, 66, 60, 94] },
		],
	},

	bolt: {
		paths: ['M68 22 L40 64 H60 L52 98 L80 56 H60 Z'],
	},
}
