import { describe, expect, it } from 'vitest'
import { renderIcon } from '../src/render.js'
import { COLORS, STROKE } from '../src/palette.js'

const shape = { paths: ['M30 30 L90 90'] }

describe('renderIcon', () => {
	it('emits a 120 viewBox at 512 intrinsic size', () => {
		const svg = renderIcon(shape, COLORS.neutral)
		expect(svg).toContain('viewBox="0 0 120 120"')
		expect(svg).toContain('width="512"')
		expect(svg).toContain('height="512"')
	})

	it('applies the single stroke constant with round caps and joins', () => {
		const svg = renderIcon(shape, COLORS.neutral)
		expect(svg).toContain(`stroke-width="${STROKE}"`)
		expect(svg).toContain('stroke-linecap="round"')
		expect(svg).toContain('stroke-linejoin="round"')
		expect(svg).toContain('fill="none"')
	})

	it('colours the stroke with the supplied hex', () => {
		expect(renderIcon(shape, '#4ADE80')).toContain('stroke="#4ADE80"')
	})

	it('renders fill:true entries as filled and unstroked', () => {
		const svg = renderIcon({ paths: [{ d: 'M0 0h10v10h-10z', fill: true }] }, '#FFFFFF')
		expect(svg).toContain('fill="#FFFFFF"')
		expect(svg).toContain('stroke="none"')
	})

	it('honours size and stroke overrides', () => {
		const svg = renderIcon(shape, '#FFFFFF', { size: 120, stroke: 8 })
		expect(svg).toContain('width="120"')
		expect(svg).toContain('stroke-width="8"')
	})

	it('is declared as an SVG document with a namespace', () => {
		expect(renderIcon(shape, '#FFFFFF')).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
	})
})

describe('renderIcon primitives', () => {
	it('renders a rounded rect', () => {
		const svg = renderIcon({ paths: [{ rect: [20, 30, 60, 40, 8] }] }, '#FFFFFF')
		expect(svg).toContain('<rect x="20" y="30" width="60" height="40" rx="8"/>')
	})

	it('defaults rect corner radius to 0', () => {
		expect(renderIcon({ paths: [{ rect: [10, 10, 20, 20] }] }, '#FFF')).toContain('rx="0"')
	})

	it('renders a circle', () => {
		expect(renderIcon({ paths: [{ circle: [60, 60, 25] }] }, '#FFF')).toContain(
			'<circle cx="60" cy="60" r="25"/>'
		)
	})

	it('renders a line', () => {
		expect(renderIcon({ paths: [{ line: [10, 20, 30, 40] }] }, '#FFF')).toContain(
			'<line x1="10" y1="20" x2="30" y2="40"/>'
		)
	})

	it('fills primitives when fill is set', () => {
		const svg = renderIcon({ paths: [{ circle: [60, 60, 10], fill: true }] }, '#4ADE80')
		expect(svg).toContain('<circle cx="60" cy="60" r="10" fill="#4ADE80" stroke="none"/>')
	})

	it('rejects an unrecognised primitive rather than emitting nothing', () => {
		expect(() => renderIcon({ paths: [{ blob: [1, 2] }] }, '#FFF')).toThrow(/unrecognised/i)
	})
})
