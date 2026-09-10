/**
 * Assemble the PTZ page and everything it needs from the rest of the config.
 *
 * The page replaces the Mics page wholesale: the wireless-mic readouts were never used in a
 * service, and the deck has exactly nine folder columns for nine pages, so a tenth page was
 * never on offer. The slot keeps its number; only its name, its controls and its folder key
 * change.
 *
 * A RENAME TOUCHES EVERY PAGE. The folder row is row 0 of all nine pages and every one of
 * its captions is baked in at build time (see `src/navrow.js`), so the other eight pages have
 * to be re-emitted with a rebuilt row 0 or they keep pointing at "Mics". Rows 1 and below on
 * those pages are carried across by reference, untouched.
 */

import { COLUMNS, GRID_SIZE } from '../layout.js'
import { assertNavCoverage, folderFor, navRow } from '../navrow.js'
import { buildKeys } from './keys.js'
import { buildKnobs, ROWS } from './knobs.js'
import { SYNC_TRIGGER_ID, buildSetupKnobs, syncTrigger } from './picture.js'
import { TRIGGER_ID, pollTrigger } from './poller.js'
import { PAGE_NAME as SETUP_NAME, buildSetupKeys } from './setup.js'
import { mergeDefinitions } from './variables.js'
import { TRIGGER_ID as TRACK_TRIGGER_ID, trackingTrigger } from './web.js'

export const PAGE_NAME = 'PTZ'
export const REPLACES = 'Mics'
export { SETUP_NAME }

/**
 * The PTZ run page, rows 1-5. Row 0 is added by `buildConfig`, which knows the page numbers.
 *
 * @param {string} conn   the ptzoptics-visca connection id
 * @param {string} host   camera address
 * @param {{setup: number|string}} pages
 * @param {Record<number, string>} [names]  preset number → shot name, shown on the preset keys
 */
export function buildPage(conn, host, pages, names = {}) {
	const { strips, knobs } = buildKnobs(conn)
	return {
		name: PAGE_NAME,
		controls: { ...buildKeys(conn, host, pages, names), [ROWS.strip]: strips, [ROWS.knob]: knobs },
		gridSize: { ...GRID_SIZE },
	}
}

/** The setup sub-page: rows 1-3 of keys, and the six value knobs with their readouts. */
export function buildSetupPage(conn, host, pages, other) {
	const { strips, knobs } = buildSetupKnobs(conn)
	return {
		name: SETUP_NAME,
		controls: { ...buildSetupKeys(conn, host, pages, other), [ROWS.strip]: strips, [ROWS.knob]: knobs },
		gridSize: { ...GRID_SIZE },
	}
}

/**
 * Find the camera connection in an export.
 *
 * @throws if there is none: the connection is created in the Companion UI, not by this tool,
 *   because its host is the one fact that belongs to the rig rather than to the code.
 */
export function findConnection(full) {
	const found = Object.entries(full.instances ?? {}).find(([, i]) => i?.moduleId === 'ptzoptics-visca')
	if (!found) throw new Error('no ptzoptics-visca connection on this rig — add it in Connections first')
	const [id, instance] = found
	return { id, label: instance.label, host: instance.config?.host }
}

/**
 * Produce the pages, custom variables and triggers for a full-type bundle.
 *
 * @param {object} full  a live `type: full` export
 * @returns {{pages: object, custom_variables: object, triggers: object, pageNumber: string, connection: object}}
 */
export function buildConfig(full) {
	const connection = findConnection(full)

	const target = Object.entries(full.pages).find(([, p]) => p.name === REPLACES || p.name === PAGE_NAME)
	if (!target) throw new Error(`no page named "${REPLACES}" or "${PAGE_NAME}" on this rig`)
	const [pageNumber] = target

	const pages = structuredClone(full.pages)
	/*
	 * The setup sub-page takes the slot it already has, or the first number past the last
	 * page. Companion's full import inserts pages up to the highest number in the bundle, so a
	 * new tenth page needs nothing more than being present as "10".
	 */
	const existingSetup = Object.entries(pages).find(([, p]) => p.name === SETUP_NAME)?.[0]
	const setupNumber = existingSetup ?? String(Math.max(...Object.keys(pages).map(Number)) + 1)
	const numbers = { setup: setupNumber, run: pageNumber }

	pages[pageNumber] = buildPage(connection.id, connection.host, numbers)
	pages[setupNumber] = buildSetupPage(connection.id, connection.host, numbers)

	const pageNumbers = Object.fromEntries(Object.entries(pages).map(([n, p]) => [p.name, Number(n)]))
	assertNavCoverage(Object.values(pages).map((p) => p.name), COLUMNS)

	for (const page of Object.values(pages)) {
		page.controls ??= {}
		page.controls[0] = navRow(folderFor(page.name), pageNumbers)
	}

	const triggers = structuredClone(full.triggers ?? {})
	for (const [id, trigger] of [
		[TRIGGER_ID, pollTrigger(connection.host)],
		[TRACK_TRIGGER_ID, trackingTrigger(connection.host)],
		[SYNC_TRIGGER_ID, syncTrigger()],
	]) {
		for (const [existing, t] of Object.entries(triggers)) {
			if (t?.options?.name === trigger.options.name) delete triggers[existing]
		}
		triggers[id] = trigger
	}

	return {
		pages,
		custom_variables: mergeDefinitions(full.custom_variables),
		triggers,
		pageNumber,
		setupNumber,
		connection,
	}
}
