import { describe, expect, it } from 'vitest'
import { cv, exec, expr, field, logicIf, override, raw, setVar, v, visca, wait, when } from '../src/ptz/actions.js'
import { BG, control, key, knob, layers, strip } from '../src/ptz/controls.js'
import { DEFAULT_SPEED, SPEED, STATE, definitions, mergeDefinitions } from '../src/ptz/variables.js'
import { DIRECTION, DRIVE_MS, KNOBS, ROWS, buildKnobs, deriveSpeeds, driveCommand } from '../src/ptz/knobs.js'
import { PRESET_KEYS, SPEED_STOPS, buildKeys, navKey, nextStop, presetCaption } from '../src/ptz/keys.js'
import { INTERVAL_SECONDS, SCRIPT, SCRIPT_PATH, TRIGGER_ID, pollTrigger } from '../src/ptz/poller.js'
import { PAGE_NAME, REPLACES, SETUP_NAME, buildConfig, buildPage, buildSetupPage, findConnection } from '../src/ptz/page.js'
import { TRIGGER_ID as TRACK_TRIGGER_ID } from '../src/ptz/web.js'
import { KNOB_COLS, KNOB_ROW, STRIP_ROW } from '../src/layout.js'
import { NAV_ORDER } from '../src/navrow.js'
import { ICONS } from '../src/variants.js'

const CONN = 'conn-test'
const HOST = '10.0.0.9'
const PAGES = { setup: 10, run: 9 }

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

const imageNames = new Set(ICONS.map((i) => i.name))
const imagesUsed = (control) => {
	const refs = JSON.stringify(control).match(/\$\(image:([a-z0-9-]+)\)/g) ?? []
	return refs.map((r) => r.slice('$(image:'.length, -1))
}

describe('entity factories', () => {
	it('wrap values and expressions in Companion envelopes', () => {
		expect(v(3)).toEqual({ value: 3, isExpression: false })
		expect(expr('1 + 1')).toEqual({ value: '1 + 1', isExpression: true })
		expect(cv('ptz_speed')).toBe('$(internal:custom_ptz_speed)')
		expect(field('pan')).toBe("jsonpath($(internal:custom_ptz_state), '$.pan')")
	})

	it('builds module actions with stable ids', () => {
		expect(visca('a', CONN, 'stop')).toEqual({
			id: 'a', definitionId: 'stop', connectionId: CONN, options: {}, upgradeIndex: null, type: 'action',
		})
	})

	it('builds a custom command with and without parameters', () => {
		const plain = raw('r', CONN, '81 01 06 04 FF')
		expect(plain.definitionId).toBe('custom')
		expect(plain.options).toEqual({ custom: v('81 01 06 04 FF'), command_parameters: v('') })

		const withParams = raw('r', CONN, '81 01 04 07 20 FF', '9', ['$(internal:custom_ptz_zspeed)'])
		expect(withParams.options.command_parameters).toEqual(v('9'))
		expect(withParams.options.parameter0).toEqual(v('$(internal:custom_ptz_zspeed)'))
	})

	it('builds wait, set-variable, exec, feedback, override and logic_if entities', () => {
		expect(wait('w', 150).options.time).toEqual(expr('150'))
		expect(setVar('s', 'x', '1').options).toEqual({ name: v('x'), create: v(true), value: v('1') })
		expect(setVar('s', 'x', '1 + 1', true).options.value).toEqual(expr('1 + 1'))
		expect(exec('e', 'echo hi', 'out').options).toEqual({ path: v('echo hi'), cwd: v(''), timeout: v(4000), targetVariable: v('out') })
		expect(exec('e', 'echo hi', 'out', 1000).options.timeout).toEqual(v(1000))

		const fb = when('f', '1 == 1', [override('o', 'box0', 'color', 1)])
		expect(fb.type).toBe('feedback')
		expect(fb.definitionId).toBe('check_expression')
		expect(fb.options.expression).toEqual(expr('1 == 1'))
		expect(fb.styleOverrides).toEqual([{ overrideId: 'o', elementId: 'box0', elementProperty: 'color', override: v(1) }])
		expect(when('f', 'x').styleOverrides).toEqual([])

		const branch = logicIf('if', [fb], [wait('a', 1)], [wait('b', 1)])
		expect(branch.definitionId).toBe('logic_if')
		expect(branch.connectionId).toBe('internal')
		expect(Object.keys(branch.children)).toEqual(['condition', 'actions', 'else_actions'])
		expect(logicIf('if', [fb], []).children.else_actions).toEqual([])
	})
})

