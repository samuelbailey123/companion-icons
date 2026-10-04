import { describe, expect, it } from 'vitest'
import { CENTRE, HALVES, SERMON, WORSHIP, armedOf, buildServicePages } from '../src/ptz/service.js'
import { LOOK, SERVICE_LOOK, buildHubPage } from '../src/ptz/hub.js'
import { HOLD_MS } from '../src/ptz/knobs.js'
import { KNOB_COLS, KNOB_ROW, STRIP_ROW } from '../src/layout.js'
import { folderFor } from '../src/navrow.js'
import { COLORS, MIN_CONTRAST } from '../src/palette.js'
import { ICONS } from '../src/variants.js'
import { contrastRatio } from './helpers/skia.js'

const CAM1 = { conn: 'conn-cam1', host: '10.0.0.196', atem: 1, presets: { 1: 'Wide', 2: 'Stage' }, second: true }
const CAM3 = { conn: 'conn-cam3', host: '10.0.0.181', atem: 3, presets: { 1: 'Wide', 4: 'Stage' } }
const PAGES = { worship: 15, sermon: 16 }
const { worship, sermon } = buildServicePages({ left: CAM1, right: CAM3 }, PAGES)

const label = (c) => c.style.layers.find((l) => l.type === 'text').text.value
const icon = (c) => c.style.layers.find((l) => l.id === 'image0').base64Image.value.slice('$(image:'.length, -1)
const ground = (c) => c.style.layers.find((l) => l.id === 'box0').color.value
const grid = (page, row) => Object.fromEntries(Object.entries(page.controls[row]).map(([col, c]) => [col, label(c)]))
const json = (x) => JSON.stringify(x)
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`

/** Every action reachable from a control, descending into logic_if children. */
const allActions = (control) => {
	const out = []
	const walk = (list) => {
		for (const a of list ?? []) {
			if (a.type !== 'action') continue
			out.push(a)
			for (const group of Object.values(a.children ?? {})) walk(group)
		}
	}
	for (const step of Object.values(control.steps)) for (const set of Object.values(step.action_sets)) walk(set)
	return out
}
const cells = (page) => Object.entries(page.controls).flatMap(([row, cols]) => Object.entries(cols).map(([col, c]) => ({ row: Number(row), col: Number(col), c })))
const half = (page, side) => cells(page).filter(({ col, row }) => (row === KNOB_ROW || row === STRIP_ROW ? Object.values(HALVES[side].knobs) : HALVES[side].cols).includes(col))

describe('the shared pages', () => {
	it('are named for the part of the service, and hang off the PTZ folder', () => {
		expect([worship.name, sermon.name]).toEqual([WORSHIP, SERMON])
		expect(folderFor(WORSHIP)).toBe('PTZ')
		expect(folderFor(SERMON)).toBe('PTZ')
	})

	it('lay Worship out as the operator chose: presets, STOP and Speed per camera, one Save between them', () => {
		expect(grid(worship, 1)).toEqual({ 0: '1 (Wide)', 1: '2 (Stage)', 2: '3', 3: "concat('CAM ', $(internal:custom_ptz2_atem_input))", 4: 'Save', 5: "concat('CAM ', $(internal:custom_ptz_atem_input))", 6: '1 (Wide)', 7: '2', 8: '3' })
		expect(grid(worship, 2)).toEqual({ 0: '4', 1: '5', 2: '6', 3: "concat('Speed ', $(internal:custom_ptz2_speed))", 5: "concat('Speed ', $(internal:custom_ptz_speed))", 6: '4 (Stage)', 7: '5', 8: '6' })
		expect(Object.keys(worship.controls[3]).map(Number)).toEqual([0, 1, 4, 6, 7])
		expect(icon(worship.controls[3][0])).toBe('focus-manual')
		expect(label(worship.controls[3][1])).toBe('1-Push')
		expect(label(worship.controls[3][CENTRE])).toBe('Sermon')
	})

	it('lay Sermon out: tracking and framing on top, who to follow and STOP, then three presets', () => {
		expect(Object.values(grid(sermon, 1))).toEqual(['Track', 'Close-up', 'Half body', 'Full body', 'Track', 'Close-up', 'Half body', 'Full body'])
		expect(Object.values(grid(sermon, 2)).filter((l) => !l.startsWith('concat'))).toEqual(['◂ Left', 'Middle', 'Right ▸', '◂ Left', 'Middle', 'Right ▸'])
		expect(Object.keys(sermon.controls[1]).map(Number)).toEqual([0, 1, 2, 3, 5, 6, 7, 8])
		expect(Object.keys(sermon.controls[2]).map(Number)).toEqual([0, 1, 2, 3, 5, 6, 7, 8])
		for (const col of [HALVES.left.inner, HALVES.right.inner]) expect(icon(sermon.controls[2][col])).toBe('stop')
		expect(grid(sermon, 3)).toEqual({ 0: '1 (Wide)', 1: '2 (Stage)', 2: '3', 4: 'Worship', 6: '1 (Wide)', 7: '2', 8: '3' })
	})

	it('put STOP beside the centre on both, carrying the ATEM tally for its own camera', () => {
		for (const page of [worship, sermon]) {
			for (const [side, cam] of [['left', CAM1], ['right', CAM3]]) {
				const stop = cells(page).find(({ col, c }) => col === HALVES[side].inner && icon(c) === 'stop').c
				const tally = stop.feedbacks.map((f) => f.options.expression.value).join(' ')
				expect(tally).toContain('pgm1_input_id')
				expect(tally).toContain(cam.second ? 'custom_ptz2_atem_input' : 'custom_ptz_atem_input')
			}
		}
	})

	it('split the knobs three and three: pan, tilt and zoom for each camera, on the deck columns', () => {
		for (const page of [worship, sermon]) {
			expect(Object.keys(page.controls[KNOB_ROW]).map(Number)).toEqual(KNOB_COLS)
			expect(Object.keys(page.controls[STRIP_ROW]).map(Number)).toEqual(KNOB_COLS)
			expect(KNOB_COLS.map((c) => label(page.controls[KNOB_ROW][c]))).toEqual(['Pan', 'Tilt', 'Zoom', 'Pan', 'Tilt', 'Zoom'])
			for (const c of KNOB_COLS) expect(page.controls[KNOB_ROW][c].options.rotaryActions).toBe(true)
			// The knobs are the run page's: they stop on the last detent, not on every one.
			expect(json(page.controls[KNOB_ROW][0])).toContain(`"time":{"value":"${HOLD_MS}"`)
		}
	})

	it('drive only their own camera in each half', () => {
		for (const page of [worship, sermon]) {
			for (const [side, cam, other] of [['left', CAM1, CAM3], ['right', CAM3, CAM1]]) {
				for (const { c, row, col } of half(page, side)) {
					const where = `${page.name} ${row}/${col}`
					for (const a of allActions(c)) {
						if (a.connectionId !== 'internal') expect(a.connectionId, where).toBe(cam.conn)
					}
					expect(json(c), where).not.toContain(other.conn)
					expect(json(c), where).not.toContain(other.host)
					// CAM 1 runs on ptz2_*, CAM 3 on ptz_*; neither half reads the other's state,
					// bar the preset keys disarming the other camera's Save.
					const foreign = (cam.second ? /custom_ptz_|"ptz_[a-z]/ : /ptz2_/).exec(json(c).replaceAll(armedOf(other), ''))
					expect(foreign, where).toBeNull()
				}
			}
		}
	})

	it('tint each half in its camera colour, and leave the encoders black like every knob on the deck', () => {
		for (const page of [worship, sermon]) {
			for (const [side, cam] of [['left', CAM1], ['right', CAM3]]) {
				for (const { c, row, col } of half(page, side)) {
					expect(ground(c), `${page.name} ${row}/${col}`).toBe(row === KNOB_ROW ? 0x000000 : LOOK[cam.atem].tint)
				}
			}
		}
		expect(LOOK[1].tint).not.toBe(LOOK[3].tint)
	})

	it('keep every glyph legible on its camera tint', () => {
		const colourOf = Object.fromEntries(ICONS.map((i) => [i.name, COLORS[i.color]]))
		for (const page of [worship, sermon]) {
			for (const [side, cam] of [['left', CAM1], ['right', CAM3]]) {
				for (const { c, row, col } of half(page, side)) {
					if (row === KNOB_ROW) continue
					const ratio = contrastRatio(colourOf[icon(c)], hex(LOOK[cam.atem].tint))
					expect(ratio, `${page.name} ${row}/${col} ${icon(c)} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
				}
			}
		}
	})

	it('border the last preset in its own camera colour', () => {
		const border = (c) => c.feedbacks.find((f) => f.id.endsWith('-last')).styleOverrides.find((o) => o.elementProperty === 'borderColor').override.value
		expect(border(worship.controls[1][0])).toBe(LOOK[1].accent)
		expect(border(worship.controls[1][6])).toBe(LOOK[3].accent)
	})

	it('arm both cameras from one Save, and disarm both on whichever preset saves', () => {
		const save = worship.controls[1][CENTRE]
		const [toggle] = save.steps[0].action_sets.down
		expect(toggle.children.condition[0].options.expression.value).toBe('$(internal:custom_ptz2_armed) == 1 || $(internal:custom_ptz_armed) == 1')
		expect(toggle.children.actions.map((a) => [a.options.name.value, a.options.value.value])).toEqual([['ptz2_armed', '0'], ['ptz_armed', '0']])
		expect(toggle.children.else_actions.map((a) => [a.options.name.value, a.options.value.value])).toEqual([['ptz2_armed', '1'], ['ptz_armed', '1']])
		expect(save.feedbacks[0].options.expression.value).toBe(toggle.children.condition[0].options.expression.value)

		for (const [col, own, other] of [[0, 'ptz2_armed', 'ptz_armed'], [6, 'ptz_armed', 'ptz2_armed']]) {
			const [branch] = worship.controls[1][col].steps[0].action_sets.down
			expect(branch.children.condition[0].options.expression.value).toBe(`$(internal:custom_${own}) == 1`)
			const disarmed = branch.children.actions.filter((a) => a.definitionId === 'custom_variable_set_value' && a.options.value.value === '0')
			expect(disarmed.map((a) => a.options.name.value)).toEqual([own, other])
			// Recall is untouched: it puts the shot back and nothing else.
			expect(branch.children.else_actions.map((a) => a.definitionId)).toContain('recallPreset')
		}
	})

	it('jump between the two pages from the centre column', () => {
		expect(worship.controls[3][CENTRE].steps[0].action_sets.down[0].options.page.value).toBe('16')
		expect(sermon.controls[3][CENTRE].steps[0].action_sets.down[0].options.page.value).toBe('15')
		expect(icon(worship.controls[3][CENTRE])).toBe(SERVICE_LOOK.sermon.icon)
		expect(icon(sermon.controls[3][CENTRE])).toBe(SERVICE_LOOK.worship.icon)
	})

	it('give every entity on a page its own id, and reference only shipped images', () => {
		const names = new Set(ICONS.map((i) => i.name))
		for (const page of [worship, sermon]) {
			const ids = []
			const walk = (node) => {
				if (Array.isArray(node)) return node.forEach(walk)
				if (!node || typeof node !== 'object') return
				if ('definitionId' in node) ids.push(node.id)
				if ('overrideId' in node) ids.push(node.overrideId)
				Object.values(node).forEach(walk)
			}
			walk(page.controls)
			expect(new Set(ids).size, page.name).toBe(ids.length)
			for (const ref of json(page.controls).match(/\$\(image:([a-z0-9-]+)\)/g)) expect(names, ref).toContain(ref.slice(8, -1))
		}
	})

	it('fall back to a neutral look and plain numbers for a camera with no colour or names', () => {
		const odd = buildServicePages({ left: { ...CAM1, atem: 5, presets: undefined }, right: CAM3 }, PAGES).worship
		expect(ground(odd.controls[1][0])).toBe(LOOK.default.tint)
		expect(label(odd.controls[1][0])).toBe('1')
	})
})

describe('the chooser with the shared pages', () => {
	const cameras = [
		{ atem: 1, runPage: 10, setupPage: 11, stateVar: 'ptz2_state', presetVar: 'ptz2_last' },
		{ atem: 3, runPage: 12, setupPage: 13, stateVar: 'ptz_state', presetVar: 'ptz_last' },
	]

	it('offers Worship and Sermon in the centre column, between the cameras', () => {
		const hub = buildHubPage(cameras, PAGES)
		expect(label(hub[1][CENTRE])).toBe('Worship')
		expect(label(hub[2][CENTRE])).toBe('Sermon')
		expect(hub[1][CENTRE].steps[0].action_sets.down[0].options.page.value).toBe('15')
		expect(hub[2][CENTRE].steps[0].action_sets.down[0].options.page.value).toBe('16')
	})

	it('leaves the centre empty on a deck without them', () => {
		const hub = buildHubPage(cameras)
		expect(hub[1][CENTRE]).toBeUndefined()
		expect(hub[2][CENTRE]).toBeUndefined()
	})
})
