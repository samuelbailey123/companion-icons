/**
 * Picture and power keys: exposure, white balance, backlight, the on-screen menu, power.
 *
 * Each one branches on the state the poller last read from the camera (`$.ae`, `$.wb`,
 * `$.backlight`, `$.menu`, `$.power` in the JSON), so a press does the right thing even after
 * the setting was changed from the camera's own web page. The exposure cycle steps through the
 * values that matter in a sanctuary — full auto first, then the priorities, then manual — and
 * the caption always names the current one.
 *
 * Menu stays on the run page (it is the key that turns the arrows into menu navigation);
 * the rest live on the setup page. Auto — focus and exposure together — is the exception that
 * goes back to the run page, because it is the one picture change made in a hurry.
 */

import { cv, field, logicIf, raw, setVar, v, visca, wait, when, override } from './actions.js'
import { BG, key } from './controls.js'
import { wbCodeExpression } from './picture.js'
import * as V from './variables.js'

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

/**
 * White balance: Auto, or the temperature on the setup page's WB dial.
 *
 * This used to cycle Auto → Indoor 3000K → Outdoor 4000K → One-push, back when there was no
 * way to dial a temperature. Now there is (`picture.js`), two fixed presets next to a dial
 * that reaches both would only confuse, and one-push has its own key. So: a press takes the
 * camera off Auto onto the dial, and the next puts it back on Auto. The caption is what the
 * camera reports either way.
 */
export const whiteBalanceKey = (conn) => {
	const isAuto = `${field('wb')} == "Auto"`
	return key({
		style: { icon: 'white-balance', label: `concat('WB ', ${field('wb')})`, bg: BG.key, labelIsExpression: true },
		notes: 'Toggles white balance between Auto and the colour temperature on the WB dial. The caption is what the camera reports.',
		actionSets: {
			down: [
				logicIf(
					'wb-if-auto',
					[when('wb-c-auto', isAuto)],
					[
						setVar('wb-code', V.WB_CODE, wbCodeExpression(cv(V.WB_K)), true),
						raw('wb-dial', conn, '81 01 04 35 00 FF', '8,9', [cv(V.WB_CODE)]),
					],
					[visca('wb-auto', conn, 'wb', { val: v('automatic') })]
				),
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


/**
 * The two modes the Auto key drives, as the poller names them in the JSON. "Auto" is the
 * value each field reads when the camera has that mode.
 *
 * WHITE BALANCE IS DELIBERATELY NOT HERE. The operator excluded colour (2026-09-10): the
 * sanctuary's LED wall changes colour constantly and auto white balance drifts with it, so a
 * key that put it on auto in a hurry would trade an exposure problem for a colour one. White
 * balance stays whatever the setup page or the camera's web page set it to.
 */
export const AUTO_FIELDS = ['focus', 'ae']

/** Milliseconds between the two commands, so the camera's two-deep command queue never overflows. */
const AUTO_STEP_MS = 100

/**
 * Auto: focus and exposure, both automatic or both manual, on one key.
 *
 * WHY ONE KEY. The setup page steps exposure on its own and the run page toggles autofocus,
 * but the operator asked for one press that puts the camera on auto and one that takes it
 * back off (2026-09-10). Auto is the recovery move when the picture has gone wrong
 * mid-service and there is no time to work out which of the two did it; off is the return to
 * the locked service settings once it looks right again.
 *
 * WHAT "OFF" MEANS. Manual exposure runs the camera's stored shutter, iris and gain — the
 * reference block on the Pi (`ptz_reference_params.json`) is exactly that mode, with the
 * registers at 18, 12 and 0 — and manual focus keeps the focus where it is. Nothing is
 * left for the camera to decide, which is the only sense of "off" that matters for the
 * picture.
 *
 * THE KEY READS THE CAMERA. Green and ON while both fields the poller reads say Auto; amber
 * and PART while one does; plain and OFF while neither does. A press from anything but
 * all-on goes to all-on, so the key always ends in a known state whatever the AF key, the
 * setup page or the camera's web page did in the meantime.
 */
export const autoKey = (conn) => {
	const isAuto = AUTO_FIELDS.map((f) => `${field(f)} == "Auto"`)
	const allAuto = isAuto.join(' && ')
	const someAuto = `(${isAuto.join(' || ')}) && !(${allAuto})`
	return key({
		style: { icon: 'ptz-auto', label: 'Auto OFF', bg: BG.key },
		notes:
			'Toggles focus and exposure together between automatic and manual (the locked service ' +
			'settings). White balance is left alone. Green while both are auto, amber while only one ' +
			'is. Any press from a not-both-auto state goes to both auto.',
		feedbacks: [
			when('auto-part', someAuto, [
				override('auto-part-bg', 'box0', 'color', BG.notice),
				override('auto-part-text', 'text0', 'text', 'Auto PART'),
			]),
			when('auto-all', allAuto, [
				override('auto-all-bg', 'box0', 'color', BG.engaged),
				override('auto-all-icon', 'image0', 'base64Image', '$(image:ptz-auto-on)'),
				override('auto-all-text', 'text0', 'text', 'Auto ON'),
			]),
		],
		actionSets: {
			down: [
				logicIf(
					'auto-if',
					[when('auto-cond', allAuto)],
					[
						visca('auto-focus-manual', conn, 'focusM', { bol: v('1') }),
						wait('auto-wait-off', AUTO_STEP_MS),
						visca('auto-exp-manual', conn, 'expM', { val: v('1') }),
					],
					[
						visca('auto-focus-auto', conn, 'focusM', { bol: v('0') }),
						wait('auto-wait-on', AUTO_STEP_MS),
						visca('auto-exp-auto', conn, 'expM', { val: v('0') }),
					]
				),
			],
			up: [],
		},
	})
}
