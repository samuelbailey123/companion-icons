/**
 * Start the stream as the countdown ends, not as it starts. See src/stream-at-service.js for why.
 *
 * Usage: node tools/stream-at-service.js <live-full.json> <outdir>
 *   then run what it prints, in that order: add the Sunday stream trigger first, so there is never
 *   a Sunday with nothing to start the stream, then take the start off the countdown trigger and
 *   the Countdown key.
 *
 * Off-air only: never while the service is live or recording (docs/production/recorder.md).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { planStreamAtService } from '../src/stream-at-service.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/stream-at-service.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
if (full.type !== 'full') throw new Error(`${path.basename(src)} is a "${full.type}" export, not a full one`)
const { pages, countdownTrigger, trigger } = planStreamAtService(full)
await fs.mkdir(outDir, { recursive: true })
const steps = []

if (trigger) {
	const file = path.join(outDir, 'stream-at-service-trigger.companionconfig')
	await fs.writeFile(
		file,
		JSON.stringify({
			version: full.version,
			type: 'full',
			companionBuild: full.companionBuild,
			pages: full.pages,
			triggers: { ...full.triggers, [trigger.id]: trigger.body },
			triggerCollections: full.triggerCollections ?? [],
			custom_variables: full.custom_variables,
			instances: full.instances,
			connectionCollections: full.connectionCollections ?? [],
		})
	)
	const { time, days } = trigger.body.events[0].options
	console.log(`add "${trigger.body.options.name}": stream On at ${time}, days ${days.join(',')}`)
	steps.push(`node tools/rig.js add-trigger ${file} ${trigger.id}`)
} else {
	console.log('the rig already has the Sunday stream trigger')
}

for (const actionId of countdownTrigger.remove) {
	console.log(`take the stream start ${actionId} off the Sunday countdown trigger (${countdownTrigger.id})`)
	steps.push(`node tools/rig.js remove-trigger-action ${countdownTrigger.id} ${actionId}`)
}

for (const { number, name, page, cells } of pages) {
	const file = path.join(outDir, `stream-at-service-${name.toLowerCase()}.companionconfig`)
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
	console.log(`page ${number} ${name}: take the stream start off ${cells.join(', ')}`)
	steps.push(`node tools/rig.js import-page ${file} ${number}`)
}

console.log(steps.length ? `\nthen, in order:\n${steps.map((s) => `  ${s}`).join('\n')}` : '\nnothing to change')
