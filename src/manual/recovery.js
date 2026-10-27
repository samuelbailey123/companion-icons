/**
 * The generated parts of the Recovery Guide and the Operator Guide's one consistency check.
 *
 * The Recovery Guide is prose (`manual/recovery.md`) because rebuilding a Pi is judgement, not data.
 * What can be generated is: which Companion connections hold a credential and the 1Password entry
 * each one is filed under, which tool in this repo rebuilds which page, and which backed-up Pi file
 * goes where.
 */
import { escape } from './markdown.js'
import { SECRET_KEY, connections } from './rig.js'

/** The 1Password vault every entry the manual names lives in (Sam, 2026-10-27). */
export const VAULT = '1Password'

/** `08:05:00` -> `8:05`; `10:24:57` stays. The form the Operator Guide writes times in. */
export const clock = (time) => String(time).replace(/^0/, '').replace(/:00$/, '')

/**
 * Every enabled time-of-day trigger's time that the Operator Guide does not mention.
 * @returns {string[]} the missing times, e.g. ['10:24:57 (Sunday countdown)']
 */
export function checkTimeline(md, list) {
	const missing = []
	for (const t of list.filter((x) => x.enabled)) {
		for (const e of t.events.filter((x) => x.type === 'timeofday' && x.enabled !== false)) {
			const when = clock(e.options?.time)
			if (!md.includes(when)) missing.push(`${when} (${t.name})`)
		}
	}
	return missing
}

const table = (head, rows) =>
	`<table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`

/** Connections that hold a credential, and the vault entry it belongs in. */
export function connectionCredentials(exp) {
	const rows = connections(exp)
		.map((c) => ({ c, fields: c.settings.filter(([k, v]) => SECRET_KEY.test(k) && v !== '(empty)').map(([k]) => k) }))
		.filter((x) => x.fields.length)
		.map(({ c, fields }) => [escape(c.label), escape(c.module), fields.map((f) => `<code>${escape(f)}</code>`).join(', '), `${VAULT} › <b>Companion › ${escape(c.label)}</b>`])
	return table(['Connection', 'Module', 'Fields', 'Entry'], rows)
}

/** The first line of a file's header comment: what the tool is for. */
export const purpose = (text) => (String(text).match(/^\/\*\*\s*\n\s*\*\s*(.+)$/m)?.[1] ?? '').trim()

/** Which tool in `tools/` rebuilds what, from each one's own header. */
export function builders(files) {
	const rows = [...files].sort((a, b) => a.file.localeCompare(b.file)).map((f) => [`<code>${escape(f.file)}</code>`, escape(purpose(f.text))])
	return table(['Tool', 'What it builds'], rows)
}

/** Where each backed-up file goes on a rebuilt Pi. */
export function piFiles(list) {
	const where = (f) =>
		!f.includes('/')
			? '(notes: stays in the repo)'
			: f.startsWith('AV_Power_scripts/')
				? `/home/samuelbailey/Desktop/${f}`
				: f.endsWith('.sh')
					? `/usr/local/bin/${f.split('/').pop()}`
					: `/etc/systemd/system/${f.split('/').pop()}`
	return table(['In the repo', 'On the Pi'], [...list].sort().map((f) => [`<code>pi/${escape(f)}</code>`, `<code>${escape(where(f))}</code>`]))
}
