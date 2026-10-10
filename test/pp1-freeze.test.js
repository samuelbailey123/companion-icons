import { describe, expect, it } from 'vitest'
import {
	CELL,
	ICE,
	MACRO_NAME,
	MARK,
	MODULE_ID,
	buildFreezeKey,
	buildFreezePage,
	findFreezeMacro,
	findProPresenterConnection,
	isOurs,
	labelOf,
} from '../src/pp1-freeze.js'
import { contrastRatio } from '../src/wiring.js'

const v = (value) => ({ value, isExpression: false })

/** A key somebody else authored, with the caption the cell guard should quote back. */
const foreignKey = (caption) => ({
	type: 'button-layered',
	style: { layers: [{ id: 'text0', type: 'text', text: v(caption) }] },
	options: { notes: '' },
	feedbacks: [],
	steps: {},
	localVariables: [],
})

/** A small rig: PP1 with the two slide-destination keys that must survive untouched. */
function rig() {
	return {
		version: 12,
		companionBuild: '5.0.7+test',
		connectionCollections: [{ id: 'c1' }],
		instances: {
			ppId: { moduleId: MODULE_ID, label: 'propresenter', config: {} },
			atemId: { moduleId: 'bmd-atem', label: 'atem', config: {} },
		},
		pages: {
			1: { id: 'p1', name: 'Home', controls: {}, gridSize: {} },
			3: {
				id: 'p3',
				name: 'PP1',
				controls: { 2: { 7: foreignKey('All\nScreens'), 8: foreignKey('Stage\\nNotes') } },
				gridSize: {},
			},
		},
	}
}

/** ProPresenter's `GET /v1/macros`, trimmed to what the build reads. */
const macroEntry = (name, types, uuid = `uuid-${name}`) => ({
	id: { uuid, name, index: 0 },
	actions: types.map((type) => ({ type })),
})
const MACROS = [
	macroEntry('Stage Notes', ['slide_destination', 'clear']),
	macroEntry('All Screens', ['slide_destination']),
	macroEntry('Freeze', ['slide_destination'], 'FREEZE-UUID'),
]
const MACRO = { uuid: 'FREEZE-UUID', name: 'Freeze' }

describe('findFreezeMacro', () => {
	it('finds the macro by name and returns what the key binds to', () => {
		expect(findFreezeMacro(MACROS)).toEqual(MACRO)
	})

	it('matches the name whatever its case or padding', () => {
		expect(findFreezeMacro([macroEntry(' freeze ', ['slide_destination'], 'X')])).toEqual({ uuid: 'X', name: ' freeze ' })
	})

	it('says how to make the macro when there is none', () => {
		expect(() => findFreezeMacro(MACROS.slice(0, 2))).toThrow(/no macro called "Freeze".*Slide Destination set to Stage Only/)
	})

	it('skips entries with no name instead of crashing on them', () => {
		expect(() => findFreezeMacro([{}, { id: {} }])).toThrow(/no macro called/)
	})

	it('refuses two macros with the name', () => {
		expect(() => findFreezeMacro([...MACROS, macroEntry('Freeze', ['slide_destination'])])).toThrow(/2 macros called "Freeze"/)
	})

	it('refuses a macro with no Slide Destination, naming what it has', () => {
		expect(() => findFreezeMacro([macroEntry('Freeze', ['timer', 'look'])])).toThrow(/no Slide Destination action \(it has: timer, look\)/)
		expect(() => findFreezeMacro([{ id: { uuid: 'u', name: 'Freeze' } }])).toThrow(/it has: nothing/)
	})

	it('refuses a macro that would blank the screens', () => {
		expect(() => findFreezeMacro([macroEntry('Freeze', ['slide_destination', 'clear'])])).toThrow(/Clear action/)
	})
})

describe('findProPresenterConnection', () => {
	it('returns the one connection', () => {
		expect(findProPresenterConnection(rig())[0]).toBe('ppId')
	})

	it('refuses a rig with none, or with two', () => {
		const none = rig()
		delete none.instances.ppId
		expect(() => findProPresenterConnection(none)).toThrow(/found 0/)
		expect(() => findProPresenterConnection({})).toThrow(/found 0/)
		const two = rig()
		two.instances.pp2 = { moduleId: MODULE_ID, label: 'follower', config: {} }
		expect(() => findProPresenterConnection(two)).toThrow(/found 2/)
	})
})

