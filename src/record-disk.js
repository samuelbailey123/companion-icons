/**
 * Which disk the switcher will record to, on the Record keys.
 *
 * The I/O half is `tools/record-disk.js`; everything that decides anything is here, tested.
 *
 * WHY. The HD8 has an internal SSD ("Internal") and takes the service drive on USB. The switcher
 * records to whichever disk is first in its working set, and Sam reported on 2026-10-09 that a
 * drive plugged in afterwards does not become that disk — so the service lands on Internal and
 * nobody finds out until the drive is at the edit desk with nothing on it. The Record key showed
 * `00:00` while idle, which says nothing; it now shows where the recording will go.
 *
 * WHAT THE KEY SHOWS. Idle: the volume name of the first working-set disk, which the bmd-atem
 * module publishes as `record_disk_volume`. Recording: the running time, as before. While that
 * disk is Internal the caption reads INTERNAL on amber; a recording still turns the key red,
 * because that feedback comes later in the list and wins the background.
 *
 * WHAT THIS DOES NOT DO. It does not switch the disk. The module's only disk action is "Switch
 * disk", a toggle whose effect on an idle switcher has not been tested on this rig, and a
 * recording is the wrong place to find out. Until that is proven off-air this is a warning.
 *
 * WHICH KEYS. Every key carrying the module's `recordStartStop` toggle — the Record keys on Home
 * and ATEM as of 2026-10-09 — wherever they sit. The Countdown key starts a recording too, but its
 * face is a caption with no reading on it and it is left alone.
 *
 * IDEMPOTENT. The feedback has a fixed id and the value line is recognised in either form, so a
 * rerun over its own output is byte-identical.
 */

/** Companion's id for the ATEM module. */
export const MODULE_ID = 'bmd-atem'
/** Prefix of every id and note this file writes. */
export const MARK = 'record-disk'
/** The switcher's name for its built-in SSD. */
export const INTERNAL = 'Internal'
/** The rig's "look at this" amber, the same one an armed Stream key wears. */
export const AMBER = 0xa16207
export const WARNING_CAPTION = 'INTERNAL'

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/** The one ATEM connection on the rig. */
export function findAtemConnection(full) {
	const found = Object.entries(full.instances ?? {}).filter(([, i]) => i?.moduleId === MODULE_ID)
	if (found.length !== 1) throw new Error(`expected one ${MODULE_ID} connection on this rig, found ${found.length}`)
	return found[0]
}

const actionsOf = (control) =>
	Object.values(control?.steps ?? {})
		.flatMap((step) => Object.values(step.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)

/** True for a key that starts and stops the recording: the module's toggle, on this connection. */
export function isRecordKey(control, connectionId) {
	return actionsOf(control).some(
		(a) => a.connectionId === connectionId && a.definitionId === 'recordStartStop' && a.options?.record?.value === 'toggle'
	)
}

/** What the value line reads: the running time while recording, the destination while idle. */
export const valueExpression = (label) =>
	`$(${label}:record_active) ? $(${label}:record_duration_hm) : $(${label}:record_disk_volume)`

/**
 * Return a copy of a Record key that shows the recording disk and warns on Internal.
 *
 * @param {object} control A Record key (see `isRecordKey`).
 * @param {{label: string}} atem The ATEM connection's label, which its variables are published under.
 */
export function showDisk(control, { label }) {
	const key = structuredClone(control)
	const texts = (key.style?.layers ?? []).filter((l) => l.type === 'text')
	const value = texts.find((l) => String(l.text?.value ?? '').includes(`$(${label}:record_duration_hm)`))
	const caption = texts.find((l) => l !== value)
	const box = (key.style?.layers ?? []).find((l) => l.type === 'box')
	if (!value || !caption || !box) {
		throw new Error('a Record key needs a background, a caption and a record_duration_hm line; this one was not touched')
	}
	value.text = expr(valueExpression(label))

	const warning = {
		type: 'feedback',
		id: `${MARK}:internal`,
		connectionId: 'internal',
		definitionId: 'check_expression',
		options: { expression: expr(`$(${label}:record_disk_volume) == "${INTERNAL}"`) },
		isInverted: v(false),
		upgradeIndex: -1,
		styleOverrides: [
			{ overrideId: `${MARK}:box`, elementId: box.id, elementProperty: 'color', override: v(AMBER) },
			{ overrideId: `${MARK}:caption`, elementId: caption.id, elementProperty: 'text', override: v(WARNING_CAPTION) },
		],
		children: {},
	}
	// First in the list, so the module's own recording feedback still paints the key red over it.
	key.feedbacks = [warning, ...(key.feedbacks ?? []).filter((f) => f.id !== warning.id)]

	const note = `${MARK}: idle, the value line names the disk the recording will go to, and the key warns while it is ${INTERNAL}. Built by tools/record-disk.js.`
	const notes = key.options?.notes ?? ''
	if (!notes.includes(`${MARK}:`)) key.options = { ...key.options, notes: notes ? `${notes}\n${note}` : note }
	return key
}

/**
 * Rewrite every Record key in a full export.
 *
 * Returns one page bundle per page that has one, importable with `tools/rig.js import-page`.
 * Nothing but the Record keys is touched.
 *
 * @param {object} full A full Companion export (`tools/rig.js export`).
 * @returns {{pages: Array<{number: number, name: string, cells: string[], bundle: object}>}}
 */
export function buildRecordDiskPages(full) {
	const [connectionId, instance] = findAtemConnection(full)
	const atem = { connectionId, label: instance.label }
	const pages = []
	for (const [number, source] of Object.entries(full.pages ?? {})) {
		const page = structuredClone(source)
		const cells = []
		for (const [row, columns] of Object.entries(page.controls ?? {})) {
			for (const [column, control] of Object.entries(columns)) {
				if (!isRecordKey(control, connectionId)) continue
				columns[column] = showDisk(control, atem)
				cells.push(`r${row}c${column}`)
			}
		}
		if (!cells.length) continue
		pages.push({
			number: Number(number),
			name: page.name,
			cells,
			bundle: {
				version: full.version,
				type: 'page',
				companionBuild: full.companionBuild,
				page,
				instances: full.instances,
				connectionCollections: full.connectionCollections ?? [],
				oldPageNumber: Number(number),
			},
		})
	}
	if (!pages.length) throw new Error('no Record key on this rig: nothing carries the recordStartStop toggle')
	return { pages }
}
