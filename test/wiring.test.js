import { describe, expect, it } from 'vitest'
import { LAYOUT, cleanLabel, makeImageLayer, wireButton, wirePage } from '../src/wiring.js'
import { ICONS } from '../src/variants.js'
import { MAPPING } from '../src/mapping.js'
import { makeLabelSafe } from './helpers/labelsafe.js'

const v = (value) => ({ value, isExpression: false })

const button = (layers) => ({
	type: 'button-layered',
	style: { layers },
	steps: { 0: { action_sets: { down: [{ id: 'a1', connectionId: 'conn1' }] } } },
	feedbacks: [{ id: 'f1' }],
	options: { rotaryActions: false },
})

const canvas = { id: 'canvas', type: 'canvas' }
const box = { id: 'box0', type: 'box', color: v(3355443) }
const text = (t) => ({ id: 'text0', type: 'text', text: v(t), fontsize: v(25), color: v(16777215) })
const image = (src) => ({ id: 'image0', type: 'image', base64Image: v(src) })

describe('cleanLabel', () => {
	it('strips the blank-line padding hack', () => {
		expect(cleanLabel('Previous\\n\\n\\nSlide')).toBe('Previous Slide')
		expect(cleanLabel('Next\n\n\nSlide')).toBe('Next Slide')
	})

	it('leaves ordinary labels alone', () => {
		expect(cleanLabel('Projectors On')).toBe('Projectors On')
	})

	it('passes through non-strings untouched', () => {
		expect(cleanLabel(undefined)).toBe(undefined)
	})
})

describe('makeImageLayer', () => {
	it('references the library image as a variable', () => {
		expect(makeImageLayer('projector-on').base64Image).toEqual(v('$(image:projector-on)'))
	})

	it('fits rather than crops, so no glyph is clipped', () => {
		expect(makeImageLayer('x').fillMode).toEqual(v('fit'))
	})

	it('occupies the upper area, leaving room for the label', () => {
		const l = makeImageLayer('x')
		expect(l.y).toEqual(v(LAYOUT.image.y))
		expect(l.height).toEqual(v(LAYOUT.image.height))
	})
})

describe('wireButton', () => {
	it('adds an image layer to a button that has none', () => {
		const out = wireButton(button([canvas, box, text('Projectors On')]), { icon: 'projector-on' })
		const kinds = out.style.layers.map((l) => l.type)
		expect(kinds).toEqual(['canvas', 'box', 'image', 'text'])
	})

	it('inserts the image below the text so the label stays readable', () => {
		const out = wireButton(button([canvas, box, text('X')]), { icon: 'y' })
		const kinds = out.style.layers.map((l) => l.type)
		expect(kinds.indexOf('image')).toBeLessThan(kinds.indexOf('text'))
	})

	it('reuses an existing image layer rather than stacking a second one', () => {
		const out = wireButton(button([canvas, box, image(null), text('X')]), { icon: 'cam1-idle' })
		expect(out.style.layers.filter((l) => l.type === 'image')).toHaveLength(1)
		expect(out.style.layers.find((l) => l.type === 'image').base64Image).toEqual(
			v('$(image:cam1-idle)')
		)
	})

	it('replaces an embedded base64 png with a library reference', () => {
		const out = wireButton(button([canvas, box, image('data:image/png;base64,AAAA'), text('X')]), {
			icon: 'slide-next',
		})
		const img = out.style.layers.find((l) => l.type === 'image')
		expect(img.base64Image.value).toBe('$(image:slide-next)')
		expect(img.base64Image.value).not.toContain('data:image/png')
	})

	it('cleans the blank-line hack out of the label', () => {
		const out = wireButton(button([canvas, box, text('Previous\\n\\n\\nSlide')]), { icon: 'x' })
		expect(out.style.layers.find((l) => l.type === 'text').text).toEqual(v('Previous Slide'))
	})

	it('honours an explicit label override', () => {
		const out = wireButton(button([canvas, box, text('All Screens Macro')]), {
			icon: 'macro',
			label: 'All Screens',
		})
		expect(out.style.layers.find((l) => l.type === 'text').text).toEqual(v('All Screens'))
	})

	it('moves the text into the lower strip', () => {
		const t = wireButton(button([canvas, box, text('X')]), { icon: 'y' }).style.layers.find(
			(l) => l.type === 'text'
		)
		expect(t.y).toEqual(v(LAYOUT.text.y))
		expect(t.height).toEqual(v(LAYOUT.text.height))
	})

	it('preserves actions, feedbacks and options untouched', () => {
		const input = button([canvas, box, text('X')])
		const out = wireButton(input, { icon: 'y' })
		expect(out.steps).toEqual(input.steps)
		expect(out.feedbacks).toEqual(input.feedbacks)
		expect(out.options).toEqual(input.options)
	})

	it('preserves the background colour, so feedback still has something to change', () => {
		const out = wireButton(button([canvas, box, text('X')]), { icon: 'y' })
		expect(out.style.layers.find((l) => l.type === 'box').color).toEqual(v(3355443))
	})

	it('does not mutate the input control', () => {
		const input = button([canvas, box, text('X')])
		const before = JSON.stringify(input)
		wireButton(input, { icon: 'y' })
		expect(JSON.stringify(input)).toBe(before)
	})

	it('passes through non-layered controls such as pageup/pagedown', () => {
		const nav = { type: 'pageup' }
		expect(wireButton(nav, { icon: 'x' })).toBe(nav)
	})
})

