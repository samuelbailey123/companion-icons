/**
 * Add the triggers that poll the tracks and bring the SQ7's connection back. See src/live-state.js
 * for why each exists.
 *
 * Usage: node tools/live-state-triggers.js <live-full.json> <outdir> [<standInLabel> <standInHost>]
 *   then: node tools/rig.js create-vars <outdir>/triggers.companionconfig
 *         node tools/rig.js add-trigger <outdir>/triggers.companionconfig <id it prints>   (each)
 *
 * WITH A STAND-IN it builds only the SQ pair, aimed at a connection and "mixer" that are not the
 * real ones. That is how the reconnect was proven off-air on 2026-10-31: an allenheath-sq connection
 * pointed at a fake mixer on the Pi, which could be switched off and on at will.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { SCRIPT_PATH, VARIABLE } from './pp1-tracks.js'
import { buildTriggers, variablesFor } from '../src/live-state.js'

const [, , src, outDir, standInLabel, standInHost] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/live-state-triggers.js <live-full.json> <outdir> [<standInLabel> <standInHost>]')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)

const standIn = standInLabel ? { label: standInLabel, host: standInHost } : undefined
const added = buildTriggers(full, { script: SCRIPT_PATH, variable: VARIABLE, standIn })
for (const [id, t] of Object.entries(added)) {
	if (Object.values(full.triggers ?? {}).some((x) => x.options?.name === t.options.name)) {
		throw new Error(`the rig already has a "${t.options.name}" trigger`)
	}
	console.log(`  "${t.options.name}" (${id})`)
}

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'triggers.companionconfig')
await fs.writeFile(
	file,
	JSON.stringify({
		version: full.version,
		type: 'full',
		companionBuild: full.companionBuild,
		pages: full.pages,
		triggers: { ...full.triggers, ...added },
		triggerCollections: full.triggerCollections ?? [],
		custom_variables: { ...full.custom_variables, ...variablesFor(added) },
		instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
	})
)
console.log(`\nwrote ${file}`)
console.log(`  first: node tools/rig.js create-vars ${file}`)
for (const id of Object.keys(added)) console.log(`  then:  node tools/rig.js add-trigger ${file} ${id}`)
