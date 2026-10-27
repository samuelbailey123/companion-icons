import { describe, expect, it } from 'vitest'
import { describeEntity, describeEvent, hex, optionText, overrideText, visca } from '../src/manual/describe.js'
import { action, definitionsFixture, feedback } from './helpers/manual-export.js'

const ctx = { labels: { sw: 'atem', internal: 'internal' }, defs: definitionsFixture() }

describe('optionText', () => {
	it('shows expressions, booleans, colours, choices, lists and objects', () => {
		expect(optionText({ value: '$(a:b)', isExpression: true })).toBe('= $(a:b)')
		expect(optionText({ value: true })).toBe('yes')
		expect(optionText({ value: false })).toBe('no')
		expect(optionText({ value: 0xff00 }, { type: 'colorpicker' })).toBe('#00FF00')
		expect(optionText({ value: 1 }, { choices: [{ id: 1, label: 'Cam 1' }] })).toBe('Cam 1')
		expect(optionText({ value: 9 }, { choices: [{ id: 1, label: 'Cam 1' }] })).toBe('9')
		expect(optionText({ value: [1, 2] }, { choices: [{ id: 1, label: 'Cam 1' }] })).toBe('Cam 1, 2')
		expect(optionText({ value: { a: 1 } })).toBe('{"a":1}')
		expect(optionText({ value: null })).toBe('null')
		expect(optionText({ value: 'x' })).toBe('x')
		expect(hex(255)).toBe('#0000FF')
	})
})

describe('describeEntity', () => {
	it('uses the module definition for labels and choices, and skips static text', () => {
		const d = describeEntity(feedback('sw', 'program', { input: 1, extra: 'kept', blank: '' }), ctx)
		expect(d).toMatchObject({ who: 'atem', what: 'Program tally', options: [['Input', 'Cam 1'], ['extra', 'kept']] })
	})
	it('keeps action and feedback definitions apart', () => {
		expect(describeEntity(action('sw', 'program', { input: 1 }), ctx).what).toBe('program')
	})
	it('falls back to raw ids without definitions', () => {
		const d = describeEntity(action('zz', 'thing', { a: 1 }), { labels: {} })
		expect(d).toMatchObject({ who: 'zz', what: 'thing', options: [['a', '1']], children: [], overrides: [] })
	})
	it('names raw VISCA commands', () => {
		const d = describeEntity(action('cam', 'custom', { custom: '81 01 04 07 20 FF' }), ctx)
		expect(d.options[0]).toEqual(['custom', '81 01 04 07 20 FF (zoom in)'])
	})
	it('recurses into children and reports flags and style changes', () => {
		const ifThen = action('internal', 'logic_if', {}, {
			children: {
				condition: [feedback('internal', 'check_expression', { expression: '1 == 1' }, { isInverted: { value: true } })],
				actions: [action('sw', 'cut', { mixeffect: 1 }, { disabled: true })],
				else_actions: [],
			},
			styleOverrides: [{ elementId: 'text0', elementProperty: 'text', override: { value: 'LIVE' } }],
		})
		const d = describeEntity(ifThen, ctx)
		expect(d.children.map((c) => c.group)).toEqual(['condition', 'actions'])
		expect(d.children[0].items[0].inverted).toBe(true)
		expect(d.children[1].items[0]).toMatchObject({ what: 'Cut', disabled: true, options: [['M/E', 'M/E 1']] })
		expect(d.overrides).toEqual(['label LIVE'])
	})
	it('copes with an entity that has no options', () => {
		expect(describeEntity({ connectionId: 'sw', definitionId: 'auto' }, ctx).options).toEqual([])
	})
})

describe('overrideText', () => {
	it('names what a feedback changes', () => {
		expect(overrideText({ elementId: 'box0', elementProperty: 'color', override: { value: 0xb91c1c } })).toBe('colour #B91C1C')
		expect(overrideText({ elementId: 'text0', elementProperty: 'color', override: { value: 0xffffff } })).toBe('text colour #FFFFFF')
		expect(overrideText({ elementId: 'image0', elementProperty: 'base64Image', override: { value: '$(image:rec)' } })).toBe('icon rec')
		expect(overrideText({ elementId: 'box0', elementProperty: 'borderColor', override: { value: 0 } })).toBe('border #000000')
		expect(overrideText({ elementId: 'text0', elementProperty: 'text', override: { value: 'a', isExpression: true } })).toBe('label = a')
		expect(overrideText({ elementId: 'box0', elementProperty: 'opacity', override: { value: 50 } })).toBe('box0.opacity 50')
		expect(overrideText({ elementProperty: 'enabled' })).toBe('undefined.enabled undefined')
	})
})

describe('describeEvent', () => {
	it('says when a trigger fires', () => {
		expect(describeEvent({ type: 'interval', options: { seconds: 5 } })).toBe('Every 5 s')
		expect(describeEvent({ type: 'timeofday', options: { time: '10:00:00', days: [0, 6] } })).toBe('At 10:00:00 on Sun, Sat')
		expect(describeEvent({ type: 'timeofday', options: { time: '10:00:00' } })).toBe('At 10:00:00 on no day')
		expect(describeEvent({ type: 'variable_changed', options: { variableId: 'a:b' } })).toBe('When $(a:b) changes')
		expect(describeEvent({ type: 'startup', options: { delay: 500 } })).toBe('When Companion starts, after 500 ms')
		expect(describeEvent({ type: 'startup' })).toBe('When Companion starts')
		expect(describeEvent({ type: 'condition_true', enabled: false })).toBe('When the condition becomes true (disabled)')
		expect(describeEvent({ type: 'condition_false' })).toBe('When the condition becomes false')
		expect(describeEvent({ type: 'odd', options: { a: 1 } })).toBe('odd {"a":1}')
	})
})

describe('visca', () => {
	it('picks the longest matching prefix', () => {
		expect(visca('81 01 04 07 00 FF')).toBe('stop zoom')
		expect(visca('81 01 04 07 25 FF')).toBe('zoom in')
		expect(visca('81 01 06 01 00 00 03 01 FF')).toBe('tilt up')
		expect(visca('81 09 04 47 FF')).toBe('unnamed VISCA command')
	})
})
