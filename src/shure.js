/**
 * Companion expressions for the Shure wireless page.
 *
 * These build strings, not values — every function returns an expression for Companion to
 * evaluate against live variables. They live here rather than in `tools/` so the test suite
 * covers them: the logic is small but every branch of it is a way to cry wolf during a
 * service, and none of it is visible until it is wrong in front of a congregation.
 *
 * THE CENTRAL PROBLEM IS THAT "NO READING" AND "BAD READING" LOOK ALIKE. A Shure channel
 * reports nothing useful when its transmitter is off, and the module represents that three
 * different ways depending on model and how long the channel has been idle:
 *
 *   - the string "Unknown"          — transmitter powered off
 *   - EMPTY                         — the channel has never reported (seen on unused slots)
 *   - a numeric sentinel            — 255 for bars, -128ish for RF, from the wire protocol
 *
 * Arithmetic swallows all three. `min()` over a set containing "Unknown" is poisoned, and an
 * empty string coerces to 0 — which is worse than useless, because 0 is the *alarm* value. A
 * rack whose mics are simply in the cupboard would sit red every week until the page was
 * ignored, which is the only real failure mode a status display has.
 *
 * So every reading is gated on the channel being LIVE, and non-live channels collapse to an
 * OFF sentinel above any real value. Nothing that is not actually transmitting can ever be
 * the worst case.
 *
 * RF THRESHOLDS ARE THE MODULE'S OWN, not invented here — see RF_BANDS.
 */

/** Above any real bar count, so an idle channel can never win a `min()`. */
export const OFF = 9

/**
 * dBm floor for each RF bar count, strongest first.
 *
 * Copied from shure-wireless 2.3.1, which derives the receiver's own bar display as:
 *   rfBitmapA = rf >= -25 ? 5 : rf >= -70 ? 4 : rf >= -77 ? 3 : rf >= -83 ? 2 : rf >= -90 ? 1 : 0
 *
 * Using Shure's bands rather than a guess means the key agrees with the number on the front
 * of the rack. An operator who checks one against the other must not find them disagreeing.
 */
export const RF_BANDS = [
	[-25, 5],
	[-70, 4],
	[-77, 3],
	[-83, 2],
	[-90, 1],
]

/** Companion variable reference for one channel field. */
const ref = (label, ch, field) => `$(${label}:ch_${ch}_${field})`

/**
 * Is this channel actually transmitting?
 *
 * Battery bars is the liveness oracle because every supported model reports it, and it is
 * exactly the field the module sets to "Unknown" when a transmitter drops off.
 */
export const isLive = (label, ch) => {
	const bars = ref(label, ch, 'battery_bars')
	return `(${bars} != "Unknown" && ${bars} != "")`
}

/** Battery bars, or OFF when the transmitter is not on. */
export const battery = (label, ch) => `(${isLive(label, ch)} ? ${ref(label, ch, 'battery_bars')} : ${OFF})`

/**
 * RF level in dBm as a bare number.
 *
 * The connection runs with `variableFormat: "units"`, so the variable reads "-39 dBm" rather
 * than -39. Stripping the suffix is cheaper than reconfiguring four live receivers, and it
 * keeps the units for anything that wants to display the raw value.
 */
export const rfDbm = (label, ch) => `replaceAll(${ref(label, ch, 'rf_level')}, " dBm", "")`

/**
 * RF strength as 0..5 bars, or OFF when the channel is not live.
 *
 * `isNumber` guards the parse as well as the liveness: if the module ever reports a word
 * where a level should be, this reads as "no signal to judge" rather than as zero bars.
 */
export const rfBars = (label, ch) => {
	const dbm = rfDbm(label, ch)
	// reduceRight, not reduce. The bands are strongest-first, and a ternary ladder is tested
	// outermost-first, so folding left puts the WEAKEST test on the outside — where it matches
	// everything and every channel reads one bar.
	const ladder = RF_BANDS.reduceRight((rest, [floor, bars]) => `${dbm} >= ${floor} ? ${bars} : ${rest}`, '0')
	return `(${isLive(label, ch)} && isNumber(${dbm}) ? (${ladder}) : ${OFF})`
}

