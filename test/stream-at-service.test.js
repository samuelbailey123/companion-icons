import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countdownKey, streamStart } from '../src/record-hyperdeck.js'
import {
	COUNTDOWN_TRIGGER,
	DAYS,
	MARK,
	STREAM_AT,
	TRIGGER_NAME,
	planStreamAtService,
	streamTrigger,
	withoutStreamStart,
} from '../src/stream-at-service.js'

/** The live PP1 Countdown key, read off the rig on 2026-10-26, before the HyperDeck took recording. */
const LIVE = JSON.parse(fs.readFileSync(new URL('./fixtures/record-keys-20261026.json', import.meta.url)))

const ATEM = { connectionId: '10AAWntiwEwz4HB_8wNWu', label: 'atem' }
const HD = { connectionId: 'hd1', label: 'hyperdeck' }
const VH = { connectionId: 'vh1', label: 'videohub' }
const instances = {
	[ATEM.connectionId]: { moduleId: 'bmd-atem', label: 'atem' },
	[HD.connectionId]: { moduleId: 'bmd-hyperdeck', label: 'hyperdeck' },
	[VH.connectionId]: { moduleId: 'bmd-videohub', label: 'videohub' },
}

const down = (control) => control.steps[0].action_sets.down
const kinds = (actions) => actions.map((a) => a.definitionId)
const toggle = { ...streamStart(ATEM), id: 'by-hand', options: { stream: { value: 'toggle', isExpression: false } } }

/** The Countdown key as the rig had it from 2026-10-27: cue, route, HyperDeck rec, stream On. */
const STREAMING_KEY = (() => {
	const key = countdownKey(LIVE.countdown, ATEM, HD, VH)
	down(key).push({ ...streamStart(ATEM), id: 'live-stream-id' })
	return key
})()

/** The Sunday countdown trigger, its actions copied off that key, as the rig had it. */
const countdownTrigger = (actions = down(STREAMING_KEY)) => ({
	type: 'trigger',
	options: { name: COUNTDOWN_TRIGGER, enabled: true, sortOrder: 4 },
	actions: structuredClone(actions),
	events: [{ id: 'e', type: 'timeofday', enabled: true, options: { time: '10:24:57', days: [0] } }],
})

const rig = ({ key = STREAMING_KEY, triggers = { cd1: countdownTrigger() } } = {}) => ({
	instances,
	pages: {
		1: { name: 'Home', controls: { 2: { 3: LIVE.record } } },
		3: { name: 'PP1', controls: { 2: { 6: key, 7: { steps: { 0: { action_sets: { down: [toggle] } } } } } } },
		7: { name: 'VW' },
		8: { name: 'System', controls: { 1: null } },
	},
	triggers: { tracks: { type: 'trigger', options: { name: 'Sunday tracks fade', sortOrder: 9 } }, ...triggers },
})

describe('the Sunday stream trigger', () => {
	const t = streamTrigger(ATEM, 3)

	it('turns the stream on, never toggles it, so a stream started by hand is left running', () => {
		expect(t.actions).toHaveLength(1)
		expect(t.actions[0]).toMatchObject({ connectionId: ATEM.connectionId, definitionId: 'streamStartStop', type: 'action' })
		expect(t.actions[0].options).toEqual({ stream: { value: 'true', isExpression: false } })
	})

	it('fires at 10:30:00 on Sundays only, as the countdown ends', () => {
		expect(STREAM_AT).toBe('10:30:00')
		expect(DAYS).toEqual([0])
		expect(t.events).toEqual([{ id: `${MARK}:at`, type: 'timeofday', enabled: true, options: { time: '10:30:00', days: [0] } }])
	})

	it('is named, enabled, unconditional and placed where it is told', () => {
		expect(t.options).toMatchObject({ name: TRIGGER_NAME, enabled: true, sortOrder: 3 })
		expect(t.options.notes).toMatch(/10:30:00/)
		expect(t.condition).toEqual([])
	})
})

describe('taking the stream start off a key', () => {
	it('takes off the stream start and keeps the cue, route and recording in order', () => {
		expect(kinds(down(withoutStreamStart(STREAMING_KEY, ATEM)))).toEqual(['specificPlaylistOperation', 'route', 'rec'])
	})

	it('leaves a stream toggle, other connections, the look and empty steps alone', () => {
		const key = withoutStreamStart({ ...STREAMING_KEY, steps: { 0: { action_sets: { down: [toggle], up: null } }, 1: {} } }, ATEM)
		expect(key.steps).toEqual({ 0: { action_sets: { down: [toggle], up: null } }, 1: {} })
		expect(key.style).toEqual(STREAMING_KEY.style)
		expect(withoutStreamStart({}, ATEM)).toEqual({})
	})
})

describe('planning the change on the rig', () => {
	const plan = planStreamAtService(rig())

	it('takes the stream start off the Countdown key, and touches no other key or page', () => {
		expect(plan.pages.map((p) => `${p.number} ${p.name}: ${p.cells.join(', ')}`)).toEqual(['3 PP1: 2/6 Countdown'])
		const pp1 = plan.pages[0].page
		expect(kinds(down(pp1.controls[2][6]))).toEqual(['specificPlaylistOperation', 'route', 'rec'])
		expect(pp1.controls[2][7]).toEqual(rig().pages[3].controls[2][7])
	})

	it('takes the stream start off the Sunday countdown trigger, by its id on the rig', () => {
		expect(plan.countdownTrigger).toEqual({ id: 'cd1', remove: ['live-stream-id'] })
	})

	it('adds the Sunday stream trigger after the rig’s others', () => {
		expect(plan.trigger.id).toBe(MARK)
		expect(plan.trigger.body).toEqual(streamTrigger(ATEM, 10))
	})

	it('has nothing to do once it has been done', () => {
		const done = rig({
			key: plan.pages[0].page.controls[2][6],
			triggers: { cd1: countdownTrigger(down(withoutStreamStart(STREAMING_KEY, ATEM))), s: plan.trigger.body },
		})
		expect(planStreamAtService(done)).toMatchObject({ pages: [], countdownTrigger: { id: 'cd1', remove: [] }, trigger: null })
	})

	it('copes with a countdown trigger that has no actions, and a rig with no other triggers', () => {
		const bare = { ...rig(), triggers: { cd1: { options: { name: COUNTDOWN_TRIGGER } } } }
		const { countdownTrigger: cd, trigger } = planStreamAtService(bare)
		expect(cd.remove).toEqual([])
		expect(trigger.body.options.sortOrder).toBe(1)
		const unsorted = { ...rig(), triggers: { cd1: { options: { name: COUNTDOWN_TRIGGER } }, x: { options: {} } } }
		expect(planStreamAtService(unsorted).trigger.body.options.sortOrder).toBe(1)
	})

	it('says so when the Countdown key or the countdown trigger is missing or doubled', () => {
		const noKey = { ...rig(), pages: { 1: rig().pages[1] } }
		expect(() => planStreamAtService(noKey)).toThrow(/no Countdown key/)
		expect(() => planStreamAtService({ ...rig(), pages: undefined })).toThrow(/no Countdown key/)
		expect(() => planStreamAtService(rig({ triggers: {} }))).toThrow(/expected one "Sunday countdown" trigger, found 0/)
		expect(() => planStreamAtService(rig({ triggers: { a: countdownTrigger(), b: countdownTrigger() } }))).toThrow(/found 2/)
		expect(() => planStreamAtService({ ...rig(), triggers: undefined })).toThrow(/found 0/)
	})
})
