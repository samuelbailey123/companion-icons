/**
 * Show the ProPresenter timer on the PP1 page.
 *
 * Usage: node tools/pp1-page.js <prod-full.json> <outfile>
 *
 * The Speaker and Worship buttons both drive the SAME ProPresenter timer — they are
 * duration presets, 45 minutes and 25 minutes, not two separate timers. So there is one
 * value to display, and it belongs on both buttons rather than on a separate readout.
 *
 * That also solves a space problem: PP1 has no room left. Six of eight keys are in use
 * plus two for navigation, and all four touchstrip segments are occupied by Speaker,
 * Worship, All Screens and Stage Notes. Putting the countdown on the buttons themselves
 * costs nothing.
 *
 * Each button now shows its preset name with the live countdown beneath, and colours by
 * timer state: green while running, amber once it overruns, red if it overran and stopped.
 *
 * THE VARIABLE NAME. The module publishes one variable per timer, built as
 * `timer_<uuid with dashes stripped>` (see timersCurrentUpdated in the module source), plus
 * `_seconds` and `_custom` variants. That beats parsing `timers_current_json` with jsonpath.
 * The case is taken from the timer id in the existing button config; if ProPresenter reports
 * the uuid in a different case the button will read $NA and only this constant needs
 * changing. This could not be verified at build time because ProPresenter was idle and
 * publishing no timer data at all.
 */
import fs from 'node:fs/promises'

const [, , src, out] = process.argv
if (!src || !out) {
	console.error('usage: node tools/pp1-page.js <prod-full.json> <outfile>')
	process.exit(1)
}

const v = (value) => ({ value, isExpression: false })

const RUNNING_GREEN = 0x15803d
const OVERRUNNING_AMBER = 0xd97706
const OVERRAN_RED = 0xb91c1c

/** Layer id for the countdown line, so a rebuild can replace it instead of duplicating it. */
const COUNTDOWN_ID = 'text1'

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages['2'])

const ppId = Object.entries(full.instances).find(
	([, i]) => i?.moduleId === 'renewedvision-propresenter-api'
)?.[0]
if (!ppId) throw new Error('no ProPresenter connection found')

const TIMERS = [
	{ cell: ['2', '0'], label: 'Speaker' },
	{ cell: ['2', '1'], label: 'Worship' },
]

/**
 * The two playlist-focus buttons, keyed by the operation they perform.
 *
 * They were added by hand with a 27px PNG stretched over the whole 120px key and a label of
 * `Focus\n\n\nPrevious` — blank lines used to shove the word below the artwork. This puts
 * them on the same footing as every other button on the page: a library icon in the top
 * band, one line of label beneath it.
 */
const FOCUS = {
	focus_previous: { image: 'focus-prev', label: 'Focus Prev' },
	focus_next: { image: 'focus-next', label: 'Focus Next' },
}

/**
 * Find the focus buttons by what they DO, not by where they sit.
 *
 * Matching on the operation alone is not enough: the Thunder button also issues
 * `focus_next`, as one of two actions, before triggering its audio playlist. Restyling it
 * would wreck it. A real focus button is one whose entire behaviour is a single
 * `focusedPresentationOperation`, so that is the test.
 */
function focusKindOf(control) {
	const actions = []
	for (const step of Object.values(control.steps ?? {})) {
		for (const set of Object.values(step.action_sets ?? {})) {
			if (Array.isArray(set)) actions.push(...set)
		}
	}
	if (actions.length !== 1) return null
	const [only] = actions
	if (only.definitionId !== 'focusedPresentationOperation') return null
	const op = only.options?.focused_presentation_operation
	return (op && typeof op === 'object' ? op.value : op) ?? null
}

/** Pull the timer uuid out of the button's own action so it can never drift apart from it. */
function timerIdFrom(control) {
	for (const step of Object.values(control.steps ?? {})) {
		for (const set of Object.values(step.action_sets ?? {})) {
			if (!Array.isArray(set)) continue
			for (const a of set) {
				if (a.definitionId !== 'timerOperation') continue
				const chosen = a.options?.timer_id_dropdown?.value ?? a.options?.timer_id_dropdown
				if (chosen && chosen !== 'manually_specify_timerid') return String(chosen)
			}
		}
	}
	return null
}

