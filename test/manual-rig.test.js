import { describe, expect, it } from 'vitest'
import {
	assertNoSecrets,
	at,
	backgroundOf,
	connectionLabels,
	connections,
	credentials,
	css,
	customVariables,
	flatOptions,
	folderRow,
	imageLibrary,
	pages,
	plain,
	secretValues,
	setName,
	stepsOf,
	surfaces,
	textOf,
	triggers,
	weak,
} from '../src/manual/rig.js'
import { exportFixture, key } from './helpers/manual-export.js'

describe('small helpers', () => {
	it('unwraps Companion option envelopes and leaves bare values alone', () => {
		expect(plain({ value: 3, isExpression: false })).toBe(3)
		expect(plain('x')).toBe('x')
		expect(plain(null)).toBe(null)
		expect(flatOptions({ a: { value: 1 }, b: 2 })).toEqual({ a: 1, b: 2 })
		expect(flatOptions(undefined)).toEqual({})
	})
	it('formats colours and positions', () => {
		expect(css(0xff0000)).toBe('#ff0000')
		expect(css(0x1ff0000)).toBe('#ff0000')
		expect(at(1, 3)).toBe('r1c3')
	})
	it('names action sets as a person would', () => {
		expect(setName('down')).toBe('Press')
		expect(setName('rotate_right')).toBe('Turn right')
		expect(setName('2000')).toBe('Held 2 s')
		expect(setName('odd')).toBe('odd')
	})
})

describe('reading keys', () => {
	it('takes the label and background from the first text and box layers', () => {
		expect(textOf(key('  Go  '))).toBe('Go')
		expect(backgroundOf(key('x', { color: 0x00ff00 }))).toBe('#00ff00')
		expect(textOf({ style: { layers: [] } })).toBe('')
		expect(backgroundOf({ style: { layers: [] } })).toBe('#000000')
		expect(textOf({})).toBe('')
	})
	it('lists steps with empty sets dropped and known sets first', () => {
		const exp = exportFixture()
		const twoStep = exp.pages[2].controls[1][0]
		const steps = stepsOf(twoStep)
		expect(steps).toHaveLength(2)
		expect(steps[0].sets.map((s) => s.name)).toEqual(['down'])
		expect(steps[1].sets.map((s) => s.name)).toEqual(['down', '2000'])
		expect(stepsOf({})).toEqual([])
		expect(stepsOf({ steps: { 0: {} } })).toEqual([{ id: '0', sets: [] }])
		expect(stepsOf({ steps: { 0: { action_sets: { down: null } } } })).toEqual([{ id: '0', sets: [] }])
	})
})

describe('pages', () => {
	it('sorts pages by number and keys in reading order', () => {
		const list = pages(exportFixture())
		expect(list.map((p) => p.number)).toEqual([1, 2, 3])
		expect(list[0].keys.map((k) => at(k.row, k.column))).toEqual(['r0c0', 'r0c1', 'r1c0', 'r1c1'])
		expect(pages({})).toEqual([])
		expect(pages({ pages: { 4: { name: 'Empty' } } })[0].keys).toEqual([])
	})
	it('finds the folder row the pages share, and which pages carry it', () => {
		const row = folderRow(pages(exportFixture()))
		expect(row.pages).toEqual([1, 2])
		expect(row.keys.map((k) => textOf(k.control))).toEqual(['Home', 'Desk'])
	})
	it('reports no folder row when no two pages share one', () => {
		expect(folderRow([])).toEqual({ pages: [], keys: [] })
		const list = pages(exportFixture()).filter((p) => p.number !== 2)
		expect(folderRow(list)).toEqual({ pages: [], keys: [] })
		expect(folderRow(pages({ pages: { 1: { controls: {} }, 2: { controls: {} } } }))).toEqual({ pages: [], keys: [] })
	})
})

