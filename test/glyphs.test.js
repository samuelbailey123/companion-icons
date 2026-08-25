import { describe, expect, it } from 'vitest'
import { COLLECTIONS, SHAPES } from '../src/glyphs/index.js'
import { VIEWBOX } from '../src/palette.js'

/** Extract every coordinate-ish number from a glyph element for bounds checking. */
function coords(p) {
	if (typeof p === 'string') return p.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
	if (p.d) return p.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
	return p.rect ?? p.circle ?? p.line ?? []
}

describe('glyph shapes', () => {
	it('every shape has between one and six elements', () => {
		for (const [name, shape] of Object.entries(SHAPES)) {
			expect(shape.paths.length, name).toBeGreaterThan(0)
			expect(shape.paths.length, name).toBeLessThanOrEqual(6)
		}
	})

	it('no element declares its own stroke width', () => {
		for (const [name, shape] of Object.entries(SHAPES)) {
			for (const p of shape.paths) {
				expect(JSON.stringify(p), name).not.toContain('stroke-width')
			}
		}
	})

	it('every coordinate stays within the viewBox', () => {
		for (const [name, shape] of Object.entries(SHAPES)) {
			for (const p of shape.paths) {
				for (const v of coords(p)) {
					expect(v, `${name}: ${v}`).toBeGreaterThanOrEqual(0)
					expect(v, `${name}: ${v}`).toBeLessThanOrEqual(VIEWBOX)
				}
			}
		}
	})

	it('exposes collections as Companion image-library folders', () => {
		expect(Object.keys(COLLECTIONS).sort()).toEqual([
			'audio',
			'camera',
			'folders',
			'power',
			'present',
			'routing',
			'system',
			'utility',
			'video',
			'wireless',
		])
	})

	it('includes every expected shape, and no unexpected ones', () => {
		const expected = [
			// power
			'power', 'projector', 'pa', 'amp', 'house-lights', 'standby', 'plug', 'bolt',
			// utility
			'page-up', 'page-down', 'home', 'back', 'macro', 'lock', 'blank', 'settings', 'alert',
			// video
			'camera', 'program', 'preview', 'cut', 'auto', 'ftb', 'dsk', 'key', 'aux', 'tally',
			'macro-run', 'macro-stop', 'transition', 'still', 'brightness',
			// routing
			'route', 'take', 'unlock', 'source', 'destination', 'matrix', 'route-locked',
			// present
			'slide-next', 'slide-prev', 'slide-first', 'slide-last', 'clear', 'clear-slide',
			'clear-props', 'clear-audio', 'logo', 'stage-display', 'message', 'timer-start',
			'timer-stop', 'timer-reset', 'media', 'prop', 'playlist',
			'focus-next', 'focus-prev',
			'green-wall', 'water-calm', 'water-storm', 'thunder',
			'clear-messages', 'clear-announce', 'clear-media', 'clear-video',
			'executor',
			// audio
			'speaker', 'mute', 'fader', 'mix', 'scene-recall', 'gain', 'aux-send', 'talkback',
			'pfl', 'phantom', 'meter', 'dca', 'mono', 'mains',
			// folders
			'folder-power', 'folder-present', 'folder-lighting', 'folder-video',
			'folder-audio', 'folder-routing', 'folder-system', 'folder-wireless',
			// system
			'cpu', 'thermometer', 'memory', 'disk', 'clock', 'network',
			// wireless
			'mic', 'mic-muted', 'tx-fault', 'battery', 'rf',
			// camera
			'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
			'arrow-up-left', 'arrow-up-right', 'arrow-down-left', 'arrow-down-right',
			'ptz', 'pan', 'tilt', 'stop', 'zoom-in', 'zoom-out', 'focus', 'focus-auto', 'speed',
			'preset', 'preset-save', 'tracking', 'exposure', 'backlight', 'menu', 'folder-ptz',
			'frame-close', 'frame-half', 'frame-full',
		]
		expect(Object.keys(SHAPES).sort()).toEqual([...expected].sort())
	})

	it('exposes level families as functions producing distinct geometry', () => {
		for (const name of ['battery', 'rf']) {
			expect(typeof SHAPES[name].levels, name).toBe('function')
			const low = JSON.stringify(SHAPES[name].levels(0))
			const high = JSON.stringify(SHAPES[name].levels(3))
			expect(low, name).not.toBe(high)
		}
	})

	it('level families grow monotonically with level', () => {
		for (const name of ['battery', 'rf']) {
			let previous = 0
			for (let n = 0; n <= 3; n++) {
				const count = SHAPES[name].levels(n).paths.length
				expect(count, `${name}-${n}`).toBeGreaterThan(previous - 1)
				previous = count
			}
		}
	})
})
