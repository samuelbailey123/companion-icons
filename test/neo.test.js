import { describe, expect, it } from 'vitest'
import {
	BACK_WALL, BATTERY_CRITICAL, BATTERY_LOW, CLOCKS, DANGER_REST, FX_RETURNS, GREEN, MUTED, NEO, PAGE_NAMES, RED,
	SCENES, TCB_SAM, VOCAL_DCAS, buildNeoPages, connectionIds, lowMicExpr, pageNumbers, phases, sceneNameExpr, worstBattery,
} from '../src/neo.js'
import * as tracks from '../tools/pp1-tracks.js'
import { buildConfig, iconsUsed } from '../tools/neo-pages.js'
import { ICONS } from '../src/variants.js'

const ids = { sq: 'SQID', pp: 'PPID', vh: 'VHID' }
const numbers = { audio: 31, scenes: 32, timers: 33, clears: 34 }
const pages = buildNeoPages({ numbers, ids, tracks })
const at = (n, { row, col }) => pages[n].controls[row]?.[col]
const keyAt = (n, i) => at(n, NEO.keys[i])
const down = (c) => c.steps[0].action_sets.down
const text = (c) => c.style.layers.find((l) => l.id === 'text0').text
const icon = (c) => c.style.layers.find((l) => l.id === 'image0').base64Image.value
const bg = (c) => c.style.layers.find((l) => l.id === 'box0').color.value
const overridesOf = (c, id) => c.feedbacks.find((f) => f.id === id).styleOverrides

/** Companion expressions are JavaScript underneath; this evaluates the operators these use. */
function evaluate(expression, variables) {
	const js = expression
		.replace(/\$\(([a-z0-9]+):([a-z0-9_.]+)\)/gi, (_, conn, name) => JSON.stringify(variables[`${conn}:${name}`] ?? ''))
		.replaceAll('concat(', 'FN.concat(')
		.replaceAll('min(', 'FN.min(')
	const FN = { concat: (...a) => a.join(''), min: (...a) => Math.min(...a) }
	return new Function('FN', `return (${js})`)(FN)
}

describe('the Neo grid', () => {
	it('puts eight keys on rows 0-1, columns 0-3, and the strip controls on row 2', () => {
		expect(NEO.keys).toHaveLength(8)
		expect(NEO.keys.every(({ row, col }) => row <= 1 && col <= 3)).toBe(true)
		expect([NEO.touchLeft, NEO.lcd, NEO.touchRight]).toEqual([{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 3 }])
	})

	it('builds four named pages with nothing outside the Neo cells', () => {
		expect(Object.values(pages).map((p) => p.name)).toEqual(Object.values(PAGE_NAMES))
		for (const p of Object.values(pages)) {
			for (const [row, cols] of Object.entries(p.controls)) {
				for (const col of Object.keys(cols)) expect(Number(row) <= 2 && Number(col) <= 3 && !(row === '2' && col === '2')).toBe(true)
			}
		}
	})

	it('rounds every key and emboldens its caption, like the rest of the deck', () => {
		for (const p of Object.values(pages)) {
			for (const row of Object.values(p.controls)) {
				for (const c of Object.values(row)) {
					expect(c.style.layers.find((l) => l.id === 'box0').cornerRadius.value).toBe(25)
					expect(c.style.layers.find((l) => l.id === 'text0').weight.value).toBe('bold')
				}
			}
		}
	})

	it('only uses icons the library has', () => {
		const names = new Set(ICONS.map((i) => i.name))
		expect(iconsUsed(pages).filter((n) => !names.has(n))).toEqual([])
	})

	it('pages with the touch points, both ways', () => {
		const target = (n, cell) => down(at(n, cell))[0].options.page.value
		expect([target(31, NEO.touchLeft), target(31, NEO.touchRight)]).toEqual(['32', '32'])
		expect([target(32, NEO.touchLeft), target(32, NEO.touchRight)]).toEqual(['31', '31'])
		expect([target(33, NEO.touchLeft), target(33, NEO.touchRight)]).toEqual(['34', '34'])
		expect([target(34, NEO.touchLeft), target(34, NEO.touchRight)]).toEqual(['33', '33'])
	})

	it('refreshes the track readouts on the way into the audio page', () => {
		const paths = down(at(32, NEO.touchLeft)).slice(1).map((a) => a.options.path.value)
		expect(paths).toEqual(['state', 'volume', 'title'].map((verb) => `${tracks.SCRIPT_PATH} ${verb}`))
		expect(down(keyAt(32, 7))[0].options.page.value).toBe('31')
	})
})

