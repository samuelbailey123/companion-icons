/**
 * Dante on the deck: a read-only SQ7 sub-page answering "is every source reaching the desk?"
 *
 * The I/O half is `tools/dante-page.js`; everything that decides anything is here, tested.
 *
 * READ-ONLY, ON PURPOSE (Sam, 2026-10-11: "more of just like read for now"). No key on the page
 * changes a route. The connection behind it — `dante`, Bitfocus `audinate-dantecontroller` 1.1.2,
 * running on the Pi — can make and clear crosspoints, but a key that both reports and acts is a
 * key pressed by accident, and a route pulled mid-service is a mic gone from the room. The only
 * actions are navigation: the folder row, and the Dante key on SQ7 that opens this page.
 *
 * "NORMAL" IS WHAT THE DESK ASKS FOR. The routes below are the SQ7 Dante card's own subscriptions,
 * read off the network on 2026-10-11 (netaudio `subscription list`). They are not a design. If the
 * desk is repatched in Dante Controller, change them here, or the page will report the new patch
 * as broken.
 *
 * NEUTRAL UNTIL PROVEN. A key rests slate and is lit by feedback, never the other way round:
 *
 *   red    a source the desk needs is not on the Dante network at all
 *   amber  it is on the network, but its routes into the SQ7 are not all up
 *   green  it is on the network and every one of its routes is subscribed
 *
 * Green is the only state that needs evidence — an AND over the device being present and every
 * crosspoint subscribed — so a dead module, a renamed device or an unknown channel can never read
 * as fine. Feedbacks apply in order and later ones win, so the list runs red, amber, green.
 * Sources the desk only sometimes has (the tracks MacBook, two laptops) rest at "Not here" in
 * slate rather than red: their absence is a fact about the week, not a fault.
 *
 * PRESENCE IS THE MODULE'S DEVICE LIST. `$(dante:devices)` holds the names the module has heard
 * from within its timeout (15 s on this rig: a 5 s sweep, three missed answers). Hardware keeps
 * itself alive with heartbeats; Dante Virtual Soundcard only by answering the sweep.
 *
 * WHAT IS NOT HERE. The PTP clock leader: module 1.1.2 does not read clocking. On 2026-10-11 the
 * SQ7 card was leader and every other device followed it (netaudio `clock`). A sample-rate
 * mismatch is here, because that is the clock fault that silences a device.
 */
import { GRID_SIZE } from './layout.js'
import { folderFor, navRow } from './navrow.js'
import { expr, override, overrideExpr, v, when } from './ptz/actions.js'
import { key } from './ptz/controls.js'

/** Companion's id for the module, and the label this rig gave the connection. */
export const MODULE_ID = 'audinate-dantecontroller'
export const LABEL = 'dante'
/** Prefix of every id and every `options.notes` this file writes, so a rebuild finds its own. */
export const MARK = 'dante'

export const FOLDER_NAME = 'Dante'
export const PARENT = 'SQ7'
/** The Dante key on SQ7: under Mute DCAs, in a row the SQ7 page leaves empty. */
export const ENTRY_CELL = { row: 2, col: 8 }
/**
 * And a Dante folder on Home (Sam, 2026-10-11), beside Projectors and PA: the things that must be
 * right before a service starts. Columns 0-3, so the Stream Deck + shows it as well as the XL and
 * the iPad deck.
 */
export const HOME = 'Home'
export const HOME_CELL = { row: 1, col: 2 }

/** The SQ7's Dante card, by its Dante name: the one receiver every route below lands on. */
export const DESK = 'AllenHth-0e0184'
/** Every device on this network runs 48 kHz. */
export const RATE = 48000

/** `count` routes: source channel `tx`, `tx+1`… into desk input `rx`, `rx+1`…. */
const run = (tx, rx, count) => Array.from({ length: count }, (_, i) => [tx + i, rx + i])

/**
 * The sources, left to right as they sit on row 1.
 *
 * `routes` are [source channel, SQ7 input] pairs. `required` sources go red when missing; the
 * rest go to "Not here". Names on the key come from what the receivers hold, as on the old Mics
 * page, not from Dante's device names.
 */
