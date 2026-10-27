/**
 * The manual's view of a Companion full export: pages, keys, triggers, variables, connections,
 * surfaces and the image library, in the shape the books print.
 *
 * Read-only: nothing here changes the export.
 *
 * CREDENTIALS NEVER LEAVE THIS FILE. A full export carries every connection's password in clear
 * text (`config.pass`, `config.secretkey`, and anything in `secrets`). `connections()` prints a
 * setting only when its name does not look like a credential, and `secretValues()` collects every
 * value that does so the build can refuse a finished book that still contains one
 * (`assertNoSecrets`). A module with a credential under an unexpected name is caught by the second
 * check even if it slips past the first.
 */
import { describeEntity, describeEvent, hex } from './describe.js'

/** Setting names that hold a credential, or half of one (Planning Center's application id). */
export const SECRET_KEY = /pass|secret|token|key|pin|auth|applicationid|user/i

const value = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v)

/** Connection id -> the label a person sees in Companion. `internal` is Companion itself. */
export function connectionLabels(exp) {
	const labels = { internal: 'Companion' }
	for (const [id, c] of Object.entries(exp.instances ?? {})) labels[id] = c.label
	return labels
}

/** Every credential value in the export, so a book can be checked for them. Short values are skipped: they would match ordinary words. */
export function secretValues(exp) {
	const found = new Set()
	for (const c of Object.values(exp.instances ?? {})) {
		for (const [k, v] of Object.entries(c.config ?? {})) if (SECRET_KEY.test(k) && typeof v === 'string' && v.length >= 6) found.add(v)
		for (const v of Object.values(c.secrets ?? {})) if (typeof v === 'string' && v.length >= 6) found.add(v)
	}
	return found
}

/** Throws, naming nothing secret, if any credential value appears in `text`. */
export function assertNoSecrets(text, secrets, where = 'book') {
	const hits = [...secrets].filter((s) => text.includes(s)).length
	if (hits) throw new Error(`${where}: ${hits} credential value(s) found in the output; refusing to write it`)
}

/** Connections with their safe settings, the names of the credential settings, and their status. */
export function connections(exp, statuses = {}) {
	return Object.entries(exp.instances ?? {})
		.sort(([, a], [, b]) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		.map(([id, c]) => {
			const config = c.config ?? {}
			const settings = Object.entries(config)
				.filter(([k, v]) => !SECRET_KEY.test(k) && v !== '' && v !== null && v !== undefined && typeof v !== 'object')
				.map(([k, v]) => [k, String(v)])
			const credentials = [...Object.keys(config).filter((k) => SECRET_KEY.test(k) && config[k] !== ''), ...Object.keys(c.secrets ?? {})]
			const st = statuses[id]
			return {
				id,
				label: c.label,
				module: c.moduleId,
				version: c.moduleVersionId,
				enabled: c.enabled !== false,
				settings,
				credentials,
				status: st ? `${st.category}${st.level && st.level !== 'ok' ? ` (${st.level})` : ''}${st.message ? `: ${st.message}` : ''}` : 'unknown',
			}
		})
}

/** The library as name -> image source, preferring the SVG original. */
export function library(exp) {
	const collections = Object.fromEntries((exp.imageLibraryCollections ?? []).map((c) => [c.id, c.label]))
	return Object.values(exp.imageLibrary ?? {})
		.map((img) => ({
			name: img.info?.name,
			description: img.info?.description ?? '',
			collection: collections[img.info?.collectionId] ?? img.info?.collectionId ?? '',
			src: img.originalImage?.startsWith('data:image/svg') ? img.originalImage : (img.previewImage ?? img.originalImage),
		}))
		.filter((img) => img.name)
		.sort((a, b) => a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name))
}

/** How a key looks with no feedback active: colours, its text layers and its icon. */
export function keyStyle(control, images = {}) {
	const layers = control.style?.layers ?? []
	const box = layers.find((l) => l.type === 'box' && l.id === 'box0') ?? layers.find((l) => l.type === 'box')
	const texts = layers.filter((l) => l.type === 'text' && value(l.enabled) !== false)
	const img = layers.find((l) => l.type === 'image' && value(l.enabled) !== false)
	const ref = img ? value(img.base64Image) : undefined
	const named = typeof ref === 'string' && !img.base64Image.isExpression ? ref.match(/^\$\(image:([^)]+)\)$/)?.[1] : undefined
	return {
		bg: box ? hex(value(box.color) ?? 0) : '#000000',
		border: box && value(box.borderWidth) ? hex(value(box.borderColor) ?? 0) : null,
		color: texts[0] ? hex(value(texts[0].color) ?? 0xffffff) : '#FFFFFF',
		texts: texts.map((t) => (t.text?.isExpression ? `= ${t.text.value}` : String(value(t.text) ?? ''))).filter((t) => t !== ''),
		icon: named ?? (typeof ref === 'string' && ref.startsWith('data:') ? 'embedded' : ref ? `= ${ref}` : null),
		image: named ? (images[named] ?? null) : typeof ref === 'string' && ref.startsWith('data:') ? ref : null,
	}
}