describe('the audio page', () => {
	it('recalls TCB Sam as scene 81, the module taking the scene as numbered on the desk', () => {
		const a = down(keyAt(31, 0))[0]
		expect([a.definitionId, a.connectionId, a.options.scene.value]).toEqual(['scene_recall', 'SQID', 81])
		expect(TCB_SAM).toEqual({ number: 81, name: 'TCB Sam' })
		expect(keyAt(31, 0).feedbacks[0].options.expression.value).toBe('$(SQ:currentScene) == 81')
	})

	it('hot-mutes the vocal DCAs and FX-mutes the four FX returns', () => {
		const strips = (c, branch) => down(c)[0].children[branch].map((a) => [a.definitionId, a.options.strip.value, a.options.mute.value])
		expect(strips(keyAt(31, 1), 'else_actions')).toEqual(VOCAL_DCAS.map((s) => ['mute_dca', s, 1]))
		expect(strips(keyAt(31, 1), 'actions')).toEqual(VOCAL_DCAS.map((s) => ['mute_dca', s, 2]))
		expect(strips(keyAt(31, 2), 'else_actions')).toEqual(FX_RETURNS.map((s) => ['mute_fx_return', s, 1]))
		expect(down(keyAt(31, 2))[0].children.condition.map((f) => f.options.channel.value)).toEqual(FX_RETURNS)
	})

	it('goes red and says muted when the whole group is muted, amber when part is', () => {
		const hot = keyAt(31, 1)
		expect(hot.feedbacks.map((f) => [f.id, f.options.operation.value])).toEqual([['neo-hot-some', 'or'], ['neo-hot-all', 'and']])
		const all = overridesOf(hot, 'neo-hot-all')
		expect(all.find((o) => o.elementId === 'box0').override.value).toBe(MUTED)
		expect(all.find((o) => o.elementId === 'text0').override.value).toBe('Vox muted')
		expect(all.find((o) => o.elementId === 'image0').override.value).toBe('$(image:mic-muted-paper)')
		expect(text(hot).value).toBe('Vox live')
	})

	it('reuses the tracks keys as the PP1 page builds them, and adds volume steps', () => {
		expect(keyAt(31, 3).steps).toEqual(tracks.fadeKey().steps)
		expect(keyAt(31, 4).steps).toEqual(tracks.playPauseKey().steps)
		expect(keyAt(31, 5).steps).toEqual(tracks.skipKey().steps)
		expect(down(keyAt(31, 6))[0].options.path.value).toBe(`${tracks.SCRIPT_PATH} down`)
		expect(down(keyAt(31, 7))[0].options.path.value).toBe(`${tracks.SCRIPT_PATH} up`)
		expect(icon(keyAt(31, 7))).toBe('$(image:volume-up)')
	})

	it('shows the track on the info screen until a battery warning takes it over', () => {
		const lcd = at(31, NEO.lcd)
		expect(text(lcd).value).toContain('$(internal:custom_chrome_tracks_title)')
		expect(lcd.feedbacks.map((f) => f.id)).toEqual(['neo-audio-batt-low', 'neo-audio-batt-low-flash', 'neo-audio-batt-crit', 'neo-audio-batt-crit-flash'])
		expect(lcd.style.layers.find((l) => l.id === 'image0').width.value).toBeLessThan(30)
	})
})

describe('mic battery warnings', () => {
	const mic = (label, ch, bars, name = '') => ({ [`${label}:ch_${ch}_battery_bars`]: bars, [`${label}:ch_${ch}_name`]: name })
	const lcd = at(31, NEO.lcd)
	const fires = (id, vars) => evaluate(lcd.feedbacks.find((f) => f.id === id).options.expression.value, vars)

	it('stay quiet with every pack off, or never reported', () => {
		expect(fires('neo-audio-batt-low', mic('shure1', 1, 'Unknown'))).toBe(false)
		expect(fires('neo-audio-batt-low', {})).toBe(false)
	})

	it(`warn at ${BATTERY_LOW} bars and go critical at ${BATTERY_CRITICAL}`, () => {
		expect(fires('neo-audio-batt-low', mic('shure2', 3, '3'))).toBe(false)
		expect(fires('neo-audio-batt-low', mic('shure2', 3, '2'))).toBe(true)
		expect(fires('neo-audio-batt-crit', mic('shure2', 3, '2'))).toBe(false)
		expect(fires('neo-audio-batt-crit', mic('shure2', 3, '1'))).toBe(true)
	})

	it('flash only on the even second', () => {
		expect(fires('neo-audio-batt-crit-flash', { ...mic('shure1', 1, '0'), 'internal:time_s': 4 })).toBe(true)
		expect(fires('neo-audio-batt-crit-flash', { ...mic('shure1', 1, '0'), 'internal:time_s': 5 })).toBe(false)
	})

	it('name the mic: its receiver name, else the rack and channel', () => {
		expect(evaluate(lowMicExpr(2), { ...mic('shure1', 1, '4'), ...mic('shure2', 2, '1', 'Lead 2') })).toBe('Lead 2 1/5')
		expect(evaluate(lowMicExpr(2), mic('shure3', 2, '2'))).toBe('Lav 2 2/5')
		expect(evaluate(lowMicExpr(2), mic('shure3', 2, '5'))).toBe('')
	})

	it('take over the info screen with the battery icon and the mic', () => {
		const crit = overridesOf(lcd, 'neo-audio-batt-crit')
		expect(crit.find((o) => o.elementId === 'image0').override.value).toBe('$(image:battery-0-paper)')
		expect(evaluate(crit.find((o) => o.elementId === 'text0').override.value, mic('shure4', 1, '0', 'Host'))).toBe('Battery Host 0/5')
		expect(worstBattery()).toContain('shure4')
	})
})

