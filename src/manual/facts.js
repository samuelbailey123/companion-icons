/**
 * What the manual knows that Companion's export does not: devices reached by the Pi's scripts
 * rather than a module, the people-facing names of things, and where each credential lives.
 *
 * Each entry says where it was read. Addresses on this LAN drift (rig.md, "Addresses drift"),
 * so the build prints the connection addresses from the export, never from here, and these
 * are only the devices no Companion connection names.
 */

/** Devices the Pi reaches through its own scripts, not a Companion module. */
export const SCRIPTED = [
	{ from: 'projector_power.py', device: 'Projectors ×3 (Panasonic)', address: '10.23.0.112, .234, .80', via: 'NTCONTROL :1024, PJLink :4352', source: 'AV_Power_scripts/README.md' },
	{ from: 'speaker_power.py', device: 'FOH speaker power (DLI web power switch)', address: '10.23.0.250', via: 'HTTP, outlets 5–8', source: 'AV_Power_scripts/README.md' },
	{ from: 'ptz_state.py, ptz_web.py', device: 'PTZ cameras (FoMaKo UV602)', address: '10.23.0.196, 10.23.0.181', via: 'HTTP :80', source: 'trigger and key exec commands' },
	{ from: 'chrome_tracks.sh', device: 'PP1 iMac — YouTube Music in Chrome', address: '10.23.0.204', via: 'SSH', source: 'trigger and key exec commands' },
	{ from: 'stage layout poll (curl)', device: 'PP1 iMac — ProPresenter', address: '10.23.0.204', via: 'HTTP :1100', source: 'trigger exec command' },
	{ from: 'system stats (awk, df, ping)', device: 'The Pi itself', address: '10.23.0.242', via: 'local commands', source: 'trigger exec commands' },
]

/**
 * What each page is for, in a sentence, by page name. Written from rig.md and the pages' own
 * keys on 2026-10-27; a page that is not here is shown with its key count only.
 */
export const PAGE_PURPOSE = {
	Home: 'Where the deck starts: folders to every page, the projectors and PA, what is on Program and Preview, Stream, Record and the ATEM macros.',
	Power: 'Projectors and front-of-house speakers on and off. Each key reads the real state, so it always shows what is on.',
	PP1: 'ProPresenter on the PP1 iMac: timers, the countdown that starts the service, pre-service, freezing the slide, clearing screens and the stage layout.',
	MA2: 'Lighting on the grandMA2: executors 101–109, Go and Back, blackout, and the house-light dials.',
	ATEM: 'The switcher: Program over Preview, Cut and Auto, the stream, the recorder, and macros.',
	SQ7: 'The sound desk: DCA levels and mutes, with the stream, foyer and main levels on the strip.',
	VW: 'The screens and LED wall: pick a destination, then a source; direct routes and wall brightness. Videohub opens every port.',
	System: 'The Pi that runs Companion: temperature, load, memory, disk, power, internet and uptime.',
	PTZ: 'Choose a PTZ camera, or open the Worship or Sermon page that runs both side by side.',
	'CAM 1': 'PTZ CAM 1 (10.23.0.196): presets, moves, zoom and focus, tracking, and the pan/tilt/zoom dials.',
	'CAM 1 Setup': 'CAM 1’s picture: exposure, white balance, backlight, tracking mode, body framing and the saved look.',
	'CAM 3': 'The PTZ at 10.23.0.181, shown as CAM 2 on the switcher since 2026-10-26: presets, moves, tracking and dials.',
	'CAM 3 Setup': 'That camera’s picture: exposure, white balance, backlight, tracking mode, body framing and the saved look.',
	Tracks: 'Walk-in music: YouTube Music in Chrome on the PP1 iMac. Previous, play/pause, skip, fade out and volume.',
	Worship: 'Both PTZs during worship: their presets side by side, save, speed, focus, and pan/tilt/zoom dials.',
	Sermon: 'Both PTZs during the sermon: tracking, close-up / half / full body, left / middle / right, presets and dials.',
	Dante: 'Read-only check of the Dante patch into the SQ7: each source, its sample rate and latency, and whether routing is normal.',
	Videohub: 'Every Videohub output over every input. Tap an output, then an input to route it there at once.',
}

