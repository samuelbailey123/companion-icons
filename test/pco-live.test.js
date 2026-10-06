import { describe, expect, it } from 'vitest'
import {
	AMBER,
	MARK,
	MODULE_ID,
	PLACEMENT,
	RED,
	TEAL,
	buildKey,
	buildPcoLivePages,
	findPcoConnection,
	isOurs,
	labelOf,
} from '../src/pco-live.js'

const v = (value) => ({ value, isExpression: false })

/** A key somebody else authored, with the caption the cell guard should quote back. */
const foreignKey = (caption) => ({
	type: 'button-layered',
	style: { layers: [{ id: 'text0', type: 'text', text: v(caption) }] },
	options: { notes: '' },
	feedbacks: [],
	steps: {},
	localVariables: [],
})

/** A small rig: the three pages the build touches, each with a key that must survive untouched. */
function rig() {
	return {
		version: 12,
		companionBuild: '5.0.7+test',
		connectionCollections: [{ id: 'c1' }],
		instances: {
			pcoId: { moduleId: MODULE_ID, label: 'pco', config: {} },
			atemId: { moduleId: 'bmd-atem', label: 'atem', config: {} },
		},
		pages: {
			1: { id: 'p1', name: 'Home', controls: { 1: { 0: foreignKey('Projectors') } }, gridSize: {} },
			15: { id: 'p15', name: 'Worship', controls: { 3: { 4: foreignKey('Sermon') } }, gridSize: {} },
			16: { id: 'p16', name: 'Sermon', controls: { 3: { 4: foreignKey('Worship') } }, gridSize: {} },
		},
	}
}

const PCO = { connectionId: 'pcoId', label: 'pco', serviceTypeId: '919088' }

const controlAt = (bundle, row, column) => bundle.page.controls[row][column]
const textOf = (control) => control.style.layers.find((l) => l.type === 'text').text.value
const downOf = (control) => control.steps[0].action_sets.down
const boxOf = (control) => control.style.layers.find((l) => l.id === 'box0')

