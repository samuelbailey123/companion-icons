import { describe, expect, it } from 'vitest'
import { SETTINGS, cycleKey, framingKey, trackKey } from '../src/ptz/tracking.js'
import { BODY, SCRIPT, SCRIPT_PATH, TRACK, track, trackingTrigger, webExec } from '../src/ptz/web.js'
import { buildSetupKeys } from '../src/ptz/setup.js'
import { autoKey, backlightKey, exposureKey, menuKey, powerKey, whiteBalanceKey } from '../src/ptz/image.js'
import { SUB_PAGES, assertNavCoverage, folderFor } from '../src/navrow.js'
import { COLUMNS } from '../src/layout.js'
import { ICONS } from '../src/variants.js'

const HOST = '10.0.0.9'
const imageNames = new Set(ICONS.map((i) => i.name))

/** Every action reachable from a control, descending into logic_if children. */
const allActions = (control) => {
	const out = []
	const walk = (list) => {
		for (const a of list ?? []) {
			out.push(a)
			for (const group of Object.values(a.children ?? {})) walk(group.filter((e) => e.type === 'action'))
		}
	}
	for (const step of Object.values(control.steps)) for (const set of Object.values(step.action_sets)) walk(set)
	return out
}

describe('the web API bridge', () => {
	it('runs the script on the Pi with the host and keeps its JSON', () => {
		const a = webExec('x', HOST, 'body full')
		expect(a.definitionId).toBe('exec')
		expect(a.options.path.value).toBe(`python3 ${SCRIPT_PATH} ${HOST} body full`)
		expect(a.options.targetVariable.value).toBe(TRACK)
		expect(track('body')).toBe("jsonpath($(internal:custom_ptz_track), '$.body')")
	})

	it('ships a Python script that takes no credentials on its command line', () => {
		expect(SCRIPT).toContain('.ptz_web')
		expect(SCRIPT).not.toMatch(/password=|--user/)
		for (const field of ['tracking', 'body', 'mode', 'speed', 'sensitivity', 'placement', 'headroom', 'lost']) {
			expect(SCRIPT).toContain(`"${field}"`)
		}
		expect(SCRIPT).toContain('"emBodyPosMod": BODY[argv[3]]')
	})

	it('polls every five seconds', () => {
		const t = trackingTrigger(HOST)
		expect(t.events[0].options.seconds).toBe(5)
		expect(t.actions[0].options.path.value).toBe(`python3 ${SCRIPT_PATH} ${HOST} get`)
	})
})

describe('tracking keys', () => {
	it('toggle tracking off the camera-reported state', () => {
		const k = trackKey(HOST)
		const branch = k.steps[0].action_sets.down[0]
		expect(branch.children.condition[0].options.expression.value).toBe(`${track('tracking')} == "On"`)
		expect(branch.children.actions[0].options.path.value).toContain('track off')
		expect(branch.children.else_actions[0].options.path.value).toContain('track on')
		expect(trackKey(HOST, 'other').feedbacks[0].id).toBe('other-on')
	})

	it('select a framing and light the selected one', () => {
		for (const which of ['close', 'half', 'full']) {
			const k = framingKey(HOST, which)
			expect(k.style.layers[3].text.value).toBe(BODY[which])
			expect(k.steps[0].action_sets.down[0].options.path.value).toContain(`body ${which}`)
			expect(k.feedbacks[0].options.expression.value).toBe(`${track('body')} == "${BODY[which]}"`)
			expect(imageNames.has(`frame-${which}`)).toBe(true)
		}
		expect(framingKey(HOST, 'full', 'p').feedbacks[0].id).toBe('p-sel')
	})

	it('cycle a setting through every value and back to the first', () => {
		for (const spec of SETTINGS) {
			const k = cycleKey(spec, HOST)
			const sets = allActions(k).filter((a) => a.definitionId === 'exec').map((a) => a.options.path.value)
			// one set per value, the fallback (first value) included exactly once
			expect(sets).toHaveLength(spec.values.length)
			for (const [, code] of spec.values) expect(sets.some((p) => p.endsWith(`set ${spec.param}=${code}`))).toBe(true)
			const conditions = allActions(k).filter((a) => a.definitionId === 'logic_if').map((a) => a.children.condition[0].options.expression.value)
			expect(conditions).toHaveLength(spec.values.length - 1)
			expect(k.style.layers[3].text.isExpression).toBe(true)
			expect(imageNames.has(spec.icon), spec.icon).toBe(true)
		}
	})
})

describe('the setup page', () => {
	const rows = buildSetupKeys('conn', HOST, { run: 9 })

	it('carries picture, power, tracking, the six settings and Auto, with a way back', () => {
		expect(Object.keys(rows[1])).toHaveLength(9)
		expect(Object.keys(rows[2])).toHaveLength(6)
		expect(Object.keys(rows[3])).toEqual(['0'])
		expect(rows[3][0]).toEqual(autoKey('conn'))
		expect(rows[1][8].steps[0].action_sets.down[0].options.page.value).toBe('9')
		expect(rows[1][4].feedbacks[0].id).toBe('setup-track-on')
		expect(rows[1][5].feedbacks[0].id).toBe('setup-frame-close-sel')
	})

	it('uses ids that do not collide with the run page', () => {
		const ids = Object.values(rows).flatMap((row) => Object.values(row)).flatMap((c) => [...allActions(c).map((a) => a.id), ...c.feedbacks.map((f) => f.id)])
		expect(new Set(ids).size).toBe(ids.length)
		expect(ids.some((id) => id === 'track-on' || id === 'frame-close-sel')).toBe(false)
	})
})

describe('picture and power keys', () => {
	it('build on their own', () => {
		for (const build of [exposureKey, whiteBalanceKey, backlightKey, powerKey, menuKey, autoKey]) {
			const k = build('conn')
			expect(k.type).toBe('button-layered')
			for (const a of allActions(k)) expect(['conn', 'internal']).toContain(a.connectionId)
		}
	})
})

describe('sub-pages in the folder row', () => {
	it('resolve to their parent folder', () => {
		expect(SUB_PAGES['PTZ Setup']).toBe('PTZ')
		expect(folderFor('PTZ Setup')).toBe('PTZ')
		expect(folderFor('PTZ')).toBe('PTZ')
	})

	it('are allowed alongside the nine, but only with their parent present', () => {
		const nine = ['Home', 'Power', 'PP1', 'MA2', 'ATEM', 'SQ7', 'VW', 'PTZ', 'System']
		expect(() => assertNavCoverage([...nine, 'PTZ Setup'], COLUMNS)).not.toThrow()
		expect(() => assertNavCoverage(nine.filter((n) => n !== 'PTZ').concat('Mics', 'PTZ Setup'), COLUMNS)).toThrow(/parent page is missing/)
		expect(() => assertNavCoverage([...nine, 'Extra'], COLUMNS)).toThrow(/unreachable/)
	})
})
