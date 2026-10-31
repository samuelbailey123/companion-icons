import { describe, expect, it } from 'vitest'
import { CORNER_RADIUS, restyleControl, restylePage } from '../src/rounded-bold.js'

const v = (value) => ({ value, isExpression: false })
const box = (id, x, y, width, height) => ({
	id, type: 'box', x: v(x), y: v(y), width: v(width), height: v(height), cornerRadius: v(0), color: v(0x1f2937),
})
const text = (id) => ({ id, type: 'text', text: v('Label'), weight: v('normal'), fontsizeAllowShrink: v(false) })
const key = (...layers) => ({ type: 'button-layered', style: { layers: [{ id: 'canvas', type: 'canvas' }, ...layers] } })

describe('restyleControl', () => {
	it('rounds the background and emboldens the caption', () => {
		const k = key(box('box0', 0, 0, 100, 100), text('text0'))
		expect(restyleControl(k)).toEqual({ rounded: 1, bolded: 1 })
		expect(k.style.layers[1].cornerRadius).toEqual(v(CORNER_RADIUS))
		expect(k.style.layers[2].weight).toEqual(v('bold'))
	})

	it('lets a bold caption shrink, because bold is wider', () => {
		const k = key(text('text0'))
		restyleControl(k)
		expect(k.style.layers[1].fontsizeAllowShrink).toEqual(v(true))
	})

	it('leaves a box that is not the whole key alone', () => {
		const track = box('track0', 6, 64, 88, 22)
		restyleControl(key(track))
		expect(track.cornerRadius).toEqual(v(0))
	})

	it('never takes a box drawn from an expression for the background', () => {
		const fill = box('fill0', 0, 0, 100, 100)
		fill.width = { value: '100', isExpression: true }
		expect(restyleControl(key(fill))).toEqual({ rounded: 0, bolded: 0 })
		expect(fill.cornerRadius).toEqual(v(0))
	})

	it('keeps readings regular so they read as values under a label', () => {
		const layers = ['text1', 'port', 'feed'].map(text)
		expect(restyleControl(key(...layers))).toEqual({ rounded: 0, bolded: 0 })
		for (const l of layers) expect(l.weight).toEqual(v('normal'))
	})

	it('emboldens a Videohub key by its name', () => {
		const name = text('name')
		restyleControl(key(name))
		expect(name.weight).toEqual(v('bold'))
	})

	it('touches nothing but those fields', () => {
		const k = key(box('box0', 0, 0, 100, 100), text('text0'))
		k.feedbacks = [{ id: 'f' }]
		k.steps = { 0: { action_sets: { down: [{ id: 'a' }] } } }
		const before = JSON.parse(JSON.stringify(k))
		restyleControl(k)
		for (const l of before.style.layers) {
			if (l.type === 'box') l.cornerRadius = v(CORNER_RADIUS)
			if (l.type === 'text') Object.assign(l, { weight: v('bold'), fontsizeAllowShrink: v(true) })
		}
		expect(k).toEqual(before)
	})

	it('takes a chosen radius', () => {
		const k = key(box('box0', 0, 0, 100, 100))
		restyleControl(k, 40)
		expect(k.style.layers[1].cornerRadius).toEqual(v(40))
	})

	it('copes with a key that has no style', () => {
		expect(restyleControl({ type: 'pagenum' })).toEqual({ rounded: 0, bolded: 0 })
	})
})

describe('restylePage', () => {
	it('counts every key on the page', () => {
		const page = {
			controls: {
				0: { 0: key(box('box0', 0, 0, 100, 100), text('text0')) },
				1: { 3: key(box('box0', 0, 0, 100, 100), text('text0'), text('text1')), 4: { type: 'x' } },
			},
		}
		expect(restylePage(page)).toEqual({ keys: 3, rounded: 2, bolded: 2 })
	})

	it('copes with an empty page', () => {
		expect(restylePage({})).toEqual({ keys: 0, rounded: 0, bolded: 0 })
	})
})
