import { describe, expect, it } from 'vitest'
import { assertNavCoverage, NAV_ORDER } from '../src/navrow.js'
import {
	BG,
	FEEDING,
	INK,
	MODULE_ID,
	PAGE_NAME,
	SELECTED,
	buildConfig,
	buildSwitchPage,
	findSurface,
	findVideohub,
	inputKey,
	outputKey,
	plan,
} from '../src/switch.js'
import { contrastRatio } from '../src/wiring.js'

const XL = { columns: 8, rows: 4 }
const PLUS_XL = { columns: 9, rows: 4 }

const hub = (config = {}) => ({
	moduleId: MODULE_ID,
	label: 'videohub',
	config: { inputCount: 16, outputCount: 16, take: false, ...config },
})

const rig = ({ instances, surfaces, pages } = {}) => ({
	instances: instances ?? { vh1: hub(), atem: { moduleId: 'bmd-atem', label: 'atem' } },
	surfaces: surfaces ?? {
		'streamdeck:main': { name: 'Main', type: 'Elgato Stream Deck + XL', gridSize: { columns: 9, rows: 6 } },
		'streamdeck:sw': { name: 'Switch', type: 'Elgato Stream Deck XL', gridSize: XL },
	},
	pages: pages ?? Object.fromEntries(NAV_ORDER.map((name, i) => [String(i + 1), { id: `p${i + 1}`, name }])),
})

const VH = { connectionId: 'vh1', label: 'videohub', inputs: 16, outputs: 16 }

const keysOf = (page) =>
	Object.entries(page.controls).flatMap(([row, cols]) =>
		Object.entries(cols).map(([col, control]) => ({ row: Number(row), col: Number(col), control }))
	)
const actionOf = (control) => control.steps[0].action_sets.down[0]
const textOf = (control, id) => control.style.layers.find((l) => l.id === id)?.text

describe('the Videohub connection', () => {
	it('reads the router size and variable prefix off the connection', () => {
		expect(findVideohub(rig())).toEqual(VH)
	})

	it('refuses a rig with no Videohub, or two', () => {
		expect(() => findVideohub(rig({ instances: {} }))).toThrow(/found 0/)
		expect(() => findVideohub(rig({ instances: { a: hub(), b: hub() } }))).toThrow(/found 2/)
		expect(() => findVideohub({})).toThrow(/found 0/)
	})

	it('refuses Take mode, where an input press would only queue', () => {
		expect(() => findVideohub(rig({ instances: { vh1: hub({ take: true }) } }))).toThrow(/Take enabled/)
	})

	it('refuses a connection that has never learnt the router size', () => {
		expect(() => findVideohub(rig({ instances: { vh1: hub({ inputCount: undefined }) } }))).toThrow(/no inputCount/)
		expect(() => findVideohub(rig({ instances: { vh1: hub({ outputCount: 0 }) } }))).toThrow(/no outputCount/)
		expect(() => findVideohub(rig({ instances: { vh1: { moduleId: MODULE_ID, label: 'videohub' } } }))).toThrow(
			/no inputCount/
		)
	})
})