describe('control envelopes', () => {
	it('stack canvas, background, icon and caption in the deck-wide geometry', () => {
		const stack = layers({ icon: 'pan', label: 'Pan', bg: BG.key })
		expect(stack.map((l) => l.type)).toEqual(['canvas', 'box', 'image', 'text'])
		expect(stack[2].base64Image).toEqual(v('$(image:pan)'))
		expect(stack[3].text).toEqual(v('Pan'))
		expect(stack[3].fontsize).toEqual(v(51))
	})

	it('can caption with an expression', () => {
		const stack = layers({ icon: 'pan', label: "concat('Pan ', 1)", bg: BG.key, labelIsExpression: true })
		expect(stack[3].text).toEqual(expr("concat('Pan ', 1)"))
	})

	it('marks encoders by rotaryActions and nothing else', () => {
		const sets = { down: [], up: [] }
		expect(key({ style: { icon: 'pan', label: '', bg: 0 }, notes: '', actionSets: sets }).options.rotaryActions).toBe(false)
		expect(knob({ style: { icon: 'pan', label: '', bg: 0 }, notes: '', actionSets: sets }).options.rotaryActions).toBe(true)
		const zone = strip({ style: { icon: 'pan', label: '', bg: 0 }, notes: '' })
		expect(zone.options.rotaryActions).toBe(false)
		expect(zone.steps[0].action_sets).toEqual({ down: [], up: [] })
		expect(strip({ style: { icon: 'pan', label: '', bg: 0 }, notes: '', actionSets: { down: [wait('w', 1)], up: [] } }).steps[0].action_sets.down).toHaveLength(1)
		expect(control({ style: { icon: 'pan', label: '', bg: 0 }, notes: 'n', actionSets: sets }).localVariables).toEqual([])
	})
})

describe('variables', () => {
	it('persist operator state and not camera state', () => {
		const defs = definitions()
		expect(defs[SPEED].persistCurrentValue).toBe(true)
		expect(defs[SPEED].defaultValue).toBe(String(DEFAULT_SPEED))
		expect(defs[STATE].persistCurrentValue).toBe(false)
		for (const name of Object.keys(defs)) expect(name.startsWith('ptz_'), name).toBe(true)
	})

	it('merge into an export without touching existing definitions or their order', () => {
		const existing = { fader1_level: { description: 'x', defaultValue: '0', persistCurrentValue: true, sortOrder: 3 } }
		const merged = mergeDefinitions(existing)
		expect(merged.fader1_level).toEqual(existing.fader1_level)
		expect(merged[SPEED].sortOrder).toBeGreaterThan(3)
		const again = mergeDefinitions(merged)
		expect(again[SPEED].sortOrder).toBe(merged[SPEED].sortOrder)
		expect(Object.keys(mergeDefinitions())).toEqual(Object.keys(definitions()))
	})
})

