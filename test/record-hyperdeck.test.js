import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
	AMBER,
	MARK,
	NO_CARD,
	RED,
	convertPages,
	countdownKey,
	findHyperdeck,
	idleText,
	isCountdownKey,
	isRecordKey,
	recordKey,
} from '../src/record-hyperdeck.js'

/** The live Home Record key and PP1 Countdown key, read off the rig on 2026-10-26. */
const LIVE = JSON.parse(fs.readFileSync(new URL('./fixtures/record-keys-20261026.json', import.meta.url)))

const ATEM = { connectionId: '10AAWntiwEwz4HB_8wNWu', label: 'atem' }
const HD = { connectionId: 'hd1', label: 'hyperdeck' }
const VH = { connectionId: 'vh1', label: 'videohub' }
const PP = 'Q5TvEd5Y-6x598I_1OW3v'

const instances = {
	[ATEM.connectionId]: { moduleId: 'bmd-atem', label: 'atem' },
	[HD.connectionId]: { moduleId: 'bmd-hyperdeck', label: 'hyperdeck' },
	[VH.connectionId]: { moduleId: 'bmd-videohub', label: 'videohub' },
	[PP]: { moduleId: 'renewedvision-propresenter-api', label: 'propresenter' },
}
const rig = (pages) => ({ instances, pages })
const PAGES = {
	1: { name: 'Home', controls: { 2: { 3: LIVE.record } } },
	3: { name: 'PP1', controls: { 2: { 6: LIVE.countdown } } },
	5: { name: 'ATEM', controls: { 3: { 1: LIVE.record }, 1: { 0: { steps: {} } } } },
	6: { name: 'SQ7', controls: { 1: { 0: { steps: {} } } } },
}

const down = (control) => control.steps[0].action_sets.down
const reading = (control) => control.style.layers.find((l) => l.id === 'text1').text

describe('finding the connections', () => {
	it('finds the one HyperDeck', () => {
		expect(findHyperdeck(rig({}))).toEqual(HD)
	})

	it('refuses a rig with none or two', () => {
		expect(() => findHyperdeck({ instances: {} })).toThrow(/found 0/)
		expect(() => findHyperdeck({})).toThrow(/found 0/)
		expect(() => findHyperdeck({ instances: { ...instances, b: { moduleId: 'bmd-hyperdeck' } } })).toThrow(/found 2/)
	})
})

describe('recognising the keys', () => {
	it('knows the live Record and Countdown keys', () => {
		expect(isRecordKey(LIVE.record, ATEM, HD)).toBe(true)
		expect(isCountdownKey(LIVE.countdown, ATEM, HD)).toBe(true)
		expect(isRecordKey(LIVE.countdown, ATEM, HD)).toBe(false)
		expect(isCountdownKey(LIVE.record, ATEM, HD)).toBe(false)
	})

	it('knows them again once converted', () => {
		expect(isRecordKey(recordKey(LIVE.record, HD), ATEM, HD)).toBe(true)
		expect(isCountdownKey(countdownKey(LIVE.countdown, ATEM, HD, VH), ATEM, HD)).toBe(true)
	})
})

describe('a Record key', () => {
	const key = recordKey(LIVE.record, HD)

	it('toggles the HyperDeck and nothing else', () => {
		expect(down(key)).toHaveLength(1)
		expect(down(key)[0]).toMatchObject({ definitionId: 'recordStopToggle', connectionId: 'hd1' })
		expect(JSON.stringify(key.steps)).not.toContain(ATEM.connectionId)
	})

	it('shows the time left on the card, or NO CARD, when idle', () => {
		expect(reading(key)).toEqual({ value: idleText(HD), isExpression: true })
		expect(idleText(HD)).toBe(`$(hyperdeck:slotId) == "-" ? "${NO_CARD}" : $(hyperdeck:recordingTime)`)
	})

	it('goes amber with no card, and red with the running time while recording, red winning', () => {
		const [noCard, recording] = key.feedbacks
		expect(noCard.options.expression.value).toBe('$(hyperdeck:slotId) == "-"')
		expect(noCard.styleOverrides.map((o) => o.override.value)).toEqual([AMBER])
		expect(recording).toMatchObject({ definitionId: 'transport_status', connectionId: 'hd1', options: { status: { value: 'record' } } })
		expect(Object.fromEntries(recording.styleOverrides.map((o) => [o.elementId, o.override.value]))).toEqual({
			box0: RED,
			text1: '$(hyperdeck:timecodeHMS)',
		})
	})

	it('keeps its caption and icon', () => {
		const look = (c) => c.style.layers.filter((l) => l.id !== 'text1')
		expect(look(key)).toEqual(look(LIVE.record))
	})

	it('no longer reads the switcher', () => {
		expect(JSON.stringify(key)).not.toMatch(/atem:|10AAWntiwEwz4HB_8wNWu/)
		expect(key.options.notes.startsWith(MARK)).toBe(true)
	})

	it('refuses a key with no reading line', () => {
		const bare = structuredClone(LIVE.record)
		bare.style.layers = bare.style.layers.filter((l) => l.id !== 'text1')
		expect(() => recordKey(bare, HD)).toThrow(/reading line/)
	})
})

