/**
 * Put the Planning Center LIVE keys on the deck.
 *
 * Usage: node tools/pco-live-pages.js <live-full.json> <outdir> --service-type <id>
 *
 * Writes one page bundle each for Home, Worship and Sermon; import them one at a time with
 * `node tools/rig.js import-page <bundle> <pageNumber>` — the page numbers are printed. Every
 * decision (which cells, what the keys show and do, what they refuse to overwrite) lives in
 * `src/pco-live.js`, which is unit-tested; this file is I/O.
 *
 * THE CONNECTION MUST ALREADY EXIST. `import-page` maps every connection in a bundle to itself
 * and refuses one the rig lacks, so the Services Live connection is added to Companion first and
 * this reads its id from the export. The service type id is the number in the PCO URL
 * (…/service_types/<id>); the module resolves "the next plan of that service type" at every
 * press, so the keys never need re-pointing week to week.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildPcoLivePages, findPcoConnection } from '../src/pco-live.js'

const [, , src, outDir, ...flags] = process.argv
const serviceTypeId = flags[flags.indexOf('--service-type') + 1]
if (!src || !outDir || flags.indexOf('--service-type') < 0 || !serviceTypeId) {
	console.error('usage: node tools/pco-live-pages.js <live-full.json> <outdir> --service-type <id>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const [connectionId, instance] = findPcoConnection(full)
console.log(`connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId ?? ''}`.trimEnd())

const { pages } = buildPcoLivePages(full, { connectionId, label: instance.label, serviceTypeId })

await fs.mkdir(outDir, { recursive: true })
for (const { number, name, cells, bundle } of pages) {
	const file = path.join(outDir, `pco-live-${name.toLowerCase()}.companionconfig`)
	await fs.writeFile(file, JSON.stringify(bundle))
	console.log(`page ${number} ${name}: ${cells.join(', ')}`)
	console.log(`  -> node tools/rig.js import-page ${file} ${number}`)
}
