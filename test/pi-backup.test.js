import { describe, expect, it } from 'vitest'
import { passwordIn, redact, skipped } from '../src/pi-backup.js'

const files = (o) => new Map(Object.entries(o))

describe('skipped', () => {
	it('never copies keys, credentials, logs, backups or caches', () => {
		for (const f of ['.chrome_tracks_key', '.chrome_tracks_known_hosts', '.chrome_tracks.err', '.ptz_web', 'ptz_web.py.20261011-preset.bak', 'chrome_tracks.sh.bak-20260927', 'ptz_look_x.prev.json', 'k.pub']) {
			expect(skipped(f)).toBe(true)
		}
		expect(skipped('ptz_web.py')).toBe(false)
		expect(skipped('ptz_look_10.23.0.181.json')).toBe(false)
	})
})

describe('redact', () => {
	it('swaps each password for its placeholder in the script and its tests', () => {
		const { files: out, elsewhere } = redact(
			files({
				'projector_power.py': 'USERNAME = "u"\nPASSWORD = "hunter22"\n',
				'test_projector_power.py': 'h = md5("u:hunter22:salt")\nx = "hunter22"',
				'.ptz_web': 'user:pass',
				'README.md': 'nothing secret',
			}),
		)
		expect(out.get('projector_power.py')).toContain('PASSWORD = "FROM-VAULT-projectors"  # redacted for the public repo: 1Password › Projectors (Panasonic) web + PJLink')
		expect(out.get('test_projector_power.py')).toBe('h = md5("u:FROM-VAULT-projectors:salt")\nx = "FROM-VAULT-projectors"')
		expect(out.has('.ptz_web')).toBe(false)
		expect(elsewhere).toEqual([])
	})
	it('reports the same word turning up in another file instead of failing', () => {
		const { elsewhere } = redact(files({ 'speaker_power.py': 'PASSWORD = "sharedword"\n', 'chrome_tracks.sh': 'ssh sharedword@imac' }))
		expect(elsewhere).toEqual([{ script: 'speaker_power.py', file: 'chrome_tracks.sh' }])
	})
	it('leaves an already redacted copy alone', () => {
		const text = 'PASSWORD = "FROM-VAULT-speaker-relay"  # redacted\n'
		expect(redact(files({ 'speaker_power.py': text })).files.get('speaker_power.py')).toBe(text)
	})
	it('refuses a script whose password it can no longer find', () => {
		expect(() => redact(files({ 'speaker_power.py': 'PASSWORD = os.environ["P"]' }))).toThrow(/no longer declares/)
	})
	it('refuses when the password survives in its own files', () => {
		expect(() => redact(files({ 'speaker_power.py': 'PASSWORD = "abcdefgh"\nprint("abcdefgh")' }))).toThrow(/still contains its password/)
	})
	it('refuses an unmapped password constant anywhere', () => {
		expect(() => redact(files({ 'new_power.py': 'PASSWORD = "zzz"\n' }))).toThrow(/nobody has mapped/)
	})
	it('reads the password constant', () => {
		expect(passwordIn('x\nPASSWORD = "p"\n')).toBe('p')
		expect(passwordIn('none')).toBe(null)
	})
})
