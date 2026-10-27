/**
 * VW after the 2026-10-26 move: the same keys, pointed at the ports their signals now use.
 *
 * WHY THIS IS A SAFETY FIX AND NOT TIDYING. The rack moved into the back and the Videohub was
 * re-patched. Outputs 1-6 now feed the ATEM's inputs, so VW's old numbers did not just miss: its
 * "PGM to Proj" shortcut, which routed to outputs 1 and 2, would have put Aux 1 onto ATEM inputs
 * 1 and 2 and taken both cameras off the switcher. Every number below was read off the router by
 * label on 2026-10-26, after Sam renamed its ports.
 *
 * Each key keeps its look. What changes is the port it acts on, and how the destination keys arm:
 * they now select the module's own destination, as the Videohub page does (src/switch.js), so the
 * source row's "feeding the armed output" highlight finally evaluates (rig.md, open fault 2) and
 * both pages share one selection.
 *
 * Every cell is checked against what it held before the move, or what this module makes of it,
 * so a page someone has since rearranged is refused rather than patched blind.
 */
import { feedingSelected, routeAction, selectAction, selectedOutput, pageKey, PAGE_NAME } from './switch.js'

/** Destinations on row 1: [column, router label, output before the move, output now]. */
export const OUTPUTS = [
	[0, 'Right Projector', 1, 16],
	[1, 'Left Projector', 2, 15],
	[2, 'LED Wall', 8, 14],
	[3, 'Backwall Projector', 10, 8],
	[4, 'Mini Screen 1', 11, 9],
]

/** Sources on row 2: [column, router label, input before the move, input now]. */
export const INPUTS = [
	[0, 'Program', 1, 4],
	[1, 'Aux 1', 2, 1],
	[2, 'Aux 2', 3, 3],
	[3, 'Multiview', 4, 2],
]

/** Row 3's both-projector shortcuts, PGM to Proj and Aux1 to Proj: [column, input before, input now]. */
export const SHORTCUTS = [
	[0, 1, 4],
	[1, 2, 1],
]

/** The projector pair the shortcuts drive: [before, now] for Right then Left. */
const PROJECTORS = [OUTPUTS[0], OUTPUTS[1]]

/** Touchstrip readouts: [column, output before, output now]. */
export const READOUTS = [
	[0, 1, 16],
	[2, 2, 15],
	[3, 8, 14],
	[5, 10, 8],
]

/** Where VW's key into the Videohub page goes: row 1's free end. */
export const ENTRY_CELL = { row: 1, col: 8 }

const v = (value) => ({ value, isExpression: false })
const down = (control) => control?.steps?.[0]?.action_sets?.down ?? []
const opt = (action, key) => action?.options?.[key]?.value

function cellOf(page, row, col) {
	const control = page.controls?.[row]?.[col]
	if (!control) throw new Error(`VW has no key at ${row}/${col}`)
	return control
}

const refuse = (row, col, what) => {
	throw new Error(`VW ${row}/${col} is not ${what}; it has been changed since this was written, so it is left alone`)
}

/** Swap a key's one feedback for `make(styleOverrides)`, keeping how it restyles the key. */
function refeed(control, make) {
	const [old] = control.feedbacks ?? []
	control.feedbacks = [make(old?.id ?? 'fb', old?.styleOverrides ?? [])]
}

const setDown = (control, actions) => {
	control.steps[0].action_sets.down = actions
}

/**
 * VW with every routing key, shortcut and readout on the new port numbers, and a key into the
 * Videohub page at row 1's end.
 *
 * @param page          the live VW page (not modified)
 * @param connectionId  the Videohub connection
 * @param label         its variable prefix, `videohub`
 * @param videohubPage  the Videohub page's number
 */
export function repointVW(page, { connectionId, label }, videohubPage) {
	const out = structuredClone(page)

	for (const [col, name, was, now] of OUTPUTS) {
		const control = cellOf(out, 1, col)
		const [action] = down(control)
		const old = action?.definitionId === 'custom_variable_set_value' && opt(action, 'value') === String(was)
		const repointed = action?.definitionId === 'select_destination' && opt(action, 'destination') === now
		if (!old && !repointed) refuse(1, col, `the ${name} destination key`)
		setDown(control, [selectAction(connectionId, `vw-select-${now}`, now)])
		refeed(control, (id, styles) => selectedOutput(connectionId, id, now, styles))
		control.options.notes = `Select ${name} (output ${now}) as the routing destination`
	}

	for (const [col, name, was, now] of INPUTS) {
		const control = cellOf(out, 2, col)
		const [action] = down(control)
		const old = action?.definitionId === 'route' && opt(action, 'source') === was
		const repointed = action?.definitionId === 'route_source' && opt(action, 'source') === now
		if (!old && !repointed) refuse(2, col, `the ${name} source key`)
		setDown(control, [routeAction(connectionId, `vw-route-${now}`, now)])
		refeed(control, (id, styles) => feedingSelected(connectionId, id, now, styles))
		control.options.notes = `Route ${name} (input ${now}) to the selected destination`
	}

	for (const [col, was, now] of SHORTCUTS) {
		const control = cellOf(out, 3, col)
		const actions = down(control)
		const routes = (source, index) =>
			actions.length === 2 &&
			actions.every((a, i) => a.definitionId === 'route' && opt(a, 'source') === source && opt(a, 'destination') === PROJECTORS[i][index])
		if (!routes(was, 2) && !routes(now, 3)) refuse(3, col, `a both-projector shortcut from input ${was}`)
		actions.forEach((a, i) => {
			a.options.source = v(now)
			a.options.destination = v(PROJECTORS[i][3])
		})
		const [feedback] = control.feedbacks ?? []
		if (feedback?.definitionId !== 'variable_value') refuse(3, col, 'lit from the right projector\'s source')
		feedback.options.variable = v(`${label}:output_${PROJECTORS[0][3]}_input_id`)
		feedback.options.value = v(String(now))
	}

	for (const [col, was, now] of READOUTS) {
		const control = cellOf(out, 4, col)
		const texts = (control.style?.layers ?? []).filter((l) => l.type === 'text')
		const reads = (n) => texts.length === 2 && texts[0].text?.value === `$(${label}:output_${n})`
		if (!reads(was) && !reads(now)) refuse(4, col, `the output ${was} readout`)
		texts[0].text = v(`$(${label}:output_${now})`)
		texts[1].text = v(`$(${label}:output_${now}_input)`)
	}

	const { row, col } = ENTRY_CELL
	const taken = out.controls[row]?.[col]
	if (taken && !(taken.options?.notes ?? '').startsWith('vw: opens')) refuse(row, col, 'free for the Videohub key')
	out.controls[row][col] = pageKey({
		id: 'vw-videohub',
		icon: 'matrix',
		// Broken by hand: left to wrap, it broke as "Videohu b" (seen on the rig 2026-10-26).
		label: 'Video\nhub',
		pageNumber: videohubPage,
		notes: `vw: opens the ${PAGE_NAME} page (page ${videohubPage}), every input and output on the router`,
	})
	return out
}
