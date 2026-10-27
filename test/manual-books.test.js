import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDump } from '../src/manual/blackmagic.js'
import {
	chapters,
	context,
	controlParts,
	documentHtml,
	entityHtml,
	gridHtml,
	keysHtml,
	labelHtml,
	navigation,
	pageTarget,
	referenceSections,
	videoTables,
} from '../src/manual/books.js'
import { pages, secretValues } from '../src/manual/rig.js'
import { definitionsFixture, exportFixture, key } from './helpers/manual-export.js'

const videohub = fs.readFileSync(new URL('./fixtures/videohub-dump.txt', import.meta.url), 'utf8')
const atem = fs.readFileSync(new URL('./fixtures/atem-dump.txt', import.meta.url), 'utf8')

const snapshot = (over = {}) => ({
	exp: exportFixture(),
	defs: definitionsFixture(),
	videohub,
	atem,
	readAt: 'today',
	build: '5.0.7+test',
	keyImage: (p, r, c) => (p === 1 && r === 1 && c === 1 ? 'data:image/png;base64,KEY' : null),
	...over,
})

describe('labels and entities', () => {
	it('shows expressions as code and words as words', () => {
		expect(labelHtml('$(atem:long_1)')).toBe('<code>$(atem:long_1)</code>')
		expect(labelHtml('Go\\nLive <now>')).toBe('Go Live &lt;now&gt;')
	})
	it('renders an entity with options, flags, overrides and children', () => {
		const html = entityHtml({
			who: 'atem',
			what: 'Cut',
			options: [['M/E', '1']],
			inverted: true,
			disabled: true,
			overrides: ['colour #FF0000'],
			children: [{ group: 'then', items: [{ who: 'x', what: 'y', options: [], inverted: false, disabled: false, overrides: [], children: [] }] }],
		})
		expect(html).toContain('<b>Cut</b>: M/E <span class="v">1</span>')
		expect(html).toContain('inverted</span>')
		expect(html).toContain('disabled</span>')
		expect(html).toContain('→ colour #FF0000')
		expect(html).toContain('<li class="group">then<ul>')
	})
	it('builds the describer context from the snapshot', () => {
		expect(context(snapshot()).labels.sw).toBe('atem')
	})
})

describe('pages on paper', () => {
	it('draws a grid with live images, fallbacks, empty slots and missing strip columns', () => {
		const home = pages(exportFixture())[0]
		const html = gridHtml(home, snapshot())
		expect(html).toContain('src="data:image/png;base64,KEY"')
		expect(html).toContain('class="fallback" style="background:#1f2937">Home')
		expect(html).toContain('class="cell none"')
		expect(html).toContain('class="cell knob"')
		expect(html).toContain('class="cell strip"')
		expect(html.match(/row-label/g)).toHaveLength(6)
		expect(gridHtml(home, snapshot(), [0]).match(/row-label/g)).toHaveLength(1)
	})
	it('lists keys with their actions, steps, feedbacks and notes', () => {
		const [home, desk, sub] = pages(exportFixture())
		const html = keysHtml(home, snapshot(), true)
		expect(html).not.toContain('r0c0')
		expect(html).toContain('Opens the sub-page.')
		expect(html).toContain('<b>Cut</b>: M/E <span class="v">M/E 1</span>')
		expect(html).toContain('Changes when')
		const two = keysHtml(desk, snapshot(), false)
		expect(two).toContain('Step 2 · Press')
		expect(two).toContain('Step 2 · Held 2 s')
		expect(two).toContain('Turn left')
		expect(keysHtml(sub, snapshot(), false)).toContain('No action: display only.')
		expect(keysHtml({ number: 9, keys: [] }, snapshot(), false)).toContain('No keys besides the folder row.')
		expect(keysHtml({ number: 9, keys: [{ row: 1, column: 0, control: key('') }] }, snapshot(), false)).toContain('(no label)')
	})
})

describe('navigation', () => {
	it('finds sub-pages and who opens them', () => {
		const nav = navigation(pages(exportFixture()))
		expect(nav.onRow).toEqual([1, 2])
		expect(nav.children.get(1)).toEqual([3])
		expect(nav.links).toContainEqual({ from: 1, to: 3, at: 'r1c0', label: 'Sub' })
		expect(nav.links).toContainEqual({ from: 3, to: 1, at: 'r0c8', label: 'Back' })
	})
	it('roots a sub-page of a sub-page under the folder page', () => {
		const exp = exportFixture()
		exp.pages[3].controls[1] = { 0: key('Deeper', { down: [{ connectionId: 'internal', definitionId: 'set_page', options: { page: '4' } }] }) }
		exp.pages[4] = { name: 'Deep', controls: {} }
		expect(navigation(pages(exp)).children.get(1)).toEqual([3, 4])
	})
	it('reads a key’s page target in either option shape', () => {
		expect(pageTarget(key('x', { down: [{ definitionId: 'set_page', options: { page: '7' } }] }))).toBe('7')
		expect(pageTarget(key('x', { down: [{ definitionId: 'set_page', options: { page: { value: '8' } } }] }))).toBe('8')
		expect(pageTarget(key('x', { down: [{ definitionId: 'set_page', options: {} }] }))).toBe(undefined)
		expect(pageTarget(key('x'))).toBe(null)
	})
})

