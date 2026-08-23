/**
 * Picture and power keys: exposure, white balance, backlight, the on-screen menu, power.
 *
 * Each one branches on the state the poller last read from the camera (`$.ae`, `$.wb`,
 * `$.backlight`, `$.menu`, `$.power` in the JSON), so a press does the right thing even after
 * the setting was changed from the camera's own web page. The cycles step through the values
 * that matter in a sanctuary — full auto first, then the priorities, then manual — and the
 * caption always names the current one.
 *
 * Menu stays on the run page (it is the key that turns the arrows into menu navigation);
 * the rest live on the setup page.
 */

import { field, logicIf, raw, visca, wait, when, override } from './actions.js'
import { BG, key } from './controls.js'

const menuOpen = (id) => when(id, `${field('menu')} == "On"`)

export const menuKey = (conn) =>
	key({
		style: { icon: 'menu', label: 'Menu', bg: BG.key },
		notes: 'Opens or closes the camera on-screen menu. While open, the arrows navigate (right enters, left backs out) and STOP closes it.',
		feedbacks: [
			when('menu-open', `${field('menu')} == "On"`, [
				override('menu-open-bg', 'box0', 'color', BG.notice),
				override('menu-open-text', 'text0', 'text', 'Menu OPEN'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'menu-if',
					[menuOpen('menu-cond')],
					[raw('menu-close', conn, '81 01 06 06 03 FF')],
					[raw('menu-open-cmd', conn, '81 01 06 06 02 FF')]
				),
			],
			up: [],
		},
	})

/** Cycle Auto → Shutter priority → Iris priority → Manual → Auto. */
export const exposureKey = (conn) => {
	const mode = (id, val) => visca(id, conn, 'expM', { val: { value: val, isExpression: false } })
	const is = (id, s) => when(id, `${field('ae')} == "${s}"`)
	return key({
		style: { icon: 'exposure', label: `concat('Exp ', ${field('ae')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Steps the exposure mode: Auto, Shutter priority, Iris priority, Manual, then back to Auto.',
		actionSets: {
			down: [
				logicIf('exp-if-auto', [is('exp-c-auto', 'Auto')], [mode('exp-shutter', '2')], [
					logicIf('exp-if-shutter', [is('exp-c-shutter', 'Shutter')], [mode('exp-iris', '3')], [
						logicIf('exp-if-iris', [is('exp-c-iris', 'Iris')], [mode('exp-manual', '1')], [mode('exp-auto', '0')]),
					]),
				]),
			],
			up: [],
		},
	})
}

/** Cycle Auto → Indoor (3000K) → Outdoor (4000K) → One push → Auto. */
export const whiteBalanceKey = (conn) => {
	const mode = (id, val) => visca(id, conn, 'wb', { val: { value: val, isExpression: false } })
	const is = (id, s) => when(id, `${field('wb')} == "${s}"`)
	return key({
		style: { icon: 'white-balance', label: `concat('WB ', ${field('wb')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Steps white balance: Auto, Indoor 3000K, Outdoor 4000K, One-push (measures now), then Auto.',
		actionSets: {
			down: [
				logicIf('wb-if-auto', [is('wb-c-auto', 'Auto')], [mode('wb-indoor', 'indoor')], [
					logicIf('wb-if-indoor', [is('wb-c-indoor', '3000K')], [mode('wb-outdoor', 'outdoor')], [
						logicIf(
							'wb-if-outdoor',
							[is('wb-c-outdoor', '4000K')],
							[mode('wb-onepush', 'onepush'), wait('wb-onepush-wait', 300), visca('wb-trigger', conn, 'wbOPT')],
							[mode('wb-auto', 'automatic')]
						),
					]),
				]),
			],
			up: [],
		},
	})
}

export const backlightKey = (conn) =>
	key({
		style: { icon: 'backlight', label: `concat('BLC ', ${field('backlight')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Toggles backlight compensation. Green while on.',
		feedbacks: [
			when('blc-on', `${field('backlight')} == "On"`, [
				override('blc-on-bg', 'box0', 'color', BG.engaged),
				override('blc-on-icon', 'image0', 'base64Image', '$(image:backlight-on)'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'blc-if',
					[when('blc-cond', `${field('backlight')} == "On"`)],
					[raw('blc-off', conn, '81 01 04 33 03 FF')],
					[raw('blc-on-cmd', conn, '81 01 04 33 02 FF')]
				),
			],
			up: [],
		},
	})

export const powerKey = (conn) =>
	key({
		style: { icon: 'ptz-power', label: `concat('Power ', ${field('power')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Toggles the camera between on and standby. Amber with a red glyph while in standby.',
		feedbacks: [
			when('power-standby', `${field('power')} == "Standby"`, [
				override('power-standby-bg', 'box0', 'color', BG.notice),
				override('power-standby-icon', 'image0', 'base64Image', '$(image:ptz-standby)'),
				override('power-standby-text', 'text0', 'text', 'STANDBY'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'power-if',
					[when('power-cond', `${field('power')} == "On"`)],
					[visca('power-off', conn, 'power', { bool: { value: 'off', isExpression: false } })],
					[visca('power-on', conn, 'power', { bool: { value: 'on', isExpression: false } })]
				),
			],
			up: [],
		},
	})