describe('the knobs', () => {
	const { strips, knobs } = buildKnobs(CONN)

	it('come as strip + encoder pairs on the columns the deck has', () => {
		expect(Object.keys(strips).map(Number).sort()).toEqual(Object.values(KNOBS).sort())
		expect(Object.keys(knobs)).toEqual(Object.keys(strips))
		for (const col of Object.keys(knobs)) {
			expect(KNOB_COLS).toContain(Number(col))
			expect(knobs[col].options.rotaryActions).toBe(true)
			expect(strips[col].options.rotaryActions).toBe(false)
		}
		expect(ROWS).toEqual({ strip: STRIP_ROW, knob: KNOB_ROW })
	})

	it('drive pan and tilt as raw VISCA with the speed nibbles from the variables, then stop', () => {
		for (const [col, dirs] of [[KNOBS.pan, ['left', 'right']], [KNOBS.tilt, ['down', 'up']]]) {
			for (const [set, dir] of [['rotate_left', dirs[0]], ['rotate_right', dirs[1]]]) {
				const chain = knobs[col].steps[0].action_sets[set]
				expect(chain.map((a) => a.definitionId)).toEqual(['custom', 'wait', 'stop'])
				expect(chain[0].options.custom.value).toBe(`81 01 06 01 00 00 ${DIRECTION[dir]} FF`)
				expect(chain[0].options.command_parameters.value).toBe('8,9;10,11')
				expect(chain[0].options.parameter0.value).toBe(cv('ptz_speed'))
				expect(chain[0].options.parameter1.value).toBe(cv('ptz_tspeed'))
				expect(chain[1].options.time.value).toBe(String(DRIVE_MS))
			}
			expect(knobs[col].steps[0].action_sets.down.map((a) => a.definitionId)).toEqual(['stop'])
		}
	})

	it('covers all eight drive directions with the camera byte table', () => {
		expect(Object.keys(DIRECTION)).toHaveLength(8)
		expect(driveCommand('d', CONN, 'upLeft').options.custom.value).toBe('81 01 06 01 00 00 01 01 FF')
	})

	it('zooms and focuses at the derived speed, and stops both', () => {
		const zoom = knobs[KNOBS.zoom].steps[0].action_sets
		expect(zoom.rotate_right[0].options.custom.value).toBe('81 01 04 07 20 FF')
		expect(zoom.rotate_left[0].options.custom.value).toBe('81 01 04 07 30 FF')
		expect(zoom.rotate_right.map((a) => a.definitionId)).toEqual(['custom', 'wait', 'zoomS'])
		expect(zoom.down.map((a) => a.definitionId)).toEqual(['zoomS'])

		const focus = knobs[KNOBS.focus].steps[0].action_sets
		// Drive, wait, stop — the same shape as pan, tilt and zoom. The stop answers with a
		// syntax error and halts the drive anyway; without it one detent runs the focus to the
		// endstop, which is what a knob that runs away feels like.
		expect(focus.rotate_right.map((a) => a.definitionId)).toEqual(['focusM', 'custom', 'wait', 'custom'])
		expect(focus.rotate_right[0].options.bol.value).toBe('1')
		expect(focus.rotate_left[1].options.custom.value).toBe('81 01 04 08 30 FF')
		expect(focus.rotate_left[3].options.custom.value).toBe('81 01 04 08 00 FF')
		expect(focus.rotate_right[3].options.custom.value).toBe('81 01 04 08 00 FF')
		expect(focus.down[0].options.custom.value).toBe('81 01 04 38 04 FF')
		expect(JSON.stringify(focus)).not.toContain('focusS')
	})

	it('keeps the speed inside 1..24 and derives tilt, zoom and focus speeds from it', () => {
		const speed = knobs[KNOBS.speed].steps[0].action_sets
		expect(speed.rotate_right[0].options.value.value).toBe(`min(24, ${cv('ptz_speed')} + 1)`)
		expect(speed.rotate_left[0].options.value.value).toBe(`max(1, ${cv('ptz_speed')} - 1)`)
		expect(speed.down[0].options.value.value).toBe(String(DEFAULT_SPEED))
		for (const set of ['rotate_right', 'rotate_left', 'down']) {
			expect(speed[set].map((a) => a.options.name.value)).toEqual(['ptz_speed', 'ptz_tspeed', 'ptz_zspeed', 'ptz_fspeed'])
			expect(speed[set][1].options.value.value).toBe(`min(20, ${cv('ptz_speed')})`)
		}
	})

	it('dials presets 1..254 with wraparound and saves only while armed', () => {
		const preset = knobs[KNOBS.preset].steps[0].action_sets
		expect(preset.rotate_right[0].options.value.value).toContain('>= 254 ? 1')
		expect(preset.rotate_left[0].options.value.value).toContain('<= 1 ? 254')
		const branch = preset.down[0]
		expect(branch.definitionId).toBe('logic_if')
		expect(branch.children.condition[0].options.expression.value).toBe(`${cv('ptz_armed')} == 1`)
		expect(branch.children.actions.map((a) => a.definitionId)).toEqual(['setPreset', 'custom_variable_set_value', 'custom_variable_set_value'])
		expect(branch.children.else_actions.map((a) => a.definitionId)).toEqual(['recallPreset', 'custom_variable_set_value'])
		expect(branch.children.actions[0].options.presetAsText.value).toBe(cv('ptz_preset'))
		expect(branch.children.actions[0].options.isText.value).toBe(true)
	})

	it('captions the readouts from the poller JSON and warns when the camera is gone', () => {
		expect(strips[KNOBS.pan].style.layers[3].text).toEqual(expr(`concat('Pan ', ${field('pan')})`))
		expect(strips[KNOBS.pan].feedbacks[0].options.expression.value).toBe(`${field('online')} != "OK"`)
		expect(strips[KNOBS.preset].feedbacks[0].styleOverrides.map((o) => o.elementProperty)).toEqual(['color', 'text', 'base64Image', 'color'])
	})

	it('only references images the library ships', () => {
		for (const c of [...Object.values(strips), ...Object.values(knobs)]) {
			for (const name of imagesUsed(c)) expect(imageNames.has(name), name).toBe(true)
		}
	})
})

