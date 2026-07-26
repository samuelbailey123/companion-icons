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