describe('wirePage', () => {
	const page = {
		name: 'Power',
		gridSize: { minColumn: 0, maxColumn: 3, minRow: 0, maxRow: 3 },
		controls: {
			0: { 0: { type: 'pageup' }, 1: button([canvas, box, text('Projectors On')]) },
			1: { 1: button([canvas, box, text('Projectors Off')]) },
		},
	}

	it('wires only the mapped cells', () => {
		const { page: out, wired } = wirePage(page, { 0: { 1: { icon: 'projector-on' } } })
		expect(wired).toEqual(['0,1 -> projector-on'])
		expect(out.controls['0']['1'].style.layers.some((l) => l.type === 'image')).toBe(true)
		expect(out.controls['1']['1'].style.layers.some((l) => l.type === 'image')).toBe(false)
	})

	it('leaves navigation buttons alone', () => {
		const { page: out } = wirePage(page, { 0: { 0: { icon: 'x' } } })
		expect(out.controls['0']['0']).toEqual({ type: 'pageup' })
	})

	it('reports a mapping entry that points at an empty cell', () => {
		const { missing } = wirePage(page, { 3: { 3: { icon: 'x' } } })
		expect(missing).toContain('3,3 (no control)')
	})

	it('reports a mapping entry that points at a non-layered control', () => {
		const { missing } = wirePage(page, { 0: { 0: { icon: 'x' } } })
		expect(missing.some((m) => m.startsWith('0,0'))).toBe(true)
	})

	it('preserves page metadata', () => {
		const { page: out } = wirePage(page, {})
		expect(out.name).toBe('Power')
		expect(out.gridSize).toEqual(page.gridSize)
	})

	it('handles a page with no controls', () => {
		expect(wirePage({ name: 'Empty' }, {}).page.controls).toEqual({})
	})
})

describe('mapping integrity', () => {
	const names = new Set(ICONS.map((i) => i.name))

	/** Every (page, row, col, spec) in the production mapping. */
	const entries = Object.entries(MAPPING).flatMap(([page, rows]) =>
		Object.entries(rows).flatMap(([row, cols]) =>
			Object.entries(cols).map(([col, spec]) => [`p${page} r${row}c${col}`, spec])
		)
	)

	it('references only icons that actually exist in the library', () => {
		// This is the important one. A mapping pointing at a name that was never built —
		// a *shape* name like `house-lights` instead of the icon `house-lights-on`, say —
		// produces a button that renders blank at runtime with no error anywhere.
		const bad = entries.filter(([, spec]) => !names.has(spec.icon))
		expect(bad.map(([where, spec]) => `${where}: ${spec.icon}`)).toEqual([])
	})

	it('uses names Companion will not rewrite', () => {
		for (const [where, spec] of entries) {
			expect(makeLabelSafe(spec.icon), where).toBe(spec.icon)
		}
	})

	it('has no leftover blank-line padding in any override label', () => {
		for (const [where, spec] of entries) {
			if (spec.label) expect(spec.label, where).not.toMatch(/\\n|\n/)
		}
	})

	it('covers every page of the production rig', () => {
		expect(Object.keys(MAPPING).sort()).toEqual(['1', '2', '3', '4', '5', '6'])
	})
})
