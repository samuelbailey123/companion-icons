import { describe, expect, it } from 'vitest'
import { builders, checkTimeline, clock, connectionCredentials, piFiles, purpose } from '../src/manual/recovery.js'
import { triggers } from '../src/manual/rig.js'
import { exportFixture } from './helpers/manual-export.js'

describe('checkTimeline', () => {
	it('writes times the way the guide does', () => {
		expect(clock('08:05:00')).toBe('8:05')
		expect(clock('10:24:57')).toBe('10:24:57')
	})
	it('finds every enabled time-of-day trigger the guide leaves out', () => {
		const list = triggers(exportFixture())
		expect(checkTimeline('At 8:05 the power comes on.', list)).toEqual([])
		expect(checkTimeline('Nothing here.', list)).toEqual(['8:05 (Sunday start)'])
		const off = [{ name: 'x', enabled: true, events: [{ type: 'timeofday', enabled: false, options: { time: '09:00:00' } }] }]
		expect(checkTimeline('', off)).toEqual([])
	})
})

describe('generated recovery tables', () => {
	it('lists connections holding a credential, with their 1Password entry, and no values', () => {
		const html = connectionCredentials(exportFixture())
		expect(html).toContain('Companion › propresenter')
		expect(html).toContain('<code>pass</code>')
		expect(html).not.toContain('<code>sdpass</code>')
		expect(html).toContain('Companion › pco')
		expect(html).not.toContain('Sup3r')
		expect(html).not.toContain('atem')
	})
	it('reads each tool’s purpose from its header', () => {
		expect(purpose('/**\n * Build the thing.\n *\n * More.\n */')).toBe('Build the thing.')
		expect(purpose('no header')).toBe('')
		const html = builders([
			{ file: 'tools/b.js', text: '/**\n * B <page>.\n */' },
			{ file: 'tools/a.js', text: '/**\n * A.\n */' },
		])
		expect(html.indexOf('tools/a.js')).toBeLessThan(html.indexOf('tools/b.js'))
		expect(html).toContain('B &lt;page&gt;.')
	})
	it('says where each backed-up file goes on the Pi', () => {
		const html = piFiles(['system/companion-backup.timer', 'AV_Power_scripts/ptz_web.py', 'system/companion-backup.sh', 'README.md'])
		expect(html).toContain('/home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py')
		expect(html).toContain('/usr/local/bin/companion-backup.sh')
		expect(html).toContain('/etc/systemd/system/companion-backup.timer')
		expect(html).toContain('(notes: stays in the repo)')
	})
})
