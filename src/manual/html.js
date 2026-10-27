/**
 * The books' HTML: a cover, a contents page, chapters that each open on a new page, and the
 * pieces the chapters are made of — key grids drawn from the export, key tables numbered to
 * match them, callouts and step lists. Print CSS only: these are rendered to PDF by
 * scripts/manual_pdf.py, which adds the running header and page numbers.
 */
import { looksLikeCode } from './describe.js'
import { escape, inline, markdown, slug } from './markdown.js'

export const BOOKS = {
	operator: { title: 'Operator Guide', tone: '#1d4ed8', blurb: 'Running a Sunday from the Stream Deck: what happens on its own, what you press, and what to do when something is wrong.' },
	reference: { title: 'Reference', tone: '#334155', blurb: 'Everything in Companion, key by key: every page, trigger, variable and connection, the devices it drives and how they are cabled.' },
	recovery: { title: 'Recovery Guide', tone: '#b91c1c', blurb: 'Rebuilding the rig from nothing: where every backup, script and credential lives, and how to put each part back.' },
}

/** `$(conn:var)` in a key's label, nested ones included, shortened to an ellipsis for the picture of the key. */
export function pictureText(t) {
	if (t.startsWith('= ')) return '…'
	let s = t
	for (let prev; prev !== s; ) {
		prev = s
		s = s.replace(/\$\([^()]*\)/g, '…')
	}
	return s.replace(/…+/g, '…')
}

/** One key, drawn the way the deck shows it at rest. */
function keyCell(k, n, highlight) {
	const s = k.style
	const text = s.texts.map(pictureText).join('\n')
	const img = s.image ? `<img src="${s.image}" alt="">` : ''
	const cls = ['key', k.row === 4 ? 'strip' : '', k.row === 5 ? 'dial' : '', highlight ? 'hl' : ''].filter(Boolean).join(' ')
	const border = s.border ? `box-shadow: inset 0 0 0 3px ${s.border};` : ''
	return `<div class="${cls}" style="grid-row:${k.row + 1};grid-column:${k.col + 1};background:${s.bg};color:${s.color};${border}">${img}<span class="kt${img ? '' : ' only'}">${escape(text)}</span><b class="kn">${n}</b></div>`
}

/** A page of the deck as a picture: 9 columns, keys, touchstrip and dials, each numbered. */
export function keyGrid(page, { highlight = [] } = {}) {
	const cells = page.keys.map((k, i) => keyCell(k, i + 1, highlight.includes(k.at)))
	const rows = Math.max(4, ...page.keys.map((k) => k.row + 1))
	return `<div class="deck" style="grid-template-rows:repeat(4, 1fr)${rows > 4 ? ' 0.55fr' : ''}${rows > 5 ? ' 1fr' : ''}">${cells.join('')}</div>`
}

/** A value, as code when it is a command or expression. */
const valueHtml = (v) => (looksLikeCode(v) ? `<code>${escape(v)}</code>` : `<i>${escape(v)}</i>`)

/** One action or feedback as a readable line, with colour chips for what it changes. */
export function entityHtml(d) {
	const who = d.who === 'Companion' ? '' : `<span class="who">${escape(d.who)}</span> `
	const opts = d.options.map(([k, v]) => `${k ? `${escape(k)} ` : ''}${valueHtml(v)}`).join(' · ')
	const flags = `${d.inverted ? ' <span class="flag">inverted</span>' : ''}${d.disabled ? ' <span class="flag">disabled</span>' : ''}`
	const ov = d.overrides.length
		? `<div class="ov">→ ${d.overrides
				.map((o) => `${o.colour ? `<span class="chip" style="background:${o.colour}"></span>` : ''}${escape(o.name)} ${o.colour ? escape(o.value) : valueHtml(o.value)}`)
				.join(', ')}</div>`
		: ''
	const kids = d.children
		.map((c) => `<div class="kids">${c.group ? `<span class="grp">${escape(c.group)}</span>` : ''}${c.items.map(entityHtml).join('')}</div>`)
		.join('')
	return `<div class="ent">${who}<b>${escape(d.what)}</b>${opts ? ` <span class="opts">${opts}</span>` : ''}${flags}${ov}${kids}</div>`
}

