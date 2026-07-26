import { describe, expect, it } from 'vitest'
import { isLabelValid, makeLabelSafe } from './helpers/labelsafe.js'

describe('makeLabelSafe', () => {
	it('leaves kebab-case names untouched', () => {
		for (const n of ['slide-next', 'battery-0', 'cam1-program', 'mute-on', 'house-lights-off']) {
			expect(makeLabelSafe(n)).toBe(n)
		}
	})

	it('rewrites characters we must therefore never use in a name', () => {
		expect(makeLabelSafe('slide next')).toBe('slide_next')
		expect(makeLabelSafe('cam.1')).toBe('cam_1')
		expect(makeLabelSafe('mic/mute')).toBe('mic_mute')
		expect(makeLabelSafe('rf+')).toBe('rf_')
	})

	it('trims surrounding whitespace before sanitising', () => {
		expect(makeLabelSafe('  power-on  ')).toBe('power-on')
	})
})

describe('isLabelValid', () => {
	it('rejects Companion reserved words', () => {
		for (const n of [
			'internal',
			'this',
			'local',
			'companion',
			'image',
			'custom',
			'expression',
			'page',
		]) {
			expect(isLabelValid(n), n).toBe(false)
		}
	})

	it('rejects reserved words regardless of case', () => {
		expect(isLabelValid('Image')).toBe(false)
		expect(isLabelValid('PAGE')).toBe(false)
	})

	it('rejects empty and non-string input', () => {
		expect(isLabelValid('')).toBe(false)
		expect(isLabelValid(null)).toBe(false)
		expect(isLabelValid(42)).toBe(false)
	})

	it('rejects a name that sanitisation would alter', () => {
		expect(isLabelValid('slide next')).toBe(false)
	})

	it('accepts our naming style', () => {
		for (const n of ['stage-display', 'battery-4', 'cam6-program', 'tx-fault']) {
			expect(isLabelValid(n), n).toBe(true)
		}
	})
})
