import { describe, expect, it } from 'vitest'
import { ARMED_SECONDS, CONFIRM_CELL, FILESYSTEM, FORMAT_CELL, addKeys, buildKeys } from '../src/hyperdeck-format.js'

const HD = 'hd-connection'
const v = (value) => ({ value, isExpression: false })

const recordKey = () => ({
	type: 'button-layered',
	style: {
		layers: [
			{ id: 'canvas', type: 'canvas' },
			{ id: 'box0', type: 'box', color: v(1), cornerRadius: v(25) },
			{ id: 'image0', type: 'image', base64Image: v('$(image:still)') },
			{ id: 'text0', type: 'text', text: v('Record'), width: v(64), halign: v('left'), weight: v('bold') },
			{ id: 'text1', type: 'text', text: v('x'), weight: v('normal') },
		],
	},
	options: { stepProgression: 'auto', notes: 'record' },
	feedbacks: [{ id: 'old' }],
	steps: { 0: { action_sets: { down: [{ definitionId: 'recordStopToggle', connectionId: HD, upgradeIndex: 7 }], up: [] }, options: { runWhileHeld: [] } } },
})

const rig = (system = {}) => ({
	instances: { [HD]: { moduleId: 'bmd-hyperdeck' }, other: { moduleId: 'bmd-atem' } },
	pages: {
		1: { name: 'Home', controls: { 2: { 3: recordKey() } } },
		8: { name: 'System', controls: { 1: { 0: { type: 'button-layered', options: {} } }, ...system } },
	},
})

const text = (key, id) => key.style.layers.find((l) => l.id === id).text
const guard = (key) => key.steps[0].action_sets.down[0]