describe('buildFreezeKey', () => {
	const key = buildFreezeKey({ connectionId: 'ppId', macro: MACRO })

	it('fires the macro by uuid on one press, and nothing else', () => {
		expect(Object.keys(key.steps)).toEqual(['0'])
		expect(key.steps[0].action_sets).toEqual({
			down: [
				{
					type: 'action',
					id: `${MARK}:action`,
					connectionId: 'ppId',
					definitionId: 'marcoIdTrigger',
					options: { macro_id_dropdown: v('FREEZE-UUID') },
					upgradeIndex: -1,
				},
			],
			up: [],
		})
	})

	it('claims no state it cannot read', () => {
		expect(key.feedbacks).toEqual([])
	})

	it('is captioned, iconed and marked as built', () => {
		expect(labelOf(key)).toBe('Freeze Slide')
		expect(key.style.layers.find((l) => l.type === 'image').base64Image).toEqual(v('$(image:still)'))
		expect(isOurs(key)).toBe(true)
		expect(key.options.notes).toContain(`"${MACRO_NAME}"`)
	})

	it('keeps white text readable on its background', () => {
		const box = key.style.layers.find((l) => l.id === 'box0')
		expect(box.color).toEqual(v(ICE))
		expect(contrastRatio('#ffffff', `#${ICE.toString(16).padStart(6, '0')}`)).toBeGreaterThanOrEqual(4.5)
	})

	it('uses the band split of the keys around it', () => {
		const image = key.style.layers.find((l) => l.type === 'image')
		const text = key.style.layers.find((l) => l.type === 'text')
		expect([image.y.value, image.height.value, text.y.value, text.height.value]).toEqual([2, 44, 46, 52])
	})
})

describe('buildFreezePage', () => {
	const { number, cell, bundle } = buildFreezePage(rig(), MACRO)

	it('writes the key into its cell on PP1 and reports it', () => {
		expect(number).toBe(3)
		expect(cell).toBe(`r${CELL.row}c${CELL.column}`)
		expect(bundle.page.controls[CELL.row][CELL.column]).toEqual(buildFreezeKey({ connectionId: 'ppId', macro: MACRO }))
	})

	it('leaves every other control deep-equal to the source', () => {
		expect(bundle.page.controls[2]).toEqual(rig().pages[3].controls[2])
	})

	it('does not mutate the export it was given', () => {
		const source = rig()
		buildFreezePage(source, MACRO)
		expect(source).toEqual(rig())
	})

	it('wraps the page as an importable page bundle carrying the rig connections', () => {
		expect(bundle).toMatchObject({
			version: 12,
			type: 'page',
			companionBuild: '5.0.7+test',
			oldPageNumber: 3,
			connectionCollections: [{ id: 'c1' }],
		})
		expect(Object.keys(bundle.instances)).toEqual(['ppId', 'atemId'])
	})

	it('defaults connectionCollections and controls when the export has none', () => {
		const source = rig()
		delete source.connectionCollections
		delete source.pages[3].controls
		const built = buildFreezePage(source, MACRO)
		expect(built.bundle.connectionCollections).toEqual([])
		expect(isOurs(built.bundle.page.controls[CELL.row][CELL.column])).toBe(true)
	})

	it('rebuilds over its own key, byte-identical', () => {
		const source = rig()
		source.pages[3] = bundle.page
		expect(JSON.stringify(buildFreezePage(source, MACRO).bundle)).toBe(JSON.stringify(bundle))
	})

	it("refuses to overwrite somebody else's key, quoting its caption", () => {
		const source = rig()
		source.pages[3].controls[CELL.row] = { [CELL.column]: foreignKey('Clear\\nLogo') }
		expect(() => buildFreezePage(source, MACRO)).toThrow(/r1c8 on PP1 is taken by "Clear Logo"; the Freeze key was not written/)
	})

	it('refuses a rig with no PP1 page', () => {
		const source = rig()
		delete source.pages[3]
		expect(() => buildFreezePage(source, MACRO)).toThrow(/no "PP1" page/)
		delete source.pages
		expect(() => buildFreezePage(source, MACRO)).toThrow(/no "PP1" page/)
	})
})

describe('labelOf / isOurs', () => {
	it('reads an empty caption off a control with no text layer', () => {
		expect(labelOf({})).toBe('')
		expect(labelOf({ style: { layers: [{ type: 'text' }] } })).toBe('')
	})

	it('does not claim a control without the mark', () => {
		expect(isOurs(undefined)).toBe(false)
		expect(isOurs({ options: {} })).toBe(false)
		expect(isOurs({ options: { notes: 'pp1-freeze-ish' } })).toBe(false)
	})
})
