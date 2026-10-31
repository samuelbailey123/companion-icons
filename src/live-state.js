/**
 * Three triggers that keep the rig's picture of itself true: one polls the tracks, two bring the
 * SQ7's connection back after the mixer has been off.
 *
 * NOTHING POLLED THE TRACKS. `chrome_tracks` was written only when a key or the Sunday trigger ran
 * chrome_tracks.sh, so tracks started by hand on the iMac left it wrong: on 2026-10-31 the board
 * and the deck said "Paused", four days old, with music playing. The poll asks the iMac every 10 s
 * and stamps `chrome_tracks_at`, because a custom variable looks the same whether it was written
 * a moment ago or last week. `timeout` turns a hung osascript into `--` rather than a value that
 * quietly stops changing. It only reads: `state` never touches the player.
 *
 * THE SQ MODULE GIVES UP. allenheath-sq 3.1.0 stops for good when the mixer closes the socket
 * ("Mixer reply processing complete, disconnecting") and on a socket error, and never tries
 * again, so powering the SQ7 off left Companion disconnected until someone stopped and started the
 * connection: the mixer closed it at 18:07 on Oct 27 and came back at 09:30 on Oct 31, and the link
 * stayed dead until 10:31. 4.0.0-rc1 is the same; upstream has it open as issue #82.
 *
 * SO COMPANION DOES WHAT THE HAND DID: connection off, one second, connection on. Only while the
 * connection is down AND the mixer answers. A second trigger knocks on the mixer, and on 51326 not
 * the MIDI port 51325 the module uses. Without that the module would be restarted every few
 * seconds all week with the mixer off.
 *
 * WHY THIS IS SAFE MID-SERVICE. On connect the module only reads mutes and levels. It sends a scene
 * only from a scene action, and the rig has none (upstream issue #102 is that action after a
 * reconnect). It fires only when the connection is already down, so it cannot break a working
 * link. Trigger conditions are checked each time a trigger fires since Companion 5.1.
 */

export const TRACKS_POLL_SECONDS = 10
export const TRACKS_STAMP = 'chrome_tracks_at'
export const NET_POLL_SECONDS = 10
export const RECONNECT_SECONDS = 15
/** The pause issue #82's reporter uses on a Refresh key. */
export const RECONNECT_PAUSE_MS = 1000
/** Answers whenever the mixer is up, and is not the MIDI port the module holds. */
export const SQ_KNOCK_PORT = 51326

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

const action = (id, definitionId, options) => ({
	id, definitionId, connectionId: 'internal', options, upgradeIndex: null, type: 'action', children: {},
})

const every = (id, seconds) => ({ id, type: 'interval', enabled: true, options: { seconds } })

const trigger = ({ name, notes, sortOrder, actions, condition = [], events }) => ({
	type: 'trigger',
	options: { name, enabled: true, sortOrder, notes },
	actions,
	condition,
	events,
	localVariables: [],
})

/** Ask the iMac what the player is doing, and stamp the moment. */
export function tracksPoll({ script, variable, sortOrder }) {
	return trigger({
		name: 'Poll tracks',
		sortOrder,
		notes: `Every ${TRACKS_POLL_SECONDS}s, asks the PP1 iMac whether YouTube Music is playing and stamps ${TRACKS_STAMP}, so the deck and the board can trust ${variable}. Only reads. Rebuild with tools/live-state-triggers.js.`,
		actions: [
			action('tracks-poll-exec', 'exec', {
				path: v(`timeout 7 ${script} state || printf -- --`),
				cwd: v(''),
				timeout: v(9000),
				targetVariable: v(variable),
			}),
			action('tracks-poll-stamp', 'custom_variable_set_value', {
				name: v(TRACKS_STAMP),
				create: v(true),
				value: expr('$(internal:time_unix)'),
			}),
		],
		events: [every('tracks-poll-event', TRACKS_POLL_SECONDS)],
	})
}