describe('the scenes page', () => {
	it('recalls the current-patch scenes after TCB Sam, and none on the old patch', () => {
		const recalled = SCENES.map((_, i) => down(keyAt(32, i))[0].options.scene.value)
		expect(recalled).toEqual([82, 71, 79, 68, 69])
		expect(recalled).not.toContain(85)
		expect(recalled).not.toContain(300)
	})

	it('names the current scene, or numbers one it does not know', () => {
		expect(evaluate(sceneNameExpr(), { 'SQ:currentScene': 82 })).toBe('Devan')
		expect(evaluate(sceneNameExpr(), { 'SQ:currentScene': 3 })).toBe('Scene 3')
		expect(text(at(32, NEO.lcd)).isExpression).toBe(true)
		expect(evaluate(text(at(32, NEO.lcd)).value, { 'SQ:currentScene': 81, 'SQ:level_79.0': '-0.6' })).toBe('TCB Sam\nMain -0.6')
	})

	it('fills every key, keeping hot mute in reach from the scenes too', () => {
		expect(NEO.keys.every((_, i) => keyAt(32, i))).toBe(true)
		expect(keyAt(32, 5).steps).toEqual(keyAt(31, 1).steps)
	})

	it('reads Main LR, display only', () => {
		expect(text(keyAt(32, 6)).value).toBe('Main $(SQ:level_79.0)')
		expect(down(keyAt(32, 6))).toEqual([])
	})
})

describe('the timers page', () => {
	const main = (state, seconds, label = 'Speaker') => ({
		'propresenter:timer_8F66EEB482F24BFFA8A6DAC0B3EA7AAE_state': state,
		'propresenter:timer_8F66EEB482F24BFFA8A6DAC0B3EA7AAE_seconds': seconds,
		'internal:custom_pp1_main_label': label,
	})

	it('selects a preset without starting it, and names the shared clock', () => {
		const speaker = down(keyAt(33, 0))
		expect(speaker[0].options.timer_operation.value).toBe('set')
		expect(speaker[0].options.timer_duration.value).toBe('00:45:00')
		expect(speaker[0].options.timer_optional_operation.value).toBe('reset')
		expect(speaker[1].options.value.value).toBe('Speaker')
		expect(down(keyAt(33, 1))[0].options.timer_duration.value).toBe('00:07:00')
		const worship = down(keyAt(33, 4))
		expect(worship).toHaveLength(1)
		expect([worship[0].options.timer_id_dropdown.value, worship[0].options.timer_duration.value]).toEqual([CLOCKS.segment.uuid, '00:25:00'])
	})

	it('starts, stops and resets each clock', () => {
		expect(down(keyAt(33, 2))[0].options.timer_operation.value).toBe('toggle')
		expect(down(keyAt(33, 3))[0].options.timer_operation.value).toBe('reset')
		expect(down(keyAt(33, 5))[0].options.timer_id_dropdown.value).toBe(CLOCKS.segment.uuid)
		expect(down(keyAt(33, 6))[0].options.timer_operation.value).toBe('reset')
		expect(down(keyAt(33, 7))[0].options.timer_increment_value.value).toBe('60')
	})

	it('turns amber at halfway and red in the last five minutes of a long clock', () => {
		const p = phases('main')
		expect(evaluate(p.half, main('running', 1400))).toBe(false)
		expect(evaluate(p.half, main('running', 1350))).toBe(true)
		expect(evaluate(p.near, main('running', 301))).toBe(false)
		expect(evaluate(p.near, main('running', 300))).toBe(true)
		expect(evaluate(p.near, main('stopped', 100))).toBe(false)
		expect(evaluate(p.overran, main('overran', -20))).toBe(true)
	})

	it('scales the reminders to a short clock: Hosting halves at 3:30 and goes red at 1:00', () => {
		const p = phases('main')
		expect(evaluate(p.half, main('running', 210, 'Hosting'))).toBe(true)
		expect(evaluate(p.near, main('running', 61, 'Hosting'))).toBe(false)
		expect(evaluate(p.near, main('running', 60, 'Hosting'))).toBe(true)
		const seg = phases('segment')
		expect(evaluate(seg.half, { 'propresenter:timer_28FAF666E93E4396B6031F8B4330DAE5_state': 'running', 'propresenter:timer_28FAF666E93E4396B6031F8B4330DAE5_seconds': 750 })).toBe(true)
	})

	it('colours the start key and the info screen by phase, most urgent last', () => {
		const ids = keyAt(33, 2).feedbacks.map((f) => f.id)
		expect(ids.slice(0, 5)).toEqual(['running', 'half', 'near', 'near-flash', 'overran'].map((t) => `neo-run-main-${t}`))
		expect(overridesOf(keyAt(33, 2), 'neo-run-main-running')[0].override.value).toBe(GREEN)
		expect(overridesOf(keyAt(33, 2), 'neo-run-main-icon')[0].override.value).toBe('$(image:timer-stop-paper)')
		expect(at(33, NEO.lcd).feedbacks.map((f) => f.id).at(-1)).toBe('neo-lcd-main-overran')
		expect(text(at(33, NEO.lcd)).value).toBe('$(internal:custom_pp1_main_label) $(propresenter:timer_8F66EEB482F24BFFA8A6DAC0B3EA7AAE)\nWorship $(propresenter:timer_28FAF666E93E4396B6031F8B4330DAE5)')
	})
})

