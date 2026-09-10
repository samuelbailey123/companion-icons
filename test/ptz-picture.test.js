import { describe, expect, it } from 'vitest'
import { cv, field } from '../src/ptz/actions.js'
import { BG } from '../src/ptz/controls.js'
import {
	SETUP_KNOBS, SYNC_TRIGGER_ID, buildSetupKnobs, levelKey, matchKey, nrKey, onePushKey, pq, syncTrigger, wbCodeExpression, wdrKey,
} from '../src/ptz/picture.js'
import { EXPCOMP_ZERO, IRIS, RANGE, SHUTTER, STANDARD, WB_CODE, WB_KELVIN, WB_MAX, WB_MIN, expcompLabel, kelvinLabel, levelLabel } from '../src/ptz/tables.js'
import { FIELDS, GAIN, MATCH, STATE, WB_CODE as WB_CODE_VAR, WB_K, definitions } from '../src/ptz/variables.js'
import { SCRIPT } from '../src/ptz/poller.js'
import { MATCH as WEB_MATCH, SCRIPT as WEB_SCRIPT, SCRIPT_PATH, matchExec } from '../src/ptz/web.js'
import { KNOB_COLS } from '../src/layout.js'
import { ICONS } from '../src/variants.js'

const CONN = 'conn-test'
const HOST = '10.0.0.9'
const OTHER = { host: '10.0.0.8', atem: 1 }
const imageNames = new Set(ICONS.map((i) => i.name))
const imagesUsed = (control) => (JSON.stringify(control).match(/\$\(image:([a-z0-9-]+)\)/g) ?? []).map((r) => r.slice('$(image:'.length, -1))

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

describe('the camera tables', () => {
	it('cover the ranges the camera accepted, with the 60 Hz shutter half the knob walks', () => {
		for (let i = RANGE.shutter[0]; i <= RANGE.shutter[1]; i++) expect(SHUTTER[i], `shutter ${i}`).toMatch(/^1\/\d+$/)
		expect(SHUTTER[STANDARD.shutter]).toBe('1/125')
		expect(SHUTTER[18]).toBe('1/60')
		for (let i = RANGE.iris[0]; i <= RANGE.iris[1]; i++) expect(IRIS[i], `iris ${i}`).toBeTruthy()
		expect(IRIS[12]).toBe('F1.8')
		expect(IRIS[0]).toBe('Close')
	})

	it('map every colour temperature both ways, in hundreds, with 4600K on code 0x1E', () => {
		const kelvins = Object.values(WB_KELVIN).sort((a, b) => a - b)
		expect(kelvins[0]).toBe(WB_MIN)
		expect(kelvins.at(-1)).toBe(WB_MAX)
		expect(new Set(kelvins).size).toBe(kelvins.length)
		for (let i = 1; i < kelvins.length; i++) expect(kelvins[i] - kelvins[i - 1]).toBe(100)
		expect(WB_CODE[4600]).toBe(0x1e)
		expect(WB_CODE[STANDARD.wbk]).toBe(0x1e)
		expect(WB_CODE[4500]).toBe(0x08)
		expect(kelvinLabel(4600)).toBe('4600K')
	})

	it('label levels and compensation the way the poller prints them', () => {
		expect(levelLabel(0)).toBe('Off')
		expect(levelLabel(8)).toBe('8')
		expect(levelLabel(8, true)).toBe('Auto')
		expect(expcompLabel(false, 7)).toBe('Off')
		expect(expcompLabel(true, EXPCOMP_ZERO)).toBe('0')
		expect(expcompLabel(true, 9)).toBe('+2')
		expect(expcompLabel(true, 5)).toBe('-2')
	})

	it('writes a byte as two VISCA nibbles', () => {
		expect(pq(21)).toBe('01 05')
		expect(pq(0)).toBe('00 00')
		expect(pq(15)).toBe('00 0F')
	})
})

