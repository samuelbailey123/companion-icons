/**
 * Host-machine glyphs, for the page that watches the Raspberry Pi Companion runs on.
 *
 * Everything here is drawn in absolute viewBox coordinates and kept inside roughly x/y
 * 13..107, because the 11-unit stroke is centred on the path and adds 5.5 per side — draw to
 * the edge and the stroked result crosses the 6% key margin the raster test enforces.
 *
 * Each shape stays within the six-element limit by collecting repeated strokes (chip pins,
 * memory contacts) into a single multi-subpath `d` rather than one element per stroke.
 */
export default {
	/** Processor: a chip body with pins on all four sides. */
	cpu: {
		paths: [
			{ rect: [34, 34, 52, 52, 6] },
			{ rect: [52, 52, 16, 16, 2] },
			'M46 22 V34 M60 22 V34 M74 22 V34 M46 86 V98 M60 86 V98 M74 86 V98 M22 46 H34 M22 60 H34 M22 74 H34 M86 46 H98 M86 60 H98 M86 74 H98',
		],
	},

	/** Temperature: a thermometer with a solid bulb. */
	thermometer: {
		paths: [
			'M60 22 A9 9 0 0 1 69 31 V66 A16 16 0 1 1 51 66 V31 A9 9 0 0 1 60 22 Z',
			{ circle: [60, 82, 8], fill: true },
		],
	},

	/** Memory: a DIMM with a chip and contact pins. */
	memory: {
		paths: [
			{ rect: [18, 40, 84, 40, 4] },
			{ rect: [32, 52, 56, 16, 2] },
			'M34 80 V94 M50 80 V94 M70 80 V94 M86 80 V94',
		],
	},

	/** Storage: a platter with spindle and head arm. */
	disk: {
		paths: [
			{ circle: [60, 60, 36] },
			{ circle: [60, 60, 7], fill: true },
			{ line: [76, 44, 90, 30] },
		],
	},

	/** Elapsed time: a plain clock face, distinct from the timer glyphs which carry transport marks. */
	clock: {
		paths: [{ circle: [60, 60, 36] }, 'M60 34 V60 L80 72'],
	},

	/**
	 * The network the Pi is on: three hosts on a bus, down to the box they share.
	 *
	 * Distinct from `route`, which means routing VIDEO between destinations. This one is about
	 * the machine having an address at all, and the two sit two keys apart on the System page.
	 */
	network: {
		paths: [
			{ rect: [22, 30, 22, 22, 4] },
			{ rect: [49, 30, 22, 22, 4] },
			{ rect: [76, 30, 22, 22, 4] },
			// Drops, bus and stem as one path: the library caps a glyph at six elements, and
			// they are one continuous piece of wiring anyway.
			'M33 52 V62 H87 V52 M60 62 V74',
			{ rect: [42, 74, 36, 22, 4] },
		],
	},
}
