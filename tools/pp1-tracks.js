/**
 * A Tracks folder on PP1: play/pause, skip, and a volume knob for the backing tracks, which play
 * in YouTube Music in Chrome on the PP1 (ProPresenter) iMac.
 *
 * Usage: node tools/pp1-tracks.js <live-full.json> <outdir>
 *   then: node tools/rig.js create-vars <outdir>/page-tracks.companionconfig
 *         node tools/rig.js import-page <outdir>/page-tracks.companionconfig <n>|new
 *         node tools/rig.js import-page <outdir>/page-<pp1>-pp1.companionconfig <pp1>
 *   and copy <outdir>/chrome_tracks.sh onto the Pi at SCRIPT_PATH.
 *
 * Each page goes in through `import-page`, which resets that page alone, so no other page on the
 * deck is touched. The Tracks page is created the first time (`new`) and replaced in place after.
 *
 * The deck cannot reach the iMac directly: it only runs `internal: exec` on the Pi. So every
 * control here runs scripts/chrome_tracks.sh on the Pi, which hops to the iMac over SSH and drives
 * Chrome through JavaScript for Automation. The script prints one word, and the controls keep it:
 * the play state in `chrome_tracks` (the keys go green on Playing), the volume in
 * `chrome_tracks_volume` (the strip shows it).
 *
 * THE TRACKS KEY OPENS THE FOLDER, and wears a folder icon to say so: with the old play icon
 * it looked like the old play/pause key and nobody could tell a folder was there. It asks for the play state and the volume on the way in, so
 * the page is right when it lands even if someone paused the tracks at the iMac. It stays at PP1
 * row 2, column 4, and Play/Pause sits at the same cell on the Tracks page, so two taps in one
 * place open the folder and play.
 *
 * THE KNOB LAGS THE HAND by about the length of an SSH round trip per detent. Each detent moves
 * YouTube Music's own slider by 5 inside the page, so detents that land out of order still add
 * up to the right level.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { GRID_SIZE, KNOB_ROW, STRIP_ROW } from '../src/layout.js'
import { folderFor, navRow } from '../src/navrow.js'
import { cv, exec, override, when } from '../src/ptz/actions.js'
import { key, knob, strip } from '../src/ptz/controls.js'

export const PAGE_NAME = 'PP1'
export const FOLDER_NAME = 'Tracks'
export const CELL = { row: 2, col: 4 }
export const SKIP_CELL = { row: 2, col: 5 }
export const VOLUME_COLUMN = 5
export const VARIABLE = 'chrome_tracks'
export const VOLUME_VARIABLE = 'chrome_tracks_volume'
export const SCRIPT_PATH = '/home/samuelbailey/Desktop/AV_Power_scripts/chrome_tracks.sh'
export const SCRIPT_SOURCE = new URL('../scripts/chrome_tracks.sh', import.meta.url)

/** An SSH hop and a JXA call; generous, because a timed-out exec leaves the variable stale. */
const TIMEOUT = 8000

/** Rest is slate, so it reads as its own thing among PP1's colour-coded keys; Playing is the
 * running green the timers use, so green means "running" everywhere on the page. */
export const BG_REST = 0x1f2937
export const BG_PLAYING = 0x15803d

const run = (verb) => `${SCRIPT_PATH} ${verb}`

const greenWhilePlaying = (id) => [
	when(id, `${cv(VARIABLE)} == 'Playing'`, [override(`${id}-bg`, 'box0', 'color', BG_PLAYING)]),
]

const goTo = (id, page) => ({
	id,
	definitionId: 'set_page',
	connectionId: 'internal',
	options: { surfaceId: { value: 'self', isExpression: false }, page: { value: String(page), isExpression: false } },
	upgradeIndex: null,
	type: 'action',
})

/** PP1's Tracks key: open the folder, and refresh what it will show. */
export const tracksKey = (tracksPage) =>
	key({
		style: { icon: 'folder-audio', label: FOLDER_NAME, bg: BG_REST },
		notes: `Opens the Tracks folder (page ${tracksPage}): play/pause, skip and volume for the tracks in Chrome on the PP1 iMac. Green while playing.`,
		feedbacks: greenWhilePlaying('tracks-playing'),
		actionSets: {
			down: [
				goTo('tracks-open', tracksPage),
				exec('tracks-open-state', run('state'), VARIABLE, TIMEOUT),
				exec('tracks-open-volume', run('volume'), VOLUME_VARIABLE, TIMEOUT),
			],
			up: [],
		},
	})

export const playPauseKey = () =>
	key({
		style: { icon: 'media', label: 'Play / Pause', bg: BG_REST },
		notes: `Play/pause the tracks in Chrome on the PP1 iMac, via ${SCRIPT_PATH}. Green while playing.`,
		feedbacks: greenWhilePlaying('tracks-pp-playing'),
		actionSets: { down: [exec('tracks-toggle', run('toggle'), VARIABLE, TIMEOUT)], up: [] },
	})

/** No variable: a skip says nothing about whether the next track is playing yet. */
export const skipKey = () =>
	key({
		style: { icon: 'cue-next', label: 'Skip', bg: BG_REST },
		notes: `Skip to the next track in YouTube Music on the PP1 iMac, via ${SCRIPT_PATH}.`,
		actionSets: { down: [exec('tracks-next', run('next'), '', TIMEOUT)], up: [] },
	})

export const volumeStrip = () =>
	strip({
		style: { icon: 'fader', label: `Vol ${cv(VOLUME_VARIABLE)}`, bg: BG_REST },
		notes: "The tracks' volume on YouTube Music's own 0-100 slider, as the knob last left it.",
	})