describe('the kelvin → code expression', () => {
	/** Evaluate the ternary chain the way Companion would, for one dial value. */
	const evaluate = (expression, k) => new Function('k', `return ${expression.split('$(internal:custom_ptz_wbk)').join('k')}`)(k)

	it('lands on the camera code for every temperature, and on the standard for anything else', () => {
		const expression = wbCodeExpression(cv(WB_K))
		for (const [code, k] of Object.entries(WB_KELVIN)) expect(evaluate(expression, k), `${k}K`).toBe(Number(code))
		expect(evaluate(expression, 0)).toBe(WB_CODE[STANDARD.wbk])
		expect(evaluate(expression, 4650)).toBe(WB_CODE[STANDARD.wbk])
	})
})

describe('the setup knobs', () => {
	const { strips, knobs } = buildSetupKnobs(CONN)

	it('come as strip + encoder pairs on the six columns the deck has', () => {
		expect(Object.values(SETUP_KNOBS).sort()).toEqual([...KNOB_COLS].sort())
		expect(Object.keys(strips)).toEqual(Object.keys(knobs))
		for (const col of Object.keys(knobs)) {
			expect(knobs[col].options.rotaryActions).toBe(true)
			expect(strips[col].options.rotaryActions).toBe(false)
			expect(strips[col].style.layers[3].text.isExpression).toBe(true)
		}
	})

	it('step shutter, iris, sharpness and compensation with the camera’s own up/down commands', () => {
		const stepped = {
			[SETUP_KNOBS.shutter]: ['81 01 04 0A 02 FF', '81 01 04 0A 03 FF'],
			[SETUP_KNOBS.iris]: ['81 01 04 0B 02 FF', '81 01 04 0B 03 FF'],
			[SETUP_KNOBS.sharp]: ['81 01 04 02 02 FF', '81 01 04 02 03 FF'],
			[SETUP_KNOBS.expcomp]: ['81 01 04 0E 02 FF', '81 01 04 0E 03 FF'],
		}
		for (const [col, [up, down]] of Object.entries(stepped)) {
			const sets = knobs[col].steps[0].action_sets
			expect(sets.rotate_right.at(-1).options.custom.value, col).toBe(up)
			expect(sets.rotate_left.at(-1).options.custom.value, col).toBe(down)
			expect(sets.rotate_right.at(-1).options.command_parameters.value).toBe('')
		}
	})

	it('put exposure into Manual before shutter, iris and gain move, and switch compensation on before it moves', () => {
		for (const col of [SETUP_KNOBS.shutter, SETUP_KNOBS.iris, SETUP_KNOBS.gain]) {
			for (const set of ['rotate_left', 'rotate_right']) {
				const modes = knobs[col].steps[0].action_sets[set].filter((a) => a.definitionId === 'expM')
				expect(modes.map((a) => a.options.val.value), `${col} ${set}`).toEqual(['1'])
			}
		}
		for (const set of ['rotate_left', 'rotate_right']) {
			expect(knobs[SETUP_KNOBS.expcomp].steps[0].action_sets[set][0].options.custom.value).toBe('81 01 04 3E 02 FF')
		}
		// Sharpness needs no mode: it applies whatever the exposure is doing.
		expect(JSON.stringify(knobs[SETUP_KNOBS.sharp])).not.toContain('expM')
	})

	it('dial gain and colour temperature through variables and send the value as a parameter', () => {
		const gain = knobs[SETUP_KNOBS.gain].steps[0].action_sets
		expect(gain.rotate_right[0].options.name.value).toBe(GAIN)
		expect(gain.rotate_right[0].options.value.value).toBe(`min(${RANGE.gain[1]}, ${cv(GAIN)} + 1)`)
		expect(gain.rotate_left[0].options.value.value).toBe(`max(${RANGE.gain[0]}, ${cv(GAIN)} - 1)`)
		const send = gain.rotate_right.at(-1)
		expect(send.options.custom.value).toBe('81 01 04 4C 00 00 00 00 FF')
		expect(send.options.command_parameters.value).toBe('13,15')
		expect(send.options.parameter0.value).toBe(cv(GAIN))

		const wb = knobs[SETUP_KNOBS.wb].steps[0].action_sets
		expect(wb.rotate_right.map((a) => a.options.name?.value ?? a.definitionId)).toEqual([WB_K, WB_CODE_VAR, 'custom'])
		expect(wb.rotate_right[0].options.value.value).toBe(`min(${WB_MAX}, ${cv(WB_K)} + 100)`)
		expect(wb.rotate_left[0].options.value.value).toBe(`max(${WB_MIN}, ${cv(WB_K)} - 100)`)
		expect(wb.rotate_right[1].options.value.value).toBe(wbCodeExpression(cv(WB_K)))
		expect(wb.rotate_right[2].options.custom.value).toBe('81 01 04 35 00 FF')
		expect(wb.rotate_right[2].options.command_parameters.value).toBe('8,9')
		expect(wb.rotate_right[2].options.parameter0.value).toBe(cv(WB_CODE_VAR))
	})

	it('return to the rig’s standard on a press, and do nothing on the iris', () => {
		const press = (col) => knobs[col].steps[0].action_sets.down
		expect(press(SETUP_KNOBS.shutter).at(-1).options.custom.value).toBe(`81 01 04 4A 00 00 ${pq(STANDARD.shutter)} FF`)
		expect(press(SETUP_KNOBS.shutter)[0].definitionId).toBe('expM')
		expect(press(SETUP_KNOBS.iris)).toEqual([])
		expect(press(SETUP_KNOBS.gain)[0].options.value.value).toBe(String(STANDARD.gain))
		expect(press(SETUP_KNOBS.expcomp).map((a) => a.options.custom?.value).filter(Boolean)).toEqual(['81 01 04 3E 03 FF', `81 01 04 4E 00 00 ${pq(EXPCOMP_ZERO)} FF`])
		expect(press(SETUP_KNOBS.wb)[0].options.value.value).toBe(String(STANDARD.wbk))
		expect(press(SETUP_KNOBS.sharp)[0].options.custom.value).toBe(`81 01 04 42 00 00 ${pq(STANDARD.sharp)} FF`)
		for (const col of Object.values(SETUP_KNOBS)) expect(knobs[col].steps[0].action_sets.up).toEqual([])
	})

	it('caption every readout from the poller and go amber when the value is not in effect', () => {
		const caption = (col) => strips[col].style.layers[3].text.value
		expect(caption(SETUP_KNOBS.shutter)).toBe(`concat('Shutter ', ${field('shutter')})`)
		expect(caption(SETUP_KNOBS.iris)).toBe(`concat('Iris ', ${field('iris')})`)
		expect(caption(SETUP_KNOBS.gain)).toBe(`concat('Gain ', ${field('gain')})`)
		expect(caption(SETUP_KNOBS.expcomp)).toBe(`concat('Comp ', ${field('expcomp')})`)
		expect(caption(SETUP_KNOBS.wb)).toBe(`concat('WB ', ${field('wb')})`)
		expect(caption(SETUP_KNOBS.sharp)).toBe(`concat('Sharp ', ${field('sharp')})`)
		const amber = (col) => strips[col].feedbacks.find((f) => f.styleOverrides.some((o) => o.override.value === BG.notice))?.options.expression.value
		expect(amber(SETUP_KNOBS.shutter)).toBe(`${field('ae')} != "Manual" && ${field('ae')} != "Shutter"`)
		expect(amber(SETUP_KNOBS.iris)).toBe(`${field('ae')} != "Manual" && ${field('ae')} != "Iris"`)
		expect(amber(SETUP_KNOBS.gain)).toBe(`!(${field('ae')} == "Manual")`)
		expect(amber(SETUP_KNOBS.expcomp)).toBe(`${field('ae')} == "Manual"`)
		expect(amber(SETUP_KNOBS.wb)).toBe(`!(includes(${field('wb')}, "K"))`)
		expect(amber(SETUP_KNOBS.sharp)).toBeUndefined()
		// The first zone doubles as the camera-down warning, like the pan strip on the run page.
		expect(strips[SETUP_KNOBS.shutter].feedbacks.at(-1).options.expression.value).toBe(`${field('online')} != "OK"`)
	})

	it('uses unique ids, only the given connection, and only shipped images', () => {
		const all = [...Object.values(strips), ...Object.values(knobs)]
		const ids = all.flatMap((c) => [...allActions(c).map((a) => a.id), ...c.feedbacks.map((f) => f.id)])
		expect(new Set(ids).size).toBe(ids.length)
		for (const c of all) {
			for (const a of allActions(c)) expect([CONN, 'internal']).toContain(a.connectionId)
			for (const name of imagesUsed(c)) expect(imageNames.has(name), name).toBe(true)
		}
	})
})