describe('triggers, variables and the image library', () => {
	it('orders triggers and fills defaults', () => {
		const list = triggers(exportFixture())
		expect(list.map((t) => t.name)).toEqual(['Poll', 'Sunday start'])
		expect(list[0].enabled).toBe(false)
		expect(list[0].notes).toBe('')
		expect(triggers({ triggers: { x: {} } })[0]).toMatchObject({ name: 'x', enabled: true, events: [], conditions: [], actions: [] })
		expect(triggers({})).toEqual([])
	})
	it('orders custom variables', () => {
		const list = customVariables(exportFixture())
		expect(list.map((v) => v.name)).toEqual(['armed', 'zeta'])
		expect(list[1].persist).toBe(true)
		expect(customVariables({ custom_variables: { q: {} } })[0]).toMatchObject({ description: '', defaultValue: '', persist: false })
		expect(customVariables({})).toEqual([])
	})
	it('groups library images by collection without their data', () => {
		const groups = imageLibrary(exportFixture())
		expect(groups).toEqual([
			{ collection: 'power', images: [{ name: 'power-on', description: 'On' }] },
			{ collection: '(none)', images: [{ name: 'loose', description: '' }] },
		])
		expect(imageLibrary({ imageLibrary: [{}] })[0].collection).toBe('(none)')
		expect(imageLibrary({})).toEqual([])
	})
})

describe('connections and credentials', () => {
	it('labels connections, including Companion itself', () => {
		const labels = connectionLabels(exportFixture())
		expect(labels.get('internal')).toBe('internal')
		expect(labels.get('sw')).toBe('atem')
		expect(connectionLabels({}).size).toBe(1)
	})
	it('masks every credential and never reads the secrets block', () => {
		const list = connections(exportFixture())
		const pp = list.find((c) => c.label === 'propresenter')
		expect(Object.fromEntries(pp.settings)).toMatchObject({ pass: '(credential: see the vault)', sdpass: '(empty)', host: '10.23.0.204' })
		expect(Object.fromEntries(pp.settings).note).toMatch(/…$/)
		expect(pp.enabled).toBe(false)
		expect(JSON.stringify(list)).not.toContain('Sup3r')
		expect(JSON.stringify(list)).not.toContain('tok-0123')
		const atem = list.find((c) => c.label === 'atem')
		expect(Object.fromEntries(atem.settings).host).toBe('(empty)')
		expect(connections({ instances: { x: { label: 'x', instance_type: 'old', config: { n: 5, o: { a: 1 } } } } })[0]).toMatchObject({
			module: 'old',
			version: '',
			settings: [
				['n', '5'],
				['o', '{"a":1}'],
			],
		})
	})
	it('collects searchable credentials and names the weak ones', () => {
		const { values, weakFields } = credentials(exportFixture())
		expect([...values].sort()).toEqual(['Sup3r-Secret!', 'app-id-123456', 'key-abcdef123456', 'tok-0123456789'])
		expect(weakFields).toEqual(['grandma2.pass'])
		expect(secretValues(exportFixture())).toEqual(values)
		expect(credentials({}).values.size).toBe(0)
		expect(credentials({ instances: { x: { label: 'x' } } }).values.size).toBe(0)
		expect(connections({})).toEqual([])
		expect(connections({ instances: { x: { label: 'x' } } })[0].settings).toEqual([])
	})
	it('treats short letter-only passwords as weak', () => {
		expect(weak('admin')).toBe(true)
		expect(weak('admin1')).toBe(false)
		expect(weak('longerword')).toBe(false)
	})
	it('refuses output containing a credential', () => {
		const secrets = secretValues(exportFixture())
		expect(() => assertNoSecrets('all clear', secrets)).not.toThrow()
		expect(() => assertNoSecrets('the pass is Sup3r-Secret! ok', secrets)).toThrow(/13 chars, starts "Su"/)
	})
})

describe('surfaces', () => {
	it('lists the Stream Decks by serial and counts the software surfaces', () => {
		const { hardware, others } = surfaces(exportFixture())
		expect(hardware.map((s) => [s.type, s.brightness, s.startsOn])).toEqual([
			['Elgato Stream Deck + XL', 100, 'the page it was last on'],
			['Elgato Stream Deck +', null, 'page 1'],
		])
		expect(others).toEqual([
			{ type: 'Service Health deck', count: 2 },
			{ type: 'timing probe', count: 1 },
		])
		expect(surfaces({ surfaces: { x: {} } }).others).toEqual([{ type: 'x', count: 1 }])
		expect(surfaces({ surfaces: { y: { integrationType: 'elgato-stream-deck', groupConfig: {} } } }).hardware[0].startsOn).toBe('page ?')
		expect(surfaces({})).toEqual({ hardware: [], others: [] })
	})
})
