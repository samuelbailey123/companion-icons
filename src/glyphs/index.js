import audio from './audio.js'
import folders from './folders.js'
import system from './system.js'
import power from './power.js'
import present from './present.js'
import routing from './routing.js'
import utility from './utility.js'
import video from './video.js'
import wireless from './wireless.js'

/** Collection name → shape table. Collection names match Companion image-library folders. */
export const COLLECTIONS = { power, video, routing, present, audio, wireless, utility, folders, system }

/**
 * Merge collections into one flat shape table.
 *
 * Throws on a duplicate shape name across collections: `$(image:...)` is a flat namespace,
 * so a silent collision would mean two icons fighting over one library entry.
 *
 * Exported so the guard itself is testable — it cannot be exercised through SHAPES, which
 * is built once at module load from collections that do not collide.
 *
 * @param {Record<string, Record<string, object>>} collections
 * @returns {Record<string, object>}
 */
export function mergeCollections(collections) {
	const merged = {}
	for (const [collection, shapes] of Object.entries(collections)) {
		for (const [name, shape] of Object.entries(shapes)) {
			if (merged[name]) throw new Error(`Duplicate shape "${name}" in collection "${collection}"`)
			merged[name] = shape
		}
	}
	return merged
}

/** Merged shape table for the real collections. */
export const SHAPES = mergeCollections(COLLECTIONS)