describe('the clears page', () => {
	it('clears audio, media and everything, in danger red', () => {
		const clear = (i) => down(keyAt(34, i))[0].options
		expect(clear(0).clear_layer_dropdown.value).toBe('audio')
		expect(clear(1).clear_layer_dropdown.value).toBe('media')
		expect(clear(2).clear_group_id_dropdown.value).toBe('27DDC76F-C385-4E1C-B85F-306238FD8268')
		expect([bg(keyAt(34, 0)), bg(keyAt(34, 2))]).toEqual([DANGER_REST, RED])
		expect(icon(keyAt(34, 1))).toBe('$(image:clear-media-paper)')
		expect(keyAt(34, 0).feedbacks[0].definitionId).toBe('Layer')
	})

	it('swaps the back wall between PP1 and PP1B with the Booth Routing routes', () => {
		const press = down(keyAt(34, 3))[0]
		expect(press.children.condition[0].options.expression.value).toBe('$(videohub:output_8_input) == "PP1"')
		const r = (a) => [a.connectionId, a.options.source.value, a.options.destination.value]
		expect(r(press.children.actions[0])).toEqual(['VHID', BACK_WALL.own, 8])
		expect(r(press.children.else_actions[0])).toEqual(['VHID', BACK_WALL.front, 8])
	})

	it('keeps Freeze, All Screens and both clocks', () => {
		expect(down(keyAt(34, 4))[0].options.macro_id_dropdown.value).toBe('3C693319-8EAC-4499-86C3-DE7A13FABCE9')
		expect(down(keyAt(34, 5))[0].options.macro_id_dropdown.value).toBe('26024D56-D05A-4E62-A0EC-C650B6E7BDD1')
		expect(down(keyAt(34, 7))[0].options.timer_operation.value).toBe('toggle')
	})
})

describe('building from a live export', () => {
	const instances = {
		SQID: { moduleId: 'allenheath-sq' },
		PPID: { moduleId: 'renewedvision-propresenter-api' },
		VHID: { moduleId: 'bmd-videohub' },
	}
	const rigPages = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { id: `p${i + 1}`, name: `P${i + 1}` }]))
	const library = ICONS.map((i) => ({ info: { name: i.name } }))

	it('finds the connections, or says which is missing', () => {
		expect(connectionIds({ instances })).toEqual(ids)
		expect(() => connectionIds({ instances: { SQID: instances.SQID } })).toThrow('renewedvision-propresenter-api')
	})

	it('numbers new pages after the last and keeps an existing page where it is', () => {
		expect(pageNumbers({ pages: rigPages(30) })).toEqual(numbers)
		const pages = { ...rigPages(31), 31: { name: 'Neo Scenes' } }
		expect(pageNumbers({ pages })).toEqual({ audio: 32, scenes: 31, timers: 33, clears: 34 })
	})

	it('refuses a rig whose pages have a gap, or whose library lacks an icon', () => {
		const gappy = rigPages(30)
		delete gappy[4]
		expect(() => buildConfig({ instances, pages: gappy, imageLibrary: library })).toThrow('not numbered')
		expect(() => buildConfig({ instances, pages: rigPages(30), imageLibrary: [] })).toThrow('import dist/library.companionconfig')
		expect(Object.keys(buildConfig({ instances, pages: rigPages(30), imageLibrary: library }).pages)).toEqual(['31', '32', '33', '34'])
	})
})