/** The page a key opens, when opening a page is all it does: the folder row, and Back keys. */
export function navTarget(k) {
	const acts = k.steps.flatMap((s) => s.sets.flatMap((set) => set.actions))
	return !k.feedbacks.length && acts.length === 1 && /^Go to page /.test(acts[0].what) ? acts[0].what.replace(/^Go to /, '') : null
}

/** The table under a page's picture: one entry per numbered key; neighbouring keys that only open a page share one line. */
export function keyTable(page) {
	const rows = []
	let nav = []
	const flushNav = () => {
		if (!nav.length) return
		const first = nav[0]
		const last = nav.at(-1)
		rows.push(
			`<tr class="nav"><td class="n">${nav.length > 1 ? `${first.n}–${last.n}` : first.n}</td><td class="where">${first.k.at}${nav.length > 1 ? `<br>–${last.k.at}` : ''}</td><td><div class="label">Open another page</div><div class="pills">${nav
				.map(({ n, k, to }) => `<span class="pill"><b>${n}</b> ${escape(k.style.texts.join(' ') || '(icon)')} → ${escape(to)}</span>`)
				.join(' ')}</div></td></tr>`,
		)
		nav = []
	}
	page.keys.forEach((k, i) => {
		const to = navTarget(k)
		if (to) return void nav.push({ n: i + 1, k, to })
		flushNav()
		const sets = k.steps.flatMap((s) =>
			s.sets.map(
				(set) =>
					`<div class="set"><span class="tag">${k.steps.length > 1 ? `Step ${s.n}${s.name ? ` "${escape(s.name)}"` : ''} · ` : ''}${set.set}</span>${set.actions.map(entityHtml).join('')}</div>`,
			),
		)
		const fb = k.feedbacks.length ? `<div class="set"><span class="tag">Looks different when</span>${k.feedbacks.map(entityHtml).join('')}</div>` : ''
		const label = k.style.texts.join(' / ') || '(icon only)'
		const kind = k.row === 4 ? '<br><small>strip</small>' : k.row === 5 ? '<br><small>dial</small>' : ''
		rows.push(
			`<tr><td class="n">${i + 1}</td><td class="where">${k.at}${kind}</td><td><div class="label">${escape(label)}</div>${
				k.notes ? `<p class="notes">${escape(k.notes)}</p>` : ''
			}${sets.join('')}${fb}${!sets.length && !fb ? '<div class="none">Shows only; pressing it does nothing.</div>' : ''}${
				k.style.icon ? `<div class="icon">icon ${escape(k.style.icon)}</div>` : ''
			}</td></tr>`,
		)
	})
	flushNav()
	return `<table class="keys"><thead><tr><th>#</th><th>Key</th><th>What it shows and does</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

/** A callout box. Kinds: do, dont, note, todo, danger. */
export function callout(kind, title, body) {
	return `<aside class="callout ${kind}"><div class="ct">${escape(title)}</div>${body}</aside>`
}

/** A simple table from rows of already-escaped HTML cells. */
export function table(head, rows, cls = '') {
	return `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
		.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
		.join('')}</tbody></table>`
}

export const code = (s) => `<code>${escape(s)}</code>`
export { escape, inline, markdown }

/**
 * A whole book. `chapters` are { title, lead?, html }; each starts a new page under a band in
 * the book's colour, numbered, with its lead line as the one-sentence point of the chapter.
 */
export function book({ kind, readAt, build, chapters }) {
	const b = BOOKS[kind]
	const toc = chapters
		.map((c, i) => `<li><a href="#${slug(c.title)}"><span class="num">${i + 1}</span>${escape(c.title)}</a>${c.lead ? `<div class="tl">${inline(c.lead)}</div>` : ''}</li>`)
		.join('')
	const others = Object.entries(BOOKS)
		.map(([k, o]) => `<li class="${k === kind ? 'this' : ''}"><span class="sw" style="background:${o.tone}"></span><b>${o.title}</b> — ${o.blurb}</li>`)
		.join('')
	const body = chapters
		.map(
			(c, i) =>
				`<section class="chapter" id="${slug(c.title)}"><header class="band"><span class="num">${i + 1}</span><h1>${escape(c.title)}</h1></header>${
					c.lead ? `<p class="lead">${inline(c.lead)}</p>` : ''
				}${c.html}</section>`,
		)
		.join('')
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rig Manual — ${b.title}</title><style>${CSS.replace(/--tone:[^;]+;/, `--tone:${b.tone};`)}</style></head><body data-book="${kind}">
<section class="cover"><div class="stripe"></div><div class="cover-in"><div class="kicker">Triumph Church · Production rig</div><h1 class="ct1">${b.title}</h1><p class="blurb">${escape(b.blurb)}</p>
<dl class="facts"><dt>Read from the rig</dt><dd>${escape(readAt)}</dd><dt>Companion</dt><dd>${escape(build)}</dd><dt>Rebuild this book</dt><dd><code>node tools/manual.js</code> in the companion-icons repo — see the Recovery Guide</dd></dl>
<div class="set-of"><div class="kicker">The three books</div><ul>${others}</ul></div></div></section>
<section class="toc"><h2>Contents</h2><ol>${toc}</ol></section>
${body}
</body></html>`
}

