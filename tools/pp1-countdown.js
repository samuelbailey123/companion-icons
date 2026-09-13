/**
 * PP1: one key that fires the pre-service countdown.
 *
 * Usage: node tools/pp1-countdown.js <live-full.json> <outdir>
 *
 * THE COUNTDOWN IS A PLAYLIST ITEM, NOT A TIMER. It is a media cue in the Sunday Service
 * playlist, under its own "Countdown" header — the second section of the playlist. Starting it
 * from ProPresenter means finding the playlist, the section and the item, and clicking, on a
 * Sunday morning with the screens live. The deck should do it in one press.
 *
 * WHAT THE KEY SENDS. ProPresenter's API triggers a playlist item by its INDEX in the playlist,
 * headers included, and has no trigger-by-UUID for items. An index is fragile: drop a
 * presentation in above the countdown and the key fires the wrong thing. So this tool never
 * hardcodes it. It asks ProPresenter — at the connection's own host and port, read from the
 * export — for the playlist as it stands, finds the section by name, takes the first real item
 * under it, and writes THAT index into the key. Reshuffle the playlist, re-run the tool, and
 * the key follows. The key's notes say what it was pointed at, and when.
 *
 * THE KEY ITSELF sits beside the other "fire this in ProPresenter" keys (All Screens, Stage
 * Notes), on the page's quiet dark ground so it cannot be mistaken for the loud orange
 * transport pair or the purple timer zones — it plays a video, it does not run a clock. The
 * `timer-start` glyph is the library's own, in its natural "on" green, which measures 8.4:1
 * on this ground (`MIN_CONTRAST` is 3). `pp1-icons.js` knows the caption too, so a rerun of
 * that tool keeps the same glyph on it.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-countdown.js <live-full.json> <outdir>')
	process.exit(1)
}

/** Where the countdown lives in ProPresenter, by the names the operator sees. */
const PLAYLIST = 'Sunday Service'
const SECTION = 'Countdown'

/** The key: its caption, its cell on the PP1 page, its ground and its glyph. */
const LABEL = 'Countdown'
const CELL = { row: 2, column: 6 }
const BG = 0x1f2937
const ICON = 'timer-start'

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const number = Object.entries(full.pages).find(([, p]) => p.name === 'PP1')?.[0]
if (!number) throw new Error('no PP1 page on this rig')

const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'renewedvision-propresenter-api')
if (!found) throw new Error('no ProPresenter connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId}`)

/** ProPresenter's own API, at the address the Companion connection uses. GETs need no login. */
async function propresenter(route) {
	const url = `http://${instance.config.host}:${instance.config.port}/v1${route}`
	const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
	if (!res.ok) throw new Error(`ProPresenter ${route}: HTTP ${res.status}`)
	return res.json()
}

/** Playlists can sit in folders; walk the whole tree. */
function* flatten(items) {
	for (const item of items) {
		yield item
		if (item.children) yield* flatten(item.children)
	}
}

const playlist = [...flatten(await propresenter('/playlists'))].find(
	(p) => p.field_type === 'playlist' && p.id?.name === PLAYLIST
)
if (!playlist) throw new Error(`ProPresenter has no playlist called "${PLAYLIST}"`)

const { items } = await propresenter(`/playlist/${playlist.id.uuid}`)
const header = items.findIndex((i) => i.type === 'header' && i.id?.name === SECTION)
if (header < 0) throw new Error(`"${PLAYLIST}" has no section called "${SECTION}"`)
const target = items[header + 1]
if (!target || target.type === 'header') throw new Error(`the "${SECTION}" section of "${PLAYLIST}" is empty`)
const index = target.id.index
console.log(`  "${PLAYLIST}" (${playlist.id.uuid})`)
console.log(`  section "${SECTION}" -> item ${index}: ${target.type} "${target.id.name}"`)

const page = structuredClone(full.pages[number])

/** A button's caption, reduced to its words, so the cell guard can recognise its own key. */
const labelOf = (control) =>
	(control?.style?.layers ?? [])
		.find((l) => l.type === 'text')
		?.text?.value?.replace(/\\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim() ?? ''

// Never silently overwrite a key someone else put here. The tool's own key may be rebuilt.
const occupant = page.controls[CELL.row]?.[CELL.column]
if (occupant && labelOf(occupant) !== LABEL) {
	throw new Error(`${CELL.row}/${CELL.column} on PP1 is taken by "${labelOf(occupant)}"; move CELL`)
}

const when = new Date().toLocaleString('sv-SE', { hour12: false }).slice(0, 16)
const key = {
	type: 'button-layered',
	style: {
		layers: [
			{
				id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
				decoration: v('default'), showStatusIcons: v('default'),
			},
			{
				id: 'box0', name: 'Background', usage: 'auto', type: 'box',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
				color: v(BG), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
			},
			{
				id: 'image0', name: 'Image', usage: 'auto', type: 'image',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(2), width: v(100), height: v(44), rotation: v(0),
				base64Image: v(`$(image:${ICON})`),
				halign: v('center'), valign: v('center'), fillMode: v('fit'),
			},
			{
				id: 'text0', name: '', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(46), width: v(100), height: v(52), rotation: v(0),
				text: v(LABEL), color: v(0xffffff),
				halign: v('center'), valign: v('center'),
				fontsize: v(51), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
		],
	},
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false,
		notes:
			`Fires the "${SECTION}" section of the "${PLAYLIST}" playlist: item ${index}, ` +
			`${target.type} "${target.id.name}". ProPresenter triggers by index, so if the playlist ` +
			`changes above it, re-run tools/pp1-countdown.js. Pointed here ${when}.`,
	},
	feedbacks: [],
	steps: {
		0: {
			action_sets: {
				down: [
					{
						id: 'pp1-countdown-fire',
						definitionId: 'specificPlaylistOperation',
						connectionId,
						options: {
							specific_playlist_operation: v('trigger_index'),
							playlist_id: v(playlist.id.uuid),
							index: v(String(index)),
							cue_index: v('0'),
						},
						upgradeIndex: null,
						type: 'action',
					},
				],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
	localVariables: [],
}

page.controls[CELL.row] ??= {}
page.controls[CELL.row][CELL.column] = key
console.log(`  ${CELL.row}/${CELL.column}  ${LABEL}  -> playlist ${playlist.id.uuid} item ${index}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-pp1.companionconfig`)
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'page',
		companionBuild: full.companionBuild,
		page,
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(number),
	})
)
console.log(`\nwrote ${path.basename(file)}`)