/** How each Companion module talks, for the control drawing. */
export const PROTOCOL = {
	'bmd-atem': 'ATEM protocol, UDP 9910',
	'bmd-videohub': 'Videohub protocol, TCP 9990',
	'bmd-hyperdeck': 'HyperDeck protocol, TCP 9993',
	'renewedvision-propresenter-api': 'ProPresenter API, HTTP',
	'allenheath-sq': 'SQ MIDI over TCP 51325',
	'malighting-grandma2': 'Telnet',
	'generic-osc': 'OSC over UDP',
	'novastar-controller': 'NovaStar, TCP',
	'ptzoptics-visca': 'VISCA over IP',
	'planningcenter-serviceslive': 'HTTPS to Planning Center',
	'audinate-dantecontroller': 'Dante discovery (multicast)',
}

/** The device a module drives, by module id. */
export const DEVICE = {
	'bmd-atem': 'ATEM Television Studio HD8',
	'bmd-videohub': 'Blackmagic Micro Videohub 16×16',
	'bmd-hyperdeck': 'HyperDeck Studio Mini',
	'renewedvision-propresenter-api': 'PP1 iMac — ProPresenter',
	'allenheath-sq': 'Allen & Heath SQ7',
	'malighting-grandma2': 'grandMA2 onPC (lighting PC)',
	'generic-osc': 'grandMA2 onPC (lighting PC)',
	'novastar-controller': 'NovaStar VX6S (LED wall)',
	'ptzoptics-visca': 'PTZ camera',
	'planningcenter-serviceslive': 'Planning Center Services (internet)',
	'audinate-dantecontroller': 'Dante network',
}

/**
 * Every credential the rig depends on, and the 1Password entry that holds it. The entry names
 * are the manual's proposal (Sam chose 1Password on 2026-10-27); the values are never written
 * anywhere in this repo or in the books.
 */
export const CREDENTIALS = [
	{ what: 'Pi login (SSH, sudo)', used: 'Everything on the Pi: Companion, the scripts, the board', entry: 'Rig — Companion Pi (samuelbailey)' },
	{ what: 'ProPresenter API password and stage display password', used: 'Companion connection "propresenter"', entry: 'Rig — ProPresenter API' },
	{ what: 'grandMA2 console login', used: 'Companion connection "grandma2"', entry: 'Rig — grandMA2 console' },
	{ what: 'Planning Center personal access token (application id and secret)', used: 'Companion connection "pco"; the board; pco-lint', entry: 'Rig — Planning Center PAT (pco-lint)' },
	{ what: 'Projector web-control login', used: 'projector_power.py (USERNAME / PASSWORD)', entry: 'Rig — Panasonic projectors' },
	{ what: 'DLI web power switch login', used: 'speaker_power.py (USERNAME / PASSWORD)', entry: 'Rig — DLI speaker power switch' },
	{ what: 'PTZ camera web login', used: 'ptz_web.py reads .ptz_web beside it, as user:pass', entry: 'Rig — PTZ camera web UI' },
	{ what: 'PP1 iMac login (its only account)', used: 'Screen Sharing; chrome_tracks.sh uses an SSH key instead', entry: 'Rig — PP1 iMac' },
	{ what: 'SSH key the Pi uses to reach the PP1 iMac', used: 'chrome_tracks.sh (.chrome_tracks_key on the Pi)', entry: 'Rig — PP1 tracks SSH key' },
	{ what: 'YouTube stream key', used: 'The ATEM’s streaming settings (set in ATEM Software Control)', entry: 'Rig — YouTube stream key' },
	{ what: 'Board scheduling passphrase', used: 'Service Health board, Planning Center scheduling', entry: 'Rig — Service Health passphrase' },
	{ what: 'UniFi console (TC-BMT UDM Pro)', used: 'DNS record "production", DHCP reservations, VPN', entry: 'Rig — UniFi (TC-BMT UDM Pro)' },
	{ what: 'GitHub access to samuelbailey123 and Decima-Labs repos', used: 'companion-icons, service-health, pco-lint', entry: 'Rig — GitHub' },
]
