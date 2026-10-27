/**
 * Make a copy of the Pi's scripts safe to publish: the logic behind `tools/pi-backup.js`.
 *
 * WHY THE PI'S SCRIPTS ARE HERE AT ALL. The Power page, every PTZ readout and the walk-in music
 * shell out to scripts in `/home/samuelbailey/Desktop/AV_Power_scripts` on the Pi. Until
 * 2026-10-27 they existed nowhere else, so losing that SD card lost them (rig.md, configuration
 * fault 4). `pi/` in this repo is their backup.
 *
 * WHY THEY ARE REDACTED. Two of them carry a device password as a constant, and their tests
 * compute hashes from the same literal. This repo is public. So each `PASSWORD = "..."` is read
 * from the copy as it arrives, swapped for a placeholder naming its 1Password entry, and every
 * other occurrence of that literal in the same script's test file is swapped for the same
 * placeholder, which keeps the tests passing. Nobody running the backup needs to know a password,
 * and none is ever written into this file.
 */

/** Scripts holding a password constant, and the 1Password entry it belongs to. */
export const SECRETS = {
	'projector_power.py': { placeholder: 'FROM-VAULT-projectors', entry: 'Projectors (Panasonic) web + PJLink' },
	'speaker_power.py': { placeholder: 'FROM-VAULT-speaker-relay', entry: 'PA power relay (DLI DIN)' },
}

/** Files on the Pi that are never copied: keys, credentials, logs, backups and caches. */
export const SKIP = [/^\.chrome_tracks_key$/, /^\.chrome_tracks_known_hosts$/, /^\.chrome_tracks\.err$/, /^\.ptz_web$/, /\.bak/, /\.prev\.json$/, /__pycache__/, /\.pub$/]

export const skipped = (name) => SKIP.some((re) => re.test(name))

/** The password literal a script declares, or null. */
export const passwordIn = (text) => text.match(/^PASSWORD = "([^"]*)"/m)?.[1] ?? null

/**
 * Redact one folder's files.
 *
 * A password's own script and test must come out clean, or nothing is written. The same word
 * turning up in some other file is reported in `elsewhere` rather than refused: it may be a
 * coincidence (on this rig the PA relay's password is also the PP1 iMac's account name, which
 * `chrome_tracks.sh` has to name), but it means the password is effectively public and should be
 * changed on the device.
 *
 * @param {Map<string,string>} files name -> text, as copied off the Pi
 * @returns {{ files: Map<string,string>, elsewhere: Array<{ script: string, file: string }> }}
 */
export function redact(files) {
	const out = new Map([...files].filter(([name]) => !skipped(name)))
	const found = []
	for (const [script, { placeholder, entry }] of Object.entries(SECRETS)) {
		const text = out.get(script)
		if (text == null) continue
		const literal = passwordIn(text)
		if (literal == null) throw new Error(`${script} no longer declares PASSWORD = "..."; update src/pi-backup.js`)
		if (literal === placeholder) continue
		const test = `test_${script}`
		out.set(script, text.replace(`PASSWORD = "${literal}"`, `PASSWORD = "${placeholder}"  # redacted for the public repo: 1Password › ${entry}`))
		if (out.has(test)) out.set(test, out.get(test).split(literal).join(placeholder))
		found.push({ script, literal, own: [script, test] })
	}
	const elsewhere = []
	for (const [name, text] of out) {
		for (const { script, literal, own } of found) {
			if (!text.includes(literal)) continue
			if (own.includes(name)) throw new Error(`${name} still contains its password after redaction; refusing to write the backup`)
			elsewhere.push({ script, file: name })
		}
		const stray = passwordIn(text)
		if (stray != null && !stray.startsWith('FROM-VAULT-')) throw new Error(`${name} declares a password nobody has mapped; add it to SECRETS in src/pi-backup.js`)
	}
	return { files: out, elsewhere }
}
