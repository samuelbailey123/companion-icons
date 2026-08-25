/**
 * SQ7: a DCA row across the top, each key showing its level and whether it is muted.
 *
 * Usage: node tools/sq-page.js <live-full.json> <outdir>
 *
 *   row 0   folder row
 *   row 1   DCA 1-8, then the existing Mute DCAs key at the end
 *   rows 2-3 left empty
 *   row 4   the Stream / Foyer / MAIN readouts on the touchstrip, untouched
 *   row 5   the three encoders, untouched
 *
 * THE PAGE WAS NEARLY EMPTY. One key and three knobs on a nine-by-four surface, while the eight
 * DCAs — the controls a service is actually mixed on — were reachable only as a single
 * all-or-nothing key. Each now has its own.
 *
 * EVERY KEY SHOWS THREE THINGS AT ONCE, which is what makes the row worth glancing at:
 *   - which DCA it is                 the caption
 *   - whether it is muted             the key turns red, from the desk's own mute state
 *   - where its fader is sitting      the live level, in dB, under the name
 *
 * The level matters as much as the mute. A DCA pulled to -20 is not muted and will not light
 * red, but it is just as absent from the room — and that is exactly the failure that gets
 * hunted for at the desk while a service waits.
 *
 * IDS ARE THE MODULE'S OWN, read out of allenheath-sq 3.1.0 rather than guessed. Note the two
 * halves disagree about their option names, which is the sort of thing that silently produces a
 * button that looks right and does nothing:
 *   action    mute_dca   options { strip, mute }     mute: 0 = toggle, 1 = on, 2 = off
 *   feedback  mute_dca   options { channel }
 * The action shape is corroborated by the Mute DCAs key already on this page, which works.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { COLUMNS, GRID_SIZE } from '../src/layout.js'
import { assertNavCoverage, navRow } from '../src/navrow.js'
import { COLORS, MIN_CONTRAST } from '../src/palette.js'
import { contrastRatio, contrastVariant } from '../src/wiring.js'
import { ICONS } from '../src/variants.js'

const [, , src, outDir] = process.argv
if (!src || !outDir) {
	console.error('usage: node tools/sq-page.js <live-full.json> <outdir>')
	process.exit(1)
}

/** DCAs, in desk order. `strip` is zero-based; the desk and its labels are one-based. */
const DCAS = [0, 1, 2, 3, 4, 5, 6, 7]

/**
 * NRPN of DCA 1's output level. The rest follow consecutively.
 *
 * Taken from the live rig: `$(SQ:level_79.32)` is described by the module as "DCA 1 Output
 * Level", through to 79.39 for DCA 8. Deriving it rather than hardcoding eight names keeps the
 * arithmetic in one visible place.
 */
const LEVEL_BASE = 32
const levelVariable = (strip) => `$(SQ:level_79.${LEVEL_BASE + strip})`

/** Toggle. The module's enum: 0 toggle, 1 on, 2 off. */
const MUTE_TOGGLE = 0

/** Dark cyan, the SQ identity; red when muted, matching every other muted thing on this deck. */
const REST_BG = 0x062b3a
const MUTED_BG = 0xcc0000

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })
const hex = (n) => '#' + ((n ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6)

const NATURAL = new Map(ICONS.filter((i) => i.collection !== 'contrast').map((i) => [i.shape, i]))
const KNOWN = new Set(ICONS.map((i) => i.name))

/** The icon name for a shape on a background: own colour if legible there, else paper/ink. */
function iconFor(shape, background) {
	const natural = NATURAL.get(shape)
	const ratio = natural ? contrastRatio(COLORS[natural.color], hex(background)) : 0
	if (natural && ratio >= MIN_CONTRAST) return { name: natural.name, ratio }

	const variant = contrastVariant(background)
	const name = `${shape}-${variant}`
	if (!KNOWN.has(name)) throw new Error(`the library has no icon "${name}"`)
	return { name, ratio: contrastRatio(COLORS[variant], hex(background)) }
}

const layers = ({ icon, name, level, bg }) => [
	{
		id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas',
		decoration: v('default'), showStatusIcons: v('default'),
	},
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
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
		/*
		 * The level, in its own layer beneath the name — the pattern the touchstrip readouts on
		 * this same page already use. Dimmer than the name on purpose: it is the secondary
		 * reading, and a row of eight equally-weighted numbers is a row nobody scans.
		 */
		id: 'text1', name: 'Level', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100),
		x: v(0), y: v(70), width: v(100), height: v(28), rotation: v(0),
		text: v(level), color: v(0xbcd8e6),
		halign: v('center'), valign: v('center'),
		fontsize: v(80), fontsizeAllowShrink: v(true), font: v('companion-sans'),
		outlineColor: v(0xff000000),
	},
]

