import { describe, expect, it } from 'vitest'
import { escape, inline, markdown, slug } from '../src/manual/markdown.js'

describe('inline', () => {
	it('formats spans and leaves code alone', () => {
		expect(inline('**b** *i* _u_ ~~s~~ [l](http://x)')).toBe('<strong>b</strong> <em>i</em> <em>u</em> <del>s</del> <a href="http://x">l</a>')
		expect(inline('`**not bold** <x>`')).toBe('<code>**not bold** &lt;x&gt;</code>')
		expect(inline('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;')
		expect(inline('snake_case_name stays')).toBe('snake_case_name stays')
		expect(escape(5)).toBe('5')
	})
})

describe('markdown', () => {
	it('renders headings with ids, paragraphs, rules and code', () => {
		const html = markdown('# Title\n\nOne\nline.\n\n---\n\n```\na < b\n```\n', { idPrefix: 'x-' })
		expect(html).toContain('<h1 id="x-title">Title</h1>')
		expect(html).toContain('<p>One line.</p>')
		expect(html).toContain('<hr>')
		expect(html).toContain('<pre><code>a &lt; b</code></pre>')
	})
	it('renders tables, with escaped pipes', () => {
		const html = markdown('| A | B |\n|---|:-:|\n| `x \\| y` | **2** |\n')
		expect(html).toContain('<th>A</th><th>B</th>')
		expect(html).toContain('<td><code>x | y</code></td><td><strong>2</strong></td>')
	})
	it('renders block quotes, recursively', () => {
		expect(markdown('> **Note** this\n> and that')).toBe('<blockquote><p><strong>Note</strong> this and that</p></blockquote>')
	})
	it('renders lists, task lists, wrapped bold and nested lines', () => {
		const html = markdown('- **one\n  two** three\n  - nested\n- [ ] todo\n- [x] done\n\n1. first\n2. second')
		expect(html).toContain('<li><strong>one two</strong> three<br>nested</li>')
		expect(html).toContain('<li class="task"><span class="box">☐</span> todo</li>')
		expect(html).toContain('<span class="box">☑</span> done')
		expect(html).toContain('<ol><li>first</li><li>second</li></ol>')
	})
	it('ends a paragraph at the next block', () => {
		const html = markdown('text\n# Head\ntext\n- item\ntext\n---')
		expect(html).toBe('<p>text</p>\n<h1 id="head">Head</h1>\n<p>text</p>\n<ul><li>item</li></ul>\n<p>text</p>\n<hr>')
	})
	it('takes a stray pipe line as a paragraph instead of hanging', () => {
		expect(markdown('| not a table\nmore')).toBe('<p>| not a table more</p>')
	})
	it('handles an unclosed fence and CRLF', () => {
		expect(markdown('```\ncode\r\n')).toBe('<pre><code>code\n</code></pre>')
	})
})

describe('slug', () => {
	it('makes anchors', () => {
		expect(slug('The **Rig**: 2026!')).toBe('the-rig-2026')
	})
})
