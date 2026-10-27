import { describe, expect, it } from 'vitest'
import { parseDump } from '../src/manual/blackmagic.js'
import { chaptersFromMarkdown } from '../src/manual/compose.js'
import { describeEntity, describeEvent, entityLines, hex, looksLikeCode, optionText, override } from '../src/manual/describe.js'
import { audioInputs, blockDiagram, controlMap, videoCabling } from '../src/manual/diagrams.js'
import { book, callout, code, entityHtml, keyGrid, keyTable, navTarget, pictureText, table } from '../src/manual/html.js'
import { escape, inline, markdown, slug } from '../src/manual/markdown.js'
import {
	assertNoSecrets,
	buildModel,
	connections,
	customVariables,
	keyStyle,
	library,
	secretValues,
	surfaces,
} from '../src/manual/model.js'
import { address, controlLinks, directives, referenceChapters, schedule } from '../src/manual/reference.js'

const v = (value, isExpression = false) => ({ value, isExpression })

/** A layered key: a box, an optional icon and label, actions on press, optional feedbacks. */
function key({ text, image, color = 0x111111, border = 0, actions = [], feedbacks = [], steps, notes = '', extraText } = {}) {
	const layers = [{ id: 'canvas', type: 'canvas' }, { id: 'box0', type: 'box', color: v(color), borderWidth: v(border), borderColor: v(0xff0000) }]
	if (image !== undefined) layers.push({ id: 'image0', type: 'image', enabled: v(true), base64Image: typeof image === 'object' ? image : v(image) })
	if (text !== undefined) layers.push({ id: 'text0', type: 'text', enabled: v(true), text: typeof text === 'object' ? text : v(text), color: v(0xffffff) })
	if (extraText) layers.push({ id: 'text1', type: 'text', enabled: v(false), text: v(extraText) })
	return {
		type: 'button-layered',
		style: { layers },
		options: { notes },
		feedbacks,
		steps: steps ?? { 0: { action_sets: { down: actions, up: [] }, options: {} } },
	}
}

const act = (connectionId, definitionId, options = {}, extra = {}) => ({ id: 'x', type: 'action', connectionId, definitionId, options, children: {}, ...extra })
const fb = (connectionId, definitionId, options = {}, styleOverrides = [], extra = {}) => ({
	id: 'f',
	type: 'feedback',
	connectionId,
	definitionId,
	options,
	isInverted: v(false),
	styleOverrides,
	children: {},
	...extra,
})

const SVG = 'data:image/svg+xml;base64,AAAA'

