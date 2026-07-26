/**
 * CLI wrapper: assemble the library and write it to disk.
 *
 * All assembly logic lives in `library.js` so it can be tested without filesystem access.
 * This file is intentionally I/O only, and is excluded from coverage for that reason.
 *
 * Run: npm run build
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ICONS } from './variants.js'
import { buildLibrary } from './library.js'

const dist = path.resolve('dist')
await fs.mkdir(path.join(dist, 'svg'), { recursive: true })

const { files, config } = await buildLibrary(ICONS)

for (const { name, svg } of files) {
	await fs.writeFile(path.join(dist, 'svg', `${name}.svg`), svg)
}

const out = path.join(dist, 'library.companionconfig')
await fs.writeFile(out, JSON.stringify(config))

const bytes = (await fs.stat(out)).size
console.log(
	`built ${files.length} icons across ${config.imageLibraryCollections.length} collections — ` +
		`${(bytes / 1024).toFixed(0)} KB`
)
