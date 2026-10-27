/**
 * Refresh `pi/`, the backup of the Pi's scripts, from the live Pi.
 *
 * Usage:
 *   node tools/pi-backup.js                 copy over SSH (needs the AV network and the Pi login)
 *   node tools/pi-backup.js --from <dir>    redact a folder already copied off the Pi
 *
 * Copies `~/Desktop/AV_Power_scripts` and the nightly backup's script and units, drops keys,
 * credential files, logs and old `.bak` copies, and swaps each hardcoded password for its 1Password
 * entry before anything is written (src/pi-backup.js). Read-only on the Pi. Run it whenever a script
 * there changes, then commit `pi/`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { redact } from '../src/pi-backup.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const PI = 'samuelbailey@10.23.0.242'
const SYSTEM = ['/usr/local/bin/companion-backup.sh', '/etc/systemd/system/companion-backup.service', '/etc/systemd/system/companion-backup.timer']

async function readDir(dir) {
	const files = new Map()
	for (const name of await fs.readdir(dir)) {
		const p = path.join(dir, name)
		if ((await fs.stat(p)).isFile()) files.set(name, await fs.readFile(p, 'utf8'))
	}
	return files
}

let source = process.argv[2] === '--from' ? path.resolve(process.argv[3]) : null
if (!source) {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-backup-'))
	const tar = execFileSync('ssh', ['-o', 'BatchMode=yes', PI, 'tar czf - -C /home/samuelbailey/Desktop --exclude=.chrome_tracks_key --exclude=.ptz_web AV_Power_scripts'])
	execFileSync('tar', ['xzf', '-', '-C', tmp], { input: tar })
	source = path.join(tmp, 'AV_Power_scripts')
	await fs.mkdir(path.join(tmp, 'system'))
	for (const f of SYSTEM) {
		await fs.writeFile(path.join(tmp, 'system', path.basename(f)), execFileSync('ssh', ['-o', 'BatchMode=yes', PI, `cat ${f}`]))
	}
}

const { files: scripts, elsewhere } = redact(await readDir(source))
for (const { script, file } of elsewhere) {
	console.warn(`warning: the password redacted from ${script} also appears in ${file}, so it is public: change it on the device`)
}
await fs.rm(path.join(ROOT, 'pi/AV_Power_scripts'), { recursive: true, force: true })
await fs.mkdir(path.join(ROOT, 'pi/AV_Power_scripts'), { recursive: true })
for (const [name, text] of scripts) {
	const mode = (await fs.stat(path.join(source, name))).mode & 0o777
	await fs.writeFile(path.join(ROOT, 'pi/AV_Power_scripts', name), text, { mode })
}
const system = path.join(path.dirname(source), 'system')
const units = await readDir(system).catch(() => new Map())
await fs.mkdir(path.join(ROOT, 'pi/system'), { recursive: true })
for (const [name, text] of units) await fs.writeFile(path.join(ROOT, 'pi/system', name), text)
console.log(`pi/: ${scripts.size} scripts, ${units.size} system files, passwords redacted`)