describe('the keys', () => {
	const { format, confirm } = buildKeys(rig())

	it('sit apart, so one finger cannot reach both', () => {
		expect(FORMAT_CELL.row).toBe(CONFIRM_CELL.row)
		expect(Math.abs(FORMAT_CELL.column - CONFIRM_CELL.column)).toBeGreaterThan(1)
	})

	it('Format card only prepares, as exFAT, with the deck’s own short window', () => {
		const [action] = guard(format).children.actions
		expect(action).toMatchObject({
			definitionId: 'formatPrepare',
			connectionId: HD,
			upgradeIndex: 7,
			options: { filesystem: v(FILESYSTEM), timeout: v(ARMED_SECONDS) },
		})
		expect(FILESYSTEM).toBe('exFAT')
		expect(ARMED_SECONDS).toBeLessThanOrEqual(10)
		expect(JSON.stringify(format.steps)).not.toContain('formatConfirm')
	})

	it('Confirm is the only key that formats', () => {
		expect(guard(confirm).children.actions).toHaveLength(1)
		expect(guard(confirm).children.actions[0]).toMatchObject({ definitionId: 'formatConfirm', connectionId: HD })
	})

	it.each([
		['Format card', 'format'],
		['Confirm', 'confirm'],
	])('%s is refused while recording, with nothing else to do', (_name, which) => {
		const key = which === 'format' ? format : confirm
		expect(key.steps[0].action_sets.down).toHaveLength(1)
		expect(key.steps[0].action_sets.up).toEqual([])
		expect(guard(key)).toMatchObject({ definitionId: 'logic_if', connectionId: 'internal' })
		const [condition] = guard(key).children.condition
		expect(condition.options.expression).toEqual({ value: '$(hyperdeck:status) != "Record"', isExpression: true })
		expect(condition.isInverted.value).toBe(false)
		expect(guard(key).children.else_actions).toEqual([])
	})

	it('Confirm stays dark and quiet until the deck is ready, then says what will go', () => {
		expect(text(confirm, 'text0')).toEqual(v('Confirm'))
		const ready = confirm.feedbacks[0]
		expect(ready).toMatchObject({ definitionId: 'format_ready', connectionId: HD })
		const by = Object.fromEntries(ready.styleOverrides.map((o) => [`${o.elementId}.${o.elementProperty}`, o.override]))
		expect(by['box0.color'].value).toBe(0xb91c1c)
		expect(by['text0.text']).toEqual(v('ERASE'))
		expect(by['text1.text'].value).toContain('$(hyperdeck:clipCount)')
		expect(confirm.style.layers.find((l) => l.id === 'box0').color.value).not.toBe(0xb91c1c)
	})

	it('Format card says how many clips there are, or that there is no card, or that it is recording', () => {
		expect(text(format, 'text0')).toEqual(v('Format card'))
		expect(text(format, 'text1').isExpression).toBe(true)
		expect(text(format, 'text1').value).toContain('NO CARD')
		expect(text(format, 'text1').value).toContain('$(hyperdeck:clipCount)')
		const recording = format.feedbacks.find((f) => f.options.expression.value.includes('"Record"'))
		expect(recording.styleOverrides[0].override).toEqual(v('RECORDING'))
	})

	it('keep the rig’s look, lose the Record key’s icon and actions, and leave the Record key alone', () => {
		const full = rig()
		const { format: key } = buildKeys(full)
		expect(key.style.layers.map((l) => l.id)).toEqual(['canvas', 'box0', 'text0', 'text1'])
		expect(key.style.layers.find((l) => l.id === 'box0').cornerRadius).toEqual(v(25))
		expect(key.style.layers.find((l) => l.id === 'text0').weight).toEqual(v('bold'))
		expect(JSON.stringify(key)).not.toContain('recordStopToggle')
		expect(key.options.notes).toContain('hyperdeck-format:')
		expect(key.options.stepProgression).toBe('auto')
		expect(full.pages[1].controls[2][3]).toEqual(recordKey())
	})

	it('take upgradeIndex -1 when the Record key has none', () => {
		const full = rig()
		delete full.pages[1].controls[2][3].steps[0].action_sets.down[0].upgradeIndex
		expect(guard(buildKeys(full).format).children.actions[0].upgradeIndex).toBe(-1)
	})

	it('refuse to build without a Record key or a HyperDeck', () => {
		const noKey = rig()
		noKey.pages[1].controls = {}
		expect(() => buildKeys(noKey)).toThrow('no Record key')
		const noDeck = rig()
		noDeck.instances = { other: { moduleId: 'bmd-atem' } }
		expect(() => buildKeys(noDeck)).toThrow('no HyperDeck')
	})

	it('cope with pages that have no controls or no steps while looking', () => {
		const full = rig()
		full.pages[0] = { name: 'Empty' }
		full.pages[2] = { name: 'Plain', controls: { 0: { 0: {} } } }
		expect(buildKeys(full).format).toBeDefined()
	})
})

describe('addKeys', () => {
	it('puts both on the System page and touches nothing else there', () => {
		const full = rig()
		const { number, page } = addKeys(full)
		expect(number).toBe('8')
		expect(page.controls[FORMAT_CELL.row][FORMAT_CELL.column].options.notes).toContain('asks the HyperDeck')
		expect(page.controls[CONFIRM_CELL.row][CONFIRM_CELL.column].options.notes).toContain('ERASES THE CARD')
		expect(page.controls[1]).toEqual(full.pages[8].controls[1])
		expect(full.pages[8].controls[3]).toBeUndefined()
	})

	it('adds to a row that is already there', () => {
		const { page } = addKeys(rig({ 3: { 0: { type: 'button-layered', options: {} } } }))
		expect(Object.keys(page.controls[3]).sort()).toEqual(['0', '6', '8'])
	})

	it('can be run again over its own keys', () => {
		const full = rig()
		full.pages[8] = addKeys(full).page
		expect(addKeys(full).page.controls[3][8].options.notes).toContain('ERASES THE CARD')
	})

	it('refuses a cell something else is using, and a rig with no System page', () => {
		expect(() => addKeys(rig({ 3: { 6: { type: 'button-layered', options: { notes: 'mine' } } } }))).toThrow('row 3 column 6 is taken')
		expect(() => addKeys(rig({ 3: { 8: { type: 'button-layered' } } }))).toThrow('row 3 column 8 is taken')
		const full = rig()
		delete full.pages[8]
		expect(() => addKeys(full)).toThrow('no System page')
	})
})
