/**
 * Build the rig manual: three books as HTML, ready for scripts/manual_pdf.py.
 *
 * Usage:
 *   node tools/manual.js <snapshotDir> <outDir>
 *
 * The snapshot folder holds what was read off the rig (tools/manual-collect.js writes it):
 *   rig.json        Companion's full export — HOLDS PASSWORDS, keep it out of git
 *   videohub.txt    the Videohub's status dump from TCP 9990
 *   atem.txt        the ATEM's status dump from TCP 9990
 *   statuses.json   connection statuses (optional)
 *   meta.json       { readAt } — when the snapshot was taken
 * Action and feedback names come from docs/manual/definitions.json, the modules' own labels;
 * an action that is not in it prints by its raw id. The production notes in docs/production
 * become the Reference's closing chapters and the Operator Guide's checklists.
 *
 * Writes <outDir>/operator.html, reference.html and recovery.html. Each book is checked for
 * every credential value in the export before it is written, and the build fails if one is
 * found, so a book can never carry a password.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDump } from '../src/manual/blackmagic.js'
import { chaptersFromMarkdown } from '../src/manual/compose.js'
import { book } from '../src/manual/html.js'
import { assertNoSecrets, buildModel, secretValues } from '../src/manual/model.js'
import { directives, referenceChapters } from '../src/manual/reference.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, 'docs')

/** The production notes, each its own chapter at the back of the Reference: the why behind the settings. */
const BACKGROUND = ['rig', 'cameras', 'switcher-atem', 'audio', 'recorder']

const read = (f) => fs.readFile(f, 'utf8')
const optional = (f, fallback) => read(f).catch(() => fallback)

async function production(names, dirs) {
	const docs = await Promise.all(names.map((n) => read(path.join(DOCS, 'production', `${n}.md`))))
	return docs.flatMap((md) => chaptersFromMarkdown(md, dirs))
}

async function main() {
	const [snap, out] = process.argv.slice(2)
	if (!snap || !out) throw new Error('usage: node tools/manual.js <snapshotDir> <outDir>')
	const exp = JSON.parse(await read(path.join(snap, 'rig.json')))
	const defs = JSON.parse(await read(path.join(DOCS, 'manual/definitions.json')))
	const statuses = JSON.parse(await optional(path.join(snap, 'statuses.json'), '{}')).statuses ?? {}
	const meta = JSON.parse(await optional(path.join(snap, 'meta.json'), '{}'))
	const vh = parseDump(await read(path.join(snap, 'videohub.txt')))
	const atem = parseDump(await read(path.join(snap, 'atem.txt')))

	const model = buildModel(exp, { defs: defs.actions, fbdefs: defs.feedbacks, statuses })
	const data = { vh, atem }
	const readAt = meta.readAt ?? 'unknown — no meta.json in the snapshot'
	const dirs = directives(model, data)
	const books = {
		operator: [...chaptersFromMarkdown(await read(path.join(DOCS, 'manual/operator.md')), dirs), ...(await production(['checklists'], dirs))],
		reference: [...referenceChapters(model, data), ...(await production(BACKGROUND, dirs))],
		recovery: chaptersFromMarkdown(await read(path.join(DOCS, 'manual/recovery.md')), dirs),
	}
	const secrets = secretValues(exp)
	await fs.mkdir(out, { recursive: true })
	for (const [kind, chapters] of Object.entries(books)) {
		const html = book({ kind, readAt, build: model.build, chapters })
		assertNoSecrets(html, secrets, kind)
		await fs.writeFile(path.join(out, `${kind}.html`), html)
		console.log(`${kind}: ${chapters.length} chapters`)
	}
}

main().catch((e) => {
	console.error(e.message)
	process.exit(1)
})
