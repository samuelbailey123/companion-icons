/**
 * System: the Pi's health, spread across the deck instead of packed into four columns.
 *
 * Usage: node tools/system-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row
 *   row 1   CPU temp, CPU load, memory, disk, power — what goes wrong under load
 *   row 2   internet, address, uptime, Companion, storage — identity and continuity
 *
 * Both rows sit on columns 0, 2, 4, 6 and 8: ten tiles, evenly spaced edge to edge. Five is the
 * only count that divides nine evenly, which is why disk percentage and disk free share a key
 * rather than taking two — and they belong together anyway, since "88% full" and "3 GB left"
 * answer the same question at two useful resolutions.
 *
 * EXISTING TILES ARE MOVED, NOT REBUILT. Their thresholds — 65/78 °C, load 2.5/4, memory
 * 75/90%, disk 80/92% — were chosen against this machine and are not mine to re-derive. They
 * come across with their feedbacks intact; only position and, for disk, the value line change.
 *
 * TWO OF THE NEW READINGS NEED NO SHELL AT ALL. Companion publishes `internal:uptime` (its OWN
 * uptime, in seconds — not the machine's, which is why the existing Uptime tile reads the OS)
 * and `internal:version`. Using those beats polling for them: no command to be wrong about, no
 * variable to keep fed, and they are correct the instant Companion starts.
 *
 * The remaining three do need the poller, and every command is strictly read-only — `df`,
 * `hostname`, and a read of /proc/mounts. Each ends in a fallback so an assumption that does
 * not hold on this machine shows "n/a" rather than something misleading, which is the
 * convention the throttle tile already uses.
 *
 * WHY STORAGE IS WORTH A KEY. An SD card that has flipped read-only is the Pi failure that
 * costs a service: Companion keeps running, the deck keeps working, and every change made from
 * that moment is lost at the next restart. Nothing else on this page would show it.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/system-page.js <live-full.json> <outdir>')
	process.exit(1)
}

/** Five tiles to a row, evenly spaced across the nine columns. */
const SPREAD = [0, 2, 4, 6, 8]

/**
 * New readings, and the read-only shell that produces each.
 *
 * These become custom variables, which must exist on the rig before the page is imported — a
 * page import cannot carry them, and importing custom variables wholesale would reset live
 * values like the MA2 fader levels.
 */
const COMMANDS = {
	sys_disk_free: `df -BG -P / 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4} END {if (NR<2) print "n/a"}'`,
	sys_ip: `hostname -I 2>/dev/null | awk '{print ($1=="" ? "n/a" : $1)}'`,
	sys_rw: `awk '$2=="/" {print ($4 ~ /(^|,)ro(,|$)/) ? "READ-ONLY" : "OK"; exit}' /proc/mounts 2>/dev/null || echo n/a`,
}

const BG = 0x1c2b2b
const WARN_BG = 0x7a5a00
const BAD_BG = 0xcc0000

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

/** An internal expression feedback that repaints a key when `expression` is true. */
const lit = (id, expression, bg, icon) => ({
	id,
	type: 'feedback',
	definitionId: 'check_expression',
	connectionId: 'internal',
	options: { expression: expr(expression) },
	isInverted: v(false),
	styleOverrides: [
		{ overrideId: `${id}-bg`, elementId: 'box0', elementProperty: 'color', override: v(bg) },
		...(icon
			? [
					{
						overrideId: `${id}-icon`,
						elementId: 'image0',
						elementProperty: 'base64Image',
						override: v(`$(image:${icon})`),
					},
				]
			: []),
	],
})

/** A tile: icon over a name over a live value, matching the rest of the deck. */
const tile = ({ icon, name, value, valueIsExpression = false, feedbacks = [] }) => ({
	type: 'button-layered',
	style: {
		layers: [
			{
				id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
				decoration: v('default'), showStatusIcons: v('default'),
			},
			{
				id: 'box0', name: 'Background', usage: 'auto', type: 'box',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
				color: v(BG), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
			},
			{
				id: 'image0', name: 'Image', usage: 'auto', type: 'image',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(2), width: v(100), height: v(40), rotation: v(0),
				base64Image: v(`$(image:${icon})`),
				halign: v('center'), valign: v('center'), fillMode: v('fit'),
			},
			{
				id: 'text0', name: 'Name', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(42), width: v(100), height: v(30), rotation: v(0),
				text: v(name), color: v(0xffffff),
				halign: v('center'), valign: v('center'),
				fontsize: v(80), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
			{
				id: 'text1', name: 'Value', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100),
				x: v(0), y: v(70), width: v(100), height: v(28), rotation: v(0),
				text: valueIsExpression ? expr(value) : v(value), color: v(0xbcd8e6),
				halign: v('center'), valign: v('center'),
				fontsize: v(80), fontsizeAllowShrink: v(true), font: v('companion-sans'),
				outlineColor: v(0xff000000),
			},
		],
	},
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes: '',
	},
	feedbacks,
	steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
	localVariables: [],
})

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

