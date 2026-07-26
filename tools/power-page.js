/**
 * Rebuild the Power page as two state-aware toggles.
 *
 * Usage: node tools/power-page.js <prod-full.json> <outfile>
 *
 * Before: four buttons — Projectors On/Off and PA On/Off — each carrying the SAME four
 * feedbacks, so all four displayed system state rather than what they did. "Projectors On"
 * sat red whenever the projectors were off, which reads exactly backwards.
 *
 * After: one button per system.
 *   tap        -> turn on
 *   hold 1s    -> turn off
 *
 * The hold is the guard. Turning projectors off mid-service is not just disruptive, it
 * costs a warm-up cycle to undo, and it was previously one stray press away. Making the
 * destructive direction require a deliberate hold removes that whole class of accident
 * without adding a confirmation step to the safe direction.
 *
 * State still comes from the existing `custom:projector_state` / `custom:pa_state`
 * feedbacks (polled every 10s by triggers), so the colour and icon keep working exactly as
 * they do now: green on, red off, amber mixed, orange unreachable.
 */
import fs from 'node:fs/promises'

const [, , src, out] = process.argv
if (!src || !out) {
	console.error('usage: node tools/power-page.js <prod-full.json> <outfile>')
	process.exit(1)
}

/** Hold duration, in ms, before the "off" action fires. */
const HOLD_MS = 1000

const v = (value) => ({ value, isExpression: false })

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const page = structuredClone(full.pages['1'])

/** Pull the existing exec action off a button so the script paths are never retyped. */
function execActionFrom(control) {
	for (const step of Object.values(control.steps ?? {})) {
		for (const set of Object.values(step.action_sets ?? {})) {
			if (Array.isArray(set)) {
				const hit = set.find((a) => a.definitionId === 'exec')
				if (hit) return structuredClone(hit)
			}
		}
	}
	return null
}

const SYSTEMS = [
	{ label: 'Projectors', on: ['0', '1'], off: ['1', '1'], target: ['0', '1'] },
	{ label: 'PA', on: ['0', '2'], off: ['1', '2'], target: ['0', '2'] },
]

let seq = 0
const freshId = () => `act-${(seq++).toString(36)}`

for (const sys of SYSTEMS) {
	const onBtn = page.controls[sys.on[0]][sys.on[1]]
	const offBtn = page.controls[sys.off[0]][sys.off[1]]

	const onAction = execActionFrom(onBtn)
	const offAction = execActionFrom(offBtn)
	if (!onAction || !offAction) throw new Error(`${sys.label}: could not find both exec actions`)

	onAction.id = freshId()
	offAction.id = freshId()

	// Start from the existing "on" button so its feedbacks and layers are preserved intact.
	const merged = structuredClone(onBtn)

	for (const layer of merged.style.layers) {
		if (layer.type === 'text') layer.text = v(sys.label)
	}

	/*
	 * Companion maps these sets to:
	 *   down          -> "Press actions"                fires the instant the key goes down
	 *   up            -> "Short release actions"        fires on a quick tap-and-release
	 *   <ms>          -> "Release after <ms> actions"   fires on release after holding
	 *
	 * ON therefore has to live in `up`, not `down`. With ON in `down` a hold would fire ON
	 * immediately and OFF on release — a power cycle rather than a guard. Verified by
	 * reading the labels Companion itself puts on these groups.
	 */
	merged.steps = {
		0: {
			action_sets: {
				down: [],
				up: [onAction],
				[String(HOLD_MS)]: [offAction],
			},
			options: { runWhileHeld: [] },
		},
	}

	page.controls[sys.target[0]][sys.target[1]] = merged
	delete page.controls[sys.off[0]][sys.off[1]]
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
		oldPageNumber: 1,
	})
)

console.log(`wrote ${out}`)
for (const sys of SYSTEMS) console.log(`  ${sys.label.padEnd(11)} tap = on, hold ${HOLD_MS}ms = off`)
console.log(`  freed 2 keys; state colours and icons unchanged`)