/** 1 when this channel is live and muted at the receiver, else 0. */
export const isMuted = (label, ch) =>
	`(${isLive(label, ch)} && ${ref(label, ch, 'audio_mute')} == "ON" ? 1 : 0)`

/** 1 when this channel is live and the receiver reports interference, else 0. */
export const hasInterference = (label, ch) =>
	`(${isLive(label, ch)} && ${ref(label, ch, 'interference_status')} == "DETECTED" ? 1 : 0)`

/** 1 when this channel is transmitting, else 0. */
export const isOn = (label, ch) => `(${isLive(label, ch)} ? 1 : 0)`

/**
 * Every (rack, channel) pair across a set of racks.
 * @param {Array<{label: string}>} racks
 * @param {number[]} channels
 */
const pairs = (racks, channels) => racks.flatMap((r) => channels.map((c) => [r.label, c]))

/** Worst (lowest) value of `per` across the given racks — OFF when nothing is live. */
export const worstOf = (per, racks, channels) =>
	`min(${pairs(racks, channels)
		.map(([label, ch]) => per(label, ch))
		.join(', ')})`

/**
 * Count of channels satisfying `per` across the given racks.
 *
 * Summed with `+` rather than joined, because every term is already a 1-or-0 ternary. `+` on
 * a *string* yields NaN in Companion expressions, which is why nothing here ever adds a raw
 * variable — the ternary is what makes the addition safe.
 */
export const countOf = (per, racks, channels) =>
	`(${pairs(racks, channels)
		.map(([label, ch]) => per(label, ch))
		.join(' + ')})`

/**
 * Display text for a worst-of reading: an em dash when nothing is live, else "3/5".
 *
 * The dash matters. A rack with every pack in the cupboard is not a fault, and showing it a
 * value — any value — invites someone to act on it.
 */
export const worstText = (worst, max = 5) => `${worst} == ${OFF} ? "—" : concat(${worst}, "/${max}")`

/** Per-channel bars for one rack, dot-separated, with idle channels shown as a dash. */
export const channelStrip = (label, channels) =>
	`concat(${channels
		.map((c) => `(${isLive(label, c)} ? ${ref(label, c, 'battery_bars')} : "—")`)
		.join(', " · ", ')})`

/**
 * Bar count at which each `rf-N` icon takes over, weakest icon first.
 *
 * The library ships `rf-0..3` against Shure's 0..5 bars, so the scale has to be squeezed.
 * These bands are chosen so a NORMAL signal shows a full icon: Shure's 5 means the pack is
 * practically touching the antenna, and 4 (>= -70 dBm) is what a healthy room actually
 * reads. Mapping 4 to a partial icon would leave the key looking degraded every service,
 * which trains people to ignore it.
 */
export const RF_ICON_BANDS = [
	[0, 'rf-0'],
	[2, 'rf-1'],
	[3, 'rf-2'],
	[4, 'rf-3'],
]

/**
 * Icon overrides for the RF key, in the order they must be applied.
 *
 * Emitted weakest-first so that later feedbacks win, matching how Companion layers style
 * overrides — the strongest band that matches is the one left standing.
 *
 * EVERY LIVE LEVEL GETS AN OVERRIDE, including zero bars. That is what lets the key's base
 * image be the neutral `rf-idle`: the base is then only ever visible when nothing at all is
 * transmitting. It matters because `rf-0` is red, and a page showing a red antenna on a
 * Tuesday afternoon — when the packs are simply in their case — is a page nobody trusts by
 * Sunday. Hence the `!= OFF` on every band.
 */
export const rfIconOverrides = (worst) =>
	RF_ICON_BANDS.map(([bars, image]) => ({ image, expression: `${worst} >= ${bars} && ${worst} != ${OFF}` }))
