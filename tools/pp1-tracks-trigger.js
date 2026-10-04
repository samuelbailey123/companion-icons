/**
 * Start the backing tracks at 10:00 Central every Sunday, and fade them out so they are silent at
 * 10:30.
 *
 * Usage: node tools/pp1-tracks-trigger.js <live-full.json> <outdir>
 *   first time: node tools/rig.js add-trigger <outdir>/triggers.companionconfig <id it prints>
 *   to change it: node tools/rig.js import <outdir>/triggers.companionconfig triggers
 *
 * PLAY, NOT TOGGLE. The Play/Pause key runs `chrome_tracks.sh toggle`, which is right under a
 * hand and wrong on a clock: if someone has already started the tracks by 10:00, a toggle stops
 * them, in front of the room. So this runs `play`, which starts a paused player and leaves a
 * playing one alone. Run it twice and the tracks are still playing.
 *
 * It writes `chrome_tracks` as the key does, so PP1's Tracks key and the folder's Play/Pause key
 * go green when it lands. Nothing polls that variable, so this is the only way they would know.
 *
 * The time is Central because Companion's `timezone` setting is America/Chicago, not because of
 * the Pi's clock (see tools/sunday-power-trigger.js). SUNDAY ONLY (`days: [0]`): tracks starting
 * themselves on a Tuesday would play into an empty room, or a rehearsal.
 *
 * FADE SO IT IS SILENT AT 10:30, NOT FROM 10:30. Asked for on 2026-10-04: the music ends as the
 * countdown reaches zero. `fade` walks the volume down over four seconds and then pauses, so it
 * starts at 10:29:56. It puts the slider back after pausing, so next Sunday's 10:00 play is not
 * silent. A paused player is left alone, so a fade after someone already stopped the tracks does
 * nothing.
 *
 * The bundle carries every trigger the rig has, untouched, plus these, so either import path
 * works. `add-trigger` adds a new one alone and leaves the others running, which matters on a
 * Sunday morning with the countdown armed; the full import is the only way to replace one.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { SCRIPT_PATH, VARIABLE } from './pp1-tracks.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-tracks-trigger.js <live-full.json> <outdir>')
	process.exit(1)
}

/**
 * What fires, and when. `days` is 0=Sunday .. 6=Saturday. The fade's timeout covers its four-second
 * walk, the settle before the slider goes back, and the SSH hop.
 */
const DAYS = [0]
const SCHEDULE = [
	{
		name: 'Sunday tracks', time: '10:00:00', verb: 'play', timeout: 8000,
		notes: 'Starts the tracks in Chrome on the PP1 iMac with "chrome_tracks.sh play", which never pauses a player that is already going.',
	},
	{
		name: 'Sunday tracks fade', time: '10:29:56', verb: 'fade', timeout: 15000,
		notes: 'Fades the tracks out over four seconds and pauses them, so they are silent at 10:30 as the countdown ends; puts the volume slider back for next time.',
	},
]

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

let seq = 0
const id = (prefix) => `pp1-tracks-trigger-${prefix}-${(seq++).toString(36)}`

const existing = full.triggers ?? {}
const triggers = { ...existing }
let sortOrder = Math.max(-1, ...Object.values(existing).map((t) => t.options?.sortOrder ?? 0))
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const added = []

for (const { name, time, verb, timeout, notes } of SCHEDULE) {
	const mine = Object.entries(existing).find(([, t]) => t.options?.name === name)
	if (mine) console.log(`  replacing the existing "${name}" trigger (${mine[0]})`)
	const triggerId = mine?.[0] ?? id(`${verb}-self`)
	if (!mine) added.push(triggerId)
	const command = `${SCRIPT_PATH} ${verb}`
	triggers[triggerId] = {
		type: 'trigger',
		options: {
			name,
			enabled: true,
			sortOrder: mine?.[1]?.options?.sortOrder ?? ++sortOrder,
			notes: `${notes} At ${time} on Sunday. Rebuild with tools/pp1-tracks-trigger.js.`,
		},
		actions: [
			{
				id: id('exec'),
				definitionId: 'exec',
				connectionId: 'internal',
				options: { path: v(command), cwd: v(''), timeout: v(timeout), targetVariable: v(VARIABLE) },
				upgradeIndex: null,
				type: 'action',
				children: {},
			},
		],
		condition: [],
		events: [{ id: id('event'), type: 'timeofday', enabled: true, options: { time, days: [...DAYS] } }],
		localVariables: [],
	}
	console.log(`  "${name}" (${triggerId}) at ${time} on ${DAYS.map((d) => DAY_NAMES[d]).join(', ')}`)
	console.log(`    ${command} -> custom:${VARIABLE}`)
}
console.log(`  ${Object.keys(triggers).length} triggers in the bundle (${Object.keys(existing).length} were on the rig)`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'triggers.companionconfig')
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages: full.pages,
		triggers,
		triggerCollections: full.triggerCollections ?? [],
		custom_variables: full.custom_variables ?? {},
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)
console.log(`\nwrote ${path.basename(file)}`)
for (const triggerId of added) console.log(`  add with: node tools/rig.js add-trigger ${file} ${triggerId}`)
console.log(`  or replace them all with: node tools/rig.js import ${file} triggers`)
