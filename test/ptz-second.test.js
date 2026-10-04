import { describe, expect, it } from 'vitest'
import { assertMirrored, definitions2, renameVariables, renameVariablesBack } from '../src/ptz/second.js'
import { LOOK, buildHubPage, runName, setupName } from '../src/ptz/hub.js'
import { buildPage, buildSetupPage } from '../src/ptz/page.js'
import { definitions } from '../src/ptz/variables.js'
import { SUB_PAGES, folderFor } from '../src/navrow.js'
import { ICONS } from '../src/variants.js'

const ONE = { conn: 'conn-one', host: '10.0.0.1' }
const TWO = { conn: 'conn-two', host: '10.0.0.2' }
const PAGES_ONE = { run: 9, setup: 10 }
const PAGES_TWO = { run: 11, setup: 12 }

describe('renaming a camera-one structure into camera two', () => {
	it('rewrites the custom_ form wherever it appears in a string', () => {
		expect(renameVariables('$(internal:custom_ptz_speed)')).toBe('$(internal:custom_ptz2_speed)')
		expect(renameVariables(`concat('Pan ', $(internal:custom_ptz_state))`)).toBe(
			`concat('Pan ', $(internal:custom_ptz2_state))`
		)
	})

	it('rewrites a bare variable name only when it is the whole string', () => {
		expect(renameVariables('ptz_armed')).toBe('ptz2_armed')
		// A caption that merely mentions the name is prose, and rewriting it would be a silent corruption.
		expect(renameVariables('press to arm ptz_armed now')).toBe('press to arm ptz_armed now')
	})

	it('leaves everything that is not a variable reference alone', () => {
		expect(renameVariables('Speed')).toBe('Speed')
		expect(renameVariables(42)).toBe(42)
		expect(renameVariables(true)).toBe(true)
		expect(renameVariables(null)).toBe(null)
	})

	it('descends into arrays and objects without mutating the input', () => {
		const input = { a: ['ptz_speed', { b: '$(internal:custom_ptz_last)' }] }
		const out = renameVariables(input)
		expect(out).toEqual({ a: ['ptz2_speed', { b: '$(internal:custom_ptz2_last)' }] })
		expect(input.a[0]).toBe('ptz_speed')
	})

	it('round-trips every variable it knows about', () => {
		for (const name of Object.keys(definitions())) {
			expect(renameVariablesBack(renameVariables(name))).toBe(name)
			const ref = `$(internal:custom_${name})`
			expect(renameVariablesBack(renameVariables(ref))).toBe(ref)
		}
	})

	it('round-trips a whole built page', () => {
		const page = buildPage(ONE.conn, ONE.host, PAGES_ONE)
		expect(renameVariablesBack(renameVariables(page))).toEqual(page)
	})

	it('leaves a camera-two structure alone when renaming back things that are not variables', () => {
		expect(renameVariablesBack('Speed')).toBe('Speed')
		expect(renameVariablesBack(7)).toBe(7)
		expect(renameVariablesBack(['x'])).toEqual(['x'])
	})
})

describe('camera two variable definitions', () => {
	it('names one variable per camera-one variable, prefixed', () => {
		const one = Object.keys(definitions())
		const two = Object.keys(definitions2())
		expect(two).toHaveLength(one.length)
		for (const name of one) expect(two).toContain(name.replace(/^ptz/, 'ptz2'))
	})

	it('keeps the persistence choice, which is what makes operator state survive a restart', () => {
		const one = definitions()
		const two = definitions2()
		for (const [name, def] of Object.entries(one)) {
			expect(two[name.replace(/^ptz/, 'ptz2')].persistCurrentValue).toBe(def.persistCurrentValue)
		}
	})

	it('says PTZ 2 in the description so the two sets are told apart in the UI', () => {
		expect(definitions2().ptz2_speed.description).toContain('PTZ 2')
	})
})

