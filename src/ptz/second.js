/**
 * A second camera, from the same page code as the first.
 *
 * The rig gained a second PTZ on 2026-08-28. Both cameras are FoMaKo UV602s and the deck
 * should drive them identically, so the run and setup pages for camera two are built by the
 * SAME `buildPage`/`buildSetupPage` calls as camera one — only the connection id, the host and
 * the page numbers differ. Nothing about the layout is duplicated, which is what stops the two
 * pages drifting apart the first time one of them is edited.
 *
 * WHAT THIS FILE ADDS is the one thing the builders cannot express: the custom variables.
 * Their names are module-level constants in `variables.js` (`ptz_speed`, `ptz_state`, ...) and
 * they are baked into module-level helpers across five files, so parameterising them would mean
 * threading a name set through ~700 lines of otherwise-working code. Instead the built structure
 * is walked once and every reference to a `ptz_*` variable is rewritten to `ptz2_*`.
 *
 * That is only safe because the rename is closed and checkable: the variable set is exactly the
 * keys of `definitions()`, and Companion refers to a custom variable in exactly two syntactic
 * forms — `custom_<name>` inside an expression or caption, and the bare `<name>` in an action's
 * option field. `assertMirrored` then proves the two pages are the same page: it renames camera
 * two's structure BACK and requires it to equal camera one's, modulo the connection id, the host
 * and the page numbers. A layout difference cannot survive that check.
 *
 * The camera badge that used to live here is gone: the deck now chooses a camera from a page of
 * its own rather than swapping between two run pages, so there is nothing to label. See
 * `src/ptz/hub.js`.
 */

import { definitions } from './variables.js'

/** Camera two's variables are camera one's with this prefix. */
const PREFIX = 'ptz'
const PREFIX2 = 'ptz2'

/** Every custom variable the PTZ pages use, longest first so no name is a prefix of another. */
const NAMES = Object.keys(definitions()).sort((a, b) => b.length - a.length)

/** `ptz_speed` -> `ptz2_speed`. */
const second = (name) => `${PREFIX2}${name.slice(PREFIX.length)}`

/**
 * Rewrite every reference to a camera-one variable into its camera-two twin.
 *
 * Walks the whole structure and rewrites strings only. Two forms are recognised:
 *
 *   `$(internal:custom_ptz_speed)`  the `custom_` form, anywhere inside a longer string
 *   `ptz_speed`                     the bare form, only when it is the WHOLE string, which is
 *                                   how `custom_variable_set_value` and `exec` name their target
 *
 * A bare name is never rewritten mid-string: captions legitimately contain prose, and a
 * substring rewrite there would be a silent corruption rather than a visible one.
 *
 * @param {T} node
 * @returns {T} a new structure; the input is not modified
 * @template T
 */
export function renameVariables(node) {
	if (typeof node === 'string') {
		let out = node
		for (const name of NAMES) out = out.split(`custom_${name}`).join(`custom_${second(name)}`)
		return NAMES.includes(out) ? second(out) : out
	}
	if (Array.isArray(node)) return node.map(renameVariables)
	if (node && typeof node === 'object') {
		return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, renameVariables(v)]))
	}
	return node
}

/** The inverse, for the mirror check. */
export function renameVariablesBack(node) {
	if (typeof node === 'string') {
		let out = node
		for (const name of NAMES) out = out.split(`custom_${second(name)}`).join(`custom_${name}`)
		const back = NAMES.map(second)
		return back.includes(out) ? `${PREFIX}${out.slice(PREFIX2.length)}` : out
	}
	if (Array.isArray(node)) return node.map(renameVariablesBack)
	if (node && typeof node === 'object') {
		return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, renameVariablesBack(v)]))
	}
	return node
}

/** Camera two's variable definitions: camera one's, renamed, with the captions following. */
export function definitions2() {
	const out = {}
	for (const [name, def] of Object.entries(definitions())) {
		out[second(name)] = { ...def, description: def.description.replace(/\bPTZ\b/, 'PTZ 2') }
	}
	return out
}

/**
 * Prove camera two's page is camera one's page.
 *
 * Renames camera two's structure back to camera one's variables, swaps its connection id and
 * host for camera one's, and requires the result to be identical. Anything that differs is a
 * layout divergence and throws with the JSON path to it.
 *
 * Preset names are identity, not layout: each camera's shots have their own names, so the
 * captions they produce are normalised away exactly, name by name, before comparing.
 *
 * @throws if the two pages are not the same page
 */
export function assertMirrored(pageOne, pageTwo, { connOne, connTwo, hostOne, hostTwo, pagesOne, pagesTwo, namesOne, namesTwo, name }) {
	/*
	 * Page numbers are normalised through the `"page":{"value":"N"` form rather than by replacing
	 * the bare number, which would also hit coordinates, sizes and colours and turn a real
	 * difference into a false pass.
	 */
	const normalise = (page, conn, host, numbers, names) => {
		let s = JSON.stringify(page).split(conn).join('<CONN>').split(host).join('<HOST>')
		for (const [role, n] of Object.entries(numbers ?? {})) {
			s = s.split(`"page":{"value":"${n}"`).join(`"page":{"value":"<${role.toUpperCase()}>"`)
		}
		for (const [n, shot] of Object.entries(names ?? {})) {
			s = s.split(` (${shot})`).join(` (<PRESET ${n}>)`)
		}
		return s
	}

	const one = normalise(pageOne, connOne, hostOne, pagesOne, namesOne)
	const two = normalise(JSON.parse(JSON.stringify(renameVariablesBack(pageTwo))), connTwo, hostTwo, pagesTwo, namesTwo)

	if (one !== two) {
		let i = 0
		while (i < one.length && i < two.length && one[i] === two[i]) i++
		throw new Error(
			`${name}: camera two is not a mirror of camera one, first difference at ${i}:\n` +
				`  cam1: ...${one.slice(Math.max(0, i - 90), i + 90)}\n` +
				`  cam2: ...${two.slice(Math.max(0, i - 90), i + 90)}`
		)
	}
}
