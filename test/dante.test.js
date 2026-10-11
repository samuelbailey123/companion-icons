import { describe, expect, it } from 'vitest'
import {
	BG,
	DESK,
	ENTRY_CELL,
	FOLDER_NAME,
	LABEL,
	MARK,
	MODULE_ID,
	PARENT,
	RATE,
	SOURCES,
	buildConfig,
	buildDantePage,
	channel,
	detailText,
	entryKey,
	findDanteConnection,
	inputsText,
	isOurs,
	normalKey,
	ratesAgree,
	requiredConditions,
	sourceKey,
} from '../src/dante.js'
import { NAV_ORDER, SUB_PAGES } from '../src/navrow.js'
import { contrastRatio } from '../src/wiring.js'

const CONN = 'danteConn'
const v = (value) => ({ value, isExpression: false })
const byName = (name) => SOURCES.find((s) => s.name === name)

/** The desk inputs a source's routes land on, flattened. */
const inputs = (source) => source.routes.map(([, rx]) => rx)

/** Every crosspoint feedback in a feedback tree. */
const crosspoints = (feedbacks) =>
	feedbacks.flatMap((f) => [
		...(f.definitionId === 'routing_bg_manual' ? [f] : []),
		...crosspoints(Object.values(f.children ?? {}).flat()),
	])

/** Every action on every control of a page. */
const actionsOn = (page) =>
	Object.values(page.controls)
		.flatMap((row) => Object.values(row))
		.flatMap((c) => Object.values(c.steps ?? {}))
		.flatMap((s) => Object.values(s.action_sets ?? {}).flat())

const textOf = (control) => control.style.layers.find((l) => l.id === 'text0').text
const bgOf = (control) => control.style.layers.find((l) => l.id === 'box0').color.value
const overridesOf = (feedback) =>
	Object.fromEntries(feedback.styleOverrides.map((o) => [o.elementProperty, o.override.value]))

/** A small rig: the nine folder-row pages, SQ7 (page 6) with a DCA key, and the Dante connection. */
const SQ = '6'
function rig({ withConnection = true, withDante = false, cell } = {}) {
	const pages = Object.fromEntries(NAV_ORDER.map((name, i) => [String(i + 1), { id: `p${i + 1}`, name, controls: {} }]))
	pages[SQ].controls = { 1: { 0: { options: { notes: 'Toggle mute on DCA 1' } } } }
	if (withDante) pages[10] = { id: 'p10-dante', name: FOLDER_NAME, controls: {} }
	if (cell) pages[SQ].controls[ENTRY_CELL.row] = { [ENTRY_CELL.col]: cell }
	return {
		version: 12,
		companionBuild: '5.0.7+test',
		pages,
		instances: {
			sqConn: { moduleId: 'allenheath-sq', label: 'SQ' },
			...(withConnection ? { [CONN]: { moduleId: MODULE_ID, label: LABEL } } : {}),
		},
	}
}

describe('the patch the desk asks for', () => {
	it('lands every source on its own SQ7 inputs, none twice', () => {
		const all = SOURCES.flatMap(inputs)
		expect(new Set(all).size).toBe(all.length)
		expect(all).toHaveLength(4 + 4 + 4 + 2 + 8 + 4 + 23 + 6)
	})

	it('matches the subscriptions read off the desk on 2026-10-11', () => {
		expect(inputs(byName('Leads'))).toEqual([1, 2, 3, 4])
		expect(inputs(byName('BGV+Host'))).toEqual([9, 10, 11, 12])
		expect(byName('PP1').routes).toEqual([[1, 23], [2, 24], [1, 45], [2, 46]])
		expect(byName('Devan').routes.at(-1)).toEqual([32, 64])
		expect(byName('Josue').routes).toEqual([[1, 42], [2, 43], [3, 44], [6, 47], [7, 48], [8, 49]])
	})

	it('treats only the laptops as optional', () => {
		expect(SOURCES.filter((s) => !s.required).map((s) => s.name)).toEqual(['Tracks', 'Devan', 'Josue'])
	})

	it('names channels the way Dante does here', () => {
		expect(channel(1)).toBe('01')
		expect(channel(64)).toBe('64')
	})

	it('writes desk inputs as contiguous runs', () => {
		expect(inputsText([[1, 1]])).toBe('SQ 1')
		expect(inputsText(byName('Leads').routes)).toBe('SQ 1-4')
		expect(inputsText(byName('PP1').routes)).toBe('SQ 23-24, 45-46')
		expect(inputsText([[1, 45], [2, 23], [3, 24]])).toBe('SQ 23-24, 45')
	})
})