const SETS = { down: 'Press', up: 'Release', rotate_left: 'Turn left', rotate_right: 'Turn right' }

/** A key's actions per step, as described entities; empty sets dropped. */
function steps(control, ctx) {
	return Object.entries(control.steps ?? {}).map(([n, step]) => ({
		n: Number(n) + 1,
		name: step.options?.name ?? '',
		sets: Object.entries(step.action_sets ?? {})
			.filter(([, list]) => list?.length)
			.map(([set, list]) => ({ set: SETS[set] ?? `After ${set} ms`, actions: list.map((a) => describeEntity(a, ctx)) })),
	}))
}

/** Every page with every key that is not blank. */
export function pages(exp, ctx) {
	const images = Object.fromEntries(library(exp).map((i) => [i.name, i.src]))
	return Object.entries(exp.pages ?? {})
		.sort(([a], [b]) => Number(a) - Number(b))
		.map(([number, page]) => {
			const keys = []
			for (const [row, cols] of Object.entries(page.controls ?? {}))
				for (const [col, control] of Object.entries(cols)) {
					const style = keyStyle(control, images)
					const st = steps(control, ctx)
					const feedbacks = (control.feedbacks ?? []).map((f) => describeEntity(f, { ...ctx, defs: ctx.fbdefs }))
					const actions = st.reduce((n, s) => n + s.sets.length, 0)
					if (!style.texts.length && !style.icon && !actions && !feedbacks.length) continue
					keys.push({
						row: Number(row),
						col: Number(col),
						at: `r${row}c${col}`,
						style,
						notes: control.options?.notes ?? '',
						steps: st,
						feedbacks,
					})
				}
			keys.sort((a, b) => a.row - b.row || a.col - b.col)
			return { number: Number(number), name: page.name, grid: page.gridSize, keys }
		})
}

/** Triggers in the order Companion lists them. */
export function triggers(exp, ctx) {
	return Object.values(exp.triggers ?? {})
		.sort((a, b) => (a.options?.sortOrder ?? 0) - (b.options?.sortOrder ?? 0))
		.map((t) => ({
			name: t.options?.name ?? '(unnamed)',
			enabled: t.options?.enabled !== false,
			notes: t.options?.notes ?? '',
			events: (t.events ?? []).map(describeEvent),
			conditions: (t.condition ?? []).map((c) => describeEntity(c, { ...ctx, defs: ctx.fbdefs })),
			actions: (t.actions ?? []).map((a) => describeEntity(a, ctx)),
		}))
}

/** Custom variables: Companion's own named slots, which the scripts and triggers fill. */
export function customVariables(exp) {
	return Object.entries(exp.custom_variables ?? {})
		.sort(([, a], [, b]) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		.map(([name, v]) => ({ name, description: v.description ?? '', default: String(v.defaultValue ?? ''), persists: v.persistCurrentValue === true }))
}

/**
 * Physical decks by name, and everything else (the Service Health board's web decks, test
 * probes) counted by kind, because each browser that opens the board's deck adds an entry.
 */
export function surfaces(exp) {
	const all = Object.entries(exp.surfaces ?? {}).map(([id, s]) => ({ id, name: s.name ?? '', kind: id.split(':')[0] }))
	const physical = all.filter((s) => s.kind === 'streamdeck')
	const others = {}
	for (const s of all.filter((s) => s.kind !== 'streamdeck')) {
		const label = s.name || s.kind
		others[label] = (others[label] ?? 0) + 1
	}
	return { physical, others: Object.entries(others).map(([name, count]) => ({ name, count })) }
}

/** Which pages, keys and triggers use each connection. */
export function usage(model) {
	const used = {}
	const mark = (d, where) => {
		;(used[d.who] ??= new Set()).add(where)
		for (const c of d.children) for (const i of c.items) mark(i, where)
	}
	for (const p of model.pages)
		for (const k of p.keys) {
			for (const s of k.steps) for (const set of s.sets) for (const a of set.actions) mark(a, `${p.name} ${k.at}`)
			for (const f of k.feedbacks) mark(f, `${p.name} ${k.at}`)
		}
	for (const t of model.triggers) for (const d of [...t.actions, ...t.conditions]) mark(d, `trigger "${t.name}"`)
	return Object.fromEntries(Object.entries(used).map(([who, set]) => [who, [...set]]))
}

/** Everything the books print from the export. */
export function buildModel(exp, { defs = {}, fbdefs = {}, statuses = {} } = {}) {
	const pageNames = Object.fromEntries(Object.entries(exp.pages ?? {}).map(([n, p]) => [n, p.name]))
	const ctx = { defs, fbdefs, labels: connectionLabels(exp), pageNames }
	const model = {
		build: exp.companionBuild,
		pages: pages(exp, ctx),
		triggers: triggers(exp, ctx),
		variables: customVariables(exp),
		connections: connections(exp, statuses),
		surfaces: surfaces(exp),
		library: library(exp),
	}
	model.usage = usage(model)
	return model
}
