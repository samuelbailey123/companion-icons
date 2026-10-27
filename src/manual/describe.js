/**
 * Plain-language descriptions of what a key, a trigger or a feedback does, read from the
 * export and named with the modules' own labels. The definitions are what Companion's UI
 * shows ("Set input on Program", "Input": "PP1"), so the manual reads the way the editor
 * does rather than as raw ids. Without a definition the raw id is shown, never guessed at.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** VISCA commands the PTZ builders send, by byte prefix, as src/ptz/*.js names them. */
export const VISCA = [
	['81 01 04 07 2', 'zoom in'],
	['81 01 04 07 3', 'zoom out'],
	['81 01 04 07 00', 'stop zoom'],
	['81 01 04 08 2', 'focus far'],
	['81 01 04 08 3', 'focus near'],
	['81 01 04 08 00', 'stop focus'],
	['81 01 04 38 04', 'one-push autofocus'],
	['81 01 06 01 00 00 03 01', 'tilt up'],
	['81 01 06 01 00 00 03 02', 'tilt down'],
	['81 01 06 01 00 00 01 03', 'pan left'],
	['81 01 06 01 00 00 02 03', 'pan right'],
	['81 01 06 06 02', 'open the camera menu'],
	['81 01 06 06 03', 'close the camera menu'],
	['81 01 04 35', 'white balance mode'],
	['81 01 04 33 02', 'backlight compensation on'],
	['81 01 04 33 03', 'backlight compensation off'],
	['81 01 04 3E 02', 'exposure compensation on'],
	['81 01 04 3E 03', 'exposure compensation off'],
	['81 01 04 0A 02', 'shutter faster'],
	['81 01 04 0A 03', 'shutter slower'],
	['81 01 04 0B 02', 'iris open'],
	['81 01 04 0B 03', 'iris close'],
	['81 01 04 0E 02', 'exposure compensation up'],
	['81 01 04 0E 03', 'exposure compensation down'],
	['81 01 04 02 02', 'sharpness up'],
	['81 01 04 02 03', 'sharpness down'],
	['81 01 04 4A', 'set shutter'],
	['81 01 04 4C', 'set gain'],
	['81 01 04 4E', 'set exposure compensation'],
	['81 01 04 42', 'set sharpness'],
	['81 01 04 51', 'set WDR level'],
	['81 01 04 54', 'set noise reduction level'],
]

/** What a raw VISCA command does; the longest matching prefix wins. */
export function visca(bytes) {
	const hit = VISCA.filter(([prefix]) => bytes.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0]
	return hit ? hit[1] : 'unnamed VISCA command'
}

export const hex = (n) => `#${Number(n).toString(16).padStart(6, '0').toUpperCase()}`

/** One option's value as text, using the definition's choice labels where it has them. */
export function optionText(opt, def) {
	if (opt.isExpression) return `= ${opt.value}`
	const v = opt.value
	if (typeof v === 'boolean') return v ? 'yes' : 'no'
	if (def?.type === 'colorpicker' && typeof v === 'number') return hex(v)
	const choice = (id) => def?.choices?.find((c) => String(c.id) === String(id))?.label ?? String(id)
	if (Array.isArray(v)) return v.map(choice).join(', ')
	if (v !== null && typeof v === 'object') return JSON.stringify(v)
	return def?.choices ? choice(v) : String(v)
}

const blank = (opt) => !opt || (!opt.isExpression && (opt.value === undefined || opt.value === null || opt.value === ''))

/**
 * An action, feedback or condition as { who, what, options, children }. `who` is the
 * connection's label, `what` the definition's label, `options` [label, text] pairs in the
 * order the editor lists them.
 */
export function describeEntity(entity, ctx) {
	const kind = entity.type === 'feedback' ? 'feedbacks' : 'actions'
	const def = ctx.defs?.[kind]?.[entity.connectionId]?.[entity.definitionId]
	const optDefs = (def?.options ?? []).filter((o) => o.type !== 'static-text')
	const ids = [...optDefs.map((o) => o.id), ...Object.keys(entity.options ?? {}).filter((id) => !optDefs.some((o) => o.id === id))]
	const options = ids
		.filter((id) => !blank(entity.options?.[id]))
		.map((id) => {
			const od = optDefs.find((o) => o.id === id)
			const text = optionText(entity.options[id], od)
			return [od?.label ?? id, id === 'custom' && /^81 /.test(text) ? `${text} (${visca(text)})` : text]
		})
	const children = Object.entries(entity.children ?? {})
		.filter(([, list]) => list?.length)
		.map(([group, list]) => ({ group, items: list.map((e) => describeEntity(e, ctx)) }))
	return {
		who: ctx.labels?.[entity.connectionId] ?? entity.connectionId,
		what: def?.label ?? entity.definitionId,
		options,
		children,
		inverted: entity.isInverted?.value === true,
		disabled: entity.disabled === true,
		overrides: (entity.styleOverrides ?? []).map(overrideText),
	}
}

/** "background #15803D", "label "On air"", "icon record": what a feedback changes on the key. */
export function overrideText(o) {
	const v = o.override ?? {}
	const value = v.isExpression ? `= ${v.value}` : v.value
	const what = { color: o.elementId?.startsWith('text') ? 'text colour' : 'colour', borderColor: 'border', base64Image: 'icon', text: 'label' }[
		o.elementProperty
	]
	const shown =
		typeof value === 'number' && /color/i.test(o.elementProperty)
			? hex(value)
			: typeof value === 'string'
				? value.replace(/^\$\(image:([^)]+)\)$/, '$1')
				: JSON.stringify(value)
	return `${what ?? `${o.elementId}.${o.elementProperty}`} ${shown}`
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

