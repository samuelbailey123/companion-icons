import { describe, expect, it } from 'vitest'
import {
	LAYOUT,
	cleanLabel,
	contrastVariant,
	feedbackBackgrounds,
	luminance,
	makeImageLayer,
	wireButton,
	wirePage,
} from '../src/wiring.js'
import { COLORS } from '../src/palette.js'
import { contrastRatio } from './helpers/skia.js'
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


describe('feedback-driven backgrounds', () => {
	/** The real palettes in use on the production rig. */
	const REAL = ['#00A651', '#CC0000', '#E67300', '#E6C000', '#0000EE', '#00EE00', '#EEEE00', '#FF0000']

	const fb = (id, color) => ({
		id,
		styleOverrides: [
			{ overrideId: `o-${id}`, elementId: 'box0', elementProperty: 'color', override: { value: color } },
		],
	})

	it('luminance accepts both hex strings and Companion 24-bit ints', () => {
		expect(luminance('#FFFFFF')).toBeCloseTo(1, 3)
		expect(luminance(0xffffff)).toBeCloseTo(1, 3)
		expect(luminance('#000000')).toBeCloseTo(0, 3)
	})

	it('the chosen variant clears 4.5:1 against every real feedback colour', () => {
		// This is the guarantee. Neither white nor black alone can do it: white is 1.7:1 on
		// #E6C000, black is 1.0:1 on #CC0000. Choosing per background is what makes it hold.
		for (const bg of REAL) {
			const chosen = COLORS[contrastVariant(bg)]
			expect(contrastRatio(chosen, bg), `${bg}`).toBeGreaterThanOrEqual(4.5)
		}
	})

	it('demonstrates why a single fixed colour cannot work', () => {
		// White drowns on the amber state...
		expect(contrastRatio(COLORS.paper, '#E6C000')).toBeLessThan(3)
		// ...and black drowns on the dark blue one. There is no single winner, which is
		// the entire justification for swapping per state.
		expect(contrastRatio(COLORS.ink, '#0000EE')).toBeLessThan(3)
	})

	it('finds every background a control\'s feedbacks can impose', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [fb('f1', 0x00a651), fb('f2', 0xcc0000)]
		expect(feedbackBackgrounds(c).map((x) => x.color)).toEqual([0x00a651, 0xcc0000])
	})

	it('ignores overrides that are not a box colour', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [
			{ id: 'f1', styleOverrides: [{ elementId: 'text0', elementProperty: 'color', override: { value: 1 } }] },
		]
		expect(feedbackBackgrounds(c)).toEqual([])
	})

	it('uses a contrast variant on a feedback-coloured button', () => {
		const c = button([canvas, box, text('Projectors On')])
		c.feedbacks = [fb('f1', 0x00a651)]
		const out = wireButton(c, { icon: 'projector-on' })
		const src = out.style.layers.find((l) => l.type === 'image').base64Image.value
		// base box is #333333, which is dark, so the base icon is the light one
		expect(src).toBe('$(image:projector-paper)')
	})

	it('adds an icon override to each colour-changing feedback', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [fb('f1', 0x00a651), fb('f2', 0xcc0000)]
		const out = wireButton(c, { icon: 'projector-on' })

		const iconOverride = (f) =>
			f.styleOverrides.find((o) => o.elementProperty === 'base64Image')?.override.value

		// light green background -> dark icon; dark red background -> light icon
		expect(iconOverride(out.feedbacks[0])).toBe('$(image:projector-ink)')
		expect(iconOverride(out.feedbacks[1])).toBe('$(image:projector-paper)')
	})

	it('leaves the original box overrides in place', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [fb('f1', 0x00a651)]
		const out = wireButton(c, { icon: 'projector-on' })
		expect(out.feedbacks[0].styleOverrides.some((o) => o.elementId === 'box0')).toBe(true)
	})

	it('is idempotent - re-wiring does not stack duplicate icon overrides', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [fb('f1', 0x00a651)]
		const once = wireButton(c, { icon: 'projector-on' })
		const twice = wireButton(once, { icon: 'projector-on' })
		const n = twice.feedbacks[0].styleOverrides.filter((o) => o.elementProperty === 'base64Image')
		expect(n).toHaveLength(1)
	})

	it('leaves buttons without colour feedback on their designed colour', () => {
		const out = wireButton(button([canvas, box, text('X')]), { icon: 'projector-on' })
		expect(out.style.layers.find((l) => l.type === 'image').base64Image.value).toBe(
			'$(image:projector-on)'
		)
		expect(out.feedbacks).toEqual([{ id: 'f1' }])
	})
})


