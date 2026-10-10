import { describe, expect, it } from 'vitest'
import {
	AMBER,
	INTERNAL,
	MARK,
	MODULE_ID,
	NO_DRIVE,
	buildRecordDiskPages,
	findAtemConnection,
	isOurFeedback,
	isRecordKey,
	showDisk,
	valueExpression,
	warningExpression,
} from '../src/record-disk.js'
import { contrastRatio } from '../src/wiring.js'

const v = (value) => ({ value, isExpression: false })

const action = (definitionId, options, connectionId = 'atemId') => ({ type: 'action', id: `a-${definitionId}`, connectionId, definitionId, options })

/** The Record key as it sits on the rig: caption, running time, and the module's red-while-recording feedback. */
const recordKey = (notes = '') => ({
	type: 'button-layered',
	style: {
		layers: [
			{ id: 'canvas', type: 'canvas' },
			{ id: 'box0', type: 'box', color: v(0x14161c) },
			{ id: 'image0', type: 'image', base64Image: v('$(image:still)') },
			{ id: 'text0', type: 'text', text: v('Record') },
			{ id: 'text1', type: 'text', text: v('$(atem:record_duration_hm)') },
		],
	},
	options: { stepProgression: 'auto', notes },
	feedbacks: [{ type: 'feedback', id: 'rec', connectionId: 'atemId', definitionId: 'recordStatus', options: { state: v(1) } }],
	steps: { 0: { action_sets: { down: [action('recordStartStop', { record: v('toggle') })], up: [] }, options: {} } },
	localVariables: [],
})

/** The Countdown key: starts a recording, never toggles one, and has no reading on its face. */
const countdownKey = () => ({
	type: 'button-layered',
	style: { layers: [{ id: 'box0', type: 'box', color: v(0) }, { id: 'text0', type: 'text', text: v('Countdown') }] },
	options: { notes: '' },
	feedbacks: [],
	steps: { 0: { action_sets: { down: [action('recordStartStop', { record: v('true') })], up: [] }, options: {} } },
	localVariables: [],
})

function rig() {
	return {
		version: 12,
		companionBuild: '5.0.7+test',
		connectionCollections: [{ id: 'c1' }],
		instances: {
			atemId: { moduleId: MODULE_ID, label: 'atem', config: {} },
			ppId: { moduleId: 'renewedvision-propresenter-api', label: 'propresenter', config: {} },
		},
		pages: {
			1: { id: 'p1', name: 'Home', controls: { 2: { 3: recordKey() } }, gridSize: {} },
			3: { id: 'p3', name: 'PP1', controls: { 2: { 6: countdownKey() } }, gridSize: {} },
			5: { id: 'p5', name: 'ATEM', controls: { 3: { 0: countdownKey(), 1: recordKey() } }, gridSize: {} },
			8: { id: 'p8', name: 'System', gridSize: {} },
		},
	}
}

const ATEM = { label: 'atem' }
const textOf = (control, id) => control.style.layers.find((l) => l.id === id).text

describe('findAtemConnection', () => {
	it('returns the one connection', () => {
		expect(findAtemConnection(rig())[0]).toBe('atemId')
	})

	it('refuses a rig with none, or with two', () => {
		expect(() => findAtemConnection({})).toThrow(/found 0/)
		const two = rig()
		two.instances.atem2 = { moduleId: MODULE_ID, label: 'atem2', config: {} }
		expect(() => findAtemConnection(two)).toThrow(/found 2/)
	})
})

