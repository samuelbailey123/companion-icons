/**
 * A small Companion full export, shaped like the live one, for the manual's tests: three pages
 * sharing a folder row, a sub-page, a two-step key, a knob, two triggers, variables, connections
 * with credentials, and library images.
 */
const v = (value, isExpression = false) => ({ value, isExpression })

export const action = (connectionId, definitionId, options = {}, extra = {}) => ({
	id: `${definitionId}-${Math.random().toString(36).slice(2, 7)}`,
	type: 'action',
	connectionId,
	definitionId,
	options: Object.fromEntries(Object.entries(options).map(([k, x]) => [k, v(x)])),
	...extra,
})
export const feedback = (connectionId, definitionId, options = {}, extra = {}) => ({ ...action(connectionId, definitionId, options, extra), type: 'feedback' })

export const key = (text, { down = [], up = [], left, right, feedbacks = [], notes = '', steps, color = 0x1f2937 } = {}) => ({
	type: 'button-layered',
	style: {
		layers: [
			{ id: 'canvas', type: 'canvas' },
			{ id: 'box0', type: 'box', color: v(color) },
			{ id: 'text0', type: 'text', text: v(text) },
		],
	},
	options: { notes, rotaryActions: Boolean(left) },
	feedbacks,
	steps: steps ?? {
		0: { action_sets: { down, up, ...(left ? { rotate_left: left, rotate_right: right ?? [] } : {}) }, options: { runWhileHeld: [] } },
	},
})

const folder = () => ({
	0: { 0: key('Home', { down: [action('internal', 'set_page', { surfaceId: 'self', page: '1' })] }), 1: key('Desk', { down: [action('internal', 'set_page', { surfaceId: 'self', page: '2' })] }) },
})

export function exportFixture() {
	return {
		version: 12,
		type: 'full',
		companionBuild: '5.0.7+test',
		pages: {
			1: {
				name: 'Home',
				gridSize: { minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 },
				controls: {
					...folder(),
					1: {
						0: key('Sub', { down: [action('internal', 'set_page', { surfaceId: 'self', page: '3' })], notes: 'Opens the sub-page.' }),
						1: key('Cut', {
							down: [action('sw', 'cut', { mixeffect: 1 })],
							feedbacks: [feedback('sw', 'program', { input: 1 }, { styleOverrides: [{ elementId: 'box0', elementProperty: 'color', override: v(0xff0000) }] })],
						}),
					},
				},
			},
			2: {
				name: 'Desk',
				gridSize: { minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 },
				controls: {
					...folder(),
					1: {
						0: key('$(sw:long_1)', {
							steps: {
								0: { action_sets: { down: [action('internal', 'custom_variable_set_value', { name: 'armed', value: '1' })], up: [] } },
								1: { action_sets: { down: [action('sw', 'streamStartStop', { stream: 'toggle' })], up: [], 2000: [action('internal', 'wait', { time: 100 })] } },
							},
						}),
					},
					5: { 0: key('Level', { left: [action('desk', 'level', { db: -3 })], right: [action('desk', 'level', { db: 3 })] }) },
				},
			},
			3: {
				name: 'Sub',
				gridSize: { minColumn: 0, maxColumn: 8, minRow: 0, maxRow: 5 },
				controls: { 0: { 8: key('Back', { down: [action('internal', 'set_page', { surfaceId: 'self', page: '1' })] }) }, 2: { 2: key('Readout') } },
			},
		},
		triggers: {
			b: {
				type: 'trigger',
				options: { name: 'Sunday start', enabled: true, sortOrder: 2, notes: 'Starts things.' },
				condition: [feedback('internal', 'variable_value', { variable: 'custom:armed', op: 'eq', value: '1' })],
				events: [{ id: 'e1', type: 'timeofday', enabled: true, options: { time: '08:05:00', days: [0] } }],
				actions: [action('sw', 'streamStartStop', { stream: 'true' })],
			},
			a: {
				type: 'trigger',
				options: { name: 'Poll', enabled: false, sortOrder: 1 },
				condition: [],
				events: [{ id: 'e2', type: 'interval', enabled: true, options: { seconds: 10 } }],
				actions: [action('internal', 'exec', { path: 'true', targetVariable: 'x' })],
			},
		},
		custom_variables: {
			zeta: { description: 'Second', defaultValue: '', persistCurrentValue: true, sortOrder: 1 },
			armed: { description: 'Arms the stream', defaultValue: '0', persistCurrentValue: false, sortOrder: 0 },
		},
		instances: {
			sw: { label: 'atem', moduleId: 'bmd-atem', moduleVersionId: '4.4.0', enabled: true, sortOrder: 0, config: { host: '', bonjourHost: '10.23.0.34:9910' }, secrets: {} },
			desk: { label: 'SQ', moduleId: 'allenheath-sq', moduleVersionId: '3.1.0', enabled: true, sortOrder: 1, config: { host: '10.23.0.191', model: 'SQ7' } },
			pp: {
				label: 'propresenter',
				moduleId: 'renewedvision-propresenter-api',
				moduleVersionId: '1.1.1',
				enabled: false,
				sortOrder: 2,
				config: { host: '10.23.0.204', pass: 'Sup3r-Secret!', sdpass: '', note: 'x'.repeat(80) },
				secrets: { token: 'tok-0123456789' },
			},
			ma: { label: 'grandma2', moduleId: 'malighting-grandma2', moduleVersionId: '2.3.0', sortOrder: 3, config: { host: '10.23.0.99', user: 'administrator', pass: 'admin' } },
			pco: { label: 'pco', moduleId: 'planningcenter-serviceslive', moduleVersionId: '2.7.0', sortOrder: 4, config: { applicationid: 'app-id-123456', secretkey: 'key-abcdef123456' } },
			dn: { label: 'dante', moduleId: 'audinate-dantecontroller', moduleVersionId: '1.1.2', sortOrder: 5, config: { ip: '10.23.0.242' } },
		},
		imageLibrary: [
			{ originalImage: 'data:image/svg+xml;base64,AAA', previewImage: 'data:image/webp;base64,BBB', info: { name: 'power-on', description: 'On', collectionId: 'power' } },
			{ originalImage: 'data:image/png;base64,CCC', previewImage: 'data:image/webp;base64,DDD', info: { name: 'loose' } },
		],
	}
}

/** Module definitions in the shape `instances.definitions.*` sends. */
export const definitionsFixture = () => ({
	actions: {
		sw: {
			cut: { label: 'Cut', options: [{ id: 'mixeffect', label: 'M/E', type: 'dropdown', choices: [{ id: 1, label: 'M/E 1' }] }] },
			streamStartStop: { label: 'Stream start/stop', options: [{ id: 'stream', label: 'Stream', type: 'dropdown', choices: [{ id: 'toggle', label: 'Toggle' }] }] },
		},
	},
	feedbacks: { sw: { program: { label: 'Program tally', options: [{ id: 'note', type: 'static-text' }, { id: 'input', label: 'Input', type: 'dropdown', choices: [{ id: 1, label: 'Cam 1' }] }] } } },
})
