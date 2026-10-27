/**
 * The Markdown the docs in this repo actually use, as HTML: headings, paragraphs, lists (task
 * lists included), tables, fenced code, block quotes, rules, and inline code, bold, italic,
 * strikethrough and links. No dependency, because nothing here needs more than that and the
 * manual has to build on a machine with only Node and this checkout.
 */

export const escape = (s) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Inline spans. Code spans are cut out first so nothing inside them is formatted. */
export function inline(text) {
	const codes = []
	let s = text.replace(/`([^`]+)`/g, (_, c) => {
		codes.push(c)
		return `\u0000${codes.length - 1}\u0000`
	})
	s = escape(s)
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/~~([^~]+)~~/g, '<del>$1</del>')
		.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
		.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
	return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escape(codes[i])}</code>`)
}

const cells = (line) =>
	line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split(/(?<!\\)\|/)
		.map((c) => c.trim().replace(/\\\|/g, '|'))

const isRule = (l) => /^\s*(-{3,}|\*{3,})\s*$/.test(l)
const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/

function list(lines, i) {
	const ordered = /\d/.test(lines[i].match(LIST)[2])
	const items = []
	while (i < lines.length) {
		const m = lines[i].match(LIST)
		if (m && m[1].length < 2) {
			items.push(m[3])
		} else if (lines[i].trim() !== '' && /^\s+/.test(lines[i]) && items.length) {
			items[items.length - 1] += `\n${lines[i].trim()}`
		} else break
		i++
	}
	const li = items.map((item) => {
		const [first, ...rest] = item.split('\n')
		const task = first.match(/^\[([ xX])\]\s+(.*)$/)
		const head = task ? `<span class="box">${task[1] === ' ' ? '☐' : '☑'}</span> ${inline(task[2])}` : inline(first)
		const tail = rest.length ? ` ${rest.map((r) => (LIST.test(r) ? `<br>${inline(r.replace(LIST, '$3'))}` : inline(r))).join(' ')}` : ''
		return `<li${task ? ' class="task"' : ''}>${head}${tail}</li>`
	})
	const tag = ordered ? 'ol' : 'ul'
	return [`<${tag}>${li.join('')}</${tag}>`, i]
}

/** Markdown to HTML. Headings get ids so the contents page can link to them. */
export function markdown(src, { idPrefix = '' } = {}) {
	const lines = src.replace(/\r\n/g, '\n').split('\n')
	const out = []
	let i = 0
	while (i < lines.length) {
		const line = lines[i]
		if (line.trim() === '') {
			i++
		} else if (/^```/.test(line)) {
			const body = []
			for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i])
			i++
			out.push(`<pre><code>${escape(body.join('\n'))}</code></pre>`)
		} else if (/^#{1,6}\s/.test(line)) {
			const [, hashes, text] = line.match(/^(#{1,6})\s+(.*)$/)
			out.push(`<h${hashes.length} id="${idPrefix}${slug(text)}">${inline(text)}</h${hashes.length}>`)
			i++
		} else if (isRule(line)) {
			out.push('<hr>')
			i++
		} else if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
			const head = cells(line)
			const rows = []
			for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]))
			out.push(
				`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows
					.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
					.join('')}</tbody></table>`,
			)
		} else if (/^>\s?/.test(line)) {
			const body = []
			for (; i < lines.length && /^>\s?/.test(lines[i]); i++) body.push(lines[i].replace(/^>\s?/, ''))
			out.push(`<blockquote>${markdown(body.join('\n'), { idPrefix })}</blockquote>`)
		} else if (LIST.test(line)) {
			const [html, next] = list(lines, i)
			out.push(html)
			i = next
		} else {
			// The first line is always the paragraph's, even one that only looks like the start of something else.
			const body = [lines[i++].trim()]
			for (
				;
				i < lines.length &&
				lines[i].trim() !== '' &&
				!/^(#{1,6}\s|```|>|\s*\|)/.test(lines[i]) &&
				!LIST.test(lines[i]) &&
				!isRule(lines[i]);
				i++
			)
				body.push(lines[i].trim())
			out.push(`<p>${inline(body.join(' '))}</p>`)
		}
	}
	return out.join('\n')
}

/** A heading's anchor: lower case, words joined by dashes. */
export const slug = (text) =>
	text
		.toLowerCase()
		.replace(/<[^>]+>|[`*_~]/g, '')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
