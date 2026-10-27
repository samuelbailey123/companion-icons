import { describe, expect, it } from 'vitest'
import { KNOB_COLS, KNOB_ROW, STRIP_ROW } from '../src/layout.js'
import { NAV_ORDER, SUB_PAGES, assertNavCoverage } from '../src/navrow.js'
import { ENTRY_ROW, FOLDERS, KINDS, MARK, MODULE_ID, MUTED, STEP, buildConfig, entryKey, findSq, folderPage, knob, strip } from '../src/sq7-faders.js'

const SQ = '_fzcz3CsH4D8mW9YLpuOb'
const instances = { [SQ]: { moduleId: MODULE_ID, label: 'SQ' }, other: { moduleId: 'bmd-atem', label: 'atem' }, gone: null }
const navPages = () => Object.fromEntries(NAV_ORDER.map((name, i) => [String(i + 1), { id: `p${i + 1}`, name, controls: {} }]))
const rig = (pages = navPages()) => ({ instances, pages })
const SQ7 = String(NAV_ORDER.indexOf('SQ7') + 1)
const numbers = Object.fromEntries(NAV_ORDER.map((name, i) => [name, i + 1]))

const set = (control, name) => control.steps[0].action_sets[name]
const text = (control, id) => control.style.layers.find((l) => l.id === id).text.value

describe('the folders', () => {
	it('are the six Sam chose, none wider than the deck has knobs', () => {
		expect(FOLDERS.map((f) => f.name)).toEqual(['DCA 1-4', 'DCA 5-8', 'Leads', 'BGV', 'Lav', 'FX'])
		expect(FOLDERS.every((f) => f.faders.length <= KNOB_COLS.length)).toBe(true)
	})

	it('put the vocal mics on the channels the Dante page names', () => {
		const channels = (name) => FOLDERS.find((f) => f.name === name).faders.map((f) => f.n)
		expect(channels('Leads')).toEqual([1, 2, 3, 4])
		expect(channels('BGV')).toEqual([5, 6, 7, 8])
		expect(channels('Lav')).toEqual([13, 14])
	})

	it('are SQ7 sub-pages, so the folder row accepts them', () => {
		for (const f of FOLDERS) expect(SUB_PAGES[f.name]).toBe('SQ7')
		expect(() => assertNavCoverage([...NAV_ORDER, ...FOLDERS.map((f) => f.name)], 9)).not.toThrow()
	})
})

describe('the level each strip reads', () => {
	it('is the module variable at the fader’s address in the SQ MIDI protocol', () => {
		expect(KINDS.dca.variable(1)).toBe('level_79.32')
		expect(KINDS.dca.variable(8)).toBe('level_79.39')
		expect(KINDS.input.variable(1)).toBe('level_64.0')
		expect(KINDS.input.variable(14)).toBe('level_64.13')
		expect(KINDS.fxr.variable(1)).toBe('level_64.60')
		expect(KINDS.fxr.variable(4)).toBe('level_64.63')
	})
})

describe('a knob', () => {
	it('turns a DCA a step down and up, with no mix to name', () => {
		const k = knob(SQ, 'dca', { n: 3, label: 'DCA 3' })
		const [down] = set(k, 'rotate_left')
		const [up] = set(k, 'rotate_right')
		expect(down).toMatchObject({ connectionId: SQ, definitionId: 'dca_level_output' })
		expect(down.options).toEqual({ input: { value: 2, isExpression: false }, leveldb: { value: `step-${STEP}`, isExpression: false }, fade: { value: 0, isExpression: false } })
		expect(up.options.leveldb.value).toBe(`step+${STEP}`)
		expect(k.options.rotaryActions).toBe(true)
	})

	it('turns an input or FX return into Main (LR)', () => {
		const lead = set(knob(SQ, 'input', { n: 1, label: 'Lead 1' }), 'rotate_right')[0]
		expect(lead).toMatchObject({ definitionId: 'chlev_to_mix', options: { input: { value: 0 }, assign: { value: 'lr' } } })
		const fx = set(knob(SQ, 'fxr', { n: 2, label: 'FX 2' }), 'rotate_left')[0]
		expect(fx).toMatchObject({ definitionId: 'fxrlev_to_mix', options: { input: { value: 1 }, assign: { value: 'lr' } } })
	})

	it('mutes or unmutes on press, and goes red while muted', () => {
		const k = knob(SQ, 'input', { n: 13, label: 'Lav 1' })
		expect(set(k, 'down')).toEqual([expect.objectContaining({ definitionId: 'mute_input', options: { strip: { value: 12, isExpression: false }, mute: { value: 0, isExpression: false } } })])
		expect(k.feedbacks[0]).toMatchObject({ definitionId: 'mute_input', connectionId: SQ, options: { channel: { value: 12 } } })
		expect(k.feedbacks[0].styleOverrides[0]).toMatchObject({ elementId: 'box0', elementProperty: 'color', override: { value: MUTED } })
		expect(text(k, 'text0')).toBe('Lav 1')
	})

	it('gives every action an id of its own', () => {
		const k = knob(SQ, 'fxr', { n: 1, label: 'FX 1' })
		const ids = Object.values(k.steps[0].action_sets).flat().map((a) => a.id)
		expect(new Set(ids).size).toBe(ids.length)
	})
})