export const volumeKnob = () =>
	knob({
		style: { icon: 'fader', label: 'Volume', bg: BG_REST },
		notes: "Turn to move YouTube Music's volume slider on the PP1 iMac by 5 per detent. Press does nothing.",
		actionSets: {
			down: [],
			up: [],
			rotate_left: [exec('tracks-volume-down', run('down'), VOLUME_VARIABLE, TIMEOUT)],
			rotate_right: [exec('tracks-volume-up', run('up'), VOLUME_VARIABLE, TIMEOUT)],
		},
	})

/** The Tracks page: the folder row with PP1 marked, the transport on row 2, volume on a knob. */
export function tracksPage(pageNumbers) {
	return {
		name: FOLDER_NAME,
		gridSize: { ...GRID_SIZE },
		controls: {
			0: navRow(folderFor(FOLDER_NAME), pageNumbers),
			[CELL.row]: { [CELL.col]: playPauseKey(), [SKIP_CELL.col]: skipKey() },
			[STRIP_ROW]: { [VOLUME_COLUMN]: volumeStrip() },
			[KNOB_ROW]: { [VOLUME_COLUMN]: volumeKnob() },
		},
	}
}

/**
 * Build both pages from a live export.
 *
 * The Tracks page keeps its number if the rig already has one, and is otherwise the next page
 * after the last, which is where `import-page … new` puts it. The PP1 key refuses to land on a
 * cell that holds anything but an earlier Tracks key.
 */
export function buildConfig(full) {
	const numberOf = (name) => Object.entries(full.pages).find(([, p]) => p.name === name)?.[0]
	const pp1 = numberOf(PAGE_NAME)
	if (!pp1) throw new Error(`no page named "${PAGE_NAME}" on this rig`)

	const numbers = Object.keys(full.pages).map(Number)
	if (Math.max(...numbers) !== numbers.length) {
		throw new Error(`pages are not numbered 1..${numbers.length}; a new page would not land after the last`)
	}
	const existing = numberOf(FOLDER_NAME)
	const tracks = existing ?? String(numbers.length + 1)

	for (const icon of ['folder-audio', 'media', 'cue-next', 'fader']) {
		if (!(full.imageLibrary ?? []).some((i) => i.info?.name === icon)) {
			throw new Error(`the rig library has no "${icon}" icon — import dist/library.companionconfig first`)
		}
	}

	const page = structuredClone(full.pages[pp1])
	page.controls ??= {}
	page.controls[CELL.row] ??= {}
	const there = page.controls[CELL.row][CELL.col]
	if (there && JSON.stringify(there).indexOf(SCRIPT_PATH) < 0) {
		throw new Error(`${PAGE_NAME} ${CELL.row}/${CELL.col} already holds a different key`)
	}
	page.controls[CELL.row][CELL.col] = tracksKey(tracks)

	const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
	const folder = tracksPage(pageNumbers)
	if (existing) folder.id = full.pages[existing].id

	const custom_variables = {
		[VARIABLE]: {
			description: 'Chrome tracks player on the PP1 iMac: Playing, Paused, Toggled or -- (from chrome_tracks.sh)',
			defaultValue: '',
			persistCurrentValue: false,
		},
		[VOLUME_VARIABLE]: {
			description: "YouTube Music's volume slider on the PP1 iMac, as NN% or -- (from chrome_tracks.sh)",
			defaultValue: '',
			persistCurrentValue: false,
		},
	}

	return { pp1, page, tracks, existing: Boolean(existing), folder, custom_variables }
}

const [, , src, outDir] = process.argv
if (process.argv[1] && path.basename(process.argv[1]) === 'pp1-tracks.js') {
	if (!src || !outDir) {
		console.error('usage: node tools/pp1-tracks.js <live-full.json> <outdir>')
		process.exit(1)
	}
	const full = JSON.parse(await fs.readFile(src, 'utf8'))
	const { pp1, page, tracks, existing, folder, custom_variables } = buildConfig(full)

	const bundle = (p, number, extra = {}) =>
		JSON.stringify({
			version: full.version,
			type: 'page',
			companionBuild: full.companionBuild,
			page: p,
			instances: full.instances,
			connectionCollections: full.connectionCollections ?? [],
			oldPageNumber: Number(number),
			...extra,
		})

	await fs.mkdir(outDir, { recursive: true })
	const pp1File = path.join(outDir, `page-${pp1}-pp1.companionconfig`)
	const tracksFile = path.join(outDir, 'page-tracks.companionconfig')
	await fs.writeFile(pp1File, bundle(page, pp1))
	await fs.writeFile(tracksFile, bundle(folder, tracks, { custom_variables }))
	const script = path.join(outDir, path.basename(SCRIPT_PATH))
	await fs.copyFile(SCRIPT_SOURCE, script)

	console.log(`  page ${pp1} "${PAGE_NAME}": Tracks key at ${CELL.row}/${CELL.col} -> opens page ${tracks}`)
	console.log(`  page ${tracks} "${FOLDER_NAME}" (${existing ? 'replacing' : 'new'}): play/pause ${CELL.row}/${CELL.col}, skip ${SKIP_CELL.row}/${SKIP_CELL.col}, volume knob column ${VOLUME_COLUMN}`)
	console.log(`wrote ${path.basename(tracksFile)}, ${path.basename(pp1File)} and ${path.basename(script)} -> ${SCRIPT_PATH} on the Pi`)
	console.log(`  import the Tracks page with: node tools/rig.js import-page ${tracksFile} ${existing ? tracks : 'new'}`)
}
