/**
 * The stream goes live as the countdown ends, not as it starts.
 *
 * WHY. From 2026-10-27 the PP1 Countdown key, and the Sunday 10:24:57 trigger that copies it,
 * turned the ATEM's stream on along with the countdown. YouTube's event is set to auto-start, so
 * it went live the moment the HD8 started sending, and the whole five-minute countdown went out
 * with its music. YouTube flagged the music. Sam, 2026-11-02: "LIVE needs to happen as countdown
 * is ending."
 *
 * WHAT CHANGES. The stream start comes off the Countdown key and off the Sunday countdown trigger;
 * both still route Program to the recorder and start the HyperDeck, so the recording still has
 * the countdown. A new "Sunday stream" trigger turns the stream on at 10:30:00 on Sundays, when
 * the countdown has run out and the walk-in tracks, faded from 10:29:56, are silent. The YouTube
 * event's scheduled start should say 10:30 too, so the "Upcoming" countdown viewers see ends when
 * the stream begins.
 *
 * On, never the toggle, as before: a stream someone started by hand is left running. On any other
 * day, or if the countdown runs late, the guarded Stream key starts it by hand.
 *
 * IDEMPOTENT. A key or trigger with no stream start is left alone, and a rig that already has the
 * Sunday stream trigger gets no second one.
 */
import { isDeepStrictEqual } from 'node:util'
import { findAtem, findHyperdeck, isCountdownKey, isStreamStart, streamStart } from './record-hyperdeck.js'

/** When the stream starts: the countdown's end, the top of the service. Deck's own timezone. */
export const STREAM_AT = '10:30:00'
/** Weekdays it fires on, Sunday being 0. */
export const DAYS = [0]
export const TRIGGER_NAME = 'Sunday stream'
/** The trigger that fires the countdown, built by tools/pp1-countdown-trigger.js. */
export const COUNTDOWN_TRIGGER = 'Sunday countdown'
/** Prefix of every id this file writes. */
export const MARK = 'stream-at-service'

/** The Sunday stream trigger: the switcher's stream, on, at {@link STREAM_AT}. */
export function streamTrigger(atem, sortOrder) {
	return {
		type: 'trigger',
		options: {
			name: TRIGGER_NAME,
			enabled: true,
			sortOrder,
			notes:
				`Turns the ATEM stream on at ${STREAM_AT} on Sunday, as the countdown ends, so the countdown's ` +
				`music never goes out (YouTube flagged it). On, not toggle, so a stream already running is ` +
				`left alone. Built by tools/stream-at-service.js; to move it, change its time here.`,
		},
		actions: [{ ...streamStart(atem), id: `${MARK}:stream` }],
		condition: [],
		events: [{ id: `${MARK}:at`, type: 'timeofday', enabled: true, options: { time: STREAM_AT, days: [...DAYS] } }],
		localVariables: [],
	}
}

/** A control with every stream start taken out of its action sets, and nothing else moved. */
export function withoutStreamStart(control, atem) {
	const out = structuredClone(control)
	for (const step of Object.values(out.steps ?? {})) {
		for (const [set, actions] of Object.entries(step.action_sets ?? {})) {
			if (Array.isArray(actions)) step.action_sets[set] = actions.filter((a) => !isStreamStart(a, atem))
		}
	}
	return out
}

/**
 * What has to change on the rig.
 *
 * @returns `pages`: each page whose Countdown key started the stream, with it taken off;
 *   `countdownTrigger`: the Sunday countdown trigger's id and the ids of its stream starts to remove;
 *   `trigger`: the Sunday stream trigger to add, with its id, or null when the rig has one.
 * @throws when there is no Countdown key, or not exactly one Sunday countdown trigger, so a renamed
 *   one is noticed rather than left starting the stream
 */
export function planStreamAtService(full) {
	const atem = findAtem(full)
	const hyperdeck = findHyperdeck(full)

	const pages = []
	let countdowns = 0
	for (const [number, page] of Object.entries(full.pages ?? {})) {
		const cells = []
		const next = structuredClone(page)
		for (const [row, cols] of Object.entries(page.controls ?? {})) {
			for (const [col, control] of Object.entries(cols ?? {})) {
				if (!isCountdownKey(control, atem, hyperdeck)) continue
				countdowns++
				const without = withoutStreamStart(control, atem)
				if (isDeepStrictEqual(without, control)) continue
				next.controls[row][col] = without
				cells.push(`${row}/${col} Countdown`)
			}
		}
		if (cells.length) pages.push({ number, name: page.name, page: next, cells })
	}
	if (!countdowns) throw new Error('no Countdown key found on any page')

	const triggers = Object.entries(full.triggers ?? {})
	const named = (name) => triggers.filter(([, t]) => t.options?.name === name)
	const countdown = named(COUNTDOWN_TRIGGER)
	if (countdown.length !== 1) throw new Error(`expected one "${COUNTDOWN_TRIGGER}" trigger, found ${countdown.length}`)
	const [[countdownId, countdownBody]] = countdown
	const remove = (countdownBody.actions ?? []).filter((a) => isStreamStart(a, atem)).map((a) => a.id)

	const sortOrder = Math.max(-1, ...triggers.map(([, t]) => t.options?.sortOrder ?? 0)) + 1
	const trigger = named(TRIGGER_NAME).length ? null : { id: MARK, body: streamTrigger(atem, sortOrder) }

	return { atem, pages, countdownTrigger: { id: countdownId, remove }, trigger }
}
