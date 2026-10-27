/**
 * The status dump a Blackmagic Videohub-protocol device sends the moment you connect to TCP 9990.
 * The Videohub and the ATEM both speak it, so one parser reads both: model, port labels, which
 * input each output takes, and (on the ATEM) the video mode.
 */
export function parseDump(text) {
	const blocks = {}
	let current
	for (const line of text.replace(/\r/g, '').split('\n')) {
		const head = line.match(/^([A-Z][A-Z0-9 ]+):$/)
		if (head) {
			current = blocks[head[1]] = []
		} else if (current && line.trim() !== '') current.push(line)
	}
	const fields = (name) => Object.fromEntries((blocks[name] ?? []).map((l) => l.split(/:\s*/, 2)).filter((p) => p.length === 2))
	const indexed = (name) => {
		const out = []
		for (const l of blocks[name] ?? []) {
			const m = l.match(/^(\d+)\s+(.*)$/)
			if (m) out[Number(m[1])] = m[2]
		}
		return out
	}
	const device = fields('VIDEOHUB DEVICE')
	return {
		model: device['Model name'] ?? '',
		id: device['Unique ID'] ?? '',
		inputs: indexed('INPUT LABELS'),
		outputs: indexed('OUTPUT LABELS'),
		routing: indexed('VIDEO OUTPUT ROUTING').map(Number),
		mode: fields('CONFIGURATION')['Video Mode'] ?? '',
	}
}
