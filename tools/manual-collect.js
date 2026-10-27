/**
 * Read what the manual is built from off the live rig, into a snapshot folder.
 *
 * Usage:
 *   node tools/manual-collect.js <snapshotDir>
 *
 * READ-ONLY: Companion's config export (one HTTP GET), and the status dump the Videohub and the
 * ATEM send the moment you connect to TCP 9990 (nothing is sent back). Needs the AV LAN.
 *
 * THE SNAPSHOT HOLDS PASSWORDS: rig.json is Companion's full export, credentials and all. It is
 * written 0600; keep the folder out of git and delete it once the books are built.
 *
 * Writes rig.json, videohub.txt, atem.txt and meta.json, which tools/manual.js reads.
 */
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { exportFull } from './rig.js'

const VIDEOHUB = '10.23.0.21'
const ATEM = '10.23.0.34'

/** The status dump a Blackmagic routing-protocol device sends on connect. Sends nothing. */
function dump9990(host, ms = 2000) {
	return new Promise((resolve, reject) => {
		let text = ''
		const s = net.connect(9990, host)
		s.setEncoding('utf8')
		s.on('data', (d) => (text += d))
		s.on('error', reject)
		setTimeout(() => {
			s.destroy()
			resolve(text)
		}, ms)
	})
}

async function main() {
	const dir = process.argv[2]
	if (!dir) throw new Error('usage: node tools/manual-collect.js <snapshotDir>')
	await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	const exported = await exportFull()
	await fs.writeFile(path.join(dir, 'rig.json'), JSON.stringify(exported), { mode: 0o600 })
	const [videohub, atem] = await Promise.all([dump9990(VIDEOHUB), dump9990(ATEM)])
	await fs.writeFile(path.join(dir, 'videohub.txt'), videohub)
	await fs.writeFile(path.join(dir, 'atem.txt'), atem)
	const readAt = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
	await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ readAt: `${readAt} Central` }))
	console.log(`snapshot in ${dir}: Companion ${exported.companionBuild}, read ${readAt}`)
}

main().catch((e) => {
	console.error(e.message)
	process.exit(1)
})