describe('wireButton defensive paths', () => {
	const fbBox = (color) => ({
		id: 'f1',
		styleOverrides: [
			{ overrideId: 'o1', elementId: 'box0', elementProperty: 'color', override: { value: color } },
		],
	})

	it('falls back to the fixed-colour icon when no contrast pair exists for the shape', () => {
		// `route` has no route-paper / route-ink pair, so a feedback-coloured VideoHub button
		// keeps its designed colour rather than referencing an icon that was never built.
		const c = button([canvas, box, text('X')])
		c.feedbacks = [fbBox(0x00a651)]
		const out = wireButton(c, { icon: 'route' })
		expect(out.style.layers.find((l) => l.type === 'image').base64Image.value).toBe(
			'$(image:route)'
		)
	})

	it('falls back when the mapping names something not in the library at all', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [fbBox(0x00a651)]
		const out = wireButton(c, { icon: 'not-a-real-icon' })
		expect(out.style.layers.find((l) => l.type === 'image').base64Image.value).toBe(
			'$(image:not-a-real-icon)'
		)
	})

	it('handles a button with no box layer when choosing a base variant', () => {
		const c = { type: 'button-layered', style: { layers: [canvas, text('X')] }, feedbacks: [fbBox(0xeeee00)] }
		const out = wireButton(c, { icon: 'projector-on' })
		// No box means no known base colour, so it is treated as dark: the light icon.
		expect(out.style.layers.find((l) => l.type === 'image').base64Image.value).toBe(
			'$(image:projector-paper)'
		)
	})

	it('handles a box whose colour is a bare number rather than an envelope', () => {
		const bare = { id: 'box0', type: 'box', color: 0xeeee00 }
		const c = { type: 'button-layered', style: { layers: [canvas, bare, text('X')] }, feedbacks: [fbBox(0)] }
		const out = wireButton(c, { icon: 'pa-on' })
		expect(out.style.layers.find((l) => l.type === 'image').base64Image.value).toBe(
			'$(image:pa-ink)'
		)
	})

	it('appends the image layer when a button has no text layer', () => {
		const c = { type: 'button-layered', style: { layers: [canvas, box] } }
		const out = wireButton(c, { icon: 'blank' })
		expect(out.style.layers.map((l) => l.type)).toEqual(['canvas', 'box', 'image'])
	})

	it('handles a control with no style at all', () => {
		const out = wireButton({ type: 'button-layered' }, { icon: 'blank' })
		expect(out.style.layers.map((l) => l.type)).toEqual(['image'])
	})

	it('leaves feedbacks that impose no background untouched', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [{ id: 'plain' }, fbBox(0x00a651)]
		const out = wireButton(c, { icon: 'projector-on' })
		expect(out.feedbacks[0]).toEqual({ id: 'plain' })
	})

	it('handles a feedback whose override carries no value', () => {
		const c = button([canvas, box, text('X')])
		c.feedbacks = [
			{ id: 'f1', styleOverrides: [{ overrideId: 'o', elementId: 'box0', elementProperty: 'color' }] },
		]
		const out = wireButton(c, { icon: 'projector-on' })
		const src = out.feedbacks[0].styleOverrides.find((o) => o.elementProperty === 'base64Image')
		// A missing colour is treated as black, so the light icon is chosen.
		expect(src.override.value).toBe('$(image:projector-paper)')
	})

	it('handles a control with no feedbacks array', () => {
		const c = { type: 'button-layered', style: { layers: [canvas, box, text('X')] } }
		expect(feedbackBackgrounds(c)).toEqual([])
		expect(() => wireButton(c, { icon: 'projector-on' })).not.toThrow()
	})

	it('ignores a null control', () => {
		expect(wireButton(null, { icon: 'x' })).toBe(null)
	})
})


describe('wirePage defensive paths', () => {
	const page = { name: 'P', controls: { 0: { 1: { type: 'pageup' } } } }

	it('treats a missing mapping as an empty one', () => {
		const { page: out, wired } = wirePage(page)
		expect(wired).toEqual([])
		expect(out.controls['0']['1']).toEqual({ type: 'pageup' })
	})

	it('ignores a style override with no elementId', () => {
		const c = {
			type: 'button-layered',
			style: { layers: [canvas, box, text('X')] },
			feedbacks: [{ id: 'f', styleOverrides: [{ elementProperty: 'color', override: { value: 1 } }] }],
		}
		expect(feedbackBackgrounds(c)).toEqual([])
	})
})


describe('wireButton remaining edge cases', () => {
	it('reads a bare text layer value that is not wrapped in an envelope', () => {
		const bare = { id: 'text0', type: 'text', text: 'Plain\\n\\n\\nLabel' }
		const out = wireButton({ type: 'button-layered', style: { layers: [box, bare] } }, { icon: 'blank' })
		expect(out.style.layers.find((l) => l.type === 'text').text).toEqual({
			value: 'Plain Label',
			isExpression: false,
		})
	})

	it('handles a colour-changing feedback that has no styleOverrides array on a second pass', () => {
		// First feedback drives the background; second has no overrides at all. Both must
		// survive the mapping without throwing.
		const c = {
			type: 'button-layered',
			style: { layers: [canvas, box, text('X')] },
			feedbacks: [
				{
					id: 'f1',
					styleOverrides: [
						{ overrideId: 'o1', elementId: 'box0', elementProperty: 'color', override: { value: 0x00a651 } },
					],
				},
				{ id: 'f2' },
			],
		}
		const out = wireButton(c, { icon: 'projector-on' })
		expect(out.feedbacks[1]).toEqual({ id: 'f2' })
		expect(
			out.feedbacks[0].styleOverrides.some((o) => o.elementProperty === 'base64Image')
		).toBe(true)
	})
})