describe('buildPcoLivePages', () => {
	const { pages } = buildPcoLivePages(rig(), PCO)
	const byName = Object.fromEntries(pages.map((p) => [p.name, p]))

	it('builds exactly the three pages, by name, keeping their numbers', () => {
		expect(pages.map((p) => [p.name, p.number])).toEqual([
			['Home', 1],
			['Worship', 15],
			['Sermon', 16],
		])
	})

	it('writes every placed cell and reports it', () => {
		for (const [name, cells] of Object.entries(PLACEMENT)) {
			const { bundle, cells: written } = byName[name]
			for (const { key, row, column } of cells) {
				expect(isOurs(controlAt(bundle, row, column))).toBe(true)
				expect(written).toContain(`r${row}c${column} ${key}`)
			}
			expect(written).toHaveLength(cells.length)
		}
	})

	it('leaves every other control deep-equal to the source', () => {
		const source = rig()
		expect(controlAt(byName.Home.bundle, 1, 0)).toEqual(source.pages[1].controls[1][0])
		expect(controlAt(byName.Worship.bundle, 3, 4)).toEqual(source.pages[15].controls[3][4])
		expect(controlAt(byName.Sermon.bundle, 3, 4)).toEqual(source.pages[16].controls[3][4])
	})

	it('does not mutate the export it was given', () => {
		const source = rig()
		buildPcoLivePages(source, PCO)
		expect(source).toEqual(rig())
	})

	it('wraps each page as an importable page bundle carrying the rig connections', () => {
		const { bundle } = byName.Worship
		expect(bundle).toMatchObject({
			version: 12,
			type: 'page',
			companionBuild: '5.0.7+test',
			oldPageNumber: 15,
			connectionCollections: [{ id: 'c1' }],
		})
		expect(bundle.page.name).toBe('Worship')
		expect(Object.keys(bundle.instances)).toEqual(['pcoId', 'atemId'])
	})

	it('defaults connectionCollections when the export has none', () => {
		const source = rig()
		delete source.connectionCollections
		const { pages: built } = buildPcoLivePages(source, PCO)
		expect(built[0].bundle.connectionCollections).toEqual([])
	})

	it('puts the same step keys in the same cells on both camera pages', () => {
		for (const name of ['Worship', 'Sermon']) {
			const { bundle } = byName[name]
			const next = controlAt(bundle, 2, 4)
			const prev = controlAt(bundle, 3, 3)
			expect(downOf(next)).toEqual([
				expect.objectContaining({
					type: 'action',
					connectionId: 'pcoId',
					definitionId: 'nextitem_inservicetype',
					options: { servicetypeid: v('919088') },
				}),
			])
			expect(downOf(prev)[0].definitionId).toBe('previousitem_inservicetype')
			expect(boxOf(next).color.value).toBe(TEAL)
			expect(boxOf(prev).color.value).toBe(TEAL)
		}
	})

	it('shows the next item on the NEXT key and the time left beside it, under the connection label', () => {
		const { bundle } = byName.Sermon
		expect(textOf(controlAt(bundle, 2, 4))).toBe('NEXT\n$(pco:plan_nextitem)')
		expect(textOf(controlAt(bundle, 3, 5))).toBe('$(pco:plan_currentitem)\n$(pco:plan_currentitem_time_remaining)')
		expect(downOf(controlAt(bundle, 3, 5))).toEqual([])
	})

	it('draws the step keys with the library cue glyphs', () => {
		const { bundle } = byName.Worship
		const image = (c) => controlAt(bundle, 2, c).style.layers.find((l) => l.type === 'image')
		expect(image(4).base64Image.value).toBe('$(image:cue-next)')
		expect(controlAt(bundle, 3, 3).style.layers.find((l) => l.type === 'image').base64Image.value).toBe(
			'$(image:cue-back)'
		)
	})

	it('keeps Home status-only: readouts with no actions', () => {
		const { bundle } = byName.Home
		for (const { row, column } of PLACEMENT.Home) {
			const control = controlAt(bundle, row, column)
			expect(downOf(control)).toEqual([])
			expect(control.style.layers.some((l) => l.type === 'image')).toBe(false)
		}
		expect(textOf(controlAt(bundle, 3, 0))).toBe('NOW\n$(pco:plan_currentitem)')
		expect(textOf(controlAt(bundle, 3, 1))).toBe('$(pco:plan_currentitem_time_remaining)\nleft')
		expect(textOf(controlAt(bundle, 3, 2))).toBe('NEXT\n$(pco:plan_nextitem)')
		expect(textOf(controlAt(bundle, 3, 3))).toBe('ends\n$(pco:plan_currentitem_time_shouldfinish)')
	})

	it('turns the NOW readouts red and the NEXT key amber on overrun, and nothing else', () => {
		const overrunColour = (control) => {
			const [fb, ...rest] = control.feedbacks
			if (!fb) return null
			expect(rest).toEqual([])
			expect(fb).toMatchObject({ type: 'feedback', connectionId: 'pcoId', definitionId: 'item_overrun', options: {} })
			expect(fb.styleOverrides).toEqual([
				expect.objectContaining({ elementId: 'box0', elementProperty: 'color' }),
			])
			return fb.styleOverrides[0].override.value
		}
		const home = byName.Home.bundle
		expect(overrunColour(controlAt(home, 3, 0))).toBe(RED)
		expect(overrunColour(controlAt(home, 3, 1))).toBe(RED)
		expect(overrunColour(controlAt(home, 3, 2))).toBeNull()
		expect(overrunColour(controlAt(home, 3, 3))).toBeNull()
		const worship = byName.Worship.bundle
		expect(overrunColour(controlAt(worship, 2, 4))).toBe(AMBER)
		expect(overrunColour(controlAt(worship, 3, 3))).toBeNull()
		expect(overrunColour(controlAt(worship, 3, 5))).toBe(RED)
	})

	it('marks every key as its own so a rebuild can find it', () => {
		const { bundle } = byName.Home
		expect(controlAt(bundle, 3, 0).options.notes.startsWith(`${MARK}: now.`)).toBe(true)
	})

	it('gives keys on different pages different ids', () => {
		const ids = (p) => downOf(controlAt(byName[p].bundle, 2, 4)).map((a) => a.id)
		expect(ids('Worship')).not.toEqual(ids('Sermon'))
	})

	it('is idempotent: rebuilding over its own keys is byte-identical', () => {
		const source = rig()
		for (const { number, bundle } of pages) source.pages[number] = bundle.page
		const { pages: again } = buildPcoLivePages(source, PCO)
		expect(again).toEqual(pages)
	})

	it('refuses a cell somebody else is using, naming the key', () => {
		const source = rig()
		source.pages[16].controls[2] = { 4: foreignKey('Track\\nCAM 1') }
		expect(() => buildPcoLivePages(source, PCO)).toThrow(/r2c4 on Sermon is taken by "Track CAM 1"/)
	})

	it('refuses a rig missing one of the pages', () => {
		const source = rig()
		delete source.pages[15]
		expect(() => buildPcoLivePages(source, PCO)).toThrow(/no "Worship" page/)
	})

	it('refuses an export with no pages at all', () => {
		expect(() => buildPcoLivePages({ instances: {} }, PCO)).toThrow(/no "Home" page/)
	})

	it('creates the row when a target row has nothing on it yet', () => {
		const source = rig()
		source.pages[1].controls = {}
		const { pages: built } = buildPcoLivePages(source, PCO)
		expect(isOurs(controlAt(built[0].bundle, 3, 0))).toBe(true)
	})

	it('copes with a page that has no controls key at all', () => {
		const source = rig()
		delete source.pages[1].controls
		const { pages: built } = buildPcoLivePages(source, PCO)
		expect(isOurs(controlAt(built[0].bundle, 3, 3))).toBe(true)
	})

	it('insists on a numeric service type id', () => {
		expect(() => buildPcoLivePages(rig(), { ...PCO, serviceTypeId: 'Sunday Service' })).toThrow(/numeric id/)
		expect(() => buildPcoLivePages(rig(), { ...PCO, serviceTypeId: undefined })).toThrow(/numeric id/)
	})
})