describe('a strip segment', () => {
	it('shows the name, the desk’s dB reading, and red while muted', () => {
		const s = strip(SQ, 'dca', { n: 1, label: 'DCA 1' })
		expect(text(s, 'text0')).toBe('DCA 1')
		expect(text(s, 'text1')).toBe('$(SQ:level_79.32) dB')
		expect(s.feedbacks[0]).toMatchObject({ definitionId: 'mute_dca', options: { channel: { value: 0 } } })
		expect(set(s, 'down')).toEqual([])
	})
})

describe('a folder page', () => {
	const page = folderPage(SQ, FOLDERS[0], numbers)

	it('has the folder row with SQ7 marked, and a strip over a knob per fader', () => {
		expect(Object.keys(page.controls[0])).toHaveLength(9)
		expect(Object.keys(page.controls[KNOB_ROW]).map(Number)).toEqual(KNOB_COLS.slice(0, 4))
		expect(Object.keys(page.controls[STRIP_ROW]).map(Number)).toEqual(KNOB_COLS.slice(0, 4))
		expect(page.name).toBe('DCA 1-4')
	})

	it('leaves the key rows empty', () => {
		for (const row of [1, 2, 3]) expect(page.controls[row]).toBeUndefined()
	})

	it('refuses a folder with more faders than knobs', () => {
		const wide = { name: 'Wide', kind: 'input', faders: Array.from({ length: 7 }, (_, i) => ({ n: i + 1, label: `CH ${i + 1}` })) }
		expect(() => folderPage(SQ, wide, numbers)).toThrow('7 faders but the deck has 6 knobs')
	})
})

describe('an entry key', () => {
	it('opens its folder’s page on the surface that pressed it', () => {
		const k = entryKey(FOLDERS[2], '21')
		expect(set(k, 'down')[0]).toMatchObject({ definitionId: 'set_page', connectionId: 'internal', options: { surfaceId: { value: 'self' }, page: { value: '21' } } })
		expect(text(k, 'text0')).toBe('Leads')
		expect(k.options.notes.startsWith(`${MARK}:`)).toBe(true)
	})
})

describe('building from a live export', () => {
	it('numbers new pages after the last, in folder order, and puts their keys on SQ7’s bottom row', () => {
		const { connectionId, sq7, parent, pages } = buildConfig(rig())
		expect(connectionId).toBe(SQ)
		expect(sq7).toBe(SQ7)
		expect(pages.map((p) => p.number)).toEqual(['10', '11', '12', '13', '14', '15'])
		expect(pages.every((p) => !p.existing && p.page.id === undefined)).toBe(true)
		FOLDERS.forEach((f, col) => expect(set(parent.controls[ENTRY_ROW][col], 'down')[0].options.page.value).toBe(String(10 + col)))
	})

	it('rebuilds existing folder pages in place, keeping their numbers and ids, over its own SQ7 keys', () => {
		const first = buildConfig(rig())
		const pages = navPages()
		pages[SQ7] = first.parent
		first.pages.forEach(({ number, page }) => (pages[number] = { ...page, id: `id-${number}` }))
		const again = buildConfig(rig(pages))
		expect(again.pages.map((p) => [p.number, p.existing, p.page.id])).toEqual(first.pages.map((p) => [p.number, true, `id-${p.number}`]))
		expect(again.parent.controls[ENTRY_ROW]).toEqual(first.parent.controls[ENTRY_ROW])
	})

	it('copies, never edits, the SQ7 page it reads', () => {
		const full = rig()
		const before = JSON.stringify(full)
		buildConfig(full)
		expect(JSON.stringify(full)).toBe(before)
	})

	it('refuses a cell on SQ7’s bottom row holding someone else’s key', () => {
		const pages = navPages()
		pages[SQ7].controls = { [ENTRY_ROW]: { 1: { options: { notes: 'something else' } } } }
		expect(() => buildConfig(rig(pages))).toThrow(`SQ7 ${ENTRY_ROW}/1 already holds a different key`)
		pages[SQ7].controls = { [ENTRY_ROW]: { 0: {} } }
		expect(() => buildConfig(rig(pages))).toThrow(`SQ7 ${ENTRY_ROW}/0 already holds a different key`)
	})

	it('refuses a rig without SQ7, without one SQ connection, or with gaps in its page numbers', () => {
		expect(() => buildConfig(rig({ 1: { name: 'Home', controls: {} } }))).toThrow('no page named "SQ7"')
		expect(() => findSq({ instances: {} })).toThrow('found 0')
		const gap = navPages()
		gap[20] = { name: 'Stray', controls: {} }
		expect(() => buildConfig(rig(gap))).toThrow('not numbered 1..10')
	})
})