for (const name of Object.keys(COMMANDS)) {
	if (!(name in (full.custom_variables ?? {}))) {
		throw new Error(`custom variable "${name}" does not exist on this rig — create it in Variables > Custom first`)
	}
}

const number = pageNumbers.System
const original = full.pages[number]

const layerOf = (c, type) => (c?.style?.layers ?? []).find((l) => l.type === type)

/** Index existing tiles by the name on them, so they can be moved without being rebuilt. */
const existing = {}
for (const cells of Object.values(original.controls ?? {})) {
	for (const control of Object.values(cells)) {
		const name = (layerOf(control, 'text')?.text?.value ?? '').replace(/\s+/g, ' ').trim()
		if (name && name !== 'Home') existing[name] = structuredClone(control)
	}
}

/** Move an existing tile onto the deck's shared geometry, optionally rewriting its value line. */
function carried(name, value) {
	const control = existing[name]
	if (!control) throw new Error(`no existing "${name}" tile to carry across — found: ${Object.keys(existing).join(', ')}`)

	const image = layerOf(control, 'image')
	if (image) {
		image.y = v(2)
		image.height = v(40)
	}
	const texts = (control.style?.layers ?? []).filter((l) => l.type === 'text')
	const bands = [
		{ y: 42, height: 30 },
		{ y: 70, height: 28 },
	]
	for (const [i, text] of texts.entries()) {
		if (!bands[i]) break
		text.y = v(bands[i].y)
		text.height = v(bands[i].height)
		text.fontsize = v(80)
		text.fontsizeAllowShrink = v(true)
	}
	if (value !== undefined && texts[1]) texts[1].text = v(value)
	return control
}

const page = structuredClone(original)
page.gridSize = { ...GRID_SIZE }
page.controls = {}

const ROW1 = [
	carried('CPU Temp'),
	carried('CPU Load'),
	carried('Memory'),
	carried('Disk', '$(internal:custom_sys_disk)% · $(internal:custom_sys_disk_free)G'),
	carried('Power'),
]

const ROW2 = [
	carried('Internet'),
	tile({ icon: 'network', name: 'Address', value: '$(internal:custom_sys_ip)' }),
	carried('Uptime'),
	tile({
		icon: 'uptime',
		name: 'Companion',
		/*
		 * `internal:uptime` is Companion's own uptime in SECONDS. Hours is the right resolution
		 * for the question this answers — "has it restarted recently?" — and `round` is one of
		 * the expression functions this rig is known to have, where `floor` is not.
		 */
		value: 'concat(round($(internal:uptime) / 3600), "h · ", $(internal:version))',
		valueIsExpression: true,
	}),
	tile({
		icon: 'storage-ok',
		name: 'Storage',
		value: '$(internal:custom_sys_rw)',
		feedbacks: [
			lit('sys-rw-bad', '$(internal:custom_sys_rw) == "READ-ONLY"', BAD_BG, 'storage-locked'),
			lit('sys-rw-unknown', '$(internal:custom_sys_rw) == "n/a"', WARN_BG, null),
		],
	}),
]

page.controls[1] = Object.fromEntries(ROW1.map((c, i) => [SPREAD[i], c]))
page.controls[2] = Object.fromEntries(ROW2.map((c, i) => [SPREAD[i], c]))
page.controls[0] = navRow('System', pageNumbers)

/* Extend the existing poller rather than adding a second: one trigger, one interval, one place to look. */
const poller = Object.entries(full.triggers ?? {}).find(([, t]) => /system stats/i.test(t.options?.name ?? ''))
if (!poller) throw new Error('no "Poll system stats" trigger to extend')
const [pollerId, pollerTrigger] = poller

const triggers = structuredClone(full.triggers)
const target = triggers[pollerId]
const already = new Set((target.actions ?? []).map((a) => a.options?.targetVariable?.value))
const added = []
for (const [variable, command] of Object.entries(COMMANDS)) {
	if (already.has(variable)) continue
	target.actions.push({
		id: `sys-poll-${variable}`,
		definitionId: 'exec',
		connectionId: 'internal',
		options: { path: v(command), cwd: v(''), timeout: v(5000), targetVariable: v(variable) },
		type: 'action',
		children: {},
	})
	added.push(variable)
}

console.log(`  row 1  ${ROW1.map((c) => layerOf(c, 'text').text.value).join(' · ')}`)
console.log(`  row 2  ${ROW2.map((c) => layerOf(c, 'text').text.value).join(' · ')}`)
console.log(`  spread across columns ${SPREAD.join(', ')}`)
console.log(`  poller "${pollerTrigger.options.name}": ${target.actions.length} readings, ${added.length} added${added.length ? ` (${added.join(', ')})` : ''}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-system.companionconfig`)
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

/* The trigger change cannot ride in a page file, so it is written for a separate import. */
await fs.writeFile(path.join(outDir, 'triggers.json'), JSON.stringify(triggers))
console.log(`\nwrote ${path.basename(file)} and triggers.json`)
