import { describe, expect, it } from 'vitest'
import { ICONS, resolveShape } from '../src/variants.js'
import { COLORS } from '../src/palette.js'
import { SHAPES } from '../src/glyphs/index.js'
import { isLabelValid, makeLabelSafe } from './helpers/labelsafe.js'

describe('icon inventory', () => {
	it('contains exactly 126 icons', () => {
		expect(ICONS).toHaveLength(126)
	})

	it('has no duplicate names', () => {
		const names = ICONS.map((i) => i.name)
		expect(new Set(names).size).toBe(names.length)
	})

	it('every name survives Companion label sanitisation unchanged', () => {
		for (const { name } of ICONS) {
			expect(makeLabelSafe(name), name).toBe(name)
			expect(isLabelValid(name), name).toBe(true)
		}
	})

	it('every icon references a real shape and a real colour token', () => {
		for (const { name, shape, color } of ICONS) {
			expect(SHAPES, `${name} -> shape ${shape}`).toHaveProperty(shape)
			expect(COLORS, `${name} -> color ${color}`).toHaveProperty(color)
		}
	})

	it('every icon carries a non-empty description for the library UI', () => {
		for (const { name, description } of ICONS) {
			expect(description?.length, name).toBeGreaterThan(0)
		}
	})

	it('assigns every icon to one of the seven collections', () => {
		const collections = new Set(ICONS.map((i) => i.collection))
		expect([...collections].sort()).toEqual([
			'audio',
			'contrast',
			'power',
			'present',
			'routing',
			'utility',
			'video',
			'wireless',
		])
	})

	it('matches the planned per-collection counts', () => {
		const counts = {}
		for (const i of ICONS) counts[i.collection] = (counts[i.collection] ?? 0) + 1
		expect(counts).toEqual({
			contrast: 14,
			power: 17,
			video: 34,
			routing: 7,
			present: 17,
			audio: 14,
			wireless: 14,
			utility: 9,
		})
	})
})

describe('index families', () => {
	const has = (name) => ICONS.some((i) => i.name === name)

	it('battery is complete and contiguous 0..4', () => {
		for (let n = 0; n <= 4; n++) expect(has(`battery-${n}`), `battery-${n}`).toBe(true)
		expect(has('battery-5')).toBe(false)
	})

	it('rf is complete and contiguous 0..3', () => {
		for (let n = 0; n <= 3; n++) expect(has(`rf-${n}`), `rf-${n}`).toBe(true)
		expect(has('rf-4')).toBe(false)
	})

	it('every camera has all three bus states', () => {
		for (let c = 1; c <= 6; c++) {
			for (const state of ['idle', 'preview', 'program']) {
				expect(has(`cam${c}-${state}`), `cam${c}-${state}`).toBe(true)
			}
		}
	})

	it('resolves level families to distinct geometry per level', () => {
		const at = (name) => JSON.stringify(resolveShape(ICONS.find((i) => i.name === name)))
		expect(at('battery-1')).not.toBe(at('battery-4'))
		expect(at('rf-0')).not.toBe(at('rf-3'))
	})

	it('resolves non-family icons to their shape unchanged', () => {
		const entry = ICONS.find((i) => i.name === 'power-on')
		expect(resolveShape(entry)).toBe(SHAPES.power)
	})

	it('grades battery and rf colour by level so state reads before the bars do', () => {
		const colorOf = (name) => ICONS.find((i) => i.name === name).color
		expect(colorOf('battery-0')).toBe('off')
		expect(colorOf('battery-4')).toBe('on')
		expect(colorOf('rf-0')).toBe('off')
		expect(colorOf('rf-3')).toBe('on')
	})
})
