import { describe, expect, it } from 'vitest'
import {
	buildTriggers,
	connectionByLabel,
	netPoll,
	reconnect,
	tracksPoll,
	variablesFor,
} from '../src/live-state.js'

const full = {
	instances: { sq1: { label: 'SQ' }, test1: { label: 'SQtest' }, gone: null },
	triggers: { old: { options: { sortOrder: 41 } } },
}
const OPTS = { script: '/x/chrome_tracks.sh', variable: 'chrome_tracks' }
const ids = (t) => t.actions.map((a) => a.definitionId)

describe('the tracks poll', () => {
	const t = tracksPoll({ ...OPTS, sortOrder: 1 })

	it('only ever asks for the state', () => {
		expect(t.actions[0].options.path.value).toBe('timeout 7 /x/chrome_tracks.sh state || printf -- --')
		expect(t.actions[0].options.targetVariable.value).toBe('chrome_tracks')
	})

	it('gives up on the command before Companion does', () => {
		expect(t.actions[0].options.timeout.value).toBeGreaterThan(7000)
	})

	it('stamps the moment as an expression, so it is a time and not the text of one', () => {
		expect(t.actions[1].options.name.value).toBe('chrome_tracks_at')
		expect(t.actions[1].options.value).toEqual({ value: '$(internal:time_unix)', isExpression: true })
	})

	it('runs often enough for the board to call it fresh', () => {
		expect(t.events[0].options.seconds).toBeLessThan(30)
	})
})

describe('the mixer knock', () => {
	const t = netPoll({ name: 'n', host: '1.2.3.4', port: 51326, variable: 'sq_net', sortOrder: 1 })

	it('writes up or down, and nothing else', () => {
		expect(t.actions[0].options.path.value).toBe('nc -z -w 2 1.2.3.4 51326 && printf up || printf down')
		expect(t.actions[0].options.targetVariable.value).toBe('sq_net')
	})
})

describe('the reconnect', () => {
	const t = reconnect({ name: 'r', label: 'SQ', connectionId: 'sq1', netVariable: 'sq_net', sortOrder: 1 })

	it('stops the connection, waits, and starts it', () => {
		expect(ids(t)).toEqual(['instance_control', 'wait', 'instance_control'])
		expect(t.actions[0].options).toMatchObject({ instance_id: { value: 'sq1' }, enable: { value: 'false' } })
		expect(t.actions[2].options).toMatchObject({ instance_id: { value: 'sq1' }, enable: { value: 'true' } })
	})

	it('never touches a connection that is up, or runs with no mixer to reach', () => {
		expect(t.condition[0].options.expression.value).toBe(
			"$(internal:connection_SQ_status) == 'error' && $(custom:sq_net) == 'up'",
		)
		expect(t.condition[0].options.expression.isExpression).toBe(true)
	})
})

describe('connectionByLabel', () => {
	it('finds a connection by what Companion calls it', () => {
		expect(connectionByLabel(full, 'SQ')).toBe('sq1')
	})

	it('refuses a label the rig does not have', () => {
		expect(() => connectionByLabel(full, 'SQ8')).toThrow('no "SQ8" connection')
		expect(() => connectionByLabel({}, 'SQ')).toThrow('no "SQ" connection')
	})
})

describe('buildTriggers', () => {
	it('adds all three after the triggers already there', () => {
		const added = buildTriggers(full, OPTS)
		expect(Object.keys(added)).toEqual(['sq-net-poll', 'sq-reconnect', 'tracks-poll'])
		expect(Object.values(added).map((t) => t.options.sortOrder)).toEqual([42, 43, 44])
		expect(added['sq-reconnect'].actions[0].options.instance_id.value).toBe('sq1')
	})

	it('copes with a rig that has no triggers yet', () => {
		const added = buildTriggers({ instances: full.instances }, OPTS)
		expect(added['sq-net-poll'].options.sortOrder).toBe(0)
	})

	it('keeps a stand-in away from the real mixer, connection and variable', () => {
		const standIn = { label: 'SQtest', host: '127.0.0.1' }
		const added = buildTriggers(full, { ...OPTS, standIn })
		expect(Object.keys(added)).toEqual(['sq-net-poll-test', 'sq-reconnect-test'])
		const text = JSON.stringify(added)
		expect(text).toContain('127.0.0.1')
		expect(text).toContain('sqtest_net')
		expect(text).not.toContain('10.23.0.191')
		expect(text).not.toContain('"sq1"')
		expect(text).not.toContain('(internal:connection_SQ_status)')
		expect(added['sq-reconnect-test'].options.name).toBe('Reconnect SQ (test)')
	})
})

describe('variablesFor', () => {
	it('defines what the triggers write and leaves the rest alone', () => {
		expect(Object.keys(variablesFor(buildTriggers(full, OPTS))).sort()).toEqual(['chrome_tracks_at', 'sq_net'])
	})

	it('defines the stand-in variable for a stand-in', () => {
		const added = buildTriggers(full, { ...OPTS, standIn: { label: 'SQtest', host: '127.0.0.1' } })
		expect(Object.keys(variablesFor(added))).toEqual(['sqtest_net'])
	})
})