const EXPORT = {
	companionBuild: '5.0.7+test',
	pages: {
		2: {
			name: 'Power',
			gridSize: {},
			controls: {
				0: { 0: key({ text: 'Home', image: '$(image:home)', actions: [act('internal', 'set_page', { page: v('1'), surfaceId: v('self') })] }) },
				1: {
					0: key({
						text: 'Projectors',
						image: '$(image:proj)',
						border: 4,
						notes: 'Powers the projectors.',
						actions: [act('internal', 'exec', { path: v('python3 /home/x/projector_power.py on'), targetVariable: v('') })],
						feedbacks: [
							fb('internal', 'variable_value', { variable: v('custom:projector_state'), op: v('eq'), value: v('on') }, [
								{ elementId: 'box0', elementProperty: 'color', override: v(0x00a651) },
							]),
						],
					}),
					1: key({ text: '' }),
				},
			},
		},
		1: {
			name: 'Home',
			gridSize: {},
			controls: {
				0: {
					0: key({ text: 'Home', image: '$(image:home)', actions: [act('internal', 'set_page', { page: v('1') })] }),
					1: key({ text: 'Power', image: '$(image:power)', actions: [act('internal', 'set_page', { page: v('2') })] }),
				},
				2: {
					0: key({ text: 'Stream\n$(atem:stream_duration_hm)', image: '$(image:live)', steps: { 0: { action_sets: { down: [] } }, 1: { action_sets: { down: [act('atem', 'streamStartStop', { action: v('toggle') })] }, options: { name: 'Go' } } } }),
					1: key({ text: v('concat($(a:b))', true), image: v('$(image:x)', true) }),
					2: key({ image: SVG }),
				},
				4: { 0: key({ text: 'Wall', actions: [] }) },
				5: { 0: key({ text: 'Dial', steps: { 0: { action_sets: { rotate_left: [act('novastar', 'brightness', {})], 1000: [act('internal', 'wait', { time: v('1') })] } } } }) },
			},
		},
	},
	triggers: {
		b: {
			options: { name: 'Sunday power on', enabled: true, sortOrder: 1, notes: 'Turns things on.' },
			events: [{ type: 'timeofday', options: { time: '08:05:00', days: [0] } }],
			condition: [],
			actions: [act('internal', 'exec', { path: v('power on'), targetVariable: v('pa_state') })],
		},
		a: {
			options: { name: 'Poll', sortOrder: 0 },
			events: [{ type: 'interval', options: { seconds: 10 } }],
			condition: [fb('internal', 'check_expression', { expression: v('1 == 1', true) })],
			actions: [act('atem', 'program', { input: v(3), mixeffect: v(0) })],
		},
		c: { options: { name: 'Off', enabled: false, sortOrder: 2 }, events: [{ type: 'startup', options: {} }], actions: [] },
	},
	custom_variables: {
		b: { description: 'Second', defaultValue: 0, persistCurrentValue: true, sortOrder: 1 },
		a: { description: 'First', defaultValue: 'on', sortOrder: 0 },
	},
	instances: {
		atem: { label: 'atem', moduleId: 'bmd-atem', moduleVersionId: '4.4.0', sortOrder: 0, enabled: true, config: { host: '', bonjourHost: '10.23.0.34:9910', modelID: 0 }, secrets: {} },
		pp: {
			label: 'propresenter',
			moduleId: 'renewedvision-propresenter-api',
			moduleVersionId: '1.1.1',
			sortOrder: 1,
			config: { host: '10.23.0.204', port: '1100', pass: 'hunter22', presets: { a: 1 }, empty: '' },
			secrets: { token: 'sekrit-token' },
		},
		novastar: { label: 'novastar', moduleId: 'novastar-controller', moduleVersionId: '2', sortOrder: 2, enabled: false, config: { host: '10.23.0.23', port: 5200 } },
		visca: { label: 'visca', moduleId: 'ptzoptics-visca', moduleVersionId: '4', sortOrder: 3, config: { host: '10.23.0.181', port: 5678 } },
		dante: { label: 'dante', moduleId: 'audinate-dantecontroller', moduleVersionId: '1', sortOrder: 4, config: { ip: '10.23.0.242' } },
		pco: { label: 'pco', moduleId: 'planningcenter-serviceslive', moduleVersionId: '2', sortOrder: 5, config: { secretkey: 'short', servicetypeid: '919088' } },
		odd: { label: 'odd', moduleId: 'something-new', moduleVersionId: '1', config: {} },
	},
	surfaces: {
		'streamdeck:AAA': { name: 'Elgato Stream Deck + XL' },
		'board:1': { name: 'Service Health deck' },
		'board:2': { name: 'Service Health deck' },
		'timing-1': {},
	},
	imageLibrary: {
		0: { originalImage: SVG, previewImage: 'data:image/webp;base64,P', info: { name: 'home', collectionId: 'nav' } },
		1: { originalImage: 'data:image/png;base64,O', previewImage: 'data:image/webp;base64,Q', info: { name: 'power', collectionId: 'power', description: 'd' } },
		2: { originalImage: 'data:image/png;base64,O', info: { name: 'proj', collectionId: 'gone' } },
		3: { originalImage: SVG, info: {} },
	},
	imageLibraryCollections: [
		{ id: 'nav', label: 'nav' },
		{ id: 'power', label: 'power' },
	],
}

const DEFS = {
	actions: {
		atem: {
			program: {
				label: 'Set Program input',
				options: [
					{ id: 'mixeffect', label: 'M/E', type: 'dropdown', choices: [{ id: 0, label: 'M/E 1' }] },
					{ id: 'input', label: 'Input', type: 'dropdown', choices: [{ id: 3, label: 'PP1' }] },
					{ id: 'note', type: 'static-text' },
				],
			},
			streamStartStop: { label: 'Stream: Start or Stop', options: [{ id: 'action', label: 'Action', type: 'dropdown', choices: [{ id: 'toggle', label: 'Toggle' }] }] },
		},
	},
	feedbacks: {},
}

const STATUSES = { atem: { category: 'good', level: 'ok', message: null }, pp: { category: 'error', level: 'Disconnected', message: 'gone' }, visca: { category: 'good' } }

const VIDEOHUB = `PROTOCOL PREAMBLE:
Version: 2.5

VIDEOHUB DEVICE:
Model name: Blackmagic Micro Videohub
Unique ID: 7c2e

INPUT LABELS:
0 Aux 1
1 Camera 1
2 PP1
3 Mystery Box
4 Input 5

OUTPUT LABELS:
0 ATEM 1
1 LED Wall
2 Deck Recorder
3 Stage Feed
4 Output 5

VIDEO OUTPUT ROUTING:
0 1
1 2
2 0
3 3
4 9

`
const ATEM = `VIDEOHUB DEVICE:
Model name: ATEM Television Studio HD8

INPUT LABELS:
0 Black
1 Cam 1

OUTPUT LABELS:
0 Auxiliary 1

CONFIGURATION:
Video Mode: 1080p59.94

VIDEO OUTPUT ROUTING:
0 1
0 9
`

const model = () => buildModel(EXPORT, { defs: DEFS.actions, fbdefs: DEFS.feedbacks, statuses: STATUSES })

