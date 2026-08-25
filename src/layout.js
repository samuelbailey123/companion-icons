/**
 * Grid geometry for the Stream Deck + XL, and the relocation of an existing page onto it.
 *
 * THE DECK CHANGED SHAPE, SO EVERY PAGE HAS TO MOVE. The rig was built for a Stream Deck +
 * (4 columns; 8 keys, one 4-zone touchstrip, 4 encoders). The + XL is a different instrument:
 *
 *   rows 0-3   36 keys, 9 across, 112x112 each
 *   row 4      one touchstrip, SIX zones, 200x100 each
 *   row 5      SIX encoders
 *
 * Both of the latter live at columns 0, 2, 3, 5, 6 and 8 — not 0..5. Columns 1, 4 and 7 do not
 * exist on those rows at all, because six controls are spread under nine key columns. Those
 * numbers are read out of Companion's own driver (`builtin-surfaces/elgato-stream-deck`), not
 * guessed: `generateButtonsGrid(9, 4, 112x112)` plus encoders declared at exactly those columns.
 *
 * CLASSIFY BY BEHAVIOUR, NEVER BY POSITION. It is tempting to say "row 2 was the strip, row 3
 * was the knobs" and shift wholesale. That is wrong the moment someone authors a plain key on
 * row 3 — which is exactly what happened here, and a position-based rule would have silently
 * dragged four working buttons onto the touchstrip. A control is a knob if and only if it
 * declares `rotaryActions`. That is the property the deck itself dispatches on.
 *
 * RELOCATION IS A PURE PERMUTATION. Nothing here reads or rewrites a control's actions,
 * feedbacks or styling — a relocated control must come out deep-equal to the one that went in.
 * `assertPermutation` enforces that rather than trusting it, because the failure mode is a
 * service where a button silently does nothing.
 */

/** Key columns available on the + XL. */
export const COLUMNS = 9

/** Rows that hold ordinary keys. Row 0 is spent on the folder row. */
export const FOLDER_ROW = 0
export const KEY_ROWS = [1, 2, 3]

/** The touchstrip and the encoders, one row each. */
export const STRIP_ROW = 4
export const KNOB_ROW = 5

/**
 * Columns the six strip zones and six encoders actually occupy.
 *
 * Index into this with the OLD 0-based slot number. The old deck had four of each at columns
 * 0..3, so slot k lands on KNOB_COLS[k] — which preserves gaps: SQ7's knobs at old 0, 1 and 3
 * come out at 0, 2 and 5, still two together and one set apart.
 */
export const KNOB_COLS = [0, 2, 3, 5, 6, 8]

/** Total grid the Companion page bounds must be set to for any of this to be addressable. */
export const GRID_SIZE = { minColumn: 0, maxColumn: COLUMNS - 1, minRow: 0, maxRow: KNOB_ROW }

/** Every action on a control, across all steps and all action sets. */
const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)

/**
 * Is this control made redundant by the folder row?
 *
 * The folder row reaches every page from every page, so any button whose ENTIRE behaviour is a
 * single page jump now duplicates one of its keys — the per-page Home key, and every folder on
 * the old Home page. Both classes go, and the second is what empties Home for its dashboard.
 *
 * The rule is deliberately about behaviour rather than position or label, so a button that
 * navigates as PART of doing something else is never swept up with them. Checked against the
 * live rig: exactly sixteen controls match, and all sixteen are navigation.
 */
export function isPureNavKey(control) {
	const actions = actionsOf(control)
	return actions.length === 1 && actions[0].definitionId === 'set_page'
}

/**
 * What kind of control is this — 'knob', 'strip' or 'key'?
 *
 * `rotaryActions` is authoritative for knobs. Only once that is ruled out does the old row
 * matter, and then only to recognise the old 4-zone touchstrip, which had no marker of its own
 * beyond sitting on row 2 of a Stream Deck +.
 */
export function classify(control, row) {
	if (control?.options?.rotaryActions) return 'knob'
	return Number(row) === 2 ? 'strip' : 'key'
}

