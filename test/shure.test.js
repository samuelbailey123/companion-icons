import { describe, expect, it } from 'vitest'
import {
	OFF,
	RF_BANDS,
	RF_ICON_BANDS,
	battery,
	channelStrip,
	countOf,
	hasInterference,
	isLive,
	isMuted,
	isOn,
	rfBars,
	rfDbm,
	rfIconOverrides,
	worstOf,
	worstText,
} from '../src/shure.js'

const RACKS = [{ label: 'shure1' }, { label: 'shure2' }]
const CH = [1, 2]

/**
 * Evaluate a generated expression the way Companion would.
 *
 * Companion's engine is JavaScript underneath, so a JS evaluation with the same handful of
 * functions is a faithful stand-in for the operators these expressions actually use. The
 * point of these tests is the THREE-STATE problem: a reading is a number, or "Unknown", or
 * empty, and only the first may ever reach a comparison.
 */
function evaluate(expression, variables) {
	const js = expression
		.replace(/\$\(([a-z0-9]+):([a-z0-9_]+)\)/gi, (_, conn, name) => JSON.stringify(variables[`${conn}:${name}`] ?? ''))
		.replaceAll('concat(', 'FN.concat(')
		.replaceAll('min(', 'FN.min(')
		.replaceAll('isNumber(', 'FN.isNumber(')
		.replaceAll('replaceAll(', 'FN.replaceAll(')
	const FN = {
		concat: (...a) => a.join(''),
		min: (...a) => Math.min(...a),
		isNumber: (v) => (typeof v === 'string' ? v.trim() !== '' && !isNaN(Number(v)) : typeof v === 'number'),
		replaceAll: (v, find, to) => String(v).replaceAll(find, to),
	}
	return new Function('FN', `return (${js})`)(FN)
}

/** A channel with a transmitter on it. */
const live = (label, ch, over = {}) => ({
	[`${label}:ch_${ch}_battery_bars`]: '4',
	[`${label}:ch_${ch}_rf_level`]: '-48 dBm',
	[`${label}:ch_${ch}_audio_mute`]: 'OFF',
	[`${label}:ch_${ch}_interference_status`]: 'NONE',
	...Object.fromEntries(Object.entries(over).map(([k, v]) => [`${label}:ch_${ch}_${k}`, v])),
})

/** A channel whose transmitter is switched off, as the module reports it. */
const off = (label, ch) => ({
	[`${label}:ch_${ch}_battery_bars`]: 'Unknown',
	[`${label}:ch_${ch}_rf_level`]: '-128 dBm',
	[`${label}:ch_${ch}_audio_mute`]: 'OFF',
	[`${label}:ch_${ch}_interference_status`]: 'NONE',
})

/** A channel that has never reported at all — every field empty. */
const never = (label, ch) => ({
	[`${label}:ch_${ch}_battery_bars`]: '',
	[`${label}:ch_${ch}_rf_level`]: '',
	[`${label}:ch_${ch}_audio_mute`]: '',
	[`${label}:ch_${ch}_interference_status`]: '',
})

describe('liveness', () => {
	it('treats a reporting channel as live', () => {
		expect(evaluate(isLive('shure1', 1), live('shure1', 1))).toBe(true)
	})

	it('treats a powered-off transmitter as not live', () => {
		expect(evaluate(isLive('shure1', 1), off('shure1', 1))).toBe(false)
	})

	it('treats a channel that never reported as not live', () => {
		expect(evaluate(isLive('shure1', 1), never('shure1', 1))).toBe(false)
	})
})

describe('battery', () => {
	/*
	 * A live channel yields the variable as Companion holds it — a STRING. That is fine and
	 * deliberate: every consumer either feeds it to `min()`, which coerces, or concatenates it
	 * for display. What must never happen is a non-numeric string reaching either, which is
	 * what the OFF sentinel exists to prevent.
	 */
	it('reports the bar count for a live channel', () => {
		expect(Number(evaluate(battery('shure1', 1), live('shure1', 1, { battery_bars: '2' })))).toBe(2)
	})

	it('collapses a powered-off channel to the OFF sentinel', () => {
		expect(evaluate(battery('shure1', 1), off('shure1', 1))).toBe(OFF)
	})

	/* An empty string coerces to 0, which is the alarm value — the exact wrong answer. */
	it('does not read an empty channel as a flat battery', () => {
		expect(evaluate(battery('shure1', 1), never('shure1', 1))).toBe(OFF)
	})

	it('lets a genuinely flat battery through', () => {
		expect(Number(evaluate(battery('shure1', 1), live('shure1', 1, { battery_bars: '0' })))).toBe(0)
	})
})

