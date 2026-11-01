import { describe, expect, it } from 'vitest'
import { NAV_ORDER } from '../src/navrow.js'
import {
	BG,
	FEEDING,
	GRID,
	HOME,
	HOME_CELL,
	INK,
	MODULE_ID,
	PAGE_NAME,
	SELECTED,
	buildConfig,
	buildVwPage,
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
const HOME_PAGE = String(NAV_ORDER.indexOf('Home') + 1)

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

	it('keeps input N under output N, and the last column free for Home', () => {
		const { outputs, inputs } = plan(VH)
		for (let i = 0; i < 16; i++) expect(inputs[i].col).toBe(outputs[i].col)
		expect([...outputs, ...inputs].some((c) => c.col === HOME_CELL.col)).toBe(false)
	})

	it('fits a router with more outputs than inputs', () => {
		const { outputs, inputs } = plan({ inputs: 4, outputs: 12 })
		expect(outputs.at(-1)).toEqual({ n: 12, row: 1, col: 5 })
		expect(inputs.at(-1)).toEqual({ n: 4, row: 2, col: 3 })
	})

	it('refuses a router that does not fit beside Home, rather than dropping ports', () => {
		expect(() => plan({ inputs: 18, outputs: 18 })).toThrow(/18 outputs and 18 inputs do not fit a 9x4 deck beside a Home key/)
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
	const kept = { 4: { 6: { readout: 'Wall' } }, 5: { 6: { knob: 'Wall' } } }
	const page = buildVwPage(VH, HOME_PAGE, kept)
	const keys = keysOf(page).filter((k) => k.row < GRID.rows)

	it('has every port exactly once, plus Home', () => {
		const notes = keys.map((k) => k.control.options.notes)
		expect(keys).toHaveLength(33)
		expect(new Set(notes).size).toBe(33)
		expect(keys.every((k) => k.col < GRID.columns)).toBe(true)
	})

	it('has no folder row: row 0 is outputs and Home', () => {
		const row0 = Object.entries(page.controls[0]).filter(([col]) => Number(col) !== HOME_CELL.col)
		expect(row0.every(([, c]) => actionOf(c).definitionId === 'select_destination')).toBe(true)
		expect(Object.values(page.controls[3]).every((c) => actionOf(c).definitionId === 'route_source')).toBe(true)
	})

	it('goes Home on the surface that pressed the corner key', () => {
		const home = page.controls[HOME_CELL.row][HOME_CELL.col]
		expect(actionOf(home)).toMatchObject({
			definitionId: 'set_page',
			connectionId: 'internal',
			options: { surfaceId: { value: 'self' }, page: { value: HOME_PAGE } },
		})
		expect(textOf(home, 'text0').value).toBe(HOME)
	})

	it('keeps the touchstrip and knobs it is given, as copies', () => {
		expect(page.controls[4]).toEqual(kept[4])
		expect(page.controls[5]).toEqual(kept[5])
		expect(page.controls[5]).not.toBe(kept[5])
	})

	it('leaves the touchstrip and knobs empty when given none, and is VW, a folder-row page', () => {
		const bare = buildVwPage(VH, HOME_PAGE)
		expect(bare.controls[4]).toBeUndefined()
		expect(bare.controls[5]).toBeUndefined()
		expect(page.name).toBe(PAGE_NAME)
		expect(NAV_ORDER).toContain(PAGE_NAME)
	})
})

describe('building from a live export', () => {
	it('replaces VW in place, keeping its id and its strip and knobs, and drops its old keys', () => {
		const full = rig()
		full.pages[VW_PAGE].controls = { 1: { 0: { old: 'Right Proj' } }, 4: { 6: { readout: 'Wall' } }, 5: { 6: { knob: 'Wall' } } }
		const { number, page, videohub, homePage } = buildConfig(full)
		expect(number).toBe(VW_PAGE)
		expect(homePage).toBe(HOME_PAGE)
		expect(page.id).toBe(`p${VW_PAGE}`)
		expect(videohub.connectionId).toBe('vh1')
		expect(page.controls[5][6]).toEqual({ knob: 'Wall' })
		expect(JSON.stringify(page)).not.toContain('Right Proj')
	})

	it('refuses a rig with no VW page, or no Home for the corner key', () => {
		expect(() => buildConfig(rig({ pages: { 1: { name: 'Home' } } }))).toThrow(/no VW page/)
		expect(() => buildConfig(rig({ pages: { 1: { name: 'VW', controls: {} } } }))).toThrow(/no Home page/)
	})
})