describe('findPcoConnection', () => {
	it('finds the Services Live connection by module id', () => {
		const [id, instance] = findPcoConnection(rig())
		expect(id).toBe('pcoId')
		expect(instance.label).toBe('pco')
	})

	it('refuses a rig without one', () => {
		const source = rig()
		delete source.instances.pcoId
		expect(() => findPcoConnection(source)).toThrow(/add it first/)
		expect(() => findPcoConnection({})).toThrow(/add it first/)
	})

	it('refuses a rig with two', () => {
		const source = rig()
		source.instances.pco2 = { moduleId: MODULE_ID, label: 'pco-old' }
		expect(() => findPcoConnection(source)).toThrow(/2 planningcenter-serviceslive connections .*pco, pco-old/)
	})
})

describe('labelOf and isOurs', () => {
	it('reads a caption across both newline spellings and shrugs at a missing one', () => {
		expect(labelOf(foreignKey('Clear\\nAudio'))).toBe('Clear Audio')
		expect(labelOf(foreignKey('Clear\n Audio '))).toBe('Clear Audio')
		expect(labelOf({ style: { layers: [] } })).toBe('')
		expect(labelOf(undefined)).toBe('')
	})

	it('recognises only its own notes marker', () => {
		expect(isOurs(buildKey('Home', 'now', PCO))).toBe(true)
		expect(isOurs(foreignKey('x'))).toBe(false)
		expect(isOurs({ options: { notes: 'pco-live-ish' } })).toBe(false)
		expect(isOurs(undefined)).toBe(false)
	})
})
