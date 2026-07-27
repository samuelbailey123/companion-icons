/**
 * Build a System page watching the Raspberry Pi that Companion runs on, plus the trigger
 * that feeds it.
 *
 * Usage: node tools/system-page.js <prod-full.json> <systemPageNumber> <homePageNumber> <outdir>
 *
 * WHY A TRIGGER AND NOT VARIABLES. Companion publishes `internal:hostname` (which reads
 * "CompanionPi" here) but no CPU, temperature, memory or disk variables at all — the
 * cpu_usage references inside its bundle belong to a vendored library, not to Companion.
 * `internal:uptime` exists but is COMPANION's uptime, not the machine's. So the numbers have
 * to be read from the OS, and `internal: exec` can do that: it runs a shell command on the
 * Companion host and writes stdout into a custom variable via `targetVariable`.
 *
 * That is the same mechanism the Power page already uses for its projector and PA scripts,
 * so it is known to work on this install — shell command support has to be enabled with
 * `--enable-shell-command-support`, and those buttons prove it is.
 *
 * EVERY COMMAND HERE IS READ-ONLY. They only read /sys, /proc and `df`/`free`/`vcgencmd`
 * output. Nothing writes, installs or restarts anything. Each is also formatted at source
 * with awk so the variable holds a display-ready value rather than something the button then
 * has to parse.
 *
 * THROTTLING IS THE ONE THAT MATTERS. `vcgencmd get_throttled` reports undervoltage and
 * thermal capping — on a Pi that is the failure that actually bites mid-service, and it is
 * invisible otherwise. 0x0 means healthy.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , src, sysArg, homeArg, outdir] = process.argv
if (!src || !sysArg || !homeArg || !outdir) {
	console.error('usage: node tools/system-page.js <prod-full.json> <systemPage> <homePage> <outdir>')
	process.exit(1)
}
const SYS = String(Number(sysArg))
const HOME = String(Number(homeArg))

const v = (value) => ({ value, isExpression: false })
const expr = (value) => ({ value, isExpression: true })

let seq = 0
const id = (p) => `${p}-${(seq++).toString(36)}`

const CARD_BG = 0x14161c
const NAV_BG = 0x1f2937

/**
 * The metrics, in reading order.
 *
 * `cmd` writes a display-ready string into `variable`. `warn`/`bad` are Companion
 * expressions over that variable; when one is true the key takes that colour. They are
 * expressions rather than fixed thresholds on the button so the rule lives next to the
 * reading it judges.
 */
const METRICS = [
	{
		key: 'temp', label: 'CPU Temp', image: 'temperature', variable: 'sys_temp',
		// Emits a bare number. Units are added by the button, so the threshold below can
		// compare the variable directly instead of stripping characters back off it.
		cmd: `awk '{printf "%.0f", $1/1000}' /sys/class/thermal/thermal_zone0/temp`,
		suffix: '°C',
		// A Pi 4 soft-throttles at 80C and hard-throttles at 85C.
		warn: '{v} >= 65', bad: '{v} >= 78',
	},
	{
		key: 'load', label: 'CPU Load', image: 'cpu', variable: 'sys_load',
		cmd: `cut -d' ' -f1 /proc/loadavg`,
		suffix: '',
		// Load is per-core, so on the Pi's four cores 4.0 means saturated.
		warn: '{v} >= 2.5', bad: '{v} >= 4',
	},
	{
		key: 'mem', label: 'Memory', image: 'memory', variable: 'sys_mem',
		cmd: `free | awk '/^Mem:/ {printf "%.0f", $3/$2*100}'`,
		suffix: '%',
		warn: '{v} >= 75', bad: '{v} >= 90',
	},
	{
		key: 'disk', label: 'Disk', image: 'disk', variable: 'sys_disk',
		cmd: `df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}'`,
		suffix: '%',
		warn: '{v} >= 80', bad: '{v} >= 92',
	},
	{
		key: 'throttle', label: 'Power', image: 'alert', variable: 'sys_throttle',
		// Undervoltage is the failure that actually bites a Pi mid-service, and it is silent.
		//
		// `vcgencmd get_throttled` is the direct read, but it needs /dev/vcio, which the
		// Companion user cannot open unless it is in the `video` group — on this host it
		// returns "Can't open device file: /dev/vcio_gencmd". So fall back to the hwmon
		// undervoltage alarm, which is a plain sysfs read anyone can do.
		//
		// Output is deliberately a word, not a raw hex code: "OK" or "UNDERVOLT" or "n/a".
		// The vcgencmd branch is validated to start 0x before being trusted, so an error
		// message can never masquerade as a reading.
		cmd:
			`v=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2); ` +
			`case "$v" in 0x0) echo OK;; 0x*) echo "$v";; *) ` +
			`a=$(cat /sys/class/hwmon/hwmon*/in0_lcrit_alarm 2>/dev/null | head -1); ` +
			`case "$a" in 0) echo OK;; 1) echo UNDERVOLT;; *) echo n/a;; esac;; esac`,
		suffix: '',
		warn: '{v} == "n/a"', bad: '{v} != "OK" && {v} != "n/a"',
	},
	{
		key: 'uptime', label: 'Uptime', image: 'uptime', variable: 'sys_uptime',
		cmd: `awk '{d=int($1/86400); h=int(($1%86400)/3600); m=int(($1%3600)/60); if (d>0) printf "%dd %dh", d, h; else printf "%dh %dm", h, m}' /proc/uptime`,
		suffix: '',
		warn: null, bad: null,
	},
]