/** Write `up` or `down` into `variable`: does the mixer answer at all? */
export function netPoll({ name, host, port, variable, sortOrder }) {
	return trigger({
		name,
		sortOrder,
		notes: `Every ${NET_POLL_SECONDS}s, knocks on ${host}:${port} and writes up or down into ${variable}, so the reconnect only runs with a mixer to reach. Rebuild with tools/live-state-triggers.js.`,
		actions: [
			action('net-poll-exec', 'exec', {
				path: v(`nc -z -w 2 ${host} ${port} && printf up || printf down`),
				cwd: v(''),
				timeout: v(5000),
				targetVariable: v(variable),
			}),
		],
		events: [every('net-poll-event', NET_POLL_SECONDS)],
	})
}

/** Stop and start `label`'s connection while it is down and `netVariable` says the mixer is up. */
export function reconnect({ name, label, connectionId, netVariable, sortOrder }) {
	const set = (id, enable) => action(id, 'instance_control', { instance_id: v(connectionId), enable: v(enable) })
	return trigger({
		name,
		sortOrder,
		notes: `The ${label} module never reconnects by itself after the mixer goes away. Every ${RECONNECT_SECONDS}s, if the connection is down and the mixer answers, stops and starts it. Rebuild with tools/live-state-triggers.js.`,
		actions: [
			set('reconnect-off', 'false'),
			action('reconnect-wait', 'wait', { time: v(RECONNECT_PAUSE_MS) }),
			set('reconnect-on', 'true'),
		],
		condition: [
			{
				id: 'reconnect-when-down',
				type: 'feedback',
				definitionId: 'check_expression',
				connectionId: 'internal',
				options: {
					expression: expr(`$(internal:connection_${label}_status) == 'error' && $(custom:${netVariable}) == 'up'`),
				},
				isInverted: v(false),
				styleOverrides: [],
				children: {},
			},
		],
		events: [every('reconnect-event', RECONNECT_SECONDS)],
	})
}

/** The connection with this label, by id; a typo must not build a trigger for nothing. */
export function connectionByLabel(full, label) {
	const hit = Object.entries(full.instances ?? {}).find(([, c]) => c?.label === label)
	if (!hit) throw new Error(`the rig has no "${label}" connection`)
	return hit[0]
}

/**
 * Every trigger this adds for `full`: the three on the rig, or with `standIn` only the SQ pair,
 * pointed at a connection and mixer that are not the real ones.
 */
export function buildTriggers(full, { script, variable, standIn }) {
	const top = Math.max(-1, ...Object.values(full.triggers ?? {}).map((t) => t.options?.sortOrder ?? 0))
	const label = standIn?.label ?? 'SQ'
	const suffix = standIn ? ' (test)' : ''
	const net = standIn ? 'sqtest_net' : 'sq_net'
	const added = {
		[`sq-net-poll${standIn ? '-test' : ''}`]: netPoll({
			name: `Poll SQ network${suffix}`,
			host: standIn?.host ?? '10.23.0.191',
			port: SQ_KNOCK_PORT,
			variable: net,
			sortOrder: top + 1,
		}),
		[`sq-reconnect${standIn ? '-test' : ''}`]: reconnect({
			name: `Reconnect SQ${suffix}`,
			label,
			connectionId: connectionByLabel(full, label),
			netVariable: net,
			sortOrder: top + 2,
		}),
	}
	if (!standIn) added['tracks-poll'] = tracksPoll({ script, variable, sortOrder: top + 3 })
	return added
}

/** The custom variables those triggers write. */
export function variablesFor(added) {
	const defs = {}
	for (const t of Object.values(added)) {
		for (const a of t.actions) {
			const name = a.options.targetVariable?.value ?? (a.definitionId === 'custom_variable_set_value' ? a.options.name.value : undefined)
			if (name === 'sq_net' || name === 'sqtest_net') defs[name] = { description: 'up or down: does the SQ7 answer on the network? (the Poll SQ network trigger)', defaultValue: '', persistCurrentValue: false }
			if (name === TRACKS_STAMP) defs[name] = { description: 'Unix time the Poll tracks trigger last ran: how the board knows chrome_tracks is current', defaultValue: '', persistCurrentValue: false }
		}
	}
	return defs
}
