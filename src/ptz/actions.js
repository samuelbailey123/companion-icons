/**
 * Action and feedback entities for the PTZ page.
 *
 * Everything the page does is built from these few factories, so the shape of a Companion
 * entity is written in exactly one place. The ids are deterministic — `${key}-${n}` — rather
 * than nanoids, so a rebuild is byte-identical and diffable against what the rig is running.
 *
 * WHAT THE MODULE SENDS, AND WHAT IT CANNOT. The rig drives the camera through Companion's
 * `ptzoptics-visca` module (4.0.0) over VISCA/TCP, and this camera — a FoMaKo, which speaks the
 * same PTZOptics-family dialect — answers every drive, zoom, focus, preset, exposure and
 * white-balance command the module defines. It does NOT answer the module's auto-tracking
 * bytes (`81 0A 11 54 0p FF` draws a syntax error, watched live on 2026-08-23), and the
 * module has no one-push focus, no backlight and no menu-on/off. Those go through the
 * module's `custom` action with the bytes from the camera's own VISCA list, read from its web
 * UI at `/img/Visca_Command_ListV1.0-2025.07.07.pdf`.
 *
 * CUSTOM VARIABLES ARE REFERRED TO AS `$(internal:custom_x)`. That is the form every other
 * page on this rig already uses, and it is what the live export carries, so it is the one
 * proven to resolve here.
 */

export const v = (value) => ({ value, isExpression: false })
export const expr = (value) => ({ value, isExpression: true })

/** `$(internal:custom_<name>)` — the rig's established way of reading a custom variable. */
export const cv = (name) => `$(internal:custom_${name})`

/** An expression reading one field of the poller's JSON: `jsonpath($(…ptz_state), '$.pan')`. */
export const field = (name) => `jsonpath(${cv('ptz_state')}, '$.${name}')`

/** Bare action entity. */
const action = (id, connectionId, definitionId, options = {}) => ({
	id,
	definitionId,
	connectionId,
	options,
	upgradeIndex: null,
	type: 'action',
})

/** One of the module's own actions. */
export const visca = (id, connectionId, definitionId, options = {}) => action(id, connectionId, definitionId, options)

/**
 * Raw VISCA bytes through the module's `custom` action.
 *
 * Parameters are optional: `params` is the module's semicolon-separated list of nibble
 * offsets and `values` the matching parameter texts (variables allowed). Left empty, the
 * bytes go exactly as written.
 */
export const raw = (id, connectionId, bytes, params = '', values = []) => {
	const options = { custom: v(bytes), command_parameters: v(params) }
	values.forEach((value, i) => {
		options[`parameter${i}`] = v(value)
	})
	return action(id, connectionId, 'custom', options)
}

/** `internal: wait`. Time is an expression-typed option in Companion 5, in milliseconds. */
export const wait = (id, ms) => action(id, 'internal', 'wait', { time: expr(String(ms)) })

/**
 * Set a custom variable.
 *
 * `value` is taken literally unless `isExpression` is set; `create` is on so a fresh rig
 * cannot drop the write because the variable is not defined yet.
 */
export const setVar = (id, name, value, isExpression = false) =>
	action(id, 'internal', 'custom_variable_set_value', {
		name: v(name),
		create: v(true),
		value: isExpression ? expr(value) : v(value),
	})

/**
 * A boolean feedback on an expression. Used both as the condition of a `logic_if` and as a
 * style feedback on a key, where `styleOverrides` carries what changes.
 */
export const when = (id, expression, styleOverrides = []) => ({
	id,
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	type: 'feedback',
	isInverted: v(false),
	styleOverrides,
	children: {},
})

/**
 * `internal: logic_if` — run `thenActions` when every condition is true, else `elseActions`.
 *
 * Companion 5 models this as an action with three child groups. The group ids are the
 * server's (`condition`, `actions`, `else_actions`), read from its `logic_if` definition.
 */
export const logicIf = (id, conditions, thenActions, elseActions = []) => ({
	...action(id, 'internal', 'logic_if', {}),
	children: { condition: conditions, actions: thenActions, else_actions: elseActions },
})

/**
 * `internal: exec` — run a shell command on the Companion host and keep stdout in a
 * custom variable. The variable must already exist: `exec` writes through `setValue`,
 * which, unlike the set-value action, has no create-if-missing.
 */
export const exec = (id, path, targetVariable, timeout = 4000) =>
	action(id, 'internal', 'exec', {
		path: v(path),
		cwd: v(''),
		timeout: v(timeout),
		targetVariable: v(targetVariable),
	})

/** A style override entry for a feedback. */
export const override = (overrideId, elementId, elementProperty, value) => ({
	overrideId,
	elementId,
	elementProperty,
	override: v(value),
})