describe('documents and chapters', () => {
	it('wraps sections in a printable document with contents', () => {
		const html = documentHtml({ title: 'T', subtitle: 'S', readAt: 'now', build: 'b', css: 'x{}', sections: [{ id: 'a', title: 'A & B', html: '<p>1</p>', class: 'page' }, { id: 'b', title: 'B', html: '' }] })
		expect(html).toContain('<style>x{}</style>')
		expect(html).toContain('<a href="#a">A &amp; B</a>')
		expect(html).toContain('<section id="a" class="page">')
		expect(html).toContain('Read off the live rig now · Companion b')
	})
	it('splits chapters, titles the intro and fills tokens', () => {
		const md = '# Book\n\nIntro text.\n\n## First\n\n### Sub\n\n{{thing}}\n\n## Second\n\nBody.'
		const list = chapters(md, { thing: '<svg/>' }, 'p-')
		expect(list.map((c) => c.title)).toEqual(['About this guide', 'First', 'Second'])
		expect(list[1].id).toBe('p-first')
		expect(list[1].html).toContain('<h2 id="p-sub">Sub</h2>')
		expect(list[1].html).toContain('<svg/>')
		expect(chapters('## Only\n\nx').map((c) => c.title)).toEqual(['Only'])
		expect(() => chapters('## A\n\n{{nope}}')).toThrow(/no generated block named \{\{nope\}\}/)
	})
})

describe('the reference', () => {
	it('tabulates the router and switcher ports', () => {
		const html = videoTables(parseDump(videohub), parseDump(atem))
		expect(html).toContain('Deck Recorder')
		expect(html).toContain('1080p59.94')
		expect(html).toContain('Videohub OUT 3, now carrying IN 16 · PP1')
		expect(html).toContain('not fed by the router')
		expect(html).toContain('TODO / spare')
	})
	it('links each controller to the devices it reaches', () => {
		const { controllers, devices, links } = controlParts(exportFixture())
		const to = (id) => links.filter((l) => l.from === id).map((l) => devices.find((d) => d.id === l.to).text)
		expect(to('c-sw')).toEqual(['ATEM Television Studio HD8'])
		expect(to('c-desk')).toEqual(['Allen & Heath SQ7'])
		expect(to('c-pco')).toEqual(['Planning Center (internet)'])
		expect(to('c-dn').length).toBeGreaterThan(3)
		expect(to('pp')).toHaveLength(3)
		expect(to('c-ma')).toEqual(['grandMA2 onPC (lighting PC)'])
		expect(controllers.find((c) => c.id === 'c-dn').host).toBe('10.23.0.242')
		expect(to('c-pp')).toEqual(['PP1 iMac (ProPresenter, walk-in music)'])
	})
	it('builds every section, with no credential anywhere', () => {
		const snap = snapshot({ libraryImage: (n) => (n === 'power-on' ? 'data:image/svg+xml;base64,AAA' : null) })
		const sections = referenceSections(snap, [{ title: 'The rig', md: '# The rig\n\nNotes.' }])
		const ids = sections.map((s) => s.id)
		expect(ids).toEqual(expect.arrayContaining(['about', 'page-map', 'signal-video', 'signal-audio', 'signal-control', 'signal-todo', 'page-1', 'page-3', 'triggers', 'variables', 'connections', 'images', 'notes-the-rig']))
		const all = sections.map((s) => s.html).join('\n')
		for (const s of secretValues(snap.exp)) expect(all).not.toContain(s)
		expect(all).toContain('disabled</span>')
		expect(all).toContain('Only if')
		expect(all).toContain('src="data:image/svg+xml;base64,AAA"')
		expect(sections.find((s) => s.id === 'page-map').html).toContain('Home r1c0')
		expect(referenceSections(snapshot()).find((s) => s.id === 'images').html).not.toContain('<img')
	})
	it('says when nothing on the deck opens a page', () => {
		const exp = exportFixture()
		exp.pages[5] = { name: 'Orphan', controls: {} }
		const html = referenceSections(snapshot({ exp })).find((s) => s.id === 'page-map').html
		expect(html).toContain('nothing on the deck')
	})
})

describe('sparse data', () => {
	it('prints what it has when the dumps and the export are thin', () => {
		const hub = { model: 'Hub', inputs: new Map([[1, 'A'], [2, 'B']]), outputs: new Map(), routing: new Map([[2, 9]]) }
		const sw = { model: 'Switcher', mode: null, inputs: new Map([[2, 'Cam 1']]), outputs: new Map([[1, 'Aux']]), routing: new Map() }
		const html = videoTables(hub, sw)
		expect(html).toContain('running <b>unknown</b>')
		expect(html).toContain('<td>unknown</td>')
		expect(html).toContain('<td>IN 9 · </td>')
		const exp = exportFixture()
		delete exp.imageLibrary
		delete exp.pages[1].controls[1][1].feedbacks
		const sections = referenceSections(snapshot({ exp }))
		expect(sections.find((s) => s.id === 'about').html).toContain('0 library images')
		expect(sections.find((s) => s.id === 'page-1').html).not.toContain('Changes when')
	})
})