describe('the Countdown key', () => {
	const key = countdownKey(LIVE.countdown, ATEM, HD, VH)

	it('puts Program on the recorder, then starts it, where it started the switcher, keeping the cue', () => {
		expect(down(key).map((a) => `${a.definitionId} ${a.connectionId}`)).toEqual([`specificPlaylistOperation ${PP}`, 'route vh1', 'rec hd1'])
		expect(down(key)[0]).toEqual(down(LIVE.countdown)[0])
		expect(down(key)[1].options).toEqual({
			source: { value: 4, isExpression: false },
			destination: { value: 13, isExpression: false },
			ignore_lock: { value: true, isExpression: false },
		})
	})

	it('is unchanged when run again, even after Companion renames its actions', () => {
		const again = structuredClone(key)
		for (const a of down(again)) a.id = `renamed-${a.definitionId}`
		const essence = (c) => down(c).map(({ definitionId, connectionId, options }) => ({ definitionId, connectionId, options }))
		expect(essence(countdownKey(again, ATEM, HD, VH))).toEqual(essence(key))
	})

	it('keeps a route to some other output', () => {
		const other = structuredClone(key)
		down(other)[1].options.destination.value = 9
		expect(down(countdownKey(other, ATEM, HD, VH)).map((a) => a.definitionId)).toEqual(['specificPlaylistOperation', 'route', 'route', 'rec'])
	})

	it('changes nothing else about the key', () => {
		expect(key.style).toEqual(LIVE.countdown.style)
		expect(key.feedbacks).toEqual(LIVE.countdown.feedbacks)
	})

	it('leaves a step with no action sets alone', () => {
		expect(countdownKey({ steps: { 0: {} } }, ATEM, HD, VH)).toEqual({ steps: { 0: {} } })
		expect(countdownKey({}, ATEM, HD, VH)).toEqual({})
	})
})

describe('converting the rig', () => {
	const { changed } = convertPages(rig(PAGES))

	it('changes exactly the Record keys and the Countdown key', () => {
		expect(changed.map((c) => `${c.number} ${c.name}: ${c.cells.join(', ')}`)).toEqual([
			'1 Home: 2/3 Record',
			'3 PP1: 2/6 Countdown',
			'5 ATEM: 3/1 Record',
		])
		expect(changed.find((c) => c.name === 'ATEM').page.controls[1][0]).toEqual({ steps: {} })
	})

	it('is unchanged when run over its own output', () => {
		const again = convertPages(rig(Object.fromEntries(changed.map((c) => [c.number, c.page]))))
		expect(again.changed.map((c) => c.page)).toEqual(changed.map((c) => c.page))
	})

	it('passes over keys and pages with nothing in them', () => {
		expect(isRecordKey({}, ATEM, HD)).toBe(false)
		expect(isRecordKey({ steps: { 0: {} } }, ATEM, HD)).toBe(false)
		expect(countdownKey({ steps: { 0: { action_sets: { down: null } } } }, ATEM, HD, VH)).toEqual({ steps: { 0: { action_sets: { down: null } } } })
		const sparse = convertPages(rig({ ...PAGES, 7: { name: 'VW' }, 8: { name: 'System', controls: { 1: null } } }))
		expect(sparse.changed.map((c) => c.name)).toEqual(['Home', 'PP1', 'ATEM'])
	})

	it('says so when a key it expects is missing', () => {
		expect(() => convertPages(rig({ 3: PAGES[3] }))).toThrow(/no Record key/)
		expect(() => convertPages(rig({ 1: PAGES[1] }))).toThrow(/no Countdown key/)
		expect(() => convertPages({ instances })).toThrow(/no Record key/)
	})
})
