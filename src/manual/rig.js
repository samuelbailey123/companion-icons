/**
 * The manual's view of a Companion full export: pages, keys, triggers, variables, connections.
 *
 * Everything here reads; nothing rewrites the export. The I/O lives in `tools/manual/`.
 *
 * CREDENTIALS NEVER LEAVE THIS FILE. A full export carries every connection's password in clear
 * text (`config.pass`, `config.secretkey`, and anything in `secrets`), and the books are published
 * in a public repo. So `connections()` shows a setting only when its name does not look like a
 * credential, `secretValues()` collects every value that does, and the build checks each finished
 * book against that set before writing it (`assertNoSecrets`). A new module with a credential field
 * named something unexpected is caught by the second check even if it slips past the first.
 */

/** Setting names that hold a credential, or half of one (Planning Center's application id). */
export const SECRET_KEY = /pass|secret|token|key|pin|auth|applicationid/i

/** Companion wraps most option values as `{ value, isExpression }`. */
export const plain = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v)

/** A layered button's options, unwrapped. */
export const flatOptions = (options) => Object.fromEntries(Object.entries(options ?? {}).map(([k, v]) => [k, plain(v)]))

/** Companion's 24-bit colour integer as CSS. */
export const css = (n) => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0')

/** Where a key is, the way the deck docs name it: `r1c3`. */
export const at = (row, column) => `r${row}c${column}`

/** Connection id -> the label a person sees in Companion. */
export function connectionLabels(exp) {
	const labels = new Map([['internal', 'internal']])
	for (const [id, inst] of Object.entries(exp.instances ?? {})) labels.set(id, inst.label)
	return labels
}

/** The text a key shows, from its first text layer, as typed (variables left as `$(...)`). */
export function textOf(control) {
	const layer = control.style?.layers?.find((l) => l.type === 'text')
	return String(plain(layer?.text) ?? '').trim()
}

/** The key's resting background colour, from its first box layer. */
export function backgroundOf(control) {
	const layer = control.style?.layers?.find((l) => l.type === 'box')
	return layer ? css(plain(layer.color)) : '#000000'
}

/** Every step's action sets, in a fixed order, with empty sets dropped. */
export function stepsOf(control) {
	const order = ['down', 'up', 'rotate_left', 'rotate_right']
	return Object.entries(control.steps ?? {}).map(([id, step]) => {
		const sets = step.action_sets ?? {}
		const names = [...order.filter((n) => n in sets), ...Object.keys(sets).filter((n) => !order.includes(n))]
		return {
			id,
			sets: names.map((name) => ({ name, actions: sets[name] ?? [] })).filter((s) => s.actions.length > 0),
		}
	})
}

/** Action-set names as a person says them. A numeric set is Companion's hold-for-N-ms set. */
export function setName(name) {
	const names = { down: 'Press', up: 'Release', rotate_left: 'Turn left', rotate_right: 'Turn right' }
	return names[name] ?? (/^\d+$/.test(name) ? `Held ${Number(name) / 1000} s` : name)
}

/** Pages in number order, each with its keys in reading order. */
export function pages(exp) {
	return Object.entries(exp.pages ?? {})
		.map(([number, page]) => ({
			number: Number(number),
			name: page.name,
			grid: page.gridSize,
			keys: Object.entries(page.controls ?? {})
				.flatMap(([row, cols]) =>
					Object.entries(cols).map(([column, control]) => ({ row: Number(row), column: Number(column), control })),
				)
				.sort((a, b) => a.row - b.row || a.column - b.column),
		}))
		.sort((a, b) => a.number - b.number)
}

/**
 * The folder row, if every page that has one carries the same row 0: a page jumps there by
 * `set_page`, so two pages share it when their row-0 keys send to the same pages in the same
 * places. Returns the shared keys and which pages have them, so the reference can print it once.
 */
