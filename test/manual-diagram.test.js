import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SOURCES, inputsText } from '../src/dante.js'
import { blocks, parseDump } from '../src/manual/blackmagic.js'
import { audioDiagram, columns, controlDiagram, fit, isDefaultLabel, navDiagram, videoDiagram } from '../src/manual/diagram.js'
import { VIDEOHUB_DESTINATIONS, VIDEOHUB_SOURCES } from '../src/manual/plant.js'

const hubText = fs.readFileSync(new URL('./fixtures/videohub-dump.txt', import.meta.url), 'utf8')
const atemText = fs.readFileSync(new URL('./fixtures/atem-dump.txt', import.meta.url), 'utf8')

describe('parseDump', () => {
	it('reads the Videohub: model, 1-based labels and live routing', () => {
		const hub = parseDump(hubText)
		expect(hub.model).toBe('Blackmagic Micro Videohub')
		expect(hub.inputs.get(4)).toBe('Program')
		expect(hub.outputs.get(13)).toBe('Deck Recorder')
		expect(hub.routing.get(13)).toBe(4)
		expect(hub.mode).toBe(null)
	})
	it('reads the ATEM, including its video mode', () => {
		const atem = parseDump(atemText)
		expect(atem.model).toBe('ATEM Television Studio HD8')
		expect(atem.mode).toBe('1080p59.94')
		expect(atem.inputs.get(4)).toBe('PP1')
		expect(atem.outputs.get(1)).toBe('Auxiliary 1')
	})
	it('copes with nothing at all', () => {
		expect(parseDump('')).toMatchObject({ model: 'unknown', id: '', mode: null })
		expect(blocks('stray line\nHEAD:\n\nx\n')).toEqual({ HEAD: ['x'] })
		expect(parseDump('INPUT LABELS:\nnot numbered\n').inputs.size).toBe(0)
	})
})

describe('columns', () => {
	it('places boxes, edges, frames and headings', () => {
		const svg = columns({
			title: 'T <1>',
			columns: [
				{ width: 100, heading: 'Left', boxes: [{ id: 'a', text: 'A', sub: 'sub', style: 'dashed' }] },
				{ width: 100, boxes: [{ id: 'b', text: 'B' }, { id: 'c', text: 'C', gapBefore: true }] },
			],
			edges: [{ from: 'a', to: 'b', label: 'L' }, { from: 'a', to: 'c', style: 'live' }, { from: 'a', to: 'missing' }],
			frames: [{ columns: [1], label: 'Frame' }],
		})
		expect(svg).toMatch(/^<svg /)
		expect(svg).toContain('T &lt;1&gt;')
		expect(svg).toContain('class="d-frame"')
		expect(svg).toContain('>Left<')
		expect(svg.match(/class="d-edge /g)).toHaveLength(2)
		expect(svg).toContain('class="d-edge-label"')
		expect(svg).toContain('class="d-box dashed"')
	})
	it('works without a title, and with a fixed width and x', () => {
		const svg = columns({ width: 500, columns: [{ x: 40, width: 100, boxes: [{ id: 'a', text: 'A' }] }], edges: [] })
		expect(svg).toContain('viewBox="0 0 500')
		expect(svg).toContain('aria-label="diagram"')
	})
	it('shortens text to fit', () => {
		expect(fit('a'.repeat(100), 100)).toHaveLength(14)
		expect(fit('short', 100)).toBe('short')
		expect(fit(null, 100)).toBe('')
		expect(fit('abcdefgh', 1)).toBe('abc…')
	})
})

describe('the drawings', () => {
	it('draws the video chain from the live dump and the plant facts', () => {
		const svg = videoDiagram(parseDump(hubText), VIDEOHUB_SOURCES, VIDEOHUB_DESTINATIONS)
		expect(svg).toContain('IN 4 · Program')
		expect(svg).toContain('OUT 13 · Deck Recorder')
		expect(svg).toContain('d-edge live')
		expect(svg).toContain('>spare<')
		expect(svg).toContain('connector: TODO')
	})
	it('copes with a router reporting fewer inputs than outputs', () => {
		const hub = { model: 'Hub', inputs: new Map(), outputs: new Map([[1, 'Out']]), routing: new Map() }
		expect(videoDiagram(hub, {}, {})).toContain('IN 1 · <')
		expect(videoDiagram({ ...hub, inputs: new Map([[1, 'In']]), outputs: new Map() }, {}, {})).toContain('OUT 1 · <')
	})
	it('marks a named port nobody has traced as TODO', () => {
		const hub = { model: 'Hub', inputs: new Map([[1, 'Mystery']]), outputs: new Map([[1, 'Somewhere']]), routing: new Map([[1, 1]]) }
		const svg = videoDiagram(hub, {}, {})
		expect(svg).toContain('TODO: what is on IN 1')
		expect(svg).toContain('TODO: what is on OUT 1')
	})
	it('tells factory labels from named ports', () => {
		expect(isDefaultLabel('Input 5', 5)).toBe(true)
		expect(isDefaultLabel('Output 12', 12)).toBe(true)
		expect(isDefaultLabel('Program', 4)).toBe(false)
	})
	it('draws audio from the Dante sources, with the XLR receiver dashed', () => {
		const svg = audioDiagram(SOURCES, inputsText)
		expect(svg).toContain('Leads → SQ 1-4')
		expect(svg).toContain('BGV+Host → XLR')
		expect(svg).toContain('d-edge dashed')
	})
	it('draws control links', () => {
		const svg = controlDiagram([{ id: 'c', text: 'atem' }], [{ id: 'd', text: 'ATEM' }], [{ from: 'c', to: 'd' }])
		expect(svg).toContain('On the Companion Pi')
		expect(svg).toContain('class="d-edge "')
	})
	it('draws the page map with sub-pages under their parent', () => {
		const svg = navDiagram(
			[
				{ number: 1, name: 'Home' },
				{ number: 2, name: 'PTZ' },
			],
			new Map([[2, [10, 11]]]),
			new Map([
				[10, 'CAM 1'],
				[11, 'CAM 3'],
			]),
		)
		expect(svg).toContain('1 Home')
		expect(svg).toContain('10 CAM 1')
		expect(svg.match(/class="d-edge"/g)).toHaveLength(2)
	})
})