function stateFeedback(timerId, state, colour) {
	return {
		id: id('fb'),
		definitionId: 'TimerState',
		connectionId: ppId,
		options: {
			timer_id_dropdown: v(timerId),
			timer_id_text: v(''),
			timer_state: v(state),
		},
		type: 'feedback',
		isInverted: v(false),
		styleOverrides: [
			{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(colour) },
			{ overrideId: id('ovr'), elementId: 'text0', elementProperty: 'color', override: v(0xffffff) },
		],
		children: {},
	}
}

for (const { cell, label } of TIMERS) {
	const control = page.controls[cell[0]]?.[cell[1]]
	if (!control) throw new Error(`no control at ${cell}`)

	const timerId = timerIdFrom(control)
	if (!timerId) throw new Error(`${label}: could not find a timer id in its actions`)
	const variable = `timer_${timerId.replace(/-/g, '')}`

	// Name on top, live countdown underneath. The icon layer is dropped: a countdown is the
	// information here, and a glyph would only compete with it for room.
	//
	// The countdown layer this script adds is also dropped, so re-running against a page that
	// has already been through here rebuilds it rather than stacking a second copy on top.
	// Without this the tool is not idempotent and quietly produces two layers sharing one id.
	const layers = control.style.layers.filter((l) => l.type !== 'image' && l.id !== COUNTDOWN_ID)

	for (const layer of layers) {
		if (layer.type !== 'text') continue
		Object.assign(layer, {
			text: v(label),
			x: v(2), y: v(2), width: v(96), height: v(42),
			halign: v('center'), valign: v('center'),
			fontsize: v(70), fontsizeAllowShrink: v(true),
		})
	}

	layers.push({
		id: COUNTDOWN_ID, name: 'Countdown', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(2), y: v(46), width: v(96), height: v(52), rotation: v(0),
		text: v(`$(propresenter:${variable})`),
		color: v(0xffffff), halign: v('center'), valign: v('center'),
		fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	})

	control.style.layers = layers

	// Later feedbacks win, so the most urgent state is listed last.
	control.feedbacks = [
		stateFeedback(timerId, 'running', RUNNING_GREEN),
		stateFeedback(timerId, 'overrunning', OVERRUNNING_AMBER),
		stateFeedback(timerId, 'overran', OVERRAN_RED),
	]

	console.log(`  ${label.padEnd(8)} timer ${timerId}`)
	console.log(`           -> $(propresenter:${variable})`)
}

// Restyle the focus buttons to match the rest of the page. The actions are left untouched.
let restyled = 0
for (const [row, cells] of Object.entries(page.controls)) {
	for (const [col, control] of Object.entries(cells)) {
		if (control?.type !== 'button-layered') continue

		const kind = focusKindOf(control)
		const spec = FOCUS[kind]
		if (!spec) continue

		for (const layer of control.style.layers) {
			if (layer.type === 'image') {
				// Was a stretched raster; becomes a library reference in the standard top band.
				layer.base64Image = v(`$(image:${spec.image})`)
				Object.assign(layer, { x: v(0), y: v(2), width: v(100), height: v(56) })
			}
			if (layer.type === 'text') {
				Object.assign(layer, {
					text: v(spec.label),
					x: v(0), y: v(60), width: v(100), height: v(38),
					halign: v('center'), valign: v('center'),
					fontsize: v(70), fontsizeAllowShrink: v(true),
				})
			}
		}

		restyled++
		console.log(`  ${row}/${col}    ${spec.label.padEnd(11)} -> $(image:${spec.image})`)
	}
}

if (restyled !== Object.keys(FOCUS).length) {
	throw new Error(`expected ${Object.keys(FOCUS).length} focus buttons, restyled ${restyled}`)
}

await fs.writeFile(
	out,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: 2,
	})
)

console.log(`wrote ${out}`)