describe('a source key', () => {
	const leads = sourceKey(CONN, byName('Leads'))
	const tracks = sourceKey(CONN, byName('Tracks'))

	it('rests slate, captioned with where it lands', () => {
		expect(bgOf(leads)).toBe(BG.rest)
		expect(textOf(leads).value).toBe('Leads\nSQ 1-4')
	})

	it('runs red, amber, green, so the state with evidence wins', () => {
		const [absent, present, routed] = leads.feedbacks
		expect(overridesOf(absent)).toEqual({ color: BG.bad, text: 'Leads\nOffline' })
		expect(overridesOf(present)).toEqual({ color: BG.warn, text: 'Leads\nNot routed' })
		expect(overridesOf(routed)).toEqual({ color: BG.good, text: 'Leads\nSQ 1-4' })
		expect(absent.options.expression.value).toBe(`!arrayIncludes($(dante:devices), "ULXD4Q-LEADS-1-4")`)
		expect(present.options.expression.value).toBe(`arrayIncludes($(dante:devices), "ULXD4Q-LEADS-1-4")`)
	})

	it('goes green only on an AND of presence and every route', () => {
		const routed = leads.feedbacks[2]
		expect(routed.definitionId).toBe('logic_operator')
		expect(routed.options.operation).toEqual(v('and'))
		expect(routed.isInverted).toEqual(v(false))
		const [on, ...routes] = routed.children.default
		expect(on.options.expression.value).toContain('ULXD4Q-LEADS-1-4')
		expect(routes).toHaveLength(4)
	})

	it('asks the module about the exact crosspoint', () => {
		const x = crosspoints(leads.feedbacks)[2]
		expect(x).toMatchObject({ connectionId: CONN, definitionId: 'routing_bg_manual', upgradeIndex: 0 })
		expect(x.options).toEqual({
			sourceChannelName: v('03'),
			sourceDeviceName: v('ULXD4Q-LEADS-1-4'),
			destinationChannelId: v('03'),
			destinationDeviceId: v(DESK),
		})
	})

	it('puts each run of inputs on its own line, so the deck never breaks one at a hyphen', () => {
		const pp1 = sourceKey(CONN, byName('PP1'))
		expect(textOf(pp1).value).toBe('PP1\nSQ 23-24\n45-46')
		expect(overridesOf(pp1.feedbacks[2]).text).toBe('PP1\nSQ 23-24\n45-46')
		expect(pp1.options.notes).toContain('(SQ 23-24, 45-46)')
	})

	it('says "Not here" in slate for a laptop that is away', () => {
		expect(overridesOf(tracks.feedbacks[0])).toEqual({ color: BG.rest, text: 'Tracks\nNot here' })
		expect(tracks.options.notes).toContain('normal for this one')
		expect(leads.options.notes).toContain('Red: not on the network')
	})

	it('cannot be pressed into doing anything', () => {
		expect(leads.steps[0].action_sets).toEqual({ down: [], up: [] })
	})
})

describe('the routing key', () => {
	const key = normalKey(CONN)
	const [broken, ok] = key.feedbacks

	it('covers every required route and no laptop', () => {
		const wanted = SOURCES.filter((s) => s.required).flatMap((s) => s.routes.map(([, rx]) => rx))
		expect(crosspoints([ok]).map((x) => Number(x.options.destinationChannelId.value))).toEqual(wanted)
		for (const laptop of SOURCES.filter((s) => !s.required)) {
			expect(JSON.stringify(key.feedbacks)).not.toContain(laptop.device)
		}
	})

	it('is red when the AND fails and green when it holds', () => {
		expect(broken.isInverted).toEqual(v(true))
		expect(overridesOf(broken)).toEqual({ color: BG.bad, text: 'Routing\nNot normal' })
		expect(ok.isInverted).toEqual(v(false))
		expect(overridesOf(ok)).toEqual({ color: BG.good, text: 'Routing\nNormal' })
		expect(ok.children.default).toEqual(requiredConditions(CONN, 'dante-normal-ok'))
		expect(broken.children.default).toEqual(requiredConditions(CONN, 'dante-normal-broken'))
	})
})

describe('device health', () => {
	it('shows rate and latency only while the device is present', () => {
		expect(detailText('iMac-PP1')).toBe(
			'arrayIncludes($(dante:devices), "iMac-PP1") ? concat(round($(dante:iMac-PP1_sr) / 100) / 10, " kHz / ", $(dante:iMac-PP1_latency), " ms") : "-"'
		)
	})

	it('agrees on the rate only with the desk present and every present device at 48k', () => {
		const agree = ratesAgree()
		expect(agree.startsWith(`arrayIncludes($(dante:devices), "${DESK}") && `)).toBe(true)
		for (const d of [DESK, ...SOURCES.map((s) => s.device)]) {
			expect(agree).toContain(`(!arrayIncludes($(dante:devices), "${d}") || $(dante:${d}_sr) == ${RATE})`)
		}
	})
})