export function folderRow(list) {
	const signature = (keys) =>
		JSON.stringify(
			keys
				.filter((k) => k.row === 0)
				.map((k) => [k.column, textOf(k.control), JSON.stringify(stepsOf(k.control).map((s) => s.sets.map((x) => x.actions.map((a) => [a.definitionId, flatOptions(a.options).page]))))]),
		)
	const counts = new Map()
	for (const p of list) {
		const s = signature(p.keys)
		counts.set(s, [...(counts.get(s) ?? []), p.number])
	}
	const [sig, numbers] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ['[]', []]
	if (sig === '[]' || numbers.length < 2) return { pages: [], keys: [] }
	return { pages: numbers, keys: list.find((p) => p.number === numbers[0]).keys.filter((k) => k.row === 0) }
}

/** Triggers in their Companion order. */
export function triggers(exp) {
	return Object.entries(exp.triggers ?? {})
		.map(([id, t]) => ({
			id,
			name: t.options?.name ?? id,
			enabled: t.options?.enabled !== false,
			notes: t.options?.notes ?? '',
			sortOrder: t.options?.sortOrder ?? 0,
			events: t.events ?? [],
			conditions: t.condition ?? [],
			actions: t.actions ?? [],
		}))
		.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Custom variables in their Companion order. */
export function customVariables(exp) {
	return Object.entries(exp.custom_variables ?? {})
		.map(([name, v]) => ({
			name,
			description: v.description ?? '',
			defaultValue: v.defaultValue ?? '',
			persist: Boolean(v.persistCurrentValue),
			sortOrder: v.sortOrder ?? 0,
		}))
		.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Image library entries grouped by collection, without the image data. */
export function imageLibrary(exp) {
	const groups = new Map()
	for (const entry of exp.imageLibrary ?? []) {
		const info = entry.info ?? {}
		const group = info.collectionId ?? '(none)'
		groups.set(group, [...(groups.get(group) ?? []), { name: info.name, description: info.description ?? '' }])
	}
	return [...groups.entries()].map(([collection, images]) => ({ collection, images }))
}

/** A setting's value for print: credentials masked, long text shortened. */
function shown(key, value) {
	if (SECRET_KEY.test(key)) return value === '' || value == null ? '(empty)' : '(credential: see the vault)'
	if (value === '' || value == null) return '(empty)'
	const s = typeof value === 'string' ? value : JSON.stringify(value)
	return s.length > 60 ? s.slice(0, 57) + '…' : s
}

/** Connections, with every credential masked and the `secrets` block never read. */
export function connections(exp) {
	return Object.entries(exp.instances ?? {})
		.map(([id, inst]) => ({
			id,
			label: inst.label,
			module: inst.moduleId ?? inst.instance_type,
			version: inst.moduleVersionId ?? '',
			enabled: inst.enabled !== false,
			sortOrder: inst.sortOrder ?? 0,
			settings: Object.entries(inst.config ?? {}).map(([k, v]) => [k, shown(k, v)]),
		}))
		.sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * A credential too weak to search for: a short run of letters ("admin") is ordinary English, so it
 * would trip the leak check on every page while proving nothing. These are reported instead, as
 * passwords worth changing.
 */
export const weak = (s) => s.length < 8 && /^[a-z]+$/i.test(s)

/** Every credential in the export: `values` for the leak check, `weakFields` naming the weak ones. */
export function credentials(exp) {
	const values = new Set()
	const weakFields = []
	const add = (where, v) => {
		if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => add(`${where}.${k}`, x))
		const s = String(v ?? '')
		if (s.length < 4) return
		if (weak(s)) weakFields.push(where)
		else values.add(s)
	}
	for (const inst of Object.values(exp.instances ?? {})) {
		for (const [k, v] of Object.entries(inst.config ?? {})) if (SECRET_KEY.test(k)) add(`${inst.label}.${k}`, v)
		add(`${inst.label}.secrets`, inst.secrets)
	}
	return { values, weakFields }
}

/** Every searchable credential value in the export, for the final leak check. */
export const secretValues = (exp) => credentials(exp).values

/** Throw if any credential value appears in a finished book. */
export function assertNoSecrets(text, secrets) {
	for (const s of secrets) {
		if (text.includes(s)) throw new Error(`a credential from the export reached the output (${s.length} chars, starts "${s.slice(0, 2)}")`)
	}
}
