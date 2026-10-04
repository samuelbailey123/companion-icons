import { describe, expect, it } from 'vitest'
import { cv, exec, expr, field, logicIf, override, raw, setVar, v, visca, wait, when } from '../src/ptz/actions.js'
import { BG, control, key, knob, layers, strip } from '../src/ptz/controls.js'
import { DEFAULT_SPEED, SPEED, STATE, definitions, mergeDefinitions } from '../src/ptz/variables.js'
import { AXES, HOLD_MS, KNOBS, ROWS, SLACK_MS, buildKnobs, deriveSpeeds, panTiltCommand } from '../src/ptz/knobs.js'
import { PRESET_KEYS, SPEED_STOPS, buildKeys, navKey, nextStop, presetCaption } from '../src/ptz/keys.js'
import { AUTO_FIELDS, autoKey } from '../src/ptz/image.js'
import { lookKey } from '../src/ptz/picture.js'
import { FRAME, TARGETS, targetKey } from '../src/ptz/tracking.js'
import { INTERVAL_SECONDS, SCRIPT, SCRIPT_PATH, TRIGGER_ID, pollTrigger } from '../src/ptz/poller.js'
import { PAGE_NAME, REPLACES, SETUP_NAME, buildConfig, buildPage, buildSetupPage, findConnection } from '../src/ptz/page.js'
import { TRIGGER_ID as TRACK_TRIGGER_ID } from '../src/ptz/web.js'
import { SYNC_TRIGGER_ID } from '../src/ptz/picture.js'
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
	const { strips, knobs } = buildKnobs(CONN, HOST)

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

	it('drive pan and tilt as one raw VISCA command that carries both axes', () => {
		for (const [axis, dirs] of [['pan', ['left', 'right']], ['tilt', ['down', 'up']]]) {
			const other = AXES[axis].other
			for (const [set, dir] of [['rotate_left', dirs[0]], ['rotate_right', dirs[1]]]) {
				const chain = knobs[KNOBS[axis]].steps[0].action_sets[set]
				const byte = String(AXES[axis].bytes[dir])
				expect(chain.map((a) => a.definitionId)).toEqual(['custom_variable_set_value', 'custom_variable_set_value', 'custom', 'wait', 'logic_if'])
				expect(chain[0].options.name.value).toBe(`ptz_${axis}_at`)
				expect(chain[0].options.value).toEqual(expr('unixNow()'))
				expect(chain[1].options.name.value).toBe(`ptz_${axis}_dir`)
				expect(chain[1].options.value).toEqual(v(byte))

				const go = chain[2].options
				expect(go.custom.value).toBe('81 01 06 01 00 00 00 00 FF')
				expect(go.command_parameters.value).toBe('8,9;10,11;12,13;14,15')
				expect(go.parameter0.value).toBe(cv('ptz_speed'))
				expect(go.parameter1.value).toBe(cv('ptz_tspeed'))
				// Pan's byte first, then tilt's: this axis's literal, the other axis's variable.
				const [pan, tilt] = axis === 'pan' ? [byte, cv(`ptz_${other}_dir`)] : [cv(`ptz_${other}_dir`), byte]
				expect([go.parameter2.value, go.parameter3.value]).toEqual([pan, tilt])
				expect(chain[3].options.time.value).toBe(String(HOLD_MS))
			}
			expect(knobs[KNOBS[axis]].steps[0].action_sets.down.map((a) => a.definitionId)).toEqual(['stop'])
		}
		expect(AXES.pan.bytes).toEqual({ left: 1, right: 2 })
		expect(AXES.tilt.bytes).toEqual({ up: 1, down: 2 })
	})

	it('stop an axis only on the last detent, and leave the other axis moving', () => {
		const [last] = knobs[KNOBS.pan].steps[0].action_sets.rotate_right.slice(-1)
		expect(last.children.condition[0].options.expression).toEqual(expr(`unixNow() - ${cv('ptz_pan_at')} >= ${HOLD_MS - SLACK_MS}`))
		const [rest, other] = last.children.actions
		expect(rest.options.name.value).toBe('ptz_pan_dir')
		expect(rest.options.value).toEqual(v('3'))
		expect(other.children.condition[0].options.expression.value).toBe(`${cv('ptz_tilt_dir')} == 1 || ${cv('ptz_tilt_dir')} == 2`)
		const [own] = other.children.actions
		expect([own.options.parameter2.value, own.options.parameter3.value]).toEqual(['3', cv('ptz_tilt_dir')])
		// The last axis to stop reads no variable: a bad one cannot spoil the final stop.
		expect(other.children.else_actions.map((a) => a.definitionId)).toEqual(['stop'])
		expect(panTiltCommand('p', CONN, '3', '3').options.parameter2.value).toBe('3')
	})

	it('zooms and focuses at the derived speed, and stops each on its last detent', () => {
		const zoom = knobs[KNOBS.zoom].steps[0].action_sets
		expect(zoom.rotate_right[1].options.custom.value).toBe('81 01 04 07 20 FF')
		expect(zoom.rotate_left[1].options.custom.value).toBe('81 01 04 07 30 FF')
		expect(zoom.rotate_right.map((a) => a.definitionId)).toEqual(['custom_variable_set_value', 'custom', 'wait', 'logic_if'])
		expect(zoom.rotate_right[0].options.name.value).toBe('ptz_zoom_at')
		expect(zoom.rotate_right[3].children.condition[0].options.expression.value).toContain(cv('ptz_zoom_at'))
		expect(zoom.rotate_right[3].children.actions.map((a) => a.definitionId)).toEqual(['zoomS'])
		expect(zoom.down.map((a) => a.definitionId)).toEqual(['zoomS'])

		const focus = knobs[KNOBS.focus].steps[0].action_sets
		// The stop answers with a syntax error and halts the drive anyway; without it one detent
		// runs the focus to the endstop, which is what a knob that runs away feels like.
		expect(focus.rotate_right.map((a) => a.definitionId)).toEqual(['focusM', 'custom_variable_set_value', 'custom', 'wait', 'logic_if'])
		expect(focus.rotate_right[0].options.bol.value).toBe('1')
		expect(focus.rotate_right[1].options.name.value).toBe('ptz_focus_at')
		expect(focus.rotate_left[2].options.custom.value).toBe('81 01 04 08 30 FF')
		for (const set of ['rotate_left', 'rotate_right']) {
			expect(focus[set][4].children.actions.map((a) => a.options.custom.value)).toEqual(['81 01 04 08 00 FF'])
		}
		expect(focus.down[0].options.custom.value).toBe('81 01 04 38 04 FF')
		expect(JSON.stringify(focus)).not.toContain('focusS')
	})

	/**
	 * Replays detents through the chains the way Companion runs them: every detent is its own
	 * chain, a chain's actions up to a wait are dispatched together, and the wait holds back only
	 * what follows it in that chain. Returns the commands the camera would receive, in order.
	 */
	const replay = (detents, { stampLag = 0 } = {}) => {
		const vars = { ptz_speed: '12', ptz_tspeed: '12', ptz_pan_dir: '3', ptz_tilt_dir: '3', ptz_pan_at: '0', ptz_tilt_at: '0' }
		const sent = []
		const queue = []
		let now = 0
		const sub = (s) => String(s).replace(/\$\(internal:custom_([a-z0-9_]+)\)/g, (_, n) => vars[n])
		const evaluate = (e) => Function(`return (${sub(e).replace(/unixNow\(\)/g, String(now))})`)()
		const run = (actions) => {
			for (const a of actions) {
				if (a.definitionId === 'custom_variable_set_value') {
					const value = a.options.value.isExpression ? evaluate(a.options.value.value) : a.options.value.value
					if (a.options.value.value === 'unixNow()' && stampLag) queue.push({ at: now + stampLag, fn: () => (vars[a.options.name.value] = String(now)) })
					else vars[a.options.name.value] = String(value)
				} else if (a.definitionId === 'custom') {
					sent.push({ at: now, pan: sub(a.options.parameter2?.value), tilt: sub(a.options.parameter3?.value) })
				} else if (a.definitionId === 'stop') {
					sent.push({ at: now, pan: '3', tilt: '3' })
				} else if (a.definitionId === 'logic_if') {
					const ok = a.children.condition.every((c) => evaluate(c.options.expression.value))
					run(ok ? a.children.actions : a.children.else_actions)
				}
			}
		}
		const chain = (actions) => {
			const i = actions.findIndex((a) => a.definitionId === 'wait')
			run(actions.slice(0, i))
			queue.push({ at: now + Number(actions[i].options.time.value), fn: () => run(actions.slice(i + 1)) })
		}
		for (const { at, axis, set } of detents) queue.push({ at, fn: () => chain(knobs[KNOBS[axis]].steps[0].action_sets[set]) })
		while (queue.length) {
			queue.sort((a, b) => a.at - b.at)
			const next = queue.shift()
			now = next.at
			next.fn()
		}
		return sent
	}
	const turn = (axis, set, from, to, every) =>
		Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => ({ at: from + i * every, axis, set }))

	it('keeps a steady turn moving and stops once, a hold after the last detent', () => {
		const sent = replay(turn('pan', 'rotate_right', 0, 1000, 50))
		const stops = sent.filter((c) => c.pan === '3')
		expect(stops).toEqual([{ at: 1000 + HOLD_MS, pan: '3', tilt: '3' }])
		expect(sent.filter((c) => c.at <= 1000).every((c) => c.pan === '2')).toBe(true)
	})

	it('still stops on the last detent when its stamp lands late', () => {
		const sent = replay(turn('pan', 'rotate_left', 0, 300, 60), { stampLag: SLACK_MS - 5 })
		expect(sent.filter((c) => c.pan === '3').map((c) => c.at)).toEqual([300 + HOLD_MS])
	})

	it('lets pan and tilt turn together without stopping each other', () => {
		const sent = replay([...turn('pan', 'rotate_right', 0, 1000, 50), ...turn('tilt', 'rotate_right', 200, 600, 40)])
		// Pan never stops while its knob turns, even when tilt's commands carry its byte.
		expect(sent.filter((c) => c.at <= 1000).every((c) => c.pan === '2')).toBe(true)
		// Tilt stops on its own, a hold after its last detent less at most the slack (its detents
		// come closer together than the slack), and the command keeps pan going.
		const tiltStop = sent.find((c) => c.tilt === '3' && c.at > 600)
		expect(tiltStop.pan).toBe('2')
		expect(tiltStop.at).toBeGreaterThanOrEqual(600 + HOLD_MS - SLACK_MS)
		expect(tiltStop.at).toBeLessThanOrEqual(600 + HOLD_MS)
		expect(sent.filter((c) => c.pan === '3').map((c) => c.at)).toEqual([1000 + HOLD_MS])
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
		expect(branch.children.else_actions.map((a) => a.definitionId)).toEqual(['recallPreset', 'custom_variable_set_value', 'exec'])
		expect(branch.children.else_actions[2].options.path.value).toBe(`python3 /home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py ${HOST} look apply`)
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

	it('fill rows 1 and 2, presets in the left block, Look, Setup, Zoom out and Auto on row 3', () => {
		expect(Object.keys(rows)).toEqual(['1', '2', '3'])
		expect(Object.keys(rows[1]).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
		expect(Object.keys(rows[2]).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
		expect(Object.keys(rows[3]).map(Number)).toEqual([2, 3, 4, 5, 6, 7, 8])
		// Presets 1-3 then 4-6, left to right, top to bottom.
		const caption = (c) => c.style.layers.find((l) => l.type === 'text').text.value
		expect([0, 1, 2].map((c) => caption(rows[1][c]))).toEqual(['1', '2', '3'])
		expect([0, 1, 2].map((c) => caption(rows[2][c]))).toEqual(['4', '5', '6'])
		for (const c of all) expect(c.options.rotaryActions).toBe(false)
		expect(all).toHaveLength(25)
		// No arrow art is left anywhere on the page.
		for (const c of all) for (const name of imagesUsed(c)) expect(name).not.toMatch(/^arrow-/)
	})

	it('caption presets with the shot name the build was given, and plain numbers otherwise', () => {
		expect(presetCaption(2, 'Stage')).toBe('2 (Stage)')
		expect(presetCaption(6)).toBe('6')
		const named = buildKeys(CONN, HOST, PAGES, { 1: 'Wide', 5: 'Bass' })
		const caption = (row) => row.style.layers.find((l) => l.type === 'text').text.value
		expect(caption(named[1][0])).toBe('1 (Wide)')
		expect(caption(named[1][1])).toBe('2')
		expect(caption(named[2][1])).toBe('5 (Bass)')
		expect(named[1][0].options.notes).toContain('preset 1 (Wide)')
		expect(caption(rows[1][0])).toBe('1')
		// The name is caption only: the recall and save actions are the same with or without it.
		expect(named[1][0].steps).toEqual(rows[1][0].steps)
		expect(named[1][0].feedbacks).toEqual(rows[1][0].feedbacks)
	})

	it('step the drive speed through its three stops and keep the derived speeds in step', () => {
		expect(SPEED_STOPS).toEqual([1, 10, 24])
		expect(nextStop('ptz_speed', SPEED_STOPS)).toBe(`${cv('ptz_speed')} < 10 ? 10 : (${cv('ptz_speed')} < 24 ? 24 : 1)`)
		expect(nextStop('x', [2, 5])).toBe(`${cv('x')} < 5 ? 5 : 2`)

		const speed = rows[2][3]
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
		const stop = rows[2][4]
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
		const stop = rows[2][4]
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
			const k = rows[1 + Math.floor(i / 3)][i % 3]
			const branch = k.steps[0].action_sets.down[0]
			expect(branch.children.actions[0].definitionId).toBe('setPreset')
			expect(branch.children.actions[0].options.presetAsNumber.value).toBe(n)
			expect(branch.children.else_actions[0].definitionId).toBe('recallPreset')
			expect(branch.children.else_actions[0].options.presetAsNumber.value).toBe(n)
			// A recall puts the saved look back by itself; a save does not touch it.
			expect(branch.children.else_actions.at(-1).options.path.value).toBe(`python3 /home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py ${HOST} look apply`)
			expect(branch.children.actions.some((a) => a.definitionId === 'exec')).toBe(false)
			expect(k.feedbacks.map((f) => f.options.expression.value)).toEqual([`${cv('ptz_last')} == ${n}`, `${cv('ptz_armed')} == 1`])
		}
		const save = rows[1][8]
		expect(save.steps[0].action_sets.down[0].options.value.value).toBe(`${cv('ptz_armed')} == 1 ? 0 : 1`)
	})

	it('toggles and cycles off the camera state the poller read', () => {
		const af = rows[1][5]
		expect(af.steps[0].action_sets.down[0].children.condition[0].options.expression.value).toBe(`${field('focus')} == "Auto"`)
		expect(af.steps[0].action_sets.down[0].children.actions[0].options.bol.value).toBe('1')
		expect(af.steps[0].action_sets.down[0].children.else_actions[0].options.bol.value).toBe('0')

		const track = rows[1][6]
		expect(track.steps[0].action_sets.down[0].children.actions[0].options.path.value).toBe(`python3 /home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py ${HOST} track off`)
		expect(track.steps[0].action_sets.down[0].children.else_actions[0].options.path.value).toContain('track on')
		expect(track.steps[0].action_sets.down[0].children.actions[0].options.targetVariable.value).toBe('ptz_track')

		const setupRows = buildSetupPage(CONN, HOST, PAGES).controls
		const exposure = setupRows[1][0]
		const modes = allActions(exposure).filter((a) => a.definitionId === 'expM').map((a) => a.options.val.value)
		expect(modes).toEqual(['2', '3', '1', '0'])

		// White balance: Auto, or the temperature on the WB dial — the fixed presets went with the dial.
		const wb = setupRows[1][1]
		const wbBranch = wb.steps[0].action_sets.down[0]
		expect(wbBranch.children.condition[0].options.expression.value).toBe(`${field('wb')} == "Auto"`)
		expect(wbBranch.children.actions.map((a) => a.definitionId)).toEqual(['custom_variable_set_value', 'custom'])
		expect(wbBranch.children.actions[0].options.name.value).toBe('ptz_wbcode')
		expect(wbBranch.children.actions[1].options.parameter0.value).toBe(cv('ptz_wbcode'))
		expect(wbBranch.children.else_actions.map((a) => a.options.val?.value)).toEqual(['automatic'])
		expect(JSON.stringify(wb)).not.toMatch(/indoor|outdoor|onepush|wbOPT/)

		const backlight = setupRows[1][2]
		expect(allActions(backlight).map((a) => a.options.custom?.value).filter(Boolean)).toEqual(['81 01 04 33 03 FF', '81 01 04 33 02 FF'])

		const power = setupRows[1][3]
		expect(allActions(power).filter((a) => a.definitionId === 'power').map((a) => a.options.bool.value)).toEqual(['off', 'on'])

		const menu = rows[2][8]
		expect(allActions(menu).map((a) => a.options.custom?.value).filter(Boolean)).toEqual(['81 01 06 06 03 FF', '81 01 06 06 02 FF'])

		for (const [cell, which] of [[rows[1][7], 'close'], [rows[2][6], 'half'], [rows[2][7], 'full']]) {
			expect(cell.steps[0].action_sets.down[0].options.path.value).toContain(`body ${which}`)
			expect(cell.feedbacks[0].options.expression.value).toContain("jsonpath($(internal:custom_ptz_track), '$.body')")
		}
		const setup = rows[3][3]
		expect(setup.steps[0].action_sets.down[0].definitionId).toBe('set_page')
		expect(setup.steps[0].action_sets.down[0].options.page.value).toBe('10')
		expect(() => navKey('x', { icon: 'ptz-setup', label: '', notes: '' }, 0)).toThrow(/not a destination/)
		expect(() => navKey('x', { icon: 'ptz-setup', label: '', notes: '' }, undefined)).toThrow(/not a destination/)
	})

	it('puts focus and exposure on auto together, and takes both off together, never colour', () => {
		expect(AUTO_FIELDS).toEqual(['focus', 'ae'])
		const auto = rows[3][5]
		expect(auto).toEqual(autoKey(CONN))
		expect(auto.style.layers[3].text).toEqual(v('Auto OFF'))
		expect(imagesUsed(auto).sort()).toEqual(['ptz-auto', 'ptz-auto-on'])

		const branch = auto.steps[0].action_sets.down[0]
		expect(branch.definitionId).toBe('logic_if')
		expect(branch.children.condition[0].options.expression.value).toBe(`${field('focus')} == "Auto" && ${field('ae')} == "Auto"`)
		// Both auto → both manual (focus '1', exposure '1'); anything else → both auto ('0', '0').
		// A wait sits between the two so the camera's two-deep command queue is never overrun.
		expect(branch.children.actions.map((a) => a.definitionId)).toEqual(['focusM', 'wait', 'expM'])
		expect(branch.children.actions[0].options.bol.value).toBe('1')
		expect(branch.children.actions[2].options.val.value).toBe('1')
		expect(branch.children.else_actions.map((a) => a.definitionId)).toEqual(['focusM', 'wait', 'expM'])
		expect(branch.children.else_actions[0].options.bol.value).toBe('0')
		expect(branch.children.else_actions[2].options.val.value).toBe('0')
		expect(auto.steps[0].action_sets.up).toEqual([])
		// White balance is excluded on purpose: nothing on the key touches it.
		expect(JSON.stringify(auto)).not.toMatch(/"wb"|04 35|\$\.wb/)

		// Lit green while both are auto, amber while only one is, plain otherwise.
		const [part, all] = auto.feedbacks
		expect(all.options.expression.value).toBe(branch.children.condition[0].options.expression.value)
		expect(all.styleOverrides.map((o) => o.override.value)).toEqual([BG.engaged, '$(image:ptz-auto-on)', 'Auto ON'])
		expect(part.options.expression.value).toBe(`(${field('focus')} == "Auto" || ${field('ae')} == "Auto") && !(${all.options.expression.value})`)
		expect(part.styleOverrides.map((o) => o.override.value)).toEqual([BG.notice, 'Auto PART'])
	})

	it('puts the saved look back from under the presets, and says whether the camera is on it', () => {
		const look = rows[3][2]
		expect(look).toEqual(lookKey(HOST))
		expect(look.steps[0].action_sets.down[0].options.path.value).toBe(`python3 /home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py ${HOST} look apply`)
		expect(look.steps[0].action_sets.down[0].options.targetVariable.value).toBe('ptz_look')
		const set = look.feedbacks.find((f) => f.id === 'look-set').options.expression.value
		for (const f of ['wb', 'ae', 'shutter', 'iris', 'gain', 'sharp']) {
			expect(set).toContain(`${field(f)} == jsonpath($(internal:custom_ptz_look), '$.${f}')`)
		}
		expect(look.feedbacks.map((f) => f.styleOverrides.find((o) => o.elementProperty === 'text')?.override.value)).toEqual(['Look set', `concat('Look ', jsonpath($(internal:custom_ptz_look), '$.left'), ' left')`, 'Look FAILED'])
		expect(imagesUsed(look)).toEqual(['ptz-look'])
	})

	it('chooses who to track by a point in each third of the frame, under the tracking block', () => {
		for (const [col, which, x] of [[6, 'left', 320], [7, 'middle', 960], [8, 'right', 1600]]) {
			const k = rows[3][col]
			expect(k).toEqual(targetKey(HOST, which))
			expect(k.steps[0].action_sets.down[0].options.path.value).toBe(`python3 /home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py ${HOST} select ${x} 486`)
			expect(k.steps[0].action_sets.down[0].options.targetVariable.value).toBe('ptz_track')
			expect(k.feedbacks).toEqual([])
		}
		for (const t of Object.values(TARGETS)) {
			expect(t.x).toBeGreaterThan(0)
			expect(t.x).toBeLessThan(FRAME.width)
			expect(t.y).toBeGreaterThan(0)
			expect(t.y).toBeLessThan(FRAME.height)
		}
	})

	it('zooms while held and homes on demand', () => {
		expect(rows[1][4].steps[0].action_sets.down[0].options.custom.value).toBe('81 01 04 07 20 FF')
		expect(rows[3][4].steps[0].action_sets.down[0].options.custom.value).toBe('81 01 04 07 30 FF')
		expect(rows[1][4].steps[0].action_sets.up[0].definitionId).toBe('zoomS')
		expect(rows[1][3].steps[0].action_sets.down[0].definitionId).toBe('home')
		expect(rows[2][5].steps[0].action_sets.down[0].options.custom.value).toBe('81 01 04 38 04 FF')
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
		expect(Object.keys(setup.controls)).toEqual(['1', '2', '3', '4', '5'])
		expect(Object.keys(setup.controls[1])).toHaveLength(9)
		expect(Object.keys(setup.controls[2])).toHaveLength(6)
		expect(Object.keys(setup.controls[3])).toHaveLength(6)
		// The six value knobs with their readouts, on the strip and encoder rows.
		expect(Object.keys(setup.controls[4]).map(Number)).toEqual(KNOB_COLS)
		expect(Object.keys(setup.controls[5]).map(Number)).toEqual(KNOB_COLS)
		for (const col of KNOB_COLS) expect(setup.controls[5][col].options.rotaryActions).toBe(true)
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
		expect(Object.keys(out.triggers).sort()).toEqual(['keep', TRIGGER_ID, TRACK_TRIGGER_ID, SYNC_TRIGGER_ID].sort())
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
		expect(Object.keys(buildConfig(bare).triggers).sort()).toEqual([TRIGGER_ID, TRACK_TRIGGER_ID, SYNC_TRIGGER_ID].sort())
	})
})