export const SOURCES = [
	{ key: 'leads', name: 'Leads', device: 'ULXD4Q-LEADS-1-4', icon: 'mic-off', required: true, routes: run(1, 1, 4) },
	{ key: 'bgv', name: 'BGV 1-4', device: 'ULXD4Q-BGV-1-4', icon: 'mic-off', required: true, routes: run(1, 5, 4) },
	/*
	 * On 2026-10-11 this receiver answered on its control port (10.23.0.253) and named itself
	 * this, but its Dante interface was not on the network, so SQ7 inputs 9-12 were unresolved.
	 */
	{ key: 'host', name: 'BGV+Host', device: 'ULXD4Q-BGV-5-6-HOST-1-2', icon: 'mic-off', required: true, routes: run(1, 9, 4) },
	{ key: 'lav', name: 'Lav 1-2', device: 'ULXD4D-LAV-1-2', icon: 'mic-off', required: true, routes: run(1, 13, 2) },
	{ key: 'tracks', name: 'Tracks', device: 'TCBs-MacBook-Pro-Tracks', icon: 'playlist', required: false, routes: run(1, 15, 8) },
	/* ProPresenter's audio, on two pairs of inputs. */
	{ key: 'pp1', name: 'PP1', device: 'iMac-PP1', icon: 'media', required: true, routes: [...run(1, 23, 2), ...run(1, 45, 2)] },
	{ key: 'devan', name: 'Devan', device: 'Devans-Mac-mini', icon: 'source', required: false, routes: [...run(1, 33, 9), ...run(19, 51, 14)] },
	{ key: 'josue', name: 'Josue', device: 'Josues-MacBook-Pro', icon: 'source', required: false, routes: [...run(1, 42, 3), ...run(6, 47, 3)] },
]

/** Resting slate, and the three states. White on each measures at least 4.5:1. */
export const BG = { rest: 0x1f2937, bad: 0xb91c1c, warn: 0xa16207, good: 0x15803d }

/** Dante channel names on this network are zero-padded numbers: "01", "02"…. */
export const channel = (n) => String(n).padStart(2, '0')

/** "SQ 1-4", "SQ 23-24, 45-46": the desk inputs a source lands on, as contiguous runs. */
export function inputsText(routes) {
	const inputs = routes.map(([, rx]) => rx).sort((a, b) => a - b)
	const runs = []
	for (const n of inputs) {
		const last = runs.at(-1)
		if (last && n === last[1] + 1) last[1] = n
		else runs.push([n, n])
	}
	return `SQ ${runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')}`
}

/** A module variable. */
const dv = (name) => `$(${LABEL}:${name})`

/** True while the module has heard from `device`. */
export const online = (device) => `arrayIncludes(${dv('devices')}, "${device}")`

/** One crosspoint, as the module's own boolean feedback: subscribed, from this channel. */
export const crosspoint = (connectionId, id, device, [tx, rx]) => ({
	id,
	type: 'feedback',
	definitionId: 'routing_bg_manual',
	connectionId,
	options: {
		sourceChannelName: v(channel(tx)),
		sourceDeviceName: v(device),
		destinationChannelId: v(channel(rx)),
		destinationDeviceId: v(DESK),
	},
	isInverted: v(false),
	styleOverrides: [],
	// The module ships one upgrade script, a placeholder; 0 marks it as already run.
	upgradeIndex: 0,
	children: {},
})

/** `internal: logic_operator` AND over `conditions`, styled when true (or false, inverted). */
export const allOf = (id, conditions, styleOverrides, inverted = false) => ({
	id,
	type: 'feedback',
	definitionId: 'logic_operator',
	connectionId: 'internal',
	options: { operation: v('and') },
	isInverted: v(inverted),
	styleOverrides,
	children: { default: conditions },
})

/**
 * Every condition that has to hold for `source` to be fully routed: present, then each route.
 *
 * Ids are prefixed by `scope` because Companion keys a control's entities by id: two ANDs over
 * the same routes on one key (the routing key has a red one and a green one) need distinct ids.
 */
export const routedConditions = (connectionId, source, scope = MARK) => [
	when(`${scope}-${source.key}-on`, online(source.device)),
	...source.routes.map((route) =>
		crosspoint(connectionId, `${scope}-${source.key}-x${route[1]}`, source.device, route)
	),
]

/** Recolour and recaption a key. */
const restyle = (id, bg, caption) => [override(`${id}-bg`, 'box0', 'color', bg), override(`${id}-text`, 'text0', 'text', caption)]

const noActions = { down: [], up: [] }