describe('the level keys', () => {
	it('cycle WDR Off → 1 … 8 → Off and NR Off → 1 … 7 → Auto → Off with direct sets', () => {
		for (const [build, fieldName, bytes] of [
			[wdrKey, 'wdr', (n) => `81 01 04 51 00 00 00 0${n.toString(16).toUpperCase()} FF`],
			[nrKey, 'nr', (n) => `81 01 04 54 0${n.toString(16).toUpperCase()} FF`],
		]) {
			const k = build(CONN)
			const sets = allActions(k).filter((a) => a.definitionId === 'custom').map((a) => a.options.custom.value)
			expect(sets).toHaveLength(RANGE[fieldName][1] + 1)
			for (let n = 0; n <= RANGE[fieldName][1]; n++) expect(sets).toContain(bytes(n))
			const conditions = allActions(k).filter((a) => a.definitionId === 'logic_if').map((a) => a.children.condition[0].options.expression.value)
			// One branch per value but the last, whose own step is the fallback back to Off.
			expect(conditions).toHaveLength(RANGE[fieldName][1])
			expect(conditions[0]).toBe(`${field(fieldName)} == "Off"`)
			expect(conditions.at(-1)).toBe(`${field(fieldName)} == "7"`)
			const fallback = allActions(k).filter((a) => a.definitionId === 'custom').at(-1)
			expect(fallback.options.custom.value).toBe(bytes(0))
			expect(k.feedbacks[0].options.expression.value).toBe(`${field(fieldName)} != "Off" && ${field(fieldName)} != "--"`)
			expect(k.style.layers[3].text.isExpression).toBe(true)
		}
		const custom = levelKey({ prefix: 'x', icon: 'wdr', caption: 'X', field: 'wdr', values: [['Off', 'A'], ['1', 'B']], notes: '' }, CONN)
		expect(custom.steps[0].action_sets.down[0].children.actions[0].options.custom.value).toBe('B')
		expect(custom.steps[0].action_sets.down[0].children.else_actions[0].options.custom.value).toBe('A')
	})
})

