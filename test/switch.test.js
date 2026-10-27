import { describe, expect, it } from 'vitest'
import { assertNavCoverage, NAV_ORDER, SUB_PAGES } from '../src/navrow.js'
import {
	BACK_CELL,
	BG,
	FEEDING,
	GRID,
	INK,
	MODULE_ID,
	PAGE_NAME,
	PARENT,
	SELECTED,
	buildConfig,
	buildVideohubPage,
	findVideohub,
	inputKey,
	outputKey,
	plan,
} from '../src/switch.js'
import { contrastRatio } from '../src/wiring.js'

const hub = (config = {}) => ({
	moduleId: MODULE_ID,
	label: 'videohub',
	config: { inputCount: 16, outputCount: 16, take: false, ...config },
})

const rig = ({ instances, pages } = {}) => ({
	instances: instances ?? { vh1: hub(), atem: { moduleId: 'bmd-atem', label: 'atem' } },
	pages: pages ?? Object.fromEntries(NAV_ORDER.map((name, i) => [String(i + 1), { id: `p${i + 1}`, name }])),
})

const VH = { connectionId: 'vh1', label: 'videohub', inputs: 16, outputs: 16 }
const VW_PAGE = String(NAV_ORDER.indexOf('VW') + 1)

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

describe('the layout', () => {
	it('is the + XL key grid with no folder row', () => {
		expect(GRID).toEqual({ columns: 9, rows: 4 })
	})

	it('puts sixteen outputs over sixteen inputs, eight a row', () => {
		const { perRow, outputs, inputs } = plan(VH)
		expect(perRow).toBe(8)
		expect(outputs[0]).toEqual({ n: 1, row: 0, col: 0 })
		expect(outputs[15]).toEqual({ n: 16, row: 1, col: 7 })
		expect(inputs[0]).toEqual({ n: 1, row: 2, col: 0 })
		expect(inputs[15]).toEqual({ n: 16, row: 3, col: 7 })
	})

	it('keeps input N under output N, and the last column free for Back', () => {
		const { outputs, inputs } = plan(VH)
		for (let i = 0; i < 16; i++) expect(inputs[i].col).toBe(outputs[i].col)
		expect([...outputs, ...inputs].some((c) => c.col === BACK_CELL.col)).toBe(false)
	})

	it('fits a router with more outputs than inputs', () => {
		const { outputs, inputs } = plan({ inputs: 4, outputs: 12 })
		expect(outputs.at(-1)).toEqual({ n: 12, row: 1, col: 5 })
		expect(inputs.at(-1)).toEqual({ n: 4, row: 2, col: 3 })
	})

	it('refuses a router that does not fit beside Back, rather than dropping ports', () => {
		expect(() => plan({ inputs: 18, outputs: 18 })).toThrow(/18 outputs and 18 inputs do not fit a 9x4 deck beside a Back key/)
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
			[INK.name, BG.nav],
		]
		for (const [fg, bg] of pairs) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
	})
})

describe('the page', () => {
	const page = buildVideohubPage(VH, VW_PAGE)
	const keys = keysOf(page)

	it('has every port exactly once, plus Back', () => {
		const notes = keys.map((k) => k.control.options.notes)
		expect(keys).toHaveLength(33)
		expect(new Set(notes).size).toBe(33)
		expect(keys.every((k) => k.row < GRID.rows && k.col < GRID.columns)).toBe(true)
	})

	it('has no folder row: row 0 is outputs and Back', () => {
		const row0 = Object.entries(page.controls[0]).filter(([col]) => Number(col) !== BACK_CELL.col)
		expect(row0.every(([, c]) => actionOf(c).definitionId === 'select_destination')).toBe(true)
		expect(Object.values(page.controls[3]).every((c) => actionOf(c).definitionId === 'route_source')).toBe(true)
	})

	it('goes back to VW on the surface that pressed Back', () => {
		const back = page.controls[BACK_CELL.row][BACK_CELL.col]
		expect(actionOf(back)).toMatchObject({
			definitionId: 'set_page',
			connectionId: 'internal',
			options: { surfaceId: { value: 'self' }, page: { value: VW_PAGE } },
		})
		expect(textOf(back, 'text0').value).toBe(PARENT)
	})

	it('leaves the touchstrip and knobs empty', () => {
		expect(page.controls[4]).toBeUndefined()
		expect(page.controls[5]).toBeUndefined()
	})

	it('is a VW sub-page, so the folder row accepts it', () => {
		expect(page.name).toBe(PAGE_NAME)
		expect(SUB_PAGES[PAGE_NAME]).toBe(PARENT)
		expect(() => assertNavCoverage([...NAV_ORDER, page.name], 9)).not.toThrow()
	})
})

describe('building from a live export', () => {
	it('lands a first build after the last page', () => {
		const { number, existing, page, videohub, vwPage } = buildConfig(rig())
		expect(number).toBe(String(NAV_ORDER.length + 1))
		expect(existing).toBe(false)
		expect(page.id).toBeUndefined()
		expect(videohub.connectionId).toBe('vh1')
		expect(vwPage).toBe(VW_PAGE)
	})

	it('replaces an existing Videohub page in place, keeping its id', () => {
		const pages = { 1: { id: 'p1', name: 'VW' }, 2: { id: 'vh', name: PAGE_NAME } }
		const { number, existing, page } = buildConfig(rig({ pages }))
		expect(number).toBe('2')
		expect(existing).toBe(true)
		expect(page.id).toBe('vh')
	})

	it('refuses a rig with no VW page to come back to', () => {
		expect(() => buildConfig(rig({ pages: { 1: { name: 'Home' } } }))).toThrow(/no VW page/)
	})

	it('refuses pages that are not numbered 1..n', () => {
		expect(() => buildConfig(rig({ pages: { 1: { name: 'Home' }, 3: { name: 'PP1' } } }))).toThrow(/not numbered 1\.\.2/)
		expect(() => buildConfig({ ...rig(), pages: undefined })).toThrow(/not numbered/)
	})
})
