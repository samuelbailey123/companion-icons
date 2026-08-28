import { describe, expect, it } from 'vitest'
import {
	RUN_NAME,
	SETUP_NAME,
	assertMirrored,
	definitions2,
	renameVariables,
	renameVariablesBack,
	swapKey,
} from '../src/ptz/second.js'
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

describe('the camera-swap key', () => {
	const imageNames = new Set(ICONS.map((i) => i.name))

	it('is captioned and drawn with the other camera ATEM number', () => {
		const key = swapKey(11, 1)
		const text = key.style.layers.find((l) => l.type === 'text')
		const image = key.style.layers.find((l) => l.type === 'image')
		expect(text.text.value).toBe('CAM 1')
		expect(image.base64Image.value).toBe('$(image:cam1-idle)')
	})

	it('only ever uses art the library actually ships', () => {
		for (const atem of [1, 2, 3, 4, 5, 6]) {
			const image = swapKey(9, atem).style.layers.find((l) => l.type === 'image')
			expect(imageNames.has(image.base64Image.value.slice('$(image:'.length, -1))).toBe(true)
		}
	})

	it('navigates to the other camera run page', () => {
		const key = swapKey(11, 1)
		const action = key.steps[0].action_sets.down[0]
		expect(action.definitionId).toBe('set_page')
		expect(action.connectionId).toBe('internal')
		expect(action.options.page.value).toBe('11')
	})

	it('refuses page 0, which Companion reads as "the page you are on"', () => {
		expect(() => swapKey(0, 1)).toThrow()
		expect(() => swapKey(undefined, 1)).toThrow()
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

describe('where the second camera sits in the deck', () => {
	it('hangs both of its pages off the PTZ folder rather than taking a column', () => {
		expect(SUB_PAGES[RUN_NAME]).toBe('PTZ')
		expect(SUB_PAGES[SETUP_NAME]).toBe('PTZ')
		expect(folderFor(RUN_NAME)).toBe('PTZ')
		expect(folderFor(SETUP_NAME)).toBe('PTZ')
	})
})