describe('one-push white balance and Match', () => {
	it('measures once and holds, and lights while held', () => {
		const k = onePushKey(CONN)
		expect(k.steps[0].action_sets.down.map((a) => a.definitionId)).toEqual(['wb', 'wait', 'wbOPT'])
		expect(k.steps[0].action_sets.down[0].options.val.value).toBe('onepush')
		expect(k.feedbacks[0].options.expression.value).toBe(`${field('wb')} == "1-Push"`)
		expect(imagesUsed(k)).toEqual(['white-card'])
	})

	it('runs the match verb against the other camera and reads its result back', () => {
		const k = matchKey(HOST, OTHER)
		const go = k.steps[0].action_sets.down[0]
		expect(go).toEqual(matchExec('match-go', HOST, OTHER.host))
		expect(go.options.path.value).toBe(`python3 ${SCRIPT_PATH} ${HOST} match ${OTHER.host}`)
		expect(go.options.targetVariable.value).toBe(WEB_MATCH)
		expect(WEB_MATCH).toBe(MATCH)
		expect(go.options.timeout.value).toBeGreaterThanOrEqual(20000)
		expect(k.style.layers[3].text.value).toBe('Match ◂ CAM 1')
		expect(k.feedbacks.map((f) => f.id)).toEqual(['match-left', 'match-ok', 'match-down'])
		expect(k.feedbacks[1].options.expression.value).toContain(`jsonpath($(internal:custom_${MATCH}), '$.left') == 0`)
	})

	it('ships the match verb in the web script, copying everything but the mounting flips', () => {
		expect(WEB_SCRIPT).toContain('def match(')
		expect(WEB_SCRIPT).toContain('"nAutoFlip"')
		expect(WEB_SCRIPT).toContain('"nFlipH"')
		expect(WEB_SCRIPT).toContain('"nFlipV"')
		expect(WEB_SCRIPT).toContain('"copied"')
		expect(WEB_SCRIPT).toContain('"left"')
		expect(WEB_SCRIPT).not.toContain('`')
	})
})

