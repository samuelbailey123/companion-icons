/**
 * Start the backing tracks at 10:00 Central every Sunday.
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
 * The bundle carries every trigger the rig has, untouched, plus this one, so either import path
 * works. `add-trigger` adds this one alone and leaves the others running, which matters on a
 * Sunday morning with the countdown armed; the full import is the only way to replace it.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { SCRIPT_PATH, VARIABLE } from './pp1-tracks.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-tracks-trigger.js <live-full.json> <outdir>')
	process.exit(1)
}

/** When it fires. `days` is 0=Sunday .. 6=Saturday. */
const TIME = '10:00:00'
const DAYS = [0]

const TRIGGER_NAME = 'Sunday tracks'

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

let seq = 0
const id = (prefix) => `pp1-tracks-trigger-${prefix}-${(seq++).toString(36)}`

const existing = full.triggers ?? {}
const mine = Object.entries(existing).find(([, t]) => t.options?.name === TRIGGER_NAME)
if (mine) console.log(`  replacing the existing "${TRIGGER_NAME}" trigger (${mine[0]})`)

const triggers = Object.fromEntries(Object.entries(existing).filter(([tid]) => tid !== mine?.[0]))
const sortOrder = Math.max(-1, ...Object.values(existing).map((t) => t.options?.sortOrder ?? 0)) + 1
const triggerId = mine?.[0] ?? id('self')
const command = `${SCRIPT_PATH} play`

triggers[triggerId] = {
	type: 'trigger',
	options: {
		name: TRIGGER_NAME,
		enabled: true,
		sortOrder: mine?.[1]?.options?.sortOrder ?? sortOrder,
		notes:
			`Starts the tracks in Chrome on the PP1 iMac at ${TIME} on Sunday with "chrome_tracks.sh play", ` +
			`which never pauses a player that is already going. Rebuild with tools/pp1-tracks-trigger.js.`,
	},
	actions: [
		{
			id: id('exec'),
			definitionId: 'exec',
			connectionId: 'internal',
			options: { path: v(command), cwd: v(''), timeout: v(8000), targetVariable: v(VARIABLE) },
			upgradeIndex: null,
			type: 'action',
			children: {},
		},
	],
	condition: [],
	events: [{ id: id('event'), type: 'timeofday', enabled: true, options: { time: TIME, days: [...DAYS] } }],
	localVariables: [],
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
console.log(`  "${TRIGGER_NAME}" (${triggerId}) at ${TIME} on ${DAYS.map((d) => DAY_NAMES[d]).join(', ')}`)
console.log(`    ${command} -> custom:${VARIABLE}`)
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
console.log(`\nwrote ${path.basename(file)} — ${mine ? `replace with: node tools/rig.js import ${file} triggers` : `add with: node tools/rig.js add-trigger ${file} ${triggerId}`}`)