const OK_GREEN = 0x15803d
const WARN_AMBER = 0xa16207
const BAD_RED = 0xb91c1c

const full = JSON.parse(await fs.readFile(src, 'utf8'))

const template = full.pages[Object.keys(full.pages)[0]]
if (!template?.gridSize) throw new Error('could not read gridSize from an existing page')

const layers = ({ image, label, valueText, bg }) => [
	{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
	{
		id: 'box0', name: 'Background', usage: 'auto', type: 'box',
		enabled: v(true), opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0),
		color: v(bg), borderWidth: v(0), borderColor: v(0), borderPosition: v('inside'),
	},
	{
		id: 'image0', name: 'Icon', usage: 'auto', type: 'image',
		enabled: v(true), opacity: v(100), x: v(2), y: v(1), width: v(96), height: v(34), rotation: v(0),
		base64Image: v(`$(image:${image})`),
	},
	{
		id: 'text0', name: 'Label', usage: 'auto', type: 'text',
		enabled: v(true), opacity: v(100), x: v(0), y: v(35), width: v(100), height: v(22), rotation: v(0),
		text: v(label), color: v(0x9aa4b2), halign: v('center'), valign: v('center'),
		fontsize: v(40), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
	},
	...(valueText
		? [{
				id: 'text1', name: 'Value', usage: 'auto', type: 'text',
				enabled: v(true), opacity: v(100), x: v(0), y: v(57), width: v(100), height: v(40), rotation: v(0),
				text: v(valueText), color: v(0xffffff), halign: v('center'), valign: v('center'),
				fontsize: v(70), fontsizeAllowShrink: v(true), font: v('companion-sans'), outlineColor: v(0xff000000),
			}]
		: []),
]

/** Colour the whole key from the reading, so a problem is visible without reading the number. */
function thresholdFeedback(expression, colour) {
	return {
		id: id('fb'),
		definitionId: 'check_expression',
		connectionId: 'internal',
		options: { expression: expr(expression) },
		type: 'feedback',
		isInverted: v(false),
		styleOverrides: [
			{ overrideId: id('ovr'), elementId: 'box0', elementProperty: 'color', override: v(colour) },
		],
		children: {},
	}
}

const metricButton = (m) => {
	// `{v}` stands in for the variable so a threshold reads as a rule rather than plumbing.
	// It must be a placeholder that cannot occur in the rule text: substituting a bare letter
	// would rewrite the "n" inside the throttle rule's "n/a" string and corrupt the compare.
	const ref = `$(internal:custom_${m.variable})`
	const fill = (rule) => rule.replaceAll('{v}', ref)

	// Later feedbacks win, so the worse state is listed last.
	const feedbacks = []
	if (m.warn) feedbacks.push(thresholdFeedback(fill(m.warn), WARN_AMBER))
	if (m.bad) feedbacks.push(thresholdFeedback(fill(m.bad), BAD_RED))

	return {
		type: 'button-layered',
		style: { layers: layers({ image: m.image, label: m.label, valueText: `${ref}${m.suffix}`, bg: CARD_BG }) },
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
		feedbacks,
		steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } },
	}
}