describe('the mirror check', () => {
	const opts = {
		connOne: ONE.conn, connTwo: TWO.conn,
		hostOne: ONE.host, hostTwo: TWO.host,
		pagesOne: PAGES_ONE, pagesTwo: PAGES_TWO,
		name: 'run page',
	}

	it('passes when camera two is the same page built for the other camera', () => {
		const one = buildPage(ONE.conn, ONE.host, PAGES_ONE)
		const two = renameVariables(buildPage(TWO.conn, TWO.host, PAGES_TWO))
		expect(() => assertMirrored(one, two, opts)).not.toThrow()
	})

	it('passes for the setup pages too', () => {
		const one = buildSetupPage(ONE.conn, ONE.host, PAGES_ONE)
		const two = renameVariables(buildSetupPage(TWO.conn, TWO.host, PAGES_TWO))
		expect(() => assertMirrored(one, two, { ...opts, name: 'setup page' })).not.toThrow()
	})

	it('catches a layout difference, which is the whole point of it', () => {
		const one = buildPage(ONE.conn, ONE.host, PAGES_ONE)
		const two = renameVariables(buildPage(TWO.conn, TWO.host, PAGES_TWO))
		delete two.controls[2][8]
		expect(() => assertMirrored(one, two, opts)).toThrow(/not a mirror/)
	})

	it('catches a caption that drifted on one camera only', () => {
		const one = buildPage(ONE.conn, ONE.host, PAGES_ONE)
		const two = renameVariables(buildPage(TWO.conn, TWO.host, PAGES_TWO))
		const text = two.controls[3][3].style.layers.find((l) => l.type === 'text')
		text.text.value = 'Setup!'
		expect(() => assertMirrored(one, two, opts)).toThrow(/not a mirror/)
	})

	it('does not need page numbers to be given', () => {
		const one = buildPage(ONE.conn, ONE.host, PAGES_ONE)
		const two = renameVariables(buildPage(TWO.conn, TWO.host, PAGES_ONE))
		expect(() => assertMirrored(one, two, { ...opts, pagesOne: undefined, pagesTwo: undefined })).not.toThrow()
	})
})

describe('where the cameras sit in the deck', () => {
	it('hangs all four camera pages off the one PTZ folder column', () => {
		for (const atem of [1, 3]) {
			expect(SUB_PAGES[runName(atem)]).toBe('PTZ')
			expect(SUB_PAGES[setupName(atem)]).toBe('PTZ')
			expect(folderFor(runName(atem))).toBe('PTZ')
			expect(folderFor(setupName(atem))).toBe('PTZ')
		}
	})
})

describe('the chooser', () => {
	const cameras = [
		{ atem: 1, runPage: 10, setupPage: 11, stateVar: 'ptz2_state', presetVar: 'ptz2_last' },
		{ atem: 3, runPage: 12, setupPage: 13, stateVar: 'ptz_state', presetVar: 'ptz_last' },
	]
	const hub = buildHubPage(cameras)
	const label = (c) => c.style.layers.find((l) => l.type === 'text').text.value

	it('gives each camera an entry key that goes to its own run page', () => {
		const entries = Object.values(hub[1])
		expect(entries).toHaveLength(2)
		expect(entries.map(label)).toEqual(['CAM 1', 'CAM 3'])
		expect(entries.map((e) => e.steps[0].action_sets.down[0].options.page.value)).toEqual(['10', '12'])
	})

	it('puts the two cameras far enough apart that neither is hit by accident', () => {
		const columns = Object.keys(hub[1]).map(Number)
		expect(Math.abs(columns[0] - columns[1])).toBeGreaterThanOrEqual(3)
	})

	it('carries the ATEM tally, so you can see what moving a camera would cost', () => {
		const entry = Object.values(hub[1])[0]
		const expressions = entry.feedbacks.map((f) => f.options.expression.value)
		expect(expressions.some((e) => e.includes('pgm1_input_id'))).toBe(true)
		expect(expressions.some((e) => e.includes('pvw1_input_id'))).toBe(true)
	})

	it('warns when a camera stops answering its poller', () => {
		const entry = Object.values(hub[1])[0]
		expect(entry.feedbacks.some((f) => f.options.expression.value.includes("'$.online'"))).toBe(true)
	})

	it('reads each camera state from that camera own variables', () => {
		expect(label(Object.values(hub[2])[0])).toContain('ptz2_state')
		expect(label(Object.values(hub[2])[1])).toContain('ptz_state')
	})

	it('offers each camera setup page directly, so setup is two presses not three', () => {
		const setups = Object.values(hub[3])
		expect(setups.map(label)).toEqual(['CAM 1 Setup', 'CAM 3 Setup'])
		expect(setups.map((s) => s.steps[0].action_sets.down[0].options.page.value)).toEqual(['11', '13'])
	})

	it('falls back to a neutral look for a camera with no colour of its own', () => {
		const odd = buildHubPage([
			{ atem: 5, runPage: 10, setupPage: 11, stateVar: 'ptz2_state', presetVar: 'ptz2_last' },
			{ atem: 3, runPage: 12, setupPage: 13, stateVar: 'ptz_state', presetVar: 'ptz_last' },
		])
		const box = Object.values(odd[1])[0].style.layers.find((l) => l.id === 'box0')
		expect(box.color.value).toBe(LOOK.default.bg)
	})

	it('gives the two cameras different colours', () => {
		expect(LOOK[1].bg).not.toBe(LOOK[3].bg)
		expect(LOOK[1].accent).not.toBe(LOOK[3].accent)
	})

	it('is laid out for exactly two cameras and says so rather than drawing nonsense', () => {
		expect(() => buildHubPage(cameras.slice(0, 1))).toThrow(/two cameras/)
		expect(() => buildHubPage([...cameras, { atem: 4 }])).toThrow(/two cameras/)
	})
})