describe('the page', () => {
	const page = buildDantePage(CONN, { Home: 1, Power: 2, PP1: 3, MA2: 4, ATEM: 5, SQ7: 6, VW: 7, PTZ: 8, System: 9 })

	it('is a sub-page of SQ7, so the folder row marks SQ7', () => {
		expect(SUB_PAGES[FOLDER_NAME]).toBe(PARENT)
		expect(Object.keys(page.controls[0])).toHaveLength(9)
	})

	it('puts each source over its own device, with the routing and desk keys at the end', () => {
		SOURCES.forEach((s, col) => {
			expect(textOf(page.controls[1][col]).value).toBe(`${s.name}\n${inputsText(s.routes).replaceAll(', ', '\n')}`)
			expect(textOf(page.controls[2][col]).value).toBe(detailText(s.device))
			expect(textOf(page.controls[2][col]).isExpression).toBe(true)
		})
		expect(textOf(page.controls[1][8]).value).toBe('Routing')
		expect(textOf(page.controls[2][8]).value).toBe('SQ7 card')
		expect(textOf(page.controls[3][0]).value).toBe('Sample rate')
	})

	it('has no action but the folder row', () => {
		expect(actionsOn(page).every((a) => a.definitionId === 'set_page')).toBe(true)
		expect(actionsOn(page)).toHaveLength(9)
	})

	it('marks every key it owns, and every id is unique within its key', () => {
		for (const row of [1, 2, 3]) {
			for (const control of Object.values(page.controls[row])) {
				expect(isOurs(control)).toBe(true)
				const ids = JSON.stringify(control).match(/"(?:id|overrideId)":"[^"]+"/g)
				expect(new Set(ids).size).toBe(ids.length)
			}
		}
	})

	it('keeps white text readable on every state', () => {
		for (const bg of Object.values(BG)) expect(contrastRatio(bg, 0xffffff)).toBeGreaterThanOrEqual(4.5)
	})
})

describe('the SQ7 key', () => {
	const key = entryKey(CONN, 17)

	it('has unique entity ids', () => {
		const ids = JSON.stringify(key).match(/"(?:id|overrideId)":"[^"]+"/g)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('opens the Dante page on this surface', () => {
		expect(key.steps[0].action_sets.down).toEqual([
			expect.objectContaining({ definitionId: 'set_page', options: { surfaceId: v('self'), page: v('17') } }),
		])
	})

	it('goes red on the same AND the routing key uses', () => {
		const [broken] = key.feedbacks
		expect(broken.isInverted).toEqual(v(true))
		expect(broken.children.default).toEqual(requiredConditions(CONN, 'dante-entry'))
		expect(overridesOf(broken)).toEqual({ color: BG.bad })
	})
})

describe('building from a live export', () => {
	it('adds a new page after the last and points SQ7 at it', () => {
		const { sq7, parent, number, existing, page, connectionId } = buildConfig(rig())
		expect([sq7, number, existing, connectionId]).toEqual([SQ, '10', false, CONN])
		expect(page.id).toBeUndefined()
		expect(parent.controls[ENTRY_CELL.row][ENTRY_CELL.col].steps[0].action_sets.down[0].options.page).toEqual(v('10'))
		expect(parent.controls[1][0].options.notes).toBe('Toggle mute on DCA 1')
	})

	it('replaces an existing Dante page in place, keeping its id', () => {
		const { number, existing, page } = buildConfig(rig({ withDante: true, cell: entryKey(CONN, 10) }))
		expect([number, existing, page.id]).toEqual(['10', true, 'p10-dante'])
	})

	it('is deterministic', () => {
		expect(JSON.stringify(buildConfig(rig()))).toBe(JSON.stringify(buildConfig(rig())))
	})

	it('refuses a cell holding somebody else\'s key', () => {
		expect(() => buildConfig(rig({ cell: { options: { notes: 'Toggle mute on DCA 8' } } }))).toThrow(/already holds/)
	})

	it('refuses without the connection, which a page import cannot create', () => {
		expect(() => buildConfig(rig({ withConnection: false }))).toThrow(/no "dante" connection/)
		expect(findDanteConnection(rig())).toBe(CONN)
	})

	it('refuses without an SQ7 page, or with a gap in the page numbers', () => {
		const noParent = rig()
		noParent.pages[SQ].name = 'Audio'
		expect(() => buildConfig(noParent)).toThrow(/no page named "SQ7"/)
		const gap = rig()
		gap.pages[12] = { name: 'Later', controls: {} }
		expect(() => buildConfig(gap)).toThrow(/not numbered/)
	})

	it('builds an SQ7 page that never had rows', () => {
		const bare = rig()
		delete bare.pages[SQ].controls
		expect(buildConfig(bare).parent.controls[ENTRY_CELL.row][ENTRY_CELL.col]).toBeDefined()
	})

	it('copes with a rig that has no connections at all', () => {
		expect(() => findDanteConnection({ pages: {} })).toThrow(/no "dante" connection/)
	})
})

it(`marks its own controls with "${MARK}:"`, () => {
	expect(isOurs({ options: { notes: `${MARK}: x` } })).toBe(true)
	expect(isOurs({ options: {} })).toBe(false)
	expect(isOurs(undefined)).toBe(false)
})