describe('the poller and the variables', () => {
	it('read every setup value with the camera’s own labels', () => {
		for (const f of ['shutter', 'iris', 'gain', 'sharp', 'expcomp', 'wdr', 'nr']) {
			expect(FIELDS).toContain(f)
			expect(SCRIPT).toContain(`"${f}"`)
		}
		expect(SCRIPT).toContain('8109044aff')
		expect(SCRIPT).toContain('8109044bff')
		expect(SCRIPT).toContain('8109044cff')
		expect(SCRIPT).toContain('81090442ff')
		expect(SCRIPT).toContain('8109043eff')
		expect(SCRIPT).toContain('8109044eff')
		expect(SCRIPT).toContain('81090451ff')
		expect(SCRIPT).toContain('81090454ff')
		// The labels are generated from the same table the deck uses.
		expect(SCRIPT).toContain('21: "1/125"')
		expect(SCRIPT).toContain('12: "F1.8"')
		expect(SCRIPT).toContain('30: "4600K"')
		expect(SCRIPT).toContain('"expcomp": "--"')
	})

	it('define the dials as persistent operator state and the match result as live', () => {
		const defs = definitions()
		expect(defs[GAIN].persistCurrentValue).toBe(true)
		expect(defs[GAIN].defaultValue).toBe('0')
		expect(defs[WB_K].defaultValue).toBe(String(STANDARD.wbk))
		expect(defs[WB_CODE_VAR].defaultValue).toBe(String(WB_CODE[STANDARD.wbk]))
		expect(defs[MATCH].persistCurrentValue).toBe(false)
		expect(defs[STATE].description).toContain('wdr')
	})
})

describe('the sync trigger', () => {
	it('sets both dials from the camera whenever the state JSON changes, and keeps the code in step', () => {
		const t = syncTrigger()
		expect(SYNC_TRIGGER_ID).toBe('trigger-ptz-sync')
		expect(t.events).toEqual([
			{ id: 'ptz-sync-on-state', type: 'variable_changed', enabled: true, options: { variableId: `internal:custom_${STATE}` } },
		])
		expect(t.actions.map((a) => a.options.name.value)).toEqual([GAIN, WB_K, WB_CODE_VAR])
		expect(t.actions[0].options.value.value).toBe(`${field('gain')} == "--" || ${field('gain')} == "" ? ${cv(GAIN)} : fromRadix(${field('gain')}, 10)`)
		expect(t.actions[1].options.value.value).toBe(`includes(${field('wb')}, "K") ? fromRadix(substr(${field('wb')}, 0, 4), 10) : ${cv(WB_K)}`)
		expect(t.actions[2].options.value.value).toBe(wbCodeExpression(cv(WB_K)))
		for (const a of t.actions) expect(a.options.value.isExpression).toBe(true)
	})
})
