/**
 * A Tracks play/pause key on the PP1 page, driving Chrome on the ProPresenter iMac.
 *
 * Usage: node tools/pp1-tracks.js <live-full.json> <outdir>
 *
 * Writes:
 *   pages-pp1-tracks.companionconfig   a full-type bundle: every page as exported, PP1 with
 *                                      the key added, plus the `chrome_tracks` variable —
 *                                      import with `rig.js create-vars` then `import … buttons`
 *   chrome_tracks.sh                   the script the key runs, to be copied onto the Pi at
 *                                      SCRIPT_PATH and made executable
 *
 * The backing tracks play in a Chrome tab on the ProPresenter machine, which Companion cannot
 * reach directly: the deck only runs `internal: exec` on the Pi. So the key runs a script on
 * the Pi that hops to the iMac over SSH and asks Chrome, through JavaScript for Automation, to
 * toggle the player. The script prints the resulting state — Playing, Paused, Toggled or `--`
 * when nothing answered — and the key stores it in `chrome_tracks` and goes green on Playing.
 *
 * The key sits at row 2, column 4: the free middle of the row, one blank key away from Next
 * so a reach for the slide keys cannot land on it.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { cv, exec, override, when } from '../src/ptz/actions.js'
import { key } from '../src/ptz/controls.js'

export const PAGE_NAME = 'PP1'
export const CELL = { row: 2, col: 4 }
export const VARIABLE = 'chrome_tracks'
export const SCRIPT_PATH = '/home/samuelbailey/Desktop/AV_Power_scripts/chrome_tracks.sh'
export const SCRIPT_SOURCE = new URL('../scripts/chrome_tracks.sh', import.meta.url)

/** Rest is slate, so it reads as its own thing among PP1's colour-coded keys; Playing is the
 * running green the timers use, so green means "running" everywhere on the page. */
export const BG_REST = 0x1f2937
export const BG_PLAYING = 0x15803d

export const tracksKey = () =>
	key({
		style: { icon: 'media', label: 'Tracks', bg: BG_REST },
		notes: `Play/pause the backing tracks in Chrome on the ProPresenter iMac, over SSH via ${SCRIPT_PATH}. Green while playing.`,
		feedbacks: [
			when('tracks-playing', `${cv(VARIABLE)} == 'Playing'`, [
				override('tracks-playing-bg', 'box0', 'color', BG_PLAYING),
			]),
		],
		actionSets: {
			down: [exec('tracks-toggle', `${SCRIPT_PATH} toggle`, VARIABLE, 8000)],
			up: [],
		},
	})

/**
 * Add the key to PP1 in a copy of the live pages.
 *
 * Idempotent: a key already at the cell is replaced only if it is this key (same exec
 * script); anything else there is a real button and the build refuses to overwrite it.
 */
export function buildConfig(full) {
	const found = Object.entries(full.pages).find(([, p]) => p.name === PAGE_NAME)
	if (!found) throw new Error(`no page named "${PAGE_NAME}" on this rig`)
	const [pageNumber] = found

	const pages = structuredClone(full.pages)
	const page = pages[pageNumber]
	page.controls ??= {}
	page.controls[CELL.row] ??= {}
	const existing = page.controls[CELL.row][CELL.col]
	if (existing && JSON.stringify(existing).indexOf(SCRIPT_PATH) < 0) {
		throw new Error(`${PAGE_NAME} ${CELL.row}/${CELL.col} already holds a different key`)
	}
	page.controls[CELL.row][CELL.col] = tracksKey()

	if (!(full.imageLibrary ?? []).some((i) => i.info?.name === 'media')) {
		throw new Error('the rig library has no "media" icon — import dist/library.companionconfig first')
	}

	const custom_variables = structuredClone(full.custom_variables ?? {})
	custom_variables[VARIABLE] ??= {
		description: 'Chrome tracks player on the iMac: Playing, Paused, Toggled or -- (from chrome_tracks.sh)',
		defaultValue: '',
		persistCurrentValue: false,
	}

	return { pages, custom_variables, pageNumber }
}

const [, , src, outDir] = process.argv
if (process.argv[1] && path.basename(process.argv[1]) === 'pp1-tracks.js') {
	if (!src || !outDir) {
		console.error('usage: node tools/pp1-tracks.js <live-full.json> <outdir>')
		process.exit(1)
	}
	const full = JSON.parse(await fs.readFile(src, 'utf8'))
	const { pages, custom_variables, pageNumber } = buildConfig(full)

	await fs.mkdir(outDir, { recursive: true })
	const bundle = path.join(outDir, 'pages-pp1-tracks.companionconfig')
	await fs.writeFile(
		bundle,
		JSON.stringify({
			version: full.version,
			type: 'full',
			companionBuild: full.companionBuild,
			pages,
			custom_variables,
			customVariablesCollections: full.customVariablesCollections ?? [],
			triggers: full.triggers ?? {},
			triggerCollections: full.triggerCollections ?? [],
			instances: full.instances,
			connectionCollections: full.connectionCollections ?? [],
		})
	)
	const script = path.join(outDir, path.basename(SCRIPT_PATH))
	await fs.copyFile(SCRIPT_SOURCE, script)

	console.log(`  page ${pageNumber} "${PAGE_NAME}": Tracks key at ${CELL.row}/${CELL.col} -> ${SCRIPT_PATH} toggle, state in custom:${VARIABLE}`)
	console.log(`wrote ${path.basename(bundle)} (${Object.keys(pages).length} pages) and ${path.basename(script)} -> ${SCRIPT_PATH} on the Pi`)
}
