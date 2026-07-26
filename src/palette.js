/**
 * Design tokens for the icon library.
 *
 * Every value here is deliberately a single source of truth. The stroke weight in
 * particular is one constant across the whole set: a stroke-based icon language reads
 * as coherent only if nothing carries a one-off weight.
 */

/**
 * Stroke weight in viewBox units.
 *
 * The style comparison shown during design used 8, which measured visibly thin at real
 * Stream Deck key size (120px). 11 recovers most of that legibility without changing the
 * idiom. This is the tunable knob: if render tests show icons falling below the ink floor,
 * raise this rather than lowering the floor.
 */
export const STROKE = 11

/** All geometry is authored in this coordinate space. */
export const VIEWBOX = 120

/**
 * Intrinsic pixel size emitted on the <svg> element.
 *
 * Skia rasterises an SVG at its declared width/height and then scales, so declaring a
 * large intrinsic size means downsampling to a 120px key stays crisp.
 */
export const INTRINSIC = 512

/** Semantic colour tokens. Colour carries meaning in this style, not just decoration. */
export const COLORS = {
	on: '#4ADE80',
	off: '#F87171',
	warn: '#FBBF24',
	video: '#60A5FA',
	present: '#FB923C',
	route: '#A78BFA',
	audio: '#38BDF8',
	neutral: '#E9E9EE',
	idle: '#6B7280',
}

/** Button background every icon is designed to sit on. Used by the contrast test. */
export const DEFAULT_BG = '#0D0D0F'

/**
 * WCAG non-text contrast minimum.
 *
 * Icons below this are illegible rather than merely subtle. The library this project
 * replaces contained a white glyph on a #DADADA background at roughly 1.4:1.
 */
export const MIN_CONTRAST = 3.0
