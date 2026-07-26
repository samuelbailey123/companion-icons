/**
 * Rebuild the Power page as two state-aware toggles.
 *
 * Usage: node tools/power-page.js <prod-full.json> <outfile>
 *
 * Before: four buttons — Projectors On/Off and PA On/Off — each carrying the SAME four
 * feedbacks, so all four displayed system state rather than what they did. "Projectors On"
 * sat red whenever the projectors were off, which reads exactly backwards.
 *
 * After: one button per system, a single press toggles.
 *
 * The press works out which direction to go from the polled state rather than from a step
 * counter, so it cannot drift out of sync if something is powered on or off elsewhere.
 * `internal: exec` declares useVariables (plain interpolation) but NOT expression support,
 * so the on/off word is computed into a variable by an expression-capable action first and
 * then interpolated into the command — the same shape used for the grandMA2 knobs.
 *
 * If the state is unknown (empty, or the PDU unreachable) the press turns things ON, which
 * is the safe default.
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

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

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
	{
		label: 'Projectors', on: ['0', '1'], off: ['1', '1'], target: ['0', '1'],
		state: 'projector_state', action: 'projector_action',
	},
	{
		label: 'PA', on: ['0', '2'], off: ['1', '2'], target: ['0', '2'],
		state: 'pa_state', action: 'pa_action',
	},
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

	// The command is the "on" script with its trailing argument swapped for the variable,
	// so the real script path is reused rather than retyped.
	const template = String(onAction.options.path.value ?? onAction.options.path)
	const command = template.replace(/(\.py )on\b/, `$1$(internal:custom_${sys.action})`)
	if (command === template) throw new Error(`${sys.label}: could not substitute the on/off argument`)

	merged.steps = {
		0: {
			action_sets: {
				down: [
					{
						id: freshId(),
						definitionId: 'custom_variable_set_value',
						connectionId: 'internal',
						options: {
							name: v(sys.action),
							create: v(true),
							value: expr(`$(internal:custom_${sys.state}) == "on" ? "off" : "on"`),
						},
						upgradeIndex: null,
						type: 'action',
					},
					{ ...onAction, options: { ...onAction.options, path: v(command) } },
				],
				up: [],
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
for (const sys of SYSTEMS) console.log(`  ${sys.label.padEnd(11)} press toggles via custom:${sys.state}`)
console.log(`  freed 2 keys; state colours and icons unchanged`)
