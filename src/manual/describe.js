/**
 * Plain-language descriptions of what a key, a trigger or a feedback does, read from the
 * export and named with the modules' own labels. The definitions are what Companion's UI
 * shows ("Set input on Program", "Input": "PP1"), so the manual reads the way the editor
 * does rather than as raw ids. Without a definition the raw id is shown, never guessed at.
 *
 * Companion's own building blocks, which make up most of this rig (go to a page, run a script
 * on the Pi, set a variable, check a value), are said in plain words instead.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const OPS = { eq: '=', ne: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤', regex: 'matches', contains: 'contains' }

export const hex = (n) => `#${(Number(n) & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`

/** One option's value as text, using the definition's choice labels where it has them. */
export function optionText(opt, def) {
	if (opt.isExpression) return `= ${opt.value}`
	const v = opt.value
	if (typeof v === 'boolean') return v ? 'yes' : 'no'
	if (def?.type === 'colorpicker' && typeof v === 'number') return hex(v)
	const choice = (id) => def?.choices?.find((c) => String(c.id) === String(id))?.label ?? String(id)
	if (Array.isArray(v)) return v.map(choice).join(', ')
	if (v !== null && typeof v === 'object') return JSON.stringify(v)
	return choice(v)
}

const blank = (opt) => !opt || (!opt.isExpression && (opt.value === undefined || opt.value === null || opt.value === ''))

/** A value reads as code when it is an expression, a command, or carries a variable. */
export const looksLikeCode = (s) => /^= |\$\(|\/|[{}]/.test(s) || s.length > 48

const raw = (e, id) => e.options?.[id]
const val = (e, id) => raw(e, id)?.value

/** Companion's own actions and checks, in words. Returns undefined for anything else. */
function plain(e, ctx) {
	if (e.connectionId !== 'internal') return undefined
	switch (e.definitionId) {
		case 'set_page': {
			const page = val(e, 'page')
			const name = ctx.pageNames?.[page]
			return { what: `Go to page ${page}${name ? ` · ${name}` : ''}`, options: [] }
		}
		case 'exec': {
			const target = val(e, 'targetVariable')
			return {
				what: target ? `Run on the Pi, result into $(custom:${target})` : 'Run on the Pi',
				options: [['', String(val(e, 'path') ?? '')]],
			}
		}
		case 'custom_variable_set_value':
			return { what: `Set $(custom:${val(e, 'name')})`, options: [['to', optionText(raw(e, 'value') ?? { value: '' })]] }
		case 'variable_value':
			return { what: `$(${val(e, 'variable')}) ${OPS[val(e, 'op')] ?? val(e, 'op')} "${val(e, 'value')}"`, options: [] }
		case 'check_expression':
			return { what: 'This is true', options: [['', String(val(e, 'expression') ?? '')]] }
		case 'logic_operator':
			return { what: val(e, 'operation') === 'or' ? 'Any of these' : 'All of these', options: [] }
		case 'logic_if':
			return { what: 'If', options: [] }
		case 'wait':
			return { what: `Wait ${val(e, 'time')} ms`, options: [] }
		default:
			return undefined
	}
}

const GROUPS = { condition: 'if', actions: 'then', else_actions: 'else', default: '' }

/**
 * An action, feedback or condition as { who, what, options, children, ... }. `who` is the
 * connection's label, `what` what it does, `options` [label, text] pairs in the order the
 * editor lists them.
 */
export function describeEntity(entity, ctx = {}) {
	const def = ctx.defs?.[entity.connectionId]?.[entity.definitionId]
	const said = plain(entity, ctx)
	let options = said?.options
	if (!options) {
		const optDefs = (def?.options ?? []).filter((o) => o.type !== 'static-text')
		const extra = Object.keys(entity.options ?? {}).filter((id) => !optDefs.some((o) => o.id === id))
		options = [...optDefs.map((o) => o.id), ...extra]
			.filter((id) => !blank(entity.options?.[id]))
			.map((id) => {
				const od = optDefs.find((o) => o.id === id)
				return [od?.label ?? id, optionText(entity.options[id], od)]
			})
	}
	const children = Object.entries(entity.children ?? {})
		.filter(([, list]) => list?.length)
		.map(([group, list]) => ({ group: GROUPS[group] ?? group, items: list.map((e) => describeEntity(e, ctx)) }))
	return {
		who: ctx.labels?.[entity.connectionId] ?? entity.connectionId,
		what: said?.what ?? def?.label ?? entity.definitionId,
		options,
		children,
		inverted: entity.isInverted?.value === true,
		disabled: entity.disabled === true,
		overrides: (entity.styleOverrides ?? []).map(override),
	}
}

const PROPS = { color: 'colour', borderColor: 'border', base64Image: 'icon', text: 'label' }

/** What a feedback changes on the key, as { name, value, colour? }: `colour #15803D`, `label On air`, `icon record`. */
export function override(o) {
	const v = o.override ?? {}
	const textLayer = /^(text|port|name|feed)/.test(o.elementId ?? '')
	const name = o.elementProperty === 'color' && textLayer ? 'text colour' : (PROPS[o.elementProperty] ?? `${o.elementId}.${o.elementProperty}`)
	if (v.isExpression) return { name, value: `= ${v.value}` }
	if (typeof v.value === 'number' && /color/i.test(o.elementProperty)) return { name, value: hex(v.value), colour: hex(v.value) }
	if (typeof v.value === 'string') return { name, value: v.value.replace(/^\$\(image:([^)]+)\)$/, '$1') }
	return { name, value: JSON.stringify(v.value) }
}

/** A trigger event in a sentence. */
export function describeEvent(ev) {
	const o = ev.options ?? {}
	const off = ev.enabled === false ? ' (disabled)' : ''
	switch (ev.type) {
		case 'interval':
			return `Every ${o.seconds} s${off}`
		case 'timeofday':
			return `At ${o.time} on ${(o.days ?? []).map((d) => DAYS[d]).join(', ') || 'no day'}${off}`
		case 'variable_changed':
			return `When $(${o.variableId}) changes${off}`
		case 'startup':
			return `When Companion starts${o.delay ? `, after ${o.delay} ms` : ''}${off}`
		case 'condition_true':
			return `When the condition becomes true${off}`
		case 'condition_false':
			return `When the condition becomes false${off}`
		default:
			return `${ev.type} ${JSON.stringify(o)}${off}`
	}
}

/** An entity tree flattened to indented lines of text. */
export function entityLines(d, depth = 0) {
	const pad = '  '.repeat(depth)
	const opts = d.options.length ? `: ${d.options.map(([k, v]) => (k ? `${k} ${v}` : v)).join('; ')}` : ''
	const flags = `${d.inverted ? ' (inverted)' : ''}${d.disabled ? ' (disabled)' : ''}`
	const lines = [`${pad}${d.who} · ${d.what}${opts}${flags}`]
	if (d.overrides.length) lines.push(`${pad}  → ${d.overrides.map((o) => `${o.name} ${o.value}`).join(', ')}`)
	for (const c of d.children) {
		if (c.group) lines.push(`${pad}  ${c.group}:`)
		for (const item of c.items) lines.push(...entityLines(item, depth + 2))
	}
	return lines
}