describe('rf', () => {
	it('strips the unit suffix the module appends', () => {
		expect(evaluate(rfDbm('shure1', 1), live('shure1', 1))).toBe('-48')
	})

	it.each(RF_BANDS)('reports %i dBm as %i bars', (floor, bars) => {
		expect(evaluate(rfBars('shure1', 1), live('shure1', 1, { rf_level: `${floor} dBm` }))).toBe(bars)
	})

	it('reports below the weakest band as zero bars', () => {
		expect(evaluate(rfBars('shure1', 1), live('shure1', 1, { rf_level: '-95 dBm' }))).toBe(0)
	})

	/* A dead transmitter parks RF near -128, which would otherwise pin the page to red. */
	it('does not read a powered-off channel as zero bars', () => {
		expect(evaluate(rfBars('shure1', 1), off('shure1', 1))).toBe(OFF)
	})

	it('does not read a non-numeric level as zero bars', () => {
		expect(evaluate(rfBars('shure1', 1), live('shure1', 1, { rf_level: 'Unknown' }))).toBe(OFF)
	})
})

describe('per-channel flags', () => {
	it('counts a live muted channel', () => {
		expect(evaluate(isMuted('shure1', 1), live('shure1', 1, { audio_mute: 'ON' }))).toBe(1)
	})

	it('does not count an off channel as muted', () => {
		expect(evaluate(isMuted('shure1', 1), { ...off('shure1', 1), 'shure1:ch_1_audio_mute': 'ON' })).toBe(0)
	})

	it('counts interference only on a live channel', () => {
		expect(evaluate(hasInterference('shure1', 1), live('shure1', 1, { interference_status: 'DETECTED' }))).toBe(1)
		expect(
			evaluate(hasInterference('shure1', 1), { ...off('shure1', 1), 'shure1:ch_1_interference_status': 'DETECTED' })
		).toBe(0)
	})

	it('counts a live channel as on', () => {
		expect(evaluate(isOn('shure1', 1), live('shure1', 1))).toBe(1)
		expect(evaluate(isOn('shure1', 1), off('shure1', 1))).toBe(0)
	})
})

describe('aggregates', () => {
	const scenario = {
		...live('shure1', 1, { battery_bars: '4', rf_level: '-48 dBm' }),
		...live('shure1', 2, { battery_bars: '1', rf_level: '-85 dBm', audio_mute: 'ON' }),
		...off('shure2', 1),
		...never('shure2', 2),
	}

	it('takes the worst battery across every rack', () => {
		expect(evaluate(worstOf(battery, RACKS, CH), scenario)).toBe(1)
	})

	/* -85 dBm sits below the -83 floor for two bars, so the weak channel reports one. */
	it('takes the worst rf across every rack', () => {
		expect(evaluate(worstOf(rfBars, RACKS, CH), scenario)).toBe(1)
	})

	it('ignores idle racks entirely when everything is off', () => {
		const idle = { ...off('shure1', 1), ...off('shure1', 2), ...off('shure2', 1), ...never('shure2', 2) }
		expect(evaluate(worstOf(battery, RACKS, CH), idle)).toBe(OFF)
		expect(evaluate(worstOf(rfBars, RACKS, CH), idle)).toBe(OFF)
	})

	it('counts muted and on-air channels', () => {
		expect(evaluate(countOf(isMuted, RACKS, CH), scenario)).toBe(1)
		expect(evaluate(countOf(isOn, RACKS, CH), scenario)).toBe(2)
	})
})

describe('display text', () => {
	it('shows a dash when nothing is transmitting', () => {
		expect(evaluate(worstText(String(OFF)), {})).toBe('—')
	})

	it('shows the reading out of five when something is', () => {
		expect(evaluate(worstText('3'), {})).toBe('3/5')
	})

	it('honours a different maximum', () => {
		expect(evaluate(worstText('2', 4), {})).toBe('2/4')
	})

	it('lists every channel in a rack, dashing the idle ones', () => {
		const vars = { ...live('shure1', 1, { battery_bars: '4' }), ...off('shure1', 2) }
		expect(evaluate(channelStrip('shure1', CH), vars)).toBe('4 · —')
	})
})

describe('rf icon overrides', () => {
	it('emits one override per band, weakest first so the strongest wins', () => {
		const overrides = rfIconOverrides('W')
		expect(overrides.map((o) => o.image)).toEqual(RF_ICON_BANDS.map(([, image]) => image))
	})

	it.each([
		[5, 'rf-3'],
		[4, 'rf-3'],
		[3, 'rf-2'],
		[2, 'rf-1'],
		[1, 'rf-0'],
		[0, 'rf-0'],
	])('shows %s bars as %s', (bars, expected) => {
		const winner = rfIconOverrides(String(bars)).filter((o) => evaluate(o.expression, {})).at(-1)
		expect(winner.image).toBe(expected)
	})

	/*
	 * The whole point of the neutral base image. OFF is numerically above every band, so
	 * without the explicit exclusion an idle rig would show a full-strength antenna; with a
	 * red `rf-0` base and no zero-bar override it would show a fault instead. Neither is true.
	 */
	it('leaves the neutral base icon in place when nothing is transmitting', () => {
		expect(rfIconOverrides(String(OFF)).filter((o) => evaluate(o.expression, {}))).toHaveLength(0)
	})
})