/**
 * Where does a control at (row, column) go?
 *
 * Keys on the old rows 0-1 drop one row to clear the folder row; keys already on rows 2-3 stay
 * put, because those rows are keys on the new deck too and moving them would be churn.
 *
 * @returns {[number, number]} destination [row, column]
 * @throws if a strip or knob sits on a slot the new deck has no control for
 */
export function destinationFor(kind, row, column) {
	const r = Number(row)
	const c = Number(column)

	if (kind === 'key') return [r <= 1 ? r + 1 : r, c]

	const col = KNOB_COLS[c]
	if (col === undefined) {
		throw new Error(`${kind} at ${r}/${c}: the + XL has only ${KNOB_COLS.length} ${kind} slots`)
	}
	return [kind === 'knob' ? KNOB_ROW : STRIP_ROW, col]
}

/**
 * Per-page destination overrides, keyed by page name then by "row/column" of the SOURCE cell.
 *
 * Used sparingly, and only where the default would break something the page was designed
 * around. Mics is the one case. Each rack's touchstrip readout sits beneath the key for that
 * rack, and the strip now lands on columns 0, 2, 3 and 5; shifting the rack keys down a row in
 * place would leave them at 1, 2, 3 and 0, every one adrift from the readout it belongs to. So
 * the racks are re-columned onto the strip's own columns, and the three whole-system summaries
 * are grouped on the row above.
 *
 * The racks sit on row 2, NOT row 3 hard against the strip. Six zones spread under nine key
 * columns never line up exactly anyway — the best available is within about a quarter of a key
 * — so hugging the strip buys very little, and it cost a hole in row 2 that made the page look
 * broken. Every other page fills downward from row 1 and leaves row 3 empty; this one does too.
 */
export const PAGE_OVERRIDES = {
	Mics: {
		'1/1': [1, 0], // Signal ┐
		'1/2': [1, 1], // Muted  ├ whole-system summaries, grouped top-left
		'1/3': [1, 2], // Packs  ┘
		'1/0': [2, 0], // Host+BGV ┐
		'0/1': [2, 2], // BGV 1-4  ├ re-columned onto their own strip zones
		'0/2': [2, 3], // Lead 1-4 │
		'0/3': [2, 5], // Lav 1-2  ┘
	},
}

/**
 * Relocate one page's controls onto the + XL grid.
 *
 * Returns the new control map plus a move list for reporting. Does NOT add the folder row —
 * that is `navrow.js`, kept separate so this stays a pure rearrangement.
 *
 * @param {object} page       a page from a Companion export
 * @param {string} pageName   used to look up PAGE_OVERRIDES
 * @returns {{controls: object, moves: Array<object>, dropped: Array<string>}}
 */
