import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXECUTOR, MODULE_ID, STEP, VARIABLE, findMa2, isBlackout, knob, ma2Page, strip } from '../src/ma2.js'

/** The live MA2 page (page 4), read off the rig on 2026-10-27 at 16:49. */
const LIVE = JSON.parse(fs.readFileSync(new URL('./fixtures/ma2-page-20261027.json', import.meta.url)))

const MA2 = 'k9pS-3z6a4bq3n0p0HesQ'
const instances = { [MA2]: { moduleId: MODULE_ID, label: 'grandma2' }, osc: { moduleId: 'generic-osc', label: 'MA2osc' } }
const rig = (page = LIVE) => ({ instances, pages: { 1: { name: 'Home', controls: {} }, 4: page } })

const cells = (page) => Object.entries(page.controls).flatMap(([r, cols]) => Object.keys(cols).map((c) => `r${r}c${c}`))
const sets = (control) => control.steps[0].action_sets
const commands = (actions) => actions.filter((a) => a.connectionId === MA2).map((a) => a.options.command.value)

describe('ma2Page', () => {
	const { number, page, removed } = ma2Page(rig())

	it('leaves the folder row, BLACKOUT, and the Lights strip and knob', () => {
		expect(number).toBe(4)
		expect(cells(page).sort()).toEqual([...[...Array(9).keys()].map((c) => `r0c${c}`), 'r3c8', 'r4c0', 'r5c0'].sort())
	})

	it('keeps the folder row and BLACKOUT exactly as they were', () => {
		expect(page.controls[0]).toEqual(LIVE.controls[0])
		expect(page.controls[3][8]).toEqual(LIVE.controls[3][8])
	})

	it('removes the old executor keys, Go keys, and the other three knobs and strips', () => {
		expect(removed).toEqual(expect.arrayContaining(['r1c0', 'r1c8', 'r2c0', 'r3c0', 'r4c2', 'r4c3', 'r4c5', 'r5c2', 'r5c3', 'r5c5']))
		expect(removed).toHaveLength(9 + 2 + 3 + 3)
	})

	it('sends nothing to any executor but 5.1', () => {
		const sent = JSON.stringify(page).match(/Executor \d+\.\d+/g)
		expect(new Set(sent)).toEqual(new Set([`Executor ${EXECUTOR}`]))
	})

	it('is unchanged when run over its own output', () => {
		const again = ma2Page(rig(page))
		expect(again.page).toEqual(page)
		expect(again.removed).toEqual([])
	})

	it('copies, never edits, the page it reads', () => {
		const before = JSON.stringify(LIVE)
		ma2Page(rig())
		expect(JSON.stringify(LIVE)).toBe(before)
	})

	it('refuses a page with no BLACKOUT key, or two', () => {
		const none = structuredClone(LIVE)
		delete none.controls[3][8]
		expect(() => ma2Page(rig(none))).toThrow('found 0')
		const two = structuredClone(LIVE)
		two.controls[2][4] = LIVE.controls[3][8]
		expect(() => ma2Page(rig(two))).toThrow('found 2')
	})

	it('refuses a rig without the MA2 page or the grandMA2 connection', () => {
		expect(() => ma2Page({ instances, pages: {} })).toThrow('no MA2 page')
		expect(() => ma2Page({ instances: {}, pages: { 4: LIVE } })).toThrow('no grandMA2 connection')
		expect(() => findMa2({})).toThrow('no grandMA2 connection')
	})

	it('builds a page whose controls are only rows 0, 3, 4 and 5 when the live page had no rows to drop', () => {
		const bare = { name: 'MA2', controls: { 3: { 8: LIVE.controls[3][8] } } }
		const out = ma2Page(rig(bare))
		expect(cells(out.page).sort()).toEqual(['r3c8', 'r4c0', 'r5c0'])
		expect(out.removed).toEqual([])
	})
})

describe('knob', () => {
	const k = knob(MA2)

	it('turns Executor 5.1 up and down a step, storing the clamped level before it sends it', () => {
		for (const [dir, expression] of [
			['rotate_right', `min(100, $(this:current) + ${STEP})`],
			['rotate_left', `max(0, $(this:current) - ${STEP})`],
		]) {
			const [store, send] = sets(k)[dir]
			expect(store).toMatchObject({ connectionId: 'internal', definitionId: 'custom_variable_set_value' })
			expect(store.options.name.value).toBe(VARIABLE)
			expect(store.options.value).toEqual({ value: expression, isExpression: true })
			expect(send).toMatchObject({ connectionId: MA2, definitionId: 'command' })
			// Plain interpolation: the module is too old to evaluate an expression option.
			expect(send.options.command).toEqual({ value: `Executor 5.1 At $(internal:custom_${VARIABLE})`, isExpression: false })
		}
	})

	it('selects Executor 5.1 on press, and has rotary actions turned on', () => {
		expect(commands(sets(k).down)).toEqual(['Select Executor 5.1'])
		expect(k.options.rotaryActions).toBe(true)
	})

	it('gives every action an id of its own', () => {
		const ids = Object.values(sets(k)).flat().map((a) => a.id)
		expect(new Set(ids).size).toBe(ids.length)
	})
})

describe('strip', () => {
	const layers = Object.fromEntries(strip().style.layers.map((l) => [l.id, l]))

	it('names the fader and shows the level the deck last sent, with a bar of it', () => {
		expect(layers.text0.text.value).toBe('Lights')
		expect(layers.text1.text.value).toBe(`$(internal:custom_${VARIABLE})%`)
		expect(layers.fill0.width).toEqual({ value: `max(0, min(100, $(internal:custom_${VARIABLE}))) * 0.88`, isExpression: true })
	})

	it('says in its notes that the level is not read back', () => {
		expect(strip().options.notes).toMatch(/Not read back/)
	})
})

describe('isBlackout', () => {
	it('knows the live BLACKOUT key and nothing else on the page', () => {
		const hits = Object.entries(LIVE.controls).flatMap(([r, cols]) =>
			Object.entries(cols).filter(([, c]) => isBlackout(c, MA2)).map(([c]) => `r${r}c${c}`),
		)
		expect(hits).toEqual(['r3c8'])
	})

	it('ignores a Blackout command sent on another connection', () => {
		expect(isBlackout(LIVE.controls[3][8], 'osc')).toBe(false)
		expect(isBlackout({}, MA2)).toBe(false)
	})
})
