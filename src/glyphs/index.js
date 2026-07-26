import audio from './audio.js'
import power from './power.js'
import present from './present.js'
import routing from './routing.js'
import utility from './utility.js'
import video from './video.js'
import wireless from './wireless.js'

/** Collection name → shape table. Collection names match Companion image-library folders. */
export const COLLECTIONS = { power, video, routing, present, audio, wireless, utility }

/**
 * Merged shape table.
 *
 * Throws on a duplicate shape name across collections: `$(image:...)` is a flat namespace,
 * so a silent collision here would mean two icons fighting over one library entry.
 */
export const SHAPES = (() => {
	const merged = {}
	for (const [collection, shapes] of Object.entries(COLLECTIONS)) {
		for (const [name, shape] of Object.entries(shapes)) {
			if (merged[name]) throw new Error(`Duplicate shape "${name}" in collection "${collection}"`)
			merged[name] = shape
		}
	}
	return merged
})()
