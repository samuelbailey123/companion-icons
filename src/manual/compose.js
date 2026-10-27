/**
 * A hand-written book from Markdown: each `# ` heading opens a chapter, a `Lead:` line straight
 * after it is the chapter's one-sentence point, and a line that is only `{{name args}}` is
 * replaced by something drawn from the rig (a page of the deck, the Sunday schedule, a
 * drawing). Unknown directives fail the build rather than printing as text.
 */
import { markdown } from './markdown.js'

const DIRECTIVE = /^\{\{\s*([\w-]+)\s*([^}]*)\}\}\s*$/

export function chaptersFromMarkdown(src, directives = {}) {
	const chapters = []
	let current
	let buffer = []
	const flush = () => {
		if (current && buffer.length) current.parts.push(markdown(buffer.join('\n'), { idPrefix: `${chapters.length}-` }))
		buffer = []
	}
	let fenced = false
	for (const line of src.replace(/\r\n/g, '\n').split('\n')) {
		if (/^```/.test(line)) fenced = !fenced
		const h1 = !fenced && line.match(/^#\s+(.*)$/)
		const dir = !fenced && line.match(DIRECTIVE)
		if (h1) {
			flush()
			current = { title: h1[1].trim(), lead: '', parts: [] }
			chapters.push(current)
		} else if (current && !current.parts.length && !buffer.some((l) => l.trim()) && /^Lead:\s*/.test(line)) {
			current.lead = line.replace(/^Lead:\s*/, '')
		} else if (dir) {
			if (!current) throw new Error(`{{${dir[1]}}} before the first chapter`)
			const fn = directives[dir[1]]
			if (!fn) throw new Error(`unknown directive {{${dir[1]}}}`)
			flush()
			current.parts.push(fn(dir[2].trim()))
		} else if (current) buffer.push(line)
	}
	flush()
	return chapters.map((c) => ({ title: c.title, lead: c.lead, html: c.parts.join('\n') }))
}