export function relocatePage(page, pageName, { alreadyGridded = false } = {}) {
	const overrides = PAGE_OVERRIDES[pageName] ?? {}
	const controls = {}
	const moves = []
	const dropped = []
	const taken = new Map()

	/*
	 * A page authored DIRECTLY on the + XL must not be relocated — it is already where it
	 * belongs. Running the normal rules over one is actively destructive: its row 2 is a key
	 * row, but the "old row 2 was the touchstrip" rule would fling those keys onto the strip,
	 * and its row 1 keys would shift down onto row 2 and collide with them.
	 *
	 * This is a flag rather than a guess. A heuristic ("uses columns past 3, so it must be
	 * new") would be right today and silently wrong the first time someone builds a narrow
	 * page on the new deck — and being wrong here means moving working buttons onto a
	 * touchstrip mid-service.
	 */
	if (alreadyGridded) {
		for (const row of Object.keys(page.controls ?? {}).sort((a, b) => Number(a) - Number(b))) {
			for (const column of Object.keys(page.controls[row]).sort((a, b) => Number(a) - Number(b))) {
				const control = page.controls[row][column]

				if (isPureNavKey(control)) {
					dropped.push(`${row}/${column}`)
					continue
				}
				if (Number(row) === FOLDER_ROW) {
					throw new Error(
						`${pageName} ${row}/${column}: row ${FOLDER_ROW} is reserved for the folder row, ` +
							`but this page already has a control there`
					)
				}

				const kind = classify(control, row)
				if (Number(row) === KNOB_ROW && !control?.options?.rotaryActions) {
					throw new Error(`${pageName} ${row}/${column}: a non-rotary control is sitting on the encoder row`)
				}
				if ([STRIP_ROW, KNOB_ROW].includes(Number(row)) && !KNOB_COLS.includes(Number(column))) {
					throw new Error(`${pageName} ${row}/${column}: column ${column} has no control on that row of this deck`)
				}

				controls[row] ??= {}
				controls[row][column] = control
				moves.push({ from: `${row}/${column}`, to: `${row}/${column}`, kind, overridden: false })
			}
		}
		return { controls, moves, dropped }
	}

	for (const row of Object.keys(page.controls ?? {}).sort((a, b) => Number(a) - Number(b))) {
		for (const column of Object.keys(page.controls[row]).sort((a, b) => Number(a) - Number(b))) {
			const control = page.controls[row][column]

			if (isPureNavKey(control)) {
				dropped.push(`${row}/${column}`)
				continue
			}

			const kind = classify(control, row)
			const override = overrides[`${row}/${column}`]
			const [r, c] = override ?? destinationFor(kind, row, column)

			if (r > KNOB_ROW || c >= COLUMNS || r < 0 || c < 0) {
				throw new Error(`${pageName} ${row}/${column} → ${r}/${c}: outside the ${COLUMNS}x${KNOB_ROW + 1} grid`)
			}
			if (r === FOLDER_ROW) {
				throw new Error(`${pageName} ${row}/${column} → ${r}/${c}: row ${FOLDER_ROW} is reserved for the folder row`)
			}
			if (kind === 'key' && (r === STRIP_ROW || r === KNOB_ROW)) {
				throw new Error(`${pageName} ${row}/${column}: a plain key cannot land on the touchstrip or encoder row`)
			}
			if (kind !== 'key' && !KNOB_COLS.includes(c)) {
				throw new Error(`${pageName} ${row}/${column} → ${r}/${c}: column ${c} has no ${kind} on this deck`)
			}

			const cell = `${r}/${c}`
			if (taken.has(cell)) {
				throw new Error(`${pageName}: ${row}/${column} and ${taken.get(cell)} both land on ${cell}`)
			}
			taken.set(cell, `${row}/${column}`)

			controls[r] ??= {}
			controls[r][c] = control
			moves.push({ from: `${row}/${column}`, to: cell, kind, overridden: Boolean(override) })
		}
	}

	return { controls, moves, dropped }
}

/**
 * Prove the relocation moved controls without altering them.
 *
 * Every surviving control must be deep-equal to the one it came from, and the counts must
 * reconcile exactly. This is the guarantee that a page full of working buttons comes out the
 * other side still working — cheap to check, and the alternative is finding out mid-service.
 *
 * @throws with the specific cell that differs
 */
export function assertPermutation(page, result, pageName) {
	const before = Object.values(page.controls ?? {}).reduce((n, r) => n + Object.keys(r).length, 0)
	const after = Object.values(result.controls).reduce((n, r) => n + Object.keys(r).length, 0)

	if (after + result.dropped.length !== before) {
		throw new Error(`${pageName}: ${before} controls in, ${after} out, ${result.dropped.length} dropped — does not reconcile`)
	}

	for (const { from, to } of result.moves) {
		const [fr, fc] = from.split('/')
		const [tr, tc] = to.split('/')
		const source = page.controls[fr][fc]
		const moved = result.controls[tr][tc]
		if (JSON.stringify(source) !== JSON.stringify(moved)) {
			throw new Error(`${pageName}: control ${from} was altered on its way to ${to}`)
		}
	}

	return { before, after, dropped: result.dropped.length }
}
