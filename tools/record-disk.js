/**
 * Make the Record keys show which disk the switcher will record to.
 *
 * Usage: node tools/record-disk.js <live-full.json> <outdir>
 *
 * Writes one page bundle per page that has a Record key; import them one at a time with
 * `node tools/rig.js import-page <bundle> <pageNumber>` — the page numbers are printed. Every
 * decision (which keys, what they show, when they warn) lives in `src/record-disk.js`, which is
 * unit-tested; this file is I/O.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildRecordDiskPages, findAtemConnection } from '../src/record-disk.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/record-disk.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const [, instance] = findAtemConnection(full)
console.log(`connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId ?? ''}`.trimEnd())

const { pages } = buildRecordDiskPages(full)

await fs.mkdir(outDir, { recursive: true })
for (const { number, name, cells, bundle } of pages) {
	const file = path.join(outDir, `record-disk-${name.toLowerCase()}.companionconfig`)
	await fs.writeFile(file, JSON.stringify(bundle))
	console.log(`page ${number} ${name}: ${cells.join(', ')}`)
	console.log(`  -> node tools/rig.js import-page ${file} ${number}`)
}