/** One source on row 1: is it on the network, and are all its routes into the SQ7 up? */
export function sourceKey(connectionId, source) {
	const id = `${MARK}-${source.key}`
	const caption = (line) => `${source.name}\n${line}`
	const inputs = inputsText(source.routes)
	// One run per line on the key: "SQ 23-24, 45-46" on one line breaks at a hyphen on the deck.
	const landing = inputs.replaceAll(', ', '\n')
	return key({
		style: { icon: source.icon, label: caption(landing), bg: BG.rest },
		notes: `${MARK}: ${source.device} into ${DESK} (${inputs}). Read-only. Green: on the network and every route subscribed. Amber: on the network, a route down. ${source.required ? 'Red: not on the network.' : 'Slate "Not here": not on the network, which is normal for this one.'}`,
		feedbacks: [
			when(
				`${id}-absent`,
				`!${online(source.device)}`,
				restyle(`${id}-absent`, source.required ? BG.bad : BG.rest, caption(source.required ? 'Offline' : 'Not here'))
			),
			when(`${id}-present`, online(source.device), restyle(`${id}-present`, BG.warn, caption('Not routed'))),
			allOf(`${id}-routed`, routedConditions(connectionId, source), restyle(`${id}-routed`, BG.good, caption(landing))),
		],
		actionSets: noActions,
	})
}

/** Every route the desk needs, as one AND. */
export const requiredConditions = (connectionId, scope) =>
	SOURCES.filter((s) => s.required).flatMap((s) => routedConditions(connectionId, s, scope))

/** Row 1's last key: the whole patch at once. Laptops that come and go are not part of it. */
export function normalKey(connectionId) {
	const id = `${MARK}-normal`
	return key({
		style: { icon: 'route', label: 'Routing', bg: BG.rest },
		notes: `${MARK}: green when every required source is on the network with all its routes into ${DESK} subscribed; red otherwise. The laptops (${SOURCES.filter((s) => !s.required).map((s) => s.name).join(', ')}) are not counted. Read-only.`,
		feedbacks: [
			allOf(`${id}-broken`, requiredConditions(connectionId, `${id}-broken`), restyle(`${id}-broken`, BG.bad, 'Routing\nNot normal'), true),
			allOf(`${id}-ok`, requiredConditions(connectionId, `${id}-ok`), restyle(`${id}-ok`, BG.good, 'Routing\nNormal')),
		],
		actionSets: noActions,
	})
}

/** "48 kHz / 1 ms" while the device is present, "-" while it is not. */
export const detailText = (device) =>
	`${online(device)} ? concat(round(${dv(`${device}_sr`)} / 100) / 10, " kHz / ", ${dv(`${device}_latency`)}, " ms") : "-"`

/** Row 2: the device's sample rate and latency, under its source. */
export function detailKey(id, name, device) {
	return key({
		style: { icon: 'network', label: detailText(device), bg: BG.rest, labelIsExpression: true },
		notes: `${MARK}: ${name} (${device}) sample rate and Dante latency, or "-" when it is not on the network. Read-only.`,
		feedbacks: [when(`${id}-rate`, `${online(device)} && ${dv(`${device}_sr`)} != ${RATE}`, [override(`${id}-rate-bg`, 'box0', 'color', BG.bad)])],
		actionSets: noActions,
	})
}

/** Every present device at RATE, and the desk present to compare against. */
export const ratesAgree = () =>
	[`${online(DESK)}`, ...[DESK, ...SOURCES.map((s) => s.device)].map((d) => `(!${online(d)} || ${dv(`${d}_sr`)} == ${RATE})`)].join(' && ')

/** The SQ7's own card: the hub. If it is gone, nothing reaches the desk. */
export function deskKey() {
	const id = `${MARK}-desk`
	return key({
		style: { icon: 'mix', label: 'SQ7 card', bg: BG.rest },
		notes: `${MARK}: the SQ7's Dante card (${DESK}), which every route on this page lands on, and its sample rate and latency. Read-only.`,
		feedbacks: [
			when(`${id}-absent`, `!${online(DESK)}`, restyle(`${id}-absent`, BG.bad, 'SQ7 card\nOffline')),
			when(`${id}-present`, online(DESK), [
				override(`${id}-present-bg`, 'box0', 'color', BG.good),
				overrideExpr(`${id}-present-text`, 'text0', 'text', `concat("SQ7 card\\n", ${detailText(DESK)})`),
			]),
		],
		actionSets: noActions,
	})
}

/** One key for the clock fault that silences a device: a sample rate that differs. */
export function rateKey() {
	const id = `${MARK}-rate`
	return key({
		style: { icon: 'meter', label: 'Sample rate', bg: BG.rest },
		notes: `${MARK}: green when every Dante device present runs ${RATE / 1000} kHz, red when one differs or the SQ7 card is missing. Read-only.`,
		feedbacks: [
			when(`${id}-bad`, `!(${ratesAgree()})`, restyle(`${id}-bad`, BG.bad, 'Sample rate\nMismatch')),
			when(`${id}-ok`, ratesAgree(), restyle(`${id}-ok`, BG.good, `Sample rate\n${RATE / 1000} kHz`)),
		],
		actionSets: noActions,
	})
}