describe('the keys', () => {
	const rows = buildKeys(CONN, HOST, PAGES)
	const all = Object.values(rows).flatMap((r) => Object.values(r))

	it('fill rows 1-3 right of the old pad, plus Speed and STOP, with nothing rotary', () => {
		expect(Object.keys(rows)).toEqual(['1', '2', '3'])
		expect(Object.keys(rows[1]).map(Number)).toEqual([3, 4, 5, 6, 7, 8])
		expect(Object.keys(rows[2]).map(Number)).toEqual([0, 1, 3, 4, 5, 6, 7, 8])
		expect(Object.keys(rows[3]).map(Number)).toEqual([3, 4, 5, 6, 7, 8])
		for (const c of all) expect(c.options.rotaryActions).toBe(false)
		expect(all).toHaveLength(20)
		// No arrow art is left anywhere on the page.
		for (const c of all) for (const name of imagesUsed(c)) expect(name).not.toMatch(/^arrow-/)
	})

	it('caption presets with the shot name the build was given, and plain numbers otherwise', () => {
		expect(presetCaption(2, 'Stage')).toBe('2 (Stage)')
		expect(presetCaption(6)).toBe('6')
		const named = buildKeys(CONN, HOST, PAGES, { 1: 'Wide', 5: 'Bass' })
		const caption = (row) => row.style.layers.find((l) => l.type === 'text').text.value
		expect(caption(named[1][3])).toBe('1 (Wide)')
		expect(caption(named[1][4])).toBe('2')
		expect(caption(named[1][7])).toBe('5 (Bass)')
		expect(named[1][3].options.notes).toContain('preset 1 (Wide)')
		expect(caption(rows[1][3])).toBe('1')
		// The name is caption only: the recall and save actions are the same with or without it.
		expect(named[1][3].steps).toEqual(rows[1][3].steps)
		expect(named[1][3].feedbacks).toEqual(rows[1][3].feedbacks)
	})

	it('step the drive speed through its three stops and keep the derived speeds in step', () => {
		expect(SPEED_STOPS).toEqual([1, 10, 24])
		expect(nextStop('ptz_speed', SPEED_STOPS)).toBe(`${cv('ptz_speed')} < 10 ? 10 : (${cv('ptz_speed')} < 24 ? 24 : 1)`)
		expect(nextStop('x', [2, 5])).toBe(`${cv('x')} < 5 ? 5 : 2`)

		const speed = rows[2][0]
		const down = speed.steps[0].action_sets.down
		expect(down[0]).toEqual(setVar('speed-cycle', SPEED, nextStop(SPEED, SPEED_STOPS), true))
		// The same three derivations the Speed knob performs, in the same order.
		expect(down.slice(1).map((a) => a.options.name.value)).toEqual(['ptz_tspeed', 'ptz_zspeed', 'ptz_fspeed'])
		expect(down.slice(1)).toEqual(deriveSpeeds('speed-cycle'))
		expect(speed.steps[0].action_sets.up).toEqual([])
		expect(speed.style.layers[3].text).toEqual(expr(`concat('Speed ', ${cv(SPEED)})`))
		expect(imagesUsed(speed)).toEqual(['speed'])
	})

	it('names the camera on the centre key, and folds the tally into the same glance', () => {
		const stop = rows[2][1]
		const caption = stop.style.layers.find((l) => l.type === 'text')
		// Read from ptz_atem_input rather than baked in, so the second camera's page gets its own
		// number for free through the variable rename.
		expect(caption.text.isExpression).toBe(true)
		expect(caption.text.value).toContain('custom_ptz_atem_input')
		expect(caption.text.value).toContain('CAM ')

		const textOf = (id) =>
			stop.feedbacks.find((f) => f.id === id).styleOverrides.find((o) => o.elementProperty === 'text').override
		// The tally captions have to stay expressions, or they would replace the camera number
		// with their own literal text and lose it.
		expect(textOf('stop-pgm').isExpression).toBe(true)
		expect(textOf('stop-pgm').value).toContain('LIVE')
		expect(textOf('stop-pgm').value).toContain('custom_ptz_atem_input')
		expect(textOf('stop-pvw').isExpression).toBe(true)
		expect(textOf('stop-pvw').value).toContain('PVW')
		// The menu caption is the one that legitimately replaces it: while the OSD is open the key
		// exits the menu and does not stop anything.
		expect(textOf('stop-menu').isExpression).toBe(false)
		expect(textOf('stop-menu').value).toBe('EXIT')
	})

	it('makes STOP halt everything, close the menu, and carry ATEM tally', () => {
		const stop = rows[2][1]
		const branch = stop.steps[0].action_sets.down[0]
		expect(branch.children.actions[0].options.custom.value).toBe('81 01 06 06 03 FF')
		expect(branch.children.else_actions.map((a) => a.definitionId)).toEqual(['stop', 'zoomS'])
		const conditions = stop.feedbacks.map((f) => f.options.expression.value)
		expect(conditions).toContain(`$(atem:pgm1_input_id) == ${cv('ptz_atem_input')}`)
		expect(conditions).toContain(`$(atem:pvw1_input_id) == ${cv('ptz_atem_input')}`)
		expect(stop.feedbacks.at(-1).styleOverrides.map((o) => o.override.value)).toContain('$(image:stop-paper)')
	})

	it('recall presets, and save them only while armed', () => {
		for (const [i, n] of PRESET_KEYS.entries()) {
			const k = rows[1][3 + i]
			const branch = k.steps[0].action_sets.down[0]
			expect(branch.children.actions[0].definitionId).toBe('setPreset')
			expect(branch.children.actions[0].options.presetAsNumber.value).toBe(n)
			expect(branch.children.else_actions[0].definitionId).toBe('recallPreset')
			expect(branch.children.else_actions[0].options.presetAsNumber.value).toBe(n)
			expect(k.feedbacks.map((f) => f.options.expression.value)).toEqual([`${cv('ptz_last')} == ${n}`, `${cv('ptz_armed')} == 1`])
		}
		const save = rows[2][8]
		expect(save.steps[0].action_sets.down[0].options.value.value).toBe(`${cv('ptz_armed')} == 1 ? 0 : 1`)
	})

	it('toggles and cycles off the camera state the poller read', () => {
		const af = rows[2][5]
		expect(af.steps[0].action_sets.down[0].children.condition[0].options.expression.value).toBe(`${field('focus')} == "Auto"`)
		expect(af.steps[0].action_sets.down[0].children.actions[0].options.bol.value).toBe('1')
		expect(af.steps[0].action_sets.down[0].children.else_actions[0].options.bol.value).toBe('0')

		const track = rows[2][6]
		expect(track.steps[0].action_sets.down[0].children.actions[0].options.path.value).toBe(`python3 /home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py ${HOST} track off`)
		expect(track.steps[0].action_sets.down[0].children.else_actions[0].options.path.value).toContain('track on')
		expect(track.steps[0].action_sets.down[0].children.actions[0].options.targetVariable.value).toBe('ptz_track')

		const setupRows = buildSetupPage(CONN, HOST, PAGES).controls
		const exposure = setupRows[1][0]
		const modes = allActions(exposure).filter((a) => a.definitionId === 'expM').map((a) => a.options.val.value)
		expect(modes).toEqual(['2', '3', '1', '0'])

		const wb = setupRows[1][1]
		const wbModes = allActions(wb).filter((a) => a.definitionId === 'wb').map((a) => a.options.val.value)
		expect(wbModes).toEqual(['indoor', 'outdoor', 'onepush', 'automatic'])
		expect(allActions(wb).some((a) => a.definitionId === 'wbOPT')).toBe(true)

		const backlight = setupRows[1][2]
		expect(allActions(backlight).map((a) => a.options.custom?.value).filter(Boolean)).toEqual(['81 01 04 33 03 FF', '81 01 04 33 02 FF'])

		const power = setupRows[1][3]
		expect(allActions(power).filter((a) => a.definitionId === 'power').map((a) => a.options.bool.value)).toEqual(['off', 'on'])

		const menu = rows[3][8]
		expect(allActions(menu).map((a) => a.options.custom?.value).filter(Boolean)).toEqual(['81 01 06 06 03 FF', '81 01 06 06 02 FF'])

		for (const [cell, which] of [[rows[2][7], 'close'], [rows[3][6], 'half'], [rows[3][7], 'full']]) {
			expect(cell.steps[0].action_sets.down[0].options.path.value).toContain(`body ${which}`)
			expect(cell.feedbacks[0].options.expression.value).toContain("jsonpath($(internal:custom_ptz_track), '$.body')")
		}
		const setup = rows[3][3]
		expect(setup.steps[0].action_sets.down[0].definitionId).toBe('set_page')
		expect(setup.steps[0].action_sets.down[0].options.page.value).toBe('10')
		expect(() => navKey('x', { icon: 'ptz-setup', label: '', notes: '' }, 0)).toThrow(/not a destination/)
		expect(() => navKey('x', { icon: 'ptz-setup', label: '', notes: '' }, undefined)).toThrow(/not a destination/)
	})

	it('zooms while held and homes on demand', () => {
		expect(rows[2][4].steps[0].action_sets.down[0].options.custom.value).toBe('81 01 04 07 20 FF')
		expect(rows[3][4].steps[0].action_sets.down[0].options.custom.value).toBe('81 01 04 07 30 FF')
		expect(rows[2][4].steps[0].action_sets.up[0].definitionId).toBe('zoomS')
		expect(rows[2][3].steps[0].action_sets.down[0].definitionId).toBe('home')
		expect(rows[3][5].steps[0].action_sets.down[0].options.custom.value).toBe('81 01 04 38 04 FF')
	})

	it('uses unique ids, only the given connection, and only shipped images', () => {
		const ids = all.flatMap((c) => [...allActions(c).map((a) => a.id), ...c.feedbacks.map((f) => f.id)])
		expect(new Set(ids).size).toBe(ids.length)
		for (const c of all) {
			for (const a of allActions(c)) expect([CONN, 'internal']).toContain(a.connectionId)
			for (const name of imagesUsed(c)) expect(imageNames.has(name), name).toBe(true)
		}
	})
})