describe('markdown', () => {
	it('renders the block types the docs use', () => {
		const html = markdown(
			[
				'# Title *x*',
				'',
				'Para line one',
				'line two with `a|b` and **bold** and _it_ and *em* and ~~gone~~ and [link](http://x).',
				'',
				'```',
				'# not a heading <b>',
				'```',
				'---',
				'| A | B \\| C |',
				'|---|:---:|',
				'| 1 | `2` |',
				'',
				'> quoted **bit**',
				'> more',
				'',
				'- [ ] todo',
				'- [x] done',
				'  continued',
				'  1. nested',
				'- plain',
				'',
				'1. one',
				'2. two',
				'',
				'| not a table',
			].join('\n'),
			{ idPrefix: 'p-' },
		)
		expect(html).toContain('<h1 id="p-title-x">Title <em>x</em></h1>')
		expect(html).toContain('<p>Para line one line two with <code>a|b</code> and <strong>bold</strong> and <em>it</em> and <em>em</em> and <del>gone</del> and <a href="http://x">link</a>.</p>')
		expect(html).toContain('<pre><code># not a heading &lt;b&gt;</code></pre>')
		expect(html).toContain('<hr>')
		expect(html).toContain('<th>B | C</th>')
		expect(html).toContain('<td><code>2</code></td>')
		expect(html).toContain('<blockquote><p>quoted <strong>bold</strong> more</p></blockquote>'.replace('bold', 'bit'))
		expect(html).toContain('<li class="task"><span class="box">☐</span> todo</li>')
		expect(html).toContain('<li class="task"><span class="box">☑</span> done continued <br>nested</li>')
		expect(html).toContain('<ol><li>one</li><li>two</li></ol>')
		expect(html).toContain('<p>| not a table</p>')
	})

	it('leaves snake_case and lone asterisks alone, and escapes', () => {
		expect(inline('custom_vh_dest a * b')).toBe('custom_vh_dest a * b')
		expect(escape('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
		expect(slug('The **Rig**: `x` & y')).toBe('the-rig-x-y')
		expect(markdown('')).toBe('')
	})
})

describe('describe', () => {
	it('words option values', () => {
		expect(optionText(v('x + 1', true))).toBe('= x + 1')
		expect(optionText(v(true))).toBe('yes')
		expect(optionText(v(false))).toBe('no')
		expect(optionText(v(0xff0000), { type: 'colorpicker' })).toBe('#FF0000')
		expect(optionText(v([1, 9]), { choices: [{ id: 1, label: 'One' }] })).toBe('One, 9')
		expect(optionText(v({ a: 1 }))).toBe('{"a":1}')
		expect(optionText(v(null))).toBe('null')
		expect(optionText(v(3), { choices: [{ id: 3, label: 'PP1' }] })).toBe('PP1')
		expect(hex(-1)).toBe('#FFFFFF')
		expect(looksLikeCode('$(a:b)')).toBe(true)
		expect(looksLikeCode('PP1')).toBe(false)
	})

	it('says Companion’s own actions in plain words', () => {
		const ctx = { pageNames: { 2: 'Power' } }
		const say = (e) => describeEntity(e, ctx)
		expect(say(act('internal', 'set_page', { page: v('2') })).what).toBe('Go to page 2 · Power')
		expect(say(act('internal', 'set_page', { page: v('9') })).what).toBe('Go to page 9')
		expect(say(act('internal', 'exec', { path: v('ls') })).what).toBe('Run on the Pi')
		expect(say(act('internal', 'exec', { targetVariable: v('t') })).options).toEqual([['', '']])
		expect(say(act('internal', 'exec', { path: v('ls'), targetVariable: v('t') })).what).toBe('Run on the Pi, result into $(custom:t)')
		expect(say(act('internal', 'custom_variable_set_value', { name: v('n'), value: v('a ? b : c', true) })).options).toEqual([['to', '= a ? b : c']])
		expect(say(act('internal', 'custom_variable_set_value', { name: v('n') })).options).toEqual([['to', '']])
		expect(say(fb('internal', 'variable_value', { variable: v('custom:s'), op: v('ne'), value: v('on') })).what).toBe('$(custom:s) ≠ "on"')
		expect(say(fb('internal', 'variable_value', { variable: v('custom:s'), op: v('odd'), value: v('on') })).what).toBe('$(custom:s) odd "on"')
		expect(say(fb('internal', 'check_expression', { expression: v('x', true) })).options).toEqual([['', 'x']])
		expect(say(fb('internal', 'check_expression', {})).options).toEqual([['', '']])
		expect(say(fb('internal', 'logic_operator', { operation: v('or') })).what).toBe('Any of these')
		expect(say(fb('internal', 'logic_operator', { operation: v('and') })).what).toBe('All of these')
		expect(say(act('internal', 'wait', { time: v('100') })).what).toBe('Wait 100 ms')
		const ifThen = say(
			act('internal', 'logic_if', {}, {
				children: { condition: [fb('internal', 'check_expression', { expression: v('x') })], actions: [act('internal', 'wait', { time: v(1) })], else_actions: [], other: [act('a', 'b')] },
			}),
		)
		expect(ifThen.what).toBe('If')
		expect(ifThen.children.map((c) => c.group)).toEqual(['if', 'then', 'other'])
		expect(say(act('internal', 'unknown_thing', { a: v('1') })).what).toBe('unknown_thing')
	})

	it('uses module definitions, and raw ids without them', () => {
		const d = describeEntity(act('atem', 'program', { input: v(3), mixeffect: v(0), extra: v('e'), blank: v(''), gone: undefined }), { defs: DEFS.actions, labels: { atem: 'atem' } })
		expect(d).toMatchObject({ who: 'atem', what: 'Set Program input', options: [['M/E', 'M/E 1'], ['Input', 'PP1'], ['extra', 'e']] })
		const raw = describeEntity({ connectionId: 'zz', definitionId: 'do', disabled: true, isInverted: v(true) })
		expect(raw).toMatchObject({ who: 'zz', what: 'do', options: [], disabled: true, inverted: true })
		expect(entityLines(raw)).toEqual(['zz · do (inverted) (disabled)'])
	})

	it('words what a feedback changes', () => {
		expect(override({ elementId: 'box0', elementProperty: 'color', override: v(0x15803d) })).toEqual({ name: 'colour', value: '#15803D', colour: '#15803D' })
		expect(override({ elementId: 'text0', elementProperty: 'color', override: v(1) })).toMatchObject({ name: 'text colour' })
		expect(override({ elementId: 'image0', elementProperty: 'base64Image', override: v('$(image:rec)') })).toEqual({ name: 'icon', value: 'rec' })
		expect(override({ elementId: 'text0', elementProperty: 'text', override: v('a', true) })).toEqual({ name: 'label', value: '= a' })
		expect(override({ elementId: 'box0', elementProperty: 'opacity', override: v(50) })).toEqual({ name: 'box0.opacity', value: '50' })
		expect(override({ elementProperty: 'color' })).toEqual({ name: 'colour', value: undefined })
	})

	it('words trigger events', () => {
		expect(describeEvent({ type: 'interval', options: { seconds: 5 } })).toBe('Every 5 s')
		expect(describeEvent({ type: 'timeofday', options: { time: '10:00:00', days: [0, 6] } })).toBe('At 10:00:00 on Sun, Sat')
		expect(describeEvent({ type: 'timeofday', options: { time: '10:00:00' }, enabled: false })).toBe('At 10:00:00 on no day (disabled)')
		expect(describeEvent({ type: 'variable_changed', options: { variableId: 'a:b' } })).toBe('When $(a:b) changes')
		expect(describeEvent({ type: 'startup', options: { delay: 500 } })).toBe('When Companion starts, after 500 ms')
		expect(describeEvent({ type: 'startup' })).toBe('When Companion starts')
		expect(describeEvent({ type: 'condition_true' })).toBe('When the condition becomes true')
		expect(describeEvent({ type: 'condition_false' })).toBe('When the condition becomes false')
		expect(describeEvent({ type: 'button_press', options: { a: 1 } })).toBe('button_press {"a":1}')
	})

	it('flattens trees to lines', () => {
		const d = describeEntity(
			act('internal', 'logic_if', {}, { children: { condition: [fb('internal', 'check_expression', { expression: v('x') }, [{ elementId: 'box0', elementProperty: 'color', override: v(0) }])] } }),
		)
		expect(entityLines(d)).toEqual(['internal · If', '  if:', '    internal · This is true: x', '      → colour #000000'])
		const grouped = describeEntity(fb('internal', 'logic_operator', { operation: v('and') }, [], { children: { default: [fb('internal', 'check_expression', { expression: v('y') })] } }))
		expect(entityLines(grouped)).toEqual(['internal · All of these', '    internal · This is true: y'])
	})
})

describe('model', () => {
	it('finds every credential and refuses a book holding one', () => {
		const secrets = secretValues(EXPORT)
		expect([...secrets].sort()).toEqual(['hunter22', 'sekrit-token'])
		expect(() => assertNoSecrets('fine', secrets)).not.toThrow()
		expect(() => assertNoSecrets('x hunter22 y', secrets, 'operator')).toThrow('operator: 1 credential value(s)')
		expect(secretValues({})).toEqual(new Set())
	})

	it('lists connections with safe settings only', () => {
		const list = connections(EXPORT, STATUSES)
		const pp = list.find((c) => c.label === 'propresenter')
		expect(pp.settings).toEqual([
			['host', '10.23.0.204'],
			['port', '1100'],
		])
		expect(pp.credentials).toEqual(['pass', 'token'])
		expect(pp.status).toBe('error (Disconnected): gone')
		expect(list.find((c) => c.label === 'atem').status).toBe('good')
		expect(list.find((c) => c.label === 'visca').status).toBe('good')
		expect(list.find((c) => c.label === 'novastar')).toMatchObject({ enabled: false, status: 'unknown' })
		expect(connections({})).toEqual([])
	})

	it('reads key styles', () => {
		const images = { home: SVG }
		expect(keyStyle(key({ text: 'A', image: '$(image:home)', border: 2 }), images)).toMatchObject({ bg: '#111111', border: '#FF0000', texts: ['A'], icon: 'home', image: SVG })
		expect(keyStyle(key({ image: '$(image:missing)' }), images)).toMatchObject({ icon: 'missing', image: null })
		expect(keyStyle(key({ image: SVG }))).toMatchObject({ icon: 'embedded', image: SVG })
		expect(keyStyle(key({ image: v('$(image:x)', true), text: v('a', true) }))).toMatchObject({ icon: '= $(image:x)', image: null, texts: ['= a'] })
		expect(keyStyle(key({ text: 'x', extraText: 'hidden' })).texts).toEqual(['x'])
		expect(keyStyle({ style: { layers: [{ type: 'box', id: 'b', color: v(1) }, { type: 'text', id: 't', text: v(null) }] } })).toMatchObject({ bg: '#000001', texts: [], color: '#FFFFFF' })
		expect(keyStyle({})).toMatchObject({ bg: '#000000', border: null, color: '#FFFFFF', texts: [], icon: null })
		expect(keyStyle({ style: { layers: [{ type: 'box', id: 'box0' }, { type: 'text', id: 'text0', text: v('t') }] } })).toMatchObject({ bg: '#000000', color: '#FFFFFF' })
	})

	it('builds pages, triggers, variables, surfaces and the library', () => {
		const m = model()
		expect(m.build).toBe('5.0.7+test')
		expect(m.pages.map((p) => p.name)).toEqual(['Home', 'Power'])
		const power = m.pages[1]
		expect(power.keys.map((k) => k.at)).toEqual(['r0c0', 'r1c0'])
		expect(power.keys[1].steps[0].sets[0].actions[0].what).toBe('Run on the Pi')
		const home = m.pages[0]
		expect(home.keys.find((k) => k.at === 'r2c0').steps.map((s) => s.name)).toEqual(['', 'Go'])
		expect(home.keys.find((k) => k.at === 'r5c0').steps[0].sets.map((s) => s.set)).toEqual(['After 1000 ms', 'Turn left'])
		expect(m.triggers.map((t) => t.name)).toEqual(['Poll', 'Sunday power on', 'Off'])
		expect(m.triggers[2].enabled).toBe(false)
		expect(m.triggers[0].conditions[0].what).toBe('This is true')
		expect(m.variables).toEqual([
			{ name: 'a', description: 'First', default: 'on', persists: false },
			{ name: 'b', description: 'Second', default: '0', persists: true },
		])
		expect(m.surfaces).toEqual({
			physical: [{ id: 'streamdeck:AAA', name: 'Elgato Stream Deck + XL', kind: 'streamdeck' }],
			others: [
				{ name: 'Service Health deck', count: 2 },
				{ name: 'timing-1', count: 1 },
			],
		})
		expect(m.library.map((i) => [i.collection, i.name, i.src.slice(0, 14)])).toEqual([
			['gone', 'proj', 'data:image/pn'.padEnd(14, 'g')],
			['nav', 'home', 'data:image/svg'],
			['power', 'power', 'data:image/web'],
		])
		expect(m.usage.atem).toEqual(['Home r2c0', 'trigger "Poll"'])
		expect(m.usage.Companion).toContain('Power r1c0')
		expect(customVariables({})).toEqual([])
		expect(surfaces({})).toEqual({ physical: [], others: [] })
		expect(library({})).toEqual([])
		expect(buildModel({}).pages).toEqual([])
	})
})

describe('a sparse export', () => {
	// Companion leaves out keys it has no value for; the manual must still build.
	const SPARSE = {
		pages: {
			1: { name: 'Bare' },
			2: {
				name: 'Odd',
				controls: {
					1: {
						0: { style: { layers: [{ type: 'box', id: 'box0', color: v(1), borderWidth: v(2) }, { type: 'text', id: 'text0', text: v('Bare key') }] } },
						1: key({
							text: 'Steps',
							steps: {
								0: { action_sets: { down: [act('internal', 'logic_if', {}, { children: { actions: [act('atem', 'cut')] } })] }, options: { name: 'Arm' } },
								1: { action_sets: { down: [act('atem', 'cut')] } },
								2: {},
							},
						}),
					},
				},
			},
		},
		triggers: { t: {}, u: { options: {} } },
		custom_variables: { z: {}, y: { description: 'Y', defaultValue: 'x' } },
		instances: { a: { label: 'a', moduleId: 'm' }, b: { label: 'b', moduleId: 'm', config: { password: 'longsecret' } } },
		surfaces: { streamdeck: {} },
		imageLibrary: {
			0: { originalImage: SVG, info: { name: 'b' } },
			1: { originalImage: SVG, info: { name: 'a' } },
		},
	}

	it('builds with defaults for everything missing', () => {
		const m = buildModel(SPARSE)
		expect(m.pages.map((p) => p.keys.length)).toEqual([0, 2])
		expect(m.pages[1].keys[0]).toMatchObject({ notes: '', steps: [], feedbacks: [], style: { border: '#000000' } })
		expect(m.triggers[0]).toMatchObject({ name: '(unnamed)', enabled: true, notes: '', events: [], conditions: [], actions: [] })
		expect(m.variables).toEqual([
			{ name: 'z', description: '', default: '', persists: false },
			{ name: 'y', description: 'Y', default: 'x', persists: false },
		])
		expect(m.connections.map((c) => c.credentials)).toEqual([[], ['password']])
		expect(secretValues(SPARSE)).toEqual(new Set(['longsecret']))
		expect(m.library.map((i) => i.name)).toEqual(['a', 'b'])
		expect(m.usage.atem).toEqual(['Odd r1c1'])
		const chapters = referenceChapters(m, { vh: parseDump(VIDEOHUB), atem: parseDump(ATEM) })
		const all = chapters.map((c) => c.html).join('')
		expect(all).toContain('<td>—</td>')
		expect(all).toContain('<code>streamdeck</code>')
		expect(all).toContain('<h3>unsorted</h3>')
		const odd = keyTable(m.pages[1])
		expect(odd).toContain('Step 1 "Arm" · Press')
		expect(odd).toContain('Step 2 · Press')
		expect(odd).toContain('<span class="grp">then</span>')
		const any = entityHtml(describeEntity(fb('internal', 'logic_operator', { operation: v('or') }, [], { children: { default: [fb('internal', 'check_expression', { expression: v('x') })] } })))
		expect(any).toContain('<div class="kids"><div class="ent"><span class="who">internal</span> <b>This is true</b>')
	})

	it('draws a router with gaps in its labels', () => {
		const vh = { model: 'm', inputs: [, 'Camera 1'], outputs: [], routing: [] }
		expect(videoCabling(vh)).toContain('Camera 1')
	})
})

describe('blackmagic', () => {
	it('parses a router dump', () => {
		const vh = parseDump(VIDEOHUB.replace(/\n/g, '\r\n'))
		expect(vh).toMatchObject({ model: 'Blackmagic Micro Videohub', id: '7c2e', mode: '' })
		expect(vh.inputs).toEqual(['Aux 1', 'Camera 1', 'PP1', 'Mystery Box', 'Input 5'])
		expect(vh.routing).toEqual([1, 2, 0, 3, 9])
		expect(parseDump(ATEM).mode).toBe('1080p59.94')
		expect(parseDump('')).toEqual({ model: '', id: '', inputs: [], outputs: [], routing: [], mode: '' })
	})
})

describe('diagrams', () => {
	it('draws boxes, ports and curves, and rejects a dangling edge', () => {
		const svg = blockDiagram({
			columns: [[{ id: 'a', title: 'A <1>', sub: 'sub', ports: [{ id: 'p', label: 'P' }, { id: 'q', label: 'Q' }] }], [{ id: 'b', title: 'B', muted: true }]],
			edges: [{ from: 'a.p', to: 'b', dashed: true, label: 'via' }, { from: 'a.q', to: 'b', faint: true, colour: '#123456' }],
		})
		expect(svg).toContain('A &lt;1&gt;')
		expect(svg).toContain('stroke-dasharray')
		expect(svg).toContain('nb muted')
		expect(svg).toContain('>via</text>')
		expect(() => blockDiagram({ columns: [[{ id: 'a', title: 'A' }]], edges: [{ from: 'x', to: 'a' }] })).toThrow('no node "x"')
		expect(() => blockDiagram({ columns: [[{ id: 'a', title: 'A', ports: [] }]], edges: [{ from: 'a.z', to: 'a' }] })).toThrow('no port "a.z"')
		expect(blockDiagram({ columns: [[{ id: 'a', title: 'A' }]], edges: [] })).toContain('<svg')
	})

	it('draws the video cabling from the dumps', () => {
		const svg = videoCabling(parseDump(VIDEOHUB), parseDump(ATEM))
		expect(svg).toContain('Mystery Box')
		expect(svg).toContain('Other sources')
		expect(svg).toContain('Other destinations')
		expect(svg).toContain('ATEM 1 — &quot;Cam 1&quot;')
		// Four labelled inputs and four labelled outputs get cables; "Input 5" and "Output 5" are spares.
		expect(svg.match(/stroke-dasharray/g)).toHaveLength(8)
		expect(videoCabling(parseDump(VIDEOHUB))).toContain('ATEM 1')
	})

	it('draws the audio inputs and the control map', () => {
		const sources = [
			{ key: 'a', name: 'A', device: 'dev-a', routes: [[1, 1]] },
			{ key: 'h', name: 'H', device: 'dev-h', away: 'On XLR', routes: [[1, 9]] },
		]
		const svg = audioInputs(sources, (r) => `SQ ${r[0][1]}`)
		expect(svg).toContain('XLR, not Dante')
		expect(svg).toContain('SQ 9  H')
		const map = controlMap([
			{ from: 'a', device: 'D', address: '1', via: 'x' },
			{ from: 'b', device: 'D', address: '1', via: 'y' },
		])
		expect(map.match(/class="nt"/g)).toHaveLength(2)
	})
})

describe('html', () => {
	const m = model()

	it('draws a page as a deck, numbered, with highlights', () => {
		const html = keyGrid(m.pages[0], { highlight: ['r2c0'] })
		expect(html).toContain('class="key hl"')
		expect(html).toContain('class="key strip"')
		expect(html).toContain('class="key dial"')
		expect(html).toContain('Stream\n…')
		expect(keyGrid(m.pages[1])).toContain('grid-template-rows:repeat(4, 1fr)"')
		expect(keyGrid({ keys: [{ row: 4, col: 0, at: 'r4c0', style: { texts: [], bg: '#000', color: '#fff' } }] })).toContain('0.55fr"')
	})

	it('shortens variables in a key picture, nested ones too', () => {
		expect(pictureText('$(atem:macro_$(local:index))')).toBe('…')
		expect(pictureText('Vol $(a:b) $(c:d)')).toBe('Vol … …')
		expect(pictureText('= concat()')).toBe('…')
	})

	it('tables every key, folding plain page links into one line', () => {
		const html = keyTable(m.pages[0])
		expect(html).toContain('<td class="n">1–2</td>')
		expect(html).toContain('Open another page')
		expect(html).toContain('Step 2 "Go" · Press')
		expect(html).toContain('Shows only; pressing it does nothing.')
		expect(html).toContain('<small>strip</small>')
		expect(html).toContain('<small>dial</small>')
		expect(html).toContain('icon embedded')
		const single = keyTable(m.pages[1])
		expect(single).toContain('<td class="n">1</td>')
		expect(single).toContain('Looks different when')
		expect(single).toContain('Powers the projectors.')
		expect(single).toContain('class="chip" style="background:#00A651"')
		const trailing = keyTable({ keys: [{ ...m.pages[1].keys[0], style: { ...m.pages[1].keys[0].style, texts: [] } }] })
		expect(trailing).toContain('(icon) → page 1')
	})

	it('knows a key that only opens a page', () => {
		expect(navTarget(m.pages[1].keys[0])).toBe('page 1 · Home')
		expect(navTarget(m.pages[1].keys[1])).toBeNull()
	})

	it('renders entities with flags, code and children', () => {
		const html = entityHtml(
			describeEntity(
				act('internal', 'logic_if', {}, { disabled: true, isInverted: v(true), children: { actions: [act('atem', 'x', { a: v('$(a:b)') })] } }),
				{ labels: { internal: 'Companion', atem: 'atem' } },
			),
		)
		expect(html).toContain('<span class="flag">inverted</span>')
		expect(html).toContain('<span class="flag">disabled</span>')
		expect(html).toContain('<span class="grp">then</span>')
		expect(html).toContain('<span class="who">atem</span>')
		expect(html).toContain('<code>$(a:b)</code>')
		const ov = entityHtml(describeEntity(fb('internal', 'logic_operator', {}, [{ elementId: 'text0', elementProperty: 'text', override: v('$(a:b)') }], { children: { default: [] } })))
		expect(ov).toContain('label <code>$(a:b)</code>')
	})

	it('builds a whole book with cover, contents and chapters', () => {
		const html = book({ kind: 'recovery', readAt: 'today', build: 'b', chapters: [{ title: 'One', lead: 'Why *this*', html: '<p>x</p>' }, { title: 'Two', html: '' }] })
		expect(html).toContain('--tone:#b91c1c;')
		expect(html).toContain('<li class="this">')
		expect(html).toContain('<section class="chapter" id="one">')
		expect(html).toContain('<p class="lead">Why <em>this</em></p>')
		expect(callout('note', 'T <x>', '<p>b</p>')).toBe('<aside class="callout note"><div class="ct">T &lt;x&gt;</div><p>b</p></aside>')
		expect(table(['a'], [['1']], 'c')).toBe('<table class="c"><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>')
		expect(code('<')).toBe('<code>&lt;</code>')
	})
})

describe('compose', () => {
	it('splits chapters, takes leads and runs directives', () => {
		const chapters = chaptersFromMarkdown(
			['# One', 'Lead: The point.', '', 'Body.', '{{thing a b}}', 'After.', '```', '# not a chapter', '{{thing}}', '```', '# Two', 'Text first.', 'Lead: not a lead, it follows text'].join('\r\n'),
			{ thing: (args) => `<x>${args}</x>` },
		)
		expect(chapters).toHaveLength(2)
		expect(chapters[0].lead).toBe('The point.')
		expect(chapters[0].html).toContain('<p>Body.</p>\n<x>a b</x>\n<p>After.</p>')
		expect(chapters[0].html).toContain('# not a chapter\n{{thing}}')
		expect(chapters[1].lead).toBe('')
		expect(chapters[1].html).toContain('Lead: not a lead')
		expect(() => chaptersFromMarkdown('# A\n{{nope}}')).toThrow('unknown directive {{nope}}')
		expect(() => chaptersFromMarkdown('{{x}}', { x: () => '' })).toThrow('before the first chapter')
		expect(chaptersFromMarkdown('text before any chapter')).toEqual([])
	})
})

describe('reference', () => {
	const m = model()
	const data = { vh: parseDump(VIDEOHUB), atem: parseDump(ATEM) }

	it('works out where a connection points', () => {
		expect(address({ settings: [['bonjourHost', 'b:1'], ['host', 'h']] })).toBe('b:1')
		expect(address({ settings: [['host', 'h'], ['port', '1']] })).toBe('h:1')
		expect(address({ settings: [['host', 'h'], ['targetPort', '2']] })).toBe('h:2')
		expect(address({ settings: [['ip', 'i']] })).toBe('i')
		expect(address({ settings: [] })).toBe('—')
	})

	it('lists every control link, connections then scripts', () => {
		const links = controlLinks(m)
		expect(links[0]).toMatchObject({ from: 'atem (bmd-atem)', device: 'ATEM Television Studio HD8', address: '10.23.0.34:9910', via: 'ATEM protocol, UDP 9910' })
		expect(links.find((l) => l.from.startsWith('visca')).device).toBe('PTZ camera 10.23.0.181')
		expect(links.find((l) => l.from.startsWith('odd'))).toMatchObject({ device: 'something-new', via: '' })
		expect(links.at(-1).from).toBe('system stats (awk, df, ping)')
	})

	it('builds every Reference chapter', () => {
		const chapters = referenceChapters(m, data)
		const titles = chapters.map((c) => c.title)
		expect(titles).toEqual([
			'How it fits together',
			'Video cabling and routing',
			'Audio',
			'Connections',
			'Page 1 · Home',
			'Page 2 · Power',
			'Triggers',
			'Custom variables',
			'Surfaces',
			'Image library',
			'Site walk: what only eyes can confirm',
		])
		const all = chapters.map((c) => c.html).join('')
		expect(all).toContain('IN 1 · Aux 1')
		expect(all).toContain('<td>—</td>')
		expect(all).toContain('video mode <b>1080p59.94</b>')
		expect(all).toContain('Planning Center')
		expect(all).toContain('(disabled)')
		expect(all).toContain('$(custom:a)')
		expect(chapters[4].lead).toMatch(/^Where the deck starts/)
		expect(chapters.find((c) => c.title === 'Page 2 · Power').lead).toMatch(/^Projectors/)
		const unnamed = referenceChapters({ ...m, pages: [{ ...m.pages[0], name: 'Custom' }] }, { vh: data.vh, atem: undefined })
		expect(unnamed.find((c) => c.title === 'Page 1 · Custom').lead).toBe('7 keys.')
		expect(unnamed[1].html).toContain('video mode <b>?</b>')
	})

	it('folds long usage lists, and connections nobody uses', () => {
		const many = { ...m, usage: { atem: Array.from({ length: 14 }, (_, i) => `k${i}`) } }
		const html = referenceChapters(many, data).find((c) => c.title === 'Connections').html
		expect(html).toContain('and 2 more')
	})

	it('puts the timed triggers in order', () => {
		const html = schedule(m)
		expect(html).toContain('<b>08:05:00 on Sun</b>')
		expect(html).toContain('Turns things on.')
		expect(schedule({ triggers: [{ name: 'x', enabled: false, notes: '', events: ['At 09:00 on Sun', 'At 07:00 on Sun'], actions: [] }] })).toMatch(/07:00.*09:00/)
	})

	it('offers directives to the hand-written books', () => {
		const d = directives(m, data)
		expect(d.page('1 r2c0,r0c1')).toContain('key hl')
		expect(d.page('2')).not.toContain('key hl')
		expect(() => d.page('99')).toThrow('no page 99')
		expect(d.keys('2')).toContain('Projectors')
		expect(d.schedule()).toContain('Sunday power on')
		expect(d.credentials()).toContain('1Password entry')
		expect(d.connections()).toContain('propresenter')
		expect(d.video()).toContain('<svg')
		expect(d.audio()).toContain('Dante network')
		expect(d.control()).toContain('Companion Pi')
		expect(d.pages()).toContain('<td>Power</td>')
	})
})