describe('the surface', () => {
	it('finds the deck named Switch', () => {
		expect(findSurface(rig())).toEqual({ surfaceId: 'streamdeck:sw', name: 'Switch', type: 'Elgato Stream Deck XL', grid: XL })
	})

	it('counts only key rows on decks with a touchstrip and knobs', () => {
		expect(findSurface(rig(), 'streamdeck:main').grid).toEqual(PLUS_XL)
		const plus = { 'sd:p': { name: 'Switch', type: 'Elgato Stream Deck +', gridSize: { columns: 4, rows: 4 } } }
		expect(findSurface(rig({ surfaces: plus })).grid).toEqual({ columns: 4, rows: 2 })
		expect(() => buildConfig(rig({ surfaces: plus }))).toThrow(/do not fit a 4x2 deck/)
	})

	it('takes an explicit id over the name', () => {
		expect(findSurface(rig(), 'streamdeck:main').surfaceId).toBe('streamdeck:main')
		expect(findSurface(rig({ surfaces: { 'sd:a': { gridSize: XL } } }), 'sd:a').name).toBe('')
	})

	it('names every surface when it cannot tell which one is meant', () => {
		const unnamed = { 'sd:a': { type: 'Elgato Stream Deck XL', gridSize: XL }, 'sd:b': {} }
		expect(() => findSurface(rig({ surfaces: unnamed }))).toThrow(
			/found 0\. Surfaces: sd:a "" Elgato Stream Deck XL; sd:b ""/
		)
		expect(() => findSurface(rig(), 'nope')).toThrow(/expected surface nope, found 0/)
		expect(() => findSurface({})).toThrow(/Surfaces: none/)
	})

	it('refuses a surface with no grid', () => {
		expect(() => findSurface(rig({ surfaces: { 'sd:x': { name: 'Switch' } } }))).toThrow(/no grid size/)
	})
})

describe('the layout', () => {
	it('puts sixteen outputs over sixteen inputs, eight a row, on an XL', () => {
		const { perRow, outputs, inputs } = plan(VH, XL)
		expect(perRow).toBe(8)
		expect(outputs[0]).toEqual({ n: 1, row: 0, col: 0 })
		expect(outputs[15]).toEqual({ n: 16, row: 1, col: 7 })
		expect(inputs[0]).toEqual({ n: 1, row: 2, col: 0 })
		expect(inputs[15]).toEqual({ n: 16, row: 3, col: 7 })
	})

	it('keeps input N under output N, and leaves the ninth column empty, on a + XL', () => {
		const { outputs, inputs } = plan(VH, PLUS_XL)
		for (let i = 0; i < 16; i++) expect(inputs[i].col).toBe(outputs[i].col)
		expect([...outputs, ...inputs].some((c) => c.col === 8)).toBe(false)
	})

	it('fits a router with more outputs than inputs', () => {
		const { outputs, inputs } = plan({ inputs: 4, outputs: 12 }, XL)
		expect(outputs.at(-1)).toEqual({ n: 12, row: 1, col: 5 })
		expect(inputs.at(-1)).toEqual({ n: 4, row: 2, col: 3 })
	})

	it('refuses a router that does not fit, rather than dropping ports', () => {
		expect(() => plan(VH, { columns: 5, rows: 3 })).toThrow(/16 outputs and 16 inputs do not fit a 5x3 deck/)
		expect(() => plan(VH, { columns: 32, rows: 1 })).toThrow(/do not fit/)
	})
})

describe('an output key', () => {
	const key = outputKey(VH, 3)

	it('selects its output and routes nothing', () => {
		expect(actionOf(key)).toMatchObject({
			definitionId: 'select_destination',
			connectionId: 'vh1',
			options: { destination: { value: 3, isExpression: false } },
		})
		expect(key.steps[0].action_sets.down).toHaveLength(1)
		expect(key.steps[0].action_sets.up).toEqual([])
	})

	it('shows the port, the router label and what is feeding it', () => {
		expect(textOf(key, 'port')).toEqual({ value: 'OUT 3', isExpression: false })
		expect(textOf(key, 'name')).toEqual({ value: '$(videohub:output_3)', isExpression: true })
		expect(textOf(key, 'feed')).toEqual({ value: '$(videohub:output_3_input)', isExpression: true })
	})

	it('lights violet, with dark text, while it is the selected output', () => {
		const [fb] = key.feedbacks
		expect(fb).toMatchObject({ definitionId: 'selected_destination', connectionId: 'vh1', options: { output: { value: 3 } } })
		const overrides = Object.fromEntries(fb.styleOverrides.map((o) => [o.elementId, o.override.value]))
		expect(overrides).toEqual({ box0: SELECTED, port: INK.selected, name: INK.selected, feed: INK.selected })
		const elements = new Set(key.style.layers.map((l) => l.id))
		for (const o of fb.styleOverrides) expect(elements.has(o.elementId)).toBe(true)
	})
})

