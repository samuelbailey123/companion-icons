/**
 * Put the Freeze key on PP1.
 *
 * Usage: node tools/pp1-freeze.js <live-full.json> <outdir>
 *
 * Writes one page bundle for PP1; import it with
 * `node tools/rig.js import-page <bundle> <pageNumber>` — the page number is printed. Every
 * decision (which cell, what the key shows and fires, what it refuses to overwrite, what the
 * macro must look like) lives in `src/pp1-freeze.js`, which is unit-tested; this file is I/O.
 *
 * THE MACRO MUST ALREADY EXIST. ProPresenter's API cannot create one, so add a macro called
 * "Freeze" in ProPresenter with a single action — Slide Destination, Stage Only — before running
 * this. The macro is read from ProPresenter at the address the Companion connection uses, so the
 * key is bound to its uuid and survives a rename.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildFreezePage, findFreezeMacro, findProPresenterConnection } from '../src/pp1-freeze.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/pp1-freeze.js <live-full.json> <outdir>')
	process.exit(1)
}

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const [, instance] = findProPresenterConnection(full)
console.log(`connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId ?? ''}`.trimEnd())

/** ProPresenter's own API. GETs need no login. */
const url = `http://${instance.config.host}:${instance.config.port}/v1/macros`
const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
if (!res.ok) throw new Error(`ProPresenter /macros: HTTP ${res.status}`)
const macro = findFreezeMacro(await res.json())
console.log(`macro "${macro.name}" (${macro.uuid})`)

const { number, cell, bundle } = buildFreezePage(full, macro)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, 'pp1-freeze.companionconfig')
await fs.writeFile(file, JSON.stringify(bundle))
console.log(`page ${number} PP1: ${cell} Freeze`)
console.log(`  -> node tools/rig.js import-page ${file} ${number}`)