/**
 * One DCA key.
 *
 * Pressing toggles the mute. That matches the encoders already on this page, which mute their
 * matrix or LR on press, so the whole surface behaves the same way under a finger.
 */
const dcaKey = (connectionId, strip, restIcon, mutedIcon) => ({
	type: 'button-layered',
	style: {
		layers: layers({
			icon: restIcon,
			name: `DCA ${strip + 1}`,
			level: `${levelVariable(strip)} dB`,
			bg: REST_BG,
		}),
	},
	options: {
		stepProgression: 'auto', stepExpression: '', rotaryActions: false,
		canModifyStyleInApis: false, notes: `Toggle mute on DCA ${strip + 1}`,
	},
	feedbacks: [
		{
			id: `sq-dca-mute-${strip}`,
			type: 'feedback',
			definitionId: 'mute_dca',
			connectionId,
			// The FEEDBACK calls it `channel`; the action calls the same thing `strip`.
			options: { channel: v(strip) },
			isInverted: v(false),
			styleOverrides: [
				{ overrideId: `sq-dca-${strip}-bg`, elementId: 'box0', elementProperty: 'color', override: v(MUTED_BG) },
				{
					overrideId: `sq-dca-${strip}-icon`, elementId: 'image0', elementProperty: 'base64Image',
					override: v(`$(image:${mutedIcon})`),
				},
			],
		},
	],
	steps: {
		0: {
			action_sets: {
				down: [
					{
						id: `sq-dca-toggle-${strip}`,
						definitionId: 'mute_dca',
						connectionId,
						options: { strip: v(strip), mute: v(MUTE_TOGGLE) },
						upgradeIndex: null,
						type: 'action',
					},
				],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
	localVariables: [],
})

const full = JSON.parse(await fs.readFile(src, 'utf8'))
const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
assertNavCoverage(Object.values(full.pages).map((p) => p.name), COLUMNS)

const number = pageNumbers.SQ7
const original = full.pages[number]
const found = Object.entries(full.instances).find(([, i]) => i.moduleId === 'allenheath-sq')
if (!found) throw new Error('no Allen & Heath SQ connection on this rig')
const [connectionId, instance] = found
console.log(`  connection "${instance.label}"  ${instance.moduleId} ${instance.moduleVersionId} (${instance.config?.model})`)

if (DCAS.length >= COLUMNS) throw new Error(`${DCAS.length} DCAs leaves no column for the existing key`)

const page = structuredClone(original)
page.gridSize = { ...GRID_SIZE }
page.controls = {}

const rest = iconFor('dca', REST_BG)
const muted = iconFor('dca', MUTED_BG)

page.controls[1] = {}
for (const [column, strip] of DCAS.entries()) {
	page.controls[1][column] = dcaKey(connectionId, strip, rest.name, muted.name)
}

// Everything the page already had, kept exactly where it is — except the old Mute DCAs key,
// which moves to the end of the DCA row so the all-at-once control sits with the individual ones.
const actionsOf = (c) =>
	Object.values(c?.steps ?? {})
		.flatMap((s) => Object.values(s.action_sets ?? {}))
		.filter(Array.isArray)
		.flat()
		.filter(Boolean)
const isPureNav = (c) => actionsOf(c).length === 1 && actionsOf(c)[0].definitionId === 'set_page'
const labelOf = (c) =>
	((c?.style?.layers ?? []).find((l) => l.type === 'text')?.text?.value ?? '').replace(/\s+/g, ' ').slice(0, 22)

const kept = []
for (const r of Object.keys(original.controls ?? {}).sort((a, b) => a - b)) {
	for (const c of Object.keys(original.controls[r]).sort((a, b) => a - b)) {
		const ctl = original.controls[r][c]
		if (Number(r) === 0 || isPureNav(ctl)) continue

		const [toRow, toCol] = Number(r) >= 4 ? [Number(r), Number(c)] : [1, COLUMNS - 1]
		page.controls[toRow] ??= {}
		if (page.controls[toRow][toCol]) throw new Error(`two controls both land on ${toRow}/${toCol}`)
		page.controls[toRow][toCol] = ctl
		kept.push(`${r}/${c} -> ${toRow}/${toCol}  ${labelOf(ctl)}`)
	}
}

page.controls[0] = navRow('SQ7', pageNumbers)

console.log(
	`  DCA 1-${DCAS.length} on row 1, press toggles mute, red when muted  ` +
		`(icon ${rest.name} ${rest.ratio.toFixed(2)}:1, muted ${muted.name} ${muted.ratio.toFixed(2)}:1)`
)
console.log(`  levels from ${levelVariable(DCAS[0])} .. ${levelVariable(DCAS.at(-1))}`)
for (const k of kept) console.log(`  kept   ${k}`)

await fs.mkdir(outDir, { recursive: true })
const file = path.join(outDir, `page-${number}-sq7.companionconfig`)
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
console.log(`\nwrote ${path.basename(file)}`)