/**
 * A key that opens this page, red whenever the patch is not normal. It wears a folder icon because
 * it opens a folder (the lesson of PP1's Tracks key, which nobody knew was one).
 */
export function entryKey(connectionId, dantePage, id = `${MARK}-entry`) {
	return key({
		style: { icon: 'folder-audio', label: FOLDER_NAME, bg: BG.rest },
		notes: `${MARK}: opens the Dante page (page ${dantePage}). Red when a source the desk needs is not reaching it.`,
		feedbacks: [allOf(`${id}-broken`, requiredConditions(connectionId, id), [override(`${id}-broken-bg`, 'box0', 'color', BG.bad)], true)],
		actionSets: {
			down: [
				{
					id: `${id}-open`,
					definitionId: 'set_page',
					connectionId: 'internal',
					options: { surfaceId: v('self'), page: v(String(dantePage)) },
					upgradeIndex: null,
					type: 'action',
				},
			],
			up: [],
		},
	})
}

/** The Dante page: the folder row with SQ7 marked, sources on row 1, their devices under them. */
export function buildDantePage(connectionId, pageNumbers) {
	const sources = Object.fromEntries(SOURCES.map((s, col) => [col, sourceKey(connectionId, s)]))
	const details = Object.fromEntries(SOURCES.map((s, col) => [col, detailKey(`${MARK}-${s.key}-detail`, s.name, s.device)]))
	return {
		name: FOLDER_NAME,
		gridSize: { ...GRID_SIZE },
		controls: {
			0: navRow(folderFor(FOLDER_NAME), pageNumbers),
			1: { ...sources, [SOURCES.length]: normalKey(connectionId) },
			2: { ...details, [SOURCES.length]: deskKey() },
			3: { 0: rateKey() },
		},
	}
}

/** The `dante` connection, which must already be on the rig. */
export function findDanteConnection(full) {
	const found = Object.entries(full.instances ?? {}).find(([, i]) => i?.moduleId === MODULE_ID && i?.label === LABEL)
	if (!found) throw new Error(`no "${LABEL}" connection (${MODULE_ID}) on this rig; add it in Companion first`)
	return found[0]
}

/** Is this control one this file wrote? */
export const isOurs = (control) => String(control?.options?.notes ?? '').startsWith(`${MARK}:`)

/** A copy of the page named `name` with `control` at `cell`, refusing a cell holding someone else's key. */
function withKey(full, number, name, cell, control) {
	const page = structuredClone(full.pages[number])
	page.controls ??= {}
	page.controls[cell.row] ??= {}
	const there = page.controls[cell.row][cell.col]
	if (there && !isOurs(there)) throw new Error(`${name} ${cell.row}/${cell.col} already holds a different key`)
	page.controls[cell.row][cell.col] = control
	return page
}

/**
 * All three pages from a live export: the Dante page, and SQ7 and Home each with a key opening it.
 *
 * The Dante page keeps its number and id if the rig has one, and is otherwise the page after the
 * last, which is where `import-page … new` puts it. Each key refuses a cell holding anything but
 * an earlier Dante key.
 */
export function buildConfig(full) {
	const numberOf = (name) => Object.entries(full.pages).find(([, p]) => p.name === name)?.[0]
	const sq7 = numberOf(PARENT)
	if (!sq7) throw new Error(`no page named "${PARENT}" on this rig`)
	const home = numberOf(HOME)
	if (!home) throw new Error(`no page named "${HOME}" on this rig`)

	const numbers = Object.keys(full.pages).map(Number)
	if (Math.max(...numbers) !== numbers.length) {
		throw new Error(`pages are not numbered 1..${numbers.length}; a new page would not land after the last`)
	}
	const existing = numberOf(FOLDER_NAME)
	const number = existing ?? String(numbers.length + 1)
	const connectionId = findDanteConnection(full)

	const parent = withKey(full, sq7, PARENT, ENTRY_CELL, entryKey(connectionId, number))
	const homePage = withKey(full, home, HOME, HOME_CELL, entryKey(connectionId, number, `${MARK}-home`))

	const pageNumbers = Object.fromEntries(Object.entries(full.pages).map(([n, p]) => [p.name, Number(n)]))
	const page = buildDantePage(connectionId, pageNumbers)
	if (existing) page.id = full.pages[existing].id

	return { sq7, parent, home, homePage, number, existing: Boolean(existing), page, connectionId }
}