describe('the poller', () => {
	it('is a self-contained Python 3 script that always prints JSON', () => {
		expect(SCRIPT.startsWith('#!/usr/bin/env python3')).toBe(true)
		for (const f of ['online', 'pan', 'tilt', 'zoom', 'focus', 'ae', 'wb', 'backlight', 'power', 'menu']) {
			expect(SCRIPT).toContain(`"${f}"`)
		}
		expect(SCRIPT).toContain('json.dumps')
		expect(SCRIPT).not.toMatch(/^import (requests|numpy)/m)
	})

	it('builds a one-second interval trigger that runs the script into the state variable', () => {
		const t = pollTrigger('10.23.0.181')
		expect(t.type).toBe('trigger')
		expect(t.events[0]).toMatchObject({ type: 'interval', enabled: true, options: { seconds: INTERVAL_SECONDS } })
		expect(t.actions).toHaveLength(1)
		expect(t.actions[0].definitionId).toBe('exec')
		expect(t.actions[0].options.path.value).toBe(`python3 ${SCRIPT_PATH} 10.23.0.181`)
		expect(t.actions[0].options.targetVariable.value).toBe(STATE)
		expect(TRIGGER_ID).toBe('trigger-ptz-poll')
	})
})

describe('the page', () => {
	const instances = {
		abc: { label: 'visca', moduleId: 'ptzoptics-visca', config: { host: '10.23.0.181' } },
		def: { label: 'atem', moduleId: 'bmd-atem', config: {} },
	}
	const rig = () => ({
		pages: Object.fromEntries(
			['Home', 'Power', 'PP1', 'MA2', 'ATEM', 'SQ7', 'VW', 'System', 'Mics'].map((name, i) => [
				String(i + 1),
				{ name, controls: { 1: { 0: { type: 'button-layered', marker: name } } } },
			])
		),
		instances,
		custom_variables: { vh_dest: { description: '', defaultValue: '1', persistCurrentValue: true, sortOrder: 1 } },
		triggers: { old: { type: 'trigger', options: { name: 'Poll PTZ camera' } }, keep: { type: 'trigger', options: { name: 'Poll PA state' } } },
	})

	it('finds the camera connection or refuses', () => {
		expect(findConnection({ instances })).toEqual({ id: 'abc', label: 'visca', host: '10.23.0.181' })
		expect(() => findConnection({ instances: { def: instances.def } })).toThrow(/add it in Connections first/)
		expect(() => findConnection({})).toThrow(/no ptzoptics-visca connection/)
	})

	it('lays the pages out on the full grid', () => {
		const page = buildPage(CONN, HOST, PAGES)
		expect(page.name).toBe(PAGE_NAME)
		expect(Object.keys(page.controls).map(Number).sort()).toEqual([1, 2, 3, STRIP_ROW, KNOB_ROW].sort())
		expect(page.gridSize).toEqual({ minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 })
		const setup = buildSetupPage(CONN, HOST, PAGES)
		expect(setup.name).toBe(SETUP_NAME)
		expect(Object.keys(setup.controls)).toEqual(['1', '2'])
		expect(Object.keys(setup.controls[1])).toHaveLength(9)
		expect(Object.keys(setup.controls[2])).toHaveLength(6)
		expect(setup.controls[1][8].steps[0].action_sets.down[0].options.page.value).toBe('9')
	})

	it('replaces Mics, rebuilds row 0 everywhere, merges variables and swaps the trigger', () => {
		const out = buildConfig(rig())
		expect(out.pageNumber).toBe('9')
		expect(out.setupNumber).toBe('10')
		expect(out.pages['9'].name).toBe('PTZ')
		expect(out.pages['10'].name).toBe('PTZ Setup')
		expect(out.pages['9'].controls[0][NAV_ORDER.indexOf('PTZ')].style.layers[3].text.value).toBe('PTZ')
		// the sub-page's folder row marks its parent as current
		expect(out.pages['10'].controls[0][NAV_ORDER.indexOf('PTZ')].style.layers[1].borderWidth.value).toBe(6)
		expect(out.pages['10'].controls[0][NAV_ORDER.indexOf('Home')].style.layers[1].borderWidth.value).toBe(0)
		expect(out.pages['9'].controls[3][3].steps[0].action_sets.down[0].options.page.value).toBe('10')
		for (const n of ['1', '2', '3', '4', '5', '6', '7', '8']) {
			expect(out.pages[n].controls[1][0].marker).toBe(rig().pages[n].name)
			expect(Object.keys(out.pages[n].controls[0])).toHaveLength(9)
		}
		expect(out.custom_variables.vh_dest).toEqual(rig().custom_variables.vh_dest)
		expect(out.custom_variables[SPEED]).toBeDefined()
		expect(Object.keys(out.triggers).sort()).toEqual(['keep', TRIGGER_ID, TRACK_TRIGGER_ID].sort())
		expect(out.triggers[TRIGGER_ID].actions[0].options.path.value).toContain('10.23.0.181')
		expect(out.triggers[TRACK_TRIGGER_ID].actions[0].options.path.value).toContain('ptz_web.py 10.23.0.181 get')
		expect(out.connection.id).toBe('abc')
		expect(REPLACES).toBe('Mics')
	})

	it('is idempotent over a rig that already has the PTZ page, and tolerates a page with no controls', () => {
		const once = buildConfig(rig())
		delete once.pages['3'].controls
		const twice = buildConfig({ ...rig(), pages: once.pages, triggers: once.triggers, custom_variables: once.custom_variables })
		expect(twice.pages['9'].name).toBe('PTZ')
		expect(twice.setupNumber).toBe('10')
		expect(Object.keys(twice.pages)).toHaveLength(10)
		expect(Object.keys(twice.pages['3'].controls)).toEqual(['0'])
		expect(Object.keys(twice.triggers).filter((t) => t === TRIGGER_ID)).toHaveLength(1)
	})

	it('refuses a rig with neither page and one with no triggers or variables still works', () => {
		const r = rig()
		r.pages['9'].name = 'Wireless'
		expect(() => buildConfig(r)).toThrow(/no page named "Mics" or "PTZ"/)
		const bare = rig()
		delete bare.triggers
		delete bare.custom_variables
		expect(Object.keys(buildConfig(bare).triggers).sort()).toEqual([TRIGGER_ID, TRACK_TRIGGER_ID].sort())
	})
})