describe('isRecordKey', () => {
	it('takes the toggle and leaves the start-only Countdown key', () => {
		expect(isRecordKey(recordKey(), 'atemId')).toBe(true)
		expect(isRecordKey(countdownKey(), 'atemId')).toBe(false)
	})

	it('ignores a toggle on some other connection, and a control with no steps', () => {
		expect(isRecordKey(recordKey(), 'other')).toBe(false)
		expect(isRecordKey({}, 'atemId')).toBe(false)
		expect(isRecordKey(undefined, 'atemId')).toBe(false)
	})

	it('reads past empty slots and non-list action sets', () => {
		const key = recordKey()
		key.steps[0].action_sets = { down: [null, ...key.steps[0].action_sets.down], rotate_left: undefined }
		expect(isRecordKey(key, 'atemId')).toBe(true)
		expect(isRecordKey({ steps: { 0: {} } }, 'atemId')).toBe(false)
		expect(isRecordKey({ steps: { 0: { action_sets: { down: [action('recordStartStop', undefined)] } } } }, 'atemId')).toBe(false)
	})
})

describe('showDisk', () => {
	const key = showDisk(recordKey(), ATEM)

	it('reads the running time while recording and the destination disk while idle', () => {
		expect(textOf(key, 'text1')).toEqual({ value: valueExpression('atem'), isExpression: true })
		expect(valueExpression('atem')).toBe(
			`$(atem:record_active) ? $(atem:record_duration_hm) : ($(atem:record_disk_volume) == "" ? "${NO_DRIVE}" : $(atem:record_disk_volume))`
		)
	})

	it('publishes under whatever the connection is called', () => {
		const renamed = recordKey()
		renamed.style.layers[4].text = v('$(switcher:record_duration_hm)')
		expect(textOf(showDisk(renamed, { label: 'switcher' }), 'text1').value).toContain('$(switcher:record_disk_volume)')
	})

	it('warns when Internal is first and when the first slot is empty', () => {
		expect(warningExpression('atem')).toBe(`$(atem:record_disk_volume) == "${INTERNAL}" || $(atem:record_disk_volume) == ""`)
	})

	it('warns by turning the key amber, leaving the caption alone', () => {
		const [warning] = key.feedbacks
		expect(warning).toMatchObject({
			id: `${MARK}:internal`,
			connectionId: 'internal',
			definitionId: 'check_expression',
			options: { expression: { value: warningExpression('atem'), isExpression: true } },
		})
		expect(warning.styleOverrides).toEqual([
			{ overrideId: `${MARK}:box`, elementId: 'box0', elementProperty: 'color', override: v(AMBER) },
		])
		expect(contrastRatio('#ffffff', `#${AMBER.toString(16).padStart(6, '0')}`)).toBeGreaterThanOrEqual(4.5)
	})

	it('keeps the recording feedback last, so a recording still turns the key red', () => {
		expect(key.feedbacks.map((f) => f.id)).toEqual([`${MARK}:internal`, 'rec'])
	})

	it('leaves the caption, the icon, the action and the source alone', () => {
		const source = recordKey()
		const built = showDisk(source, ATEM)
		expect(source).toEqual(recordKey())
		expect(textOf(built, 'text0')).toEqual(v('Record'))
		expect(built.steps).toEqual(source.steps)
		expect(built.style.layers[2]).toEqual(source.style.layers[2])
	})

	it('notes what it did, after any note already there', () => {
		expect(key.options.notes).toMatch(new RegExp(`^${MARK}: `))
		expect(showDisk(recordKey('Moved 2026-09-01.'), ATEM).options.notes).toMatch(new RegExp(`^Moved 2026-09-01\\.\\n${MARK}: `))
		const bare = recordKey()
		delete bare.options
		expect(showDisk(bare, ATEM).options.notes).toMatch(new RegExp(`^${MARK}: `))
	})

	it('is byte-identical over its own output', () => {
		expect(JSON.stringify(showDisk(key, ATEM))).toBe(JSON.stringify(key))
	})

	it('replaces its warnings after Companion re-ids them on import, however many there are', () => {
		const imported = structuredClone(key)
		imported.feedbacks[0].id = 'r6L5NMkKRvKmAz-wr6USd'
		const older = { ...structuredClone(key.feedbacks[0]), id: 'WkdKBumVkG9Jvd6kFFw1q' }
		older.styleOverrides.push({ overrideId: `${MARK}:caption`, elementId: 'text0', elementProperty: 'text', override: v('INTERNAL') })
		imported.feedbacks.splice(1, 0, older)
		expect(showDisk(imported, ATEM).feedbacks.map((f) => f.id)).toEqual([`${MARK}:internal`, 'rec'])
	})

	it('recognises its own feedback by id or override, and nothing else', () => {
		expect(isOurFeedback({ id: `${MARK}:internal` })).toBe(true)
		expect(isOurFeedback({ id: 'x', styleOverrides: [{ overrideId: 'ovr-8' }, { overrideId: `${MARK}:box` }] })).toBe(true)
		expect(isOurFeedback({ id: 'rec', styleOverrides: [{ overrideId: 'ovr-8' }, {}, null] })).toBe(false)
		expect(isOurFeedback({})).toBe(false)
		expect(isOurFeedback(undefined)).toBe(false)
	})

	it('adds the warning to a key with no feedbacks at all', () => {
		const bare = recordKey()
		delete bare.feedbacks
		expect(showDisk(bare, ATEM).feedbacks.map((f) => f.id)).toEqual([`${MARK}:internal`])
	})

	it('refuses a key it cannot read, naming what it needs', () => {
		const noValue = recordKey()
		noValue.style.layers[4].text = v('REC')
		expect(() => showDisk(noValue, ATEM)).toThrow(/record_duration_hm line/)
		const noBox = recordKey()
		noBox.style.layers.splice(1, 1)
		expect(() => showDisk(noBox, ATEM)).toThrow(/not touched/)
		const untexted = recordKey()
		delete untexted.style.layers[4].text
		expect(() => showDisk(untexted, ATEM)).toThrow(/not touched/)
		expect(() => showDisk({ steps: {} }, ATEM)).toThrow(/not touched/)
	})
})

