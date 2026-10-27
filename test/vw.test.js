import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENTRY_CELL, INPUTS, OUTPUTS, READOUTS, SHORTCUTS, repointVW } from '../src/vw.js'

/** The live VW page, read off the rig on 2026-10-26 after the move, folder row trimmed. */
const LIVE = JSON.parse(fs.readFileSync(new URL('./fixtures/vw-20261026.json', import.meta.url)))
const VH = { connectionId: 'vh1', label: 'videohub' }

const at = (page, row, col) => page.controls[row][col]
const down = (control) => control.steps[0].action_sets.down
const plain = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.value]))
const texts = (control) => control.style.layers.filter((l) => l.type === 'text').map((l) => l.text.value)

/** The router's labels as read on 2026-10-26, one-based. */
const ROUTER_OUT = { 8: 'Backwall Projector', 9: 'Mini Screen 1', 14: 'LED Wall', 15: 'Left Projector', 16: 'Right Projector' }
const ROUTER_IN = { 1: 'Aux 1', 2: 'Multiview', 3: 'Aux 2', 4: 'Program' }

describe('the port map', () => {
	it('names each port exactly as the router labels it now', () => {
		for (const [, name, , now] of OUTPUTS) expect(ROUTER_OUT[now]).toBe(name)
		for (const [, name, , now] of INPUTS) expect(ROUTER_IN[now]).toBe(name)
	})

	it('never acts on outputs 1-6, which now feed the ATEM', () => {
		const used = [...OUTPUTS.map((o) => o[3]), ...READOUTS.map((r) => r[2])]
		expect(used.filter((n) => n <= 6)).toEqual([])
	})
})

describe('repointing the live VW page', () => {
	const vw = repointVW(LIVE, VH, '18')

	it('leaves the live page untouched', () => {
		expect(down(at(LIVE, 1, 0))[0].definitionId).toBe('custom_variable_set_value')
	})

	it('makes each destination key select its new output, lit by the module', () => {
		for (const [col, , , now] of OUTPUTS) {
			const key = at(vw, 1, col)
			expect(down(key)).toHaveLength(1)
			expect(down(key)[0]).toMatchObject({ definitionId: 'select_destination', connectionId: 'vh1' })
			expect(plain(down(key)[0].options)).toEqual({ destination: now })
			expect(key.feedbacks).toHaveLength(1)
			expect(key.feedbacks[0]).toMatchObject({ definitionId: 'selected_destination', connectionId: 'vh1' })
			expect(plain(key.feedbacks[0].options)).toEqual({ output: now })
		}
	})

	it('keeps how each key looks when lit', () => {
		for (const [col] of OUTPUTS) expect(at(vw, 1, col).feedbacks[0].styleOverrides).toEqual(at(LIVE, 1, col).feedbacks[0].styleOverrides)
		for (const [col] of INPUTS) expect(at(vw, 2, col).feedbacks[0].styleOverrides).toEqual(at(LIVE, 2, col).feedbacks[0].styleOverrides)
		for (const [col] of OUTPUTS) expect(at(vw, 1, col).style).toEqual(at(LIVE, 1, col).style)
		for (const [col] of INPUTS) expect(at(vw, 2, col).style).toEqual(at(LIVE, 2, col).style)
	})

	it('makes each source key route its new input to the selected output', () => {
		for (const [col, , , now] of INPUTS) {
			const key = at(vw, 2, col)
			expect(down(key)[0]).toMatchObject({ definitionId: 'route_source', connectionId: 'vh1' })
			expect(plain(down(key)[0].options)).toEqual({ source: now, ignore_lock: true })
			expect(key.feedbacks[0]).toMatchObject({ definitionId: 'selected_source' })
			expect(plain(key.feedbacks[0].options)).toEqual({ input: now })
		}
	})

	it('sends both shortcuts to the projectors at 16 and 15, lit from the right projector', () => {
		for (const [col, , now] of SHORTCUTS) {
			const key = at(vw, 3, col)
			expect(down(key).map((a) => plain(a.options))).toEqual([
				{ source: now, destination: 16, ignore_lock: true },
				{ source: now, destination: 15, ignore_lock: true },
			])
			expect(plain(key.feedbacks[0].options)).toMatchObject({ variable: 'videohub:output_16_input_id', value: String(now) })
		}
	})

	it('reads out the new outputs on the touchstrip', () => {
		for (const [col, , now] of READOUTS) {
			expect(texts(at(vw, 4, col))).toEqual([`$(videohub:output_${now})`, `$(videohub:output_${now}_input)`])
		}
	})

	it('leaves the wall brightness readout and encoder alone', () => {
		expect(at(vw, 4, 6)).toEqual(at(LIVE, 4, 6))
		expect(at(vw, 5, 6)).toEqual(at(LIVE, 5, 6))
	})

	it('adds a key into the Videohub page at the end of row 1', () => {
		const key = at(vw, ENTRY_CELL.row, ENTRY_CELL.col)
		expect(at(LIVE, 1, 8)).toBeUndefined()
		expect(down(key)[0]).toMatchObject({ definitionId: 'set_page', connectionId: 'internal' })
		expect(plain(down(key)[0].options)).toEqual({ surfaceId: 'self', page: '18' })
		expect(texts(key)).toEqual(['Video\nhub'])
	})

	it('no longer uses the vh_dest variable or a nested expression', () => {
		const json = JSON.stringify(vw.controls)
		expect(json).not.toMatch(/vh_dest/)
		expect(json).not.toMatch(/\$\([^)]*\$\(/)
	})

	it('can be run again on its own output', () => {
		expect(repointVW(vw, VH, '18')).toEqual(vw)
	})
})

describe('refusing a page it does not recognise', () => {
	const tweak = (fn) => {
		const page = structuredClone(LIVE)
		fn(page)
		return () => repointVW(page, VH, '18')
	}

	it('refuses a missing key', () => {
		expect(tweak((p) => delete p.controls[1][2])).toThrow(/no key at 1\/2/)
	})

	it('refuses a destination key armed at a different output', () => {
		expect(tweak((p) => (down(p.controls[1][0])[0].options.value.value = '5'))).toThrow(/VW 1\/0 is not the Right Projector/)
	})

	it('refuses a source key routing a different input', () => {
		expect(tweak((p) => (down(p.controls[2][1])[0].options.source.value = 9))).toThrow(/VW 2\/1 is not the Aux 1 source key/)
	})

	it('refuses a shortcut sending somewhere else', () => {
		expect(tweak((p) => (down(p.controls[3][0])[1].options.destination.value = 7))).toThrow(/VW 3\/0/)
		expect(tweak((p) => (p.controls[3][1].feedbacks = []))).toThrow(/VW 3\/1 is not lit/)
	})

	it('refuses a readout of a different output', () => {
		expect(
			tweak((p) => (p.controls[4][3].style.layers.find((l) => l.type === 'text').text.value = '$(videohub:output_3)'))
		).toThrow(/VW 4\/3 is not the output 8 readout/)
	})

	it('refuses to overwrite something else at the end of row 1', () => {
		expect(tweak((p) => (p.controls[1][8] = { options: { notes: 'something' } }))).toThrow(/VW 1\/8 is not free/)
	})
})