const CSS = `
:root{--tone:#334155;--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--soft:#f1f5f9;--mono:ui-monospace,Menlo,monospace}
@page{size:Letter;margin:0.7in 0.6in 0.75in}
*{box-sizing:border-box}
body{font:10pt/1.45 -apple-system,"Helvetica Neue",Arial,sans-serif;color:var(--ink);margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit;text-decoration:none}
code{font:8.6pt var(--mono);background:var(--soft);padding:0 3px;border-radius:3px}
pre{font:8pt/1.4 var(--mono);background:var(--soft);padding:6px 8px;border-radius:4px;white-space:pre-wrap;word-break:break-word;margin:4px 0}
h1,h2,h3,h4{line-height:1.2;break-after:avoid}
h2{font-size:15pt;margin:20px 0 6px;color:var(--tone)}
h3{font-size:12pt;margin:16px 0 4px}
h4{font-size:10.5pt;margin:12px 0 4px}
p{margin:6px 0}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:8.8pt}
th{background:var(--tone);color:#fff;text-align:left;font-weight:600;padding:5px 6px}
td{border-bottom:1px solid var(--line);padding:5px 6px;vertical-align:top}
tr{break-inside:avoid}
blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid var(--tone);background:var(--soft)}
ul,ol{padding-left:20px;margin:6px 0}
li{margin:2px 0}
li.task{list-style:none;margin-left:-18px}
.box{font-size:12pt;margin-right:4px}
.cover{height:9.4in;position:relative;break-after:page;display:flex}
.cover .stripe{width:28px;background:var(--tone);border-radius:4px;margin-right:36px}
.cover-in{padding-top:1.2in;flex:1}
.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:8.5pt;color:var(--muted);font-weight:600}
.ct1{font-size:44pt;margin:8px 0 12px;color:var(--tone);letter-spacing:-.01em}
.blurb{font-size:13pt;max-width:5.2in;color:var(--ink)}
.facts{display:grid;grid-template-columns:1.6in 1fr;gap:6px 12px;margin:36px 0;font-size:9.5pt}
.facts dt{color:var(--muted)}
.facts dd{margin:0}
.set-of{position:absolute;bottom:0;left:64px;right:0}
.set-of ul{list-style:none;padding:0}
.set-of li{margin:6px 0;color:var(--muted);font-size:9pt}
.set-of li.this{color:var(--ink)}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.toc{break-after:page}
.toc h2{font-size:22pt;color:var(--ink)}
.toc ol{list-style:none;padding:0}
.toc li{padding:8px 0;border-bottom:1px solid var(--line)}
.toc li a{font-size:12pt;font-weight:600}
.toc .tl{color:var(--muted);font-size:9pt;margin-left:34px}
.num{display:inline-block;min-width:24px;height:24px;border-radius:12px;background:var(--tone);color:#fff;text-align:center;font:600 10pt/24px -apple-system,sans-serif;margin-right:10px;padding:0 6px}
.chapter{break-before:page}
.band{display:flex;align-items:center;border-bottom:3px solid var(--tone);padding-bottom:8px;margin-bottom:10px}
.band h1{font-size:22pt;margin:0}
.lead{font-size:11.5pt;color:var(--muted);margin:4px 0 14px;max-width:6.4in}
.callout{border-radius:6px;padding:8px 12px;margin:10px 0;break-inside:avoid;border-left:5px solid}
.callout .ct{font-weight:700;margin-bottom:2px}
.callout.do{background:#ecfdf5;border-color:#16a34a}
.callout.dont{background:#fef2f2;border-color:#dc2626}
.callout.danger{background:#fef2f2;border-color:#991b1b}
.callout.note{background:#eff6ff;border-color:#2563eb}
.callout.todo{background:#fffbeb;border-color:#d97706}
.deck{display:grid;grid-template-columns:repeat(9,1fr);gap:5px;background:#111317;padding:10px;border-radius:12px;margin:8px 0 12px;break-inside:avoid}
.key{position:relative;aspect-ratio:1;border-radius:7px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3px}
.key img{width:58%;height:46%;object-fit:contain}
.key .kt{font:600 6.4pt/1.1 -apple-system,sans-serif;text-align:center;white-space:pre-line;overflow:hidden;max-height:46%}
.key .kt.only{font-size:7.2pt;max-height:90%}
.key.strip{aspect-ratio:auto;height:100%;border-radius:3px}
.key.strip img{height:60%}
.key.dial{border-radius:50%;width:78%;justify-self:center}
.key.hl{outline:3px solid #facc15;outline-offset:2px}
.key .kn{position:absolute;top:2px;left:2px;background:rgba(255,255,255,.92);color:#0f172a;font:700 6pt/11px -apple-system,sans-serif;min-width:11px;height:11px;border-radius:6px;text-align:center;padding:0 2px}
table.keys td.n{font-weight:700;width:22px;color:var(--tone)}
table.keys td.where{width:44px;font:8pt var(--mono);color:var(--muted)}
table.keys .label{font-weight:600}
table.keys .icon{font-size:7.8pt;color:var(--muted)}
table.keys .notes{font-size:8.4pt;color:var(--muted);margin:3px 0}
.set{margin-top:4px}
.tag{display:inline-block;font-size:7.4pt;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--tone)}
.ent{font-size:8.6pt;margin:2px 0 3px;padding-left:8px;border-left:2px solid var(--line)}
.ent .who{font-size:7.2pt;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
.ent .opts{color:var(--ink)}
.ent i{font-style:normal;font-weight:600}
.ent code{font-size:7.6pt;word-break:break-all}
.ent .ov{color:var(--muted);font-size:8pt;margin-top:1px}
.ent .flag{font-size:7pt;background:#fde68a;border-radius:3px;padding:0 3px}
.kids{margin:2px 0 2px 6px}
.grp{font-size:7pt;text-transform:uppercase;letter-spacing:.06em;color:var(--tone);font-weight:700}
.chip{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 3px -1px 0;box-shadow:0 0 0 .5px rgba(0,0,0,.4)}
.pills{margin-top:3px}
.pill{display:inline-block;background:var(--soft);border-radius:10px;padding:1px 7px;margin:2px 3px 2px 0;font-size:8pt}
.pill b{color:var(--tone)}
.none{color:var(--muted);font-style:italic;font-size:8.4pt}
.diagram{width:100%;height:auto;margin:8px 0;break-inside:avoid}
.diagram .nb{fill:#fff;stroke:#334155;stroke-width:1.2}
.diagram .nb.muted{fill:#f8fafc;stroke:#94a3b8}
.diagram .nt{font:700 13px -apple-system,sans-serif;fill:#0f172a}
.diagram .ns{font:10.5px -apple-system,sans-serif;fill:#64748b}
.diagram .pl{font:11px -apple-system,sans-serif;fill:#0f172a}
.diagram .sep{stroke:#e2e8f0}
.diagram .el{font:9.5px -apple-system,sans-serif;fill:#475569;paint-order:stroke;stroke:#fff;stroke-width:3px}
.lib{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
.lib figure{margin:0;text-align:center;break-inside:avoid}
.lib img{width:100%;aspect-ratio:1;object-fit:contain;background:#0d0d0f;border-radius:6px;padding:6px}
.lib figcaption{font:7pt var(--mono);color:var(--muted);word-break:break-all}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.page-head{break-before:page}
.page-head:first-of-type{break-before:auto}
.write{border-bottom:1px solid var(--line);height:20px}
`