const homeButton = () => ({
	type: 'button-layered',
	style: { layers: layers({ image: 'home', label: '', valueText: 'Home', bg: NAV_BG }) },
	options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: false, notes: '' },
	feedbacks: [],
	steps: {
		0: {
			action_sets: {
				down: [{
					id: id('act'), definitionId: 'set_page', connectionId: 'internal',
					options: { surfaceId: v('self'), page: v(HOME) }, upgradeIndex: null, type: 'action',
				}],
				up: [],
			},
			options: { runWhileHeld: [] },
		},
	},
})

// ------------------------------------------------------------------ the page

const page = { name: 'System', gridSize: structuredClone(template.gridSize), controls: {} }
const cells = []
for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) cells.push([String(row), String(col)])

page.controls['0'] = { 0: homeButton() }
for (const [i, m] of METRICS.entries()) {
	const [row, col] = cells[i + 1]
	page.controls[row] ??= {}
	page.controls[row][col] = metricButton(m)
	console.log(`  ${row}/${col}  ${m.label.padEnd(9)} $(internal:custom_${m.variable})`)
}

// ------------------------------------------------------------- the poll trigger

/**
 * One trigger running every command in sequence.
 *
 * 30 seconds rather than the 10 the power polls use: these values move slowly, and each
 * command is a process spawn on a Pi that is also driving the deck.
 */
const pollTrigger = {
	type: 'trigger',
	options: {
		name: 'Poll system stats',
		enabled: true,
		sortOrder: 99,
		relativeDelay: false,
	},
	events: [{ id: id('evt'), type: 'interval', enabled: true, options: { seconds: 30 } }],
	condition: [],
	localVariables: [],
	actions: METRICS.map((m) => ({
		id: id('act'),
		definitionId: 'exec',
		connectionId: 'internal',
		options: {
			path: v(m.cmd),
			cwd: v(''),
			timeout: v(5000),
			targetVariable: v(m.variable),
		},
		type: 'action',
		children: {},
	})),
}

/**
 * The custom variables the trigger writes into.
 *
 * These must exist before the trigger runs. `exec`'s targetVariable calls custom.setValue,
 * which writes to an EXISTING variable — unlike the custom_variable_set_value action it has
 * no "create if missing" option. Without this the trigger fires happily, every command runs,
 * and every value is silently dropped: the first deploy did exactly that.
 *
 * persistCurrentValue is false because these are live readings; restoring yesterday's CPU
 * temperature across a restart would be worse than showing nothing.
 */
const customVariables = structuredClone(full.custom_variables ?? {})
let sortOrder = Math.max(0, ...Object.values(customVariables).map((c) => c.sortOrder ?? 0))
for (const m of METRICS) {
	customVariables[m.variable] = {
		description: `${m.label} on the Companion host (polled every 30s)`,
		defaultValue: '',
		persistCurrentValue: false,
		sortOrder: ++sortOrder,
	}
}

const triggers = structuredClone(full.triggers ?? {})
// Replace any previous copy rather than accumulating duplicates on a re-run.
for (const [tid, t] of Object.entries(triggers)) {
	if (t?.options?.name === pollTrigger.options.name) delete triggers[tid]
}
triggers[`trigger-system-poll`] = pollTrigger

await fs.mkdir(outdir, { recursive: true })

await fs.writeFile(
	path.join(outdir, `page-${SYS}-system.companionconfig`),
	JSON.stringify({
		version: full.version, type: 'page', companionBuild: full.companionBuild,
		page, instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		oldPageNumber: Number(SYS),
	})
)

await fs.writeFile(
	path.join(outdir, `triggers.companionconfig`),
	JSON.stringify({
		version: full.version, type: 'full', companionBuild: full.companionBuild,
		triggers, custom_variables: customVariables, instances: full.instances,
		connectionCollections: full.connectionCollections ?? [],
		triggerCollections: full.triggerCollections ?? [],
	})
)

console.log(`\ncommands (all read-only):`)
for (const m of METRICS) console.log(`  ${m.variable.padEnd(14)} ${m.cmd}`)
console.log(`\nwrote page ${SYS}, ${Object.keys(triggers).length} triggers and ${Object.keys(customVariables).length} custom variables -> ${outdir}`)