describe('buildRecordDiskPages', () => {
	const { pages } = buildRecordDiskPages(rig())
	const byName = Object.fromEntries(pages.map((p) => [p.name, p]))

	it('builds only the pages that have a Record key, and reports the cells', () => {
		expect(pages.map((p) => [p.name, p.number, p.cells])).toEqual([
			['Home', 1, ['r2c3']],
			['ATEM', 5, ['r3c1']],
		])
	})

	it('rewrites each Record key and nothing beside it', () => {
		expect(byName.Home.bundle.page.controls[2][3]).toEqual(showDisk(recordKey(), ATEM))
		expect(byName.ATEM.bundle.page.controls[3][1]).toEqual(showDisk(recordKey(), ATEM))
		expect(byName.ATEM.bundle.page.controls[3][0]).toEqual(countdownKey())
	})

	it('does not mutate the export it was given', () => {
		const source = rig()
		buildRecordDiskPages(source)
		expect(source).toEqual(rig())
	})

	it('wraps each page as an importable page bundle carrying the rig connections', () => {
		expect(byName.ATEM.bundle).toMatchObject({
			version: 12,
			type: 'page',
			companionBuild: '5.0.7+test',
			oldPageNumber: 5,
			connectionCollections: [{ id: 'c1' }],
		})
		expect(Object.keys(byName.ATEM.bundle.instances)).toEqual(['atemId', 'ppId'])
	})

	it('defaults connectionCollections when the export has none', () => {
		const source = rig()
		delete source.connectionCollections
		expect(buildRecordDiskPages(source).pages[0].bundle.connectionCollections).toEqual([])
	})

	it('refuses a rig with no Record key', () => {
		const source = rig()
		delete source.pages[1]
		delete source.pages[5]
		expect(() => buildRecordDiskPages(source)).toThrow(/no Record key/)
		delete source.pages
		expect(() => buildRecordDiskPages(source)).toThrow(/no Record key/)
	})
})
