/**
 * Parse the status dump a Blackmagic routing-protocol device sends on connecting to TCP 9990.
 *
 * The Videohub and the ATEM both speak it. The dump is blocks of `HEADER:` followed by lines, and
 * a blank line between blocks. Ports are 0-based on the wire; everything returned here is 1-based,
 * the way the labels on the rack, the deck and the docs number them.
 */

/** Split the dump into `{ HEADER: [lines] }`. */
export function blocks(text) {
	const out = {}
	let current = null
	for (const line of String(text).split(/\r?\n/)) {
		if (/^[A-Z][A-Z ]+:$/.test(line)) {
			current = line.slice(0, -1)
			out[current] = []
		} else if (current && line.trim() !== '') {
			out[current].push(line)
		}
	}
	return out
}

/** `0 Aux 1` lines -> Map(1 -> 'Aux 1'). */
function numbered(lines = []) {
	const map = new Map()
	for (const line of lines) {
		const m = line.match(/^(\d+) (.*)$/)
		if (m) map.set(Number(m[1]) + 1, m[2])
	}
	return map
}

/** `Key: value` lines -> object. */
function fields(lines = []) {
	return Object.fromEntries(lines.map((l) => l.split(/: (.*)/s).slice(0, 2)).filter((p) => p.length === 2))
}

/**
 * The device, its labels and its live crosspoints.
 * @returns {{ model: string, id: string, mode: string|null, inputs: Map<number,string>, outputs: Map<number,string>, routing: Map<number,number> }}
 */
export function parseDump(text) {
	const b = blocks(text)
	const device = fields(b['VIDEOHUB DEVICE'])
	const routing = new Map([...numbered(b['VIDEO OUTPUT ROUTING'])].map(([out, src]) => [out, Number(src) + 1]))
	return {
		model: device['Model name'] ?? 'unknown',
		id: device['Unique ID'] ?? '',
		mode: fields(b.CONFIGURATION)['Video Mode'] ?? null,
		inputs: numbered(b['INPUT LABELS']),
		outputs: numbered(b['OUTPUT LABELS']),
		routing,
	}
}
