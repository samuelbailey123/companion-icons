/**
 * Folder glyphs for the home page.
 *
 * Each one is a folder body with the emblem of the system it opens set inside it, so the key
 * says both "this goes somewhere" and "this is what is in there". The label still names the
 * page — the emblem is the part you learn, and after a week it is the only part you read.
 *
 * The emblems are the SAME drawings used on the buttons inside each page, nested via the
 * renderer's `group` primitive. Reusing them is the point: a folder is a promise about what
 * you will find, so it must not invent a second visual language for the same system.
 *
 * EMBLEM CHOICE IS CONSTRAINED BY SHAPE, not just meaning. The folder interior is landscape,
 * so tall or dense glyphs do not work in it: `mix` (full-height faders) broke out through the
 * folder's top edge at every usable scale, and `matrix` collapsed into a solid blob once its
 * grid fell below a few pixels. Both were rejected in favour of compact, wide emblems that
 * sit inside the body cleanly. Check any replacement at 120px before adopting it.
 */
import power from './power.js'
import video from './video.js'
import present from './present.js'
import audio from './audio.js'
import routing from './routing.js'
import system from './system.js'
import wireless from './wireless.js'

/**
 * The folder outline: a tab rising on the left, then a rounded body.
 *
 * Absolute commands only. The library authors every glyph in absolute viewBox coordinates
 * and a test enforces that every number lands in 0..120 — relative segments carry negative
 * deltas, which trip that check and, more importantly, make the geometry unreadable.
 *
 * Inset to x 18..102, y 26..92 rather than filling the space: the 11-unit stroke is centred
 * on the path, so it adds 5.5 on every side. Drawn any larger, the stroked edge crosses the
 * 6% key margin the raster test requires.
 */
const FOLDER =
	'M18 86 V32 A6 6 0 0 1 24 26 H44 A4 4 0 0 1 47 27.4 L53 34 A4 4 0 0 0 56 35.4 H96 A6 6 0 0 1 102 41.4 V86 A6 6 0 0 1 96 92 H24 A6 6 0 0 1 18 86 Z'

/**
 * How much of the nested 0..120 emblem space to use.
 *
 * Picked by rendering candidates at real key size: below this the emblems stop being
 * identifiable, above it the wider ones start crossing the folder outline.
 */
const EMBLEM_SCALE = 0.48

/** Centre of the folder body — below the tab, so the emblem sits in the pocket. */
const BODY_CENTRE = [60, 65]

/** Set an emblem into the folder body, centred, at the shared scale. */
const withEmblem = (emblem) => {
	const side = 120 * EMBLEM_SCALE
	return {
		paths: [
			FOLDER,
			{ group: emblem, at: [BODY_CENTRE[0] - side / 2, BODY_CENTRE[1] - side / 2], scale: EMBLEM_SCALE },
		],
	}
}

export default {
	'folder-power': withEmblem(power['projector'].paths),
	'folder-present': withEmblem(present['media'].paths),
	'folder-lighting': withEmblem(power['house-lights'].paths),
	'folder-video': withEmblem(video['camera'].paths),
	'folder-audio': withEmblem(audio['speaker'].paths),
	'folder-routing': withEmblem(routing['route'].paths),
	'folder-system': withEmblem(system['cpu'].paths),
	'folder-wireless': withEmblem(wireless['mic'].paths),
}