describe('an input key', () => {
	const key = inputKey(VH, 11)

	it('routes its input to the selected output, ignoring locks', () => {
		expect(actionOf(key)).toMatchObject({
			definitionId: 'route_source',
			connectionId: 'vh1',
			options: { source: { value: 11 }, ignore_lock: { value: true } },
		})
	})

	it('shows the port and the router label', () => {
		expect(textOf(key, 'port')).toEqual({ value: 'IN 11', isExpression: false })
		expect(textOf(key, 'name')).toEqual({ value: '$(videohub:input_11)', isExpression: true })
	})

	it('lights green while it feeds the selected output', () => {
		const [fb] = key.feedbacks
		expect(fb).toMatchObject({ definitionId: 'selected_source', options: { input: { value: 11 } } })
		const overrides = Object.fromEntries(fb.styleOverrides.map((o) => [o.elementId, o.override.value]))
		expect(overrides).toEqual({ box0: FEEDING, port: INK.name })
	})

	it('uses no expression that builds a variable name from a variable', () => {
		expect(JSON.stringify([key, outputKey(VH, 1)])).not.toMatch(/\$\([^)]*\$\(/)
	})
})

describe('legibility', () => {
	it('keeps every caption at 4.5:1 or better on every background it can sit on', () => {
		const pairs = [
			[INK.name, BG.output], [INK.port, BG.output], [INK.feed, BG.output],
			[INK.name, BG.input], [INK.port, BG.input],
			[INK.name, FEEDING],
			[INK.selected, SELECTED],
		]
		for (const [fg, bg] of pairs) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
	})
})

describe('the page', () => {
	const page = buildSwitchPage(VH, XL)
	const keys = keysOf(page)

	it('has every port exactly once and nothing else', () => {
		const notes = keys.map((k) => k.control.options.notes)
		expect(keys).toHaveLength(32)
		expect(new Set(notes).size).toBe(32)
		expect(keys.every((k) => k.row < XL.rows && k.col < XL.columns)).toBe(true)
	})

	it('has no folder row: row 0 is outputs', () => {
		expect(Object.values(page.controls[0]).every((c) => actionOf(c).definitionId === 'select_destination')).toBe(true)
		expect(Object.values(page.controls[3]).every((c) => actionOf(c).definitionId === 'route_source')).toBe(true)
	})

	it('is a page the folder row lets exist without a folder', () => {
		expect(page.name).toBe(PAGE_NAME)
		expect(() => assertNavCoverage([...NAV_ORDER, page.name], 9)).not.toThrow()
	})
})

describe('building from a live export', () => {
	it('lands a first build after the last page', () => {
		const { number, existing, page, surface, videohub } = buildConfig(rig())
		expect(number).toBe(String(NAV_ORDER.length + 1))
		expect(existing).toBe(false)
		expect(page.id).toBeUndefined()
		expect(surface.surfaceId).toBe('streamdeck:sw')
		expect(videohub.connectionId).toBe('vh1')
	})

	it('replaces an existing Switch page in place, keeping its id', () => {
		const pages = { 1: { id: 'p1', name: 'Home' }, 2: { id: 'sw', name: PAGE_NAME } }
		const { number, existing, page } = buildConfig(rig({ pages }), 'streamdeck:sw')
		expect(number).toBe('2')
		expect(existing).toBe(true)
		expect(page.id).toBe('sw')
	})

	it('refuses pages that are not numbered 1..n', () => {
		expect(() => buildConfig(rig({ pages: { 1: { name: 'Home' }, 3: { name: 'PP1' } } }))).toThrow(/not numbered 1\.\.2/)
		expect(() => buildConfig({ ...rig(), pages: undefined })).toThrow(/not numbered/)
	})
})
