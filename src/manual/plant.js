/**
 * What is plugged into what: the facts the cable drawings are drawn from.
 *
 * TWO KINDS OF FACT, KEPT APART. The router's labels and crosspoints, Companion's connections and
 * the Dante subscriptions are read off the live rig every build. What sits at the far end of a
 * cable is not readable over the network at all, so it is written down here, each line with where
 * it came from. Anything nobody has looked at is `null` and prints as TODO, so the drawing shows
 * the hole instead of a guess.
 *
 * When the rack is re-patched, change this file and rebuild. The labels on the Videohub are what
 * Sam named the ports on 2026-10-26 (rig.md "Video routing"); the device behind each label below
 * follows those names and rig.md's Devices table.
 */

/** Sources wired into Videohub inputs, by input number. */
export const VIDEOHUB_SOURCES = {
	1: { device: 'ATEM Television Studio HD8', port: 'Aux 1 out', source: 'port label' },
	2: { device: 'ATEM Television Studio HD8', port: 'Multiview out', source: 'port label' },
	3: { device: 'ATEM Television Studio HD8', port: 'Aux 2 out', source: 'port label' },
	4: { device: 'ATEM Television Studio HD8', port: 'Program out', source: 'port label' },
	7: { device: 'PTZ CAM 1 (FoMaKo UV602, 10.23.0.196)', port: 'SDI out', source: 'port label; rig.md Devices' },
	8: { device: 'PTZ on 10.23.0.181 (FoMaKo UV602; deck pages "CAM 3", switcher "Cam 2")', port: 'SDI out', source: 'port label; rig.md Devices' },
	14: { device: 'PP1 iMac (ProPresenter)', port: null, source: 'port label "Words Overlay"' },
	15: { device: 'PP1 iMac (ProPresenter)', port: null, source: 'port label "PP1B"' },
	16: { device: 'PP1 iMac (ProPresenter)', port: null, source: 'port label "PP1"' },
}

/** Destinations wired to Videohub outputs, by output number. */
export const VIDEOHUB_DESTINATIONS = {
	1: { device: 'ATEM Television Studio HD8', port: 'input 1', source: 'port label; rig.md Video routing' },
	2: { device: 'ATEM Television Studio HD8', port: 'input 2', source: 'port label' },
	3: { device: 'ATEM Television Studio HD8', port: 'input 3', source: 'port label' },
	4: { device: 'ATEM Television Studio HD8', port: 'input 4', source: 'port label' },
	5: { device: 'ATEM Television Studio HD8', port: 'input 5', source: 'port label' },
	6: { device: 'ATEM Television Studio HD8', port: 'input 6', source: 'port label' },
	8: { device: 'Back-wall projector', port: null, source: 'port label' },
	9: { device: 'Mini Screen 1', port: null, source: 'port label' },
	10: { device: 'Mini Screen 2', port: null, source: 'port label' },
	11: { device: 'Seetec monitor', port: null, source: 'port label "Seetec Mono"' },
	12: { device: 'Spare: the off-air test port', port: null, source: 'rig.md Video routing' },
	13: { device: 'HyperDeck Studio Mini (recorder, 10.23.0.206)', port: 'SDI in', source: 'port label; recorder.md' },
	14: { device: 'LED wall: NovaStar VX6S (10.23.0.23)', port: null, source: 'port label' },
	15: { device: 'Left projector (Panasonic)', port: null, source: 'port label' },
	16: { device: 'Right projector (Panasonic)', port: null, source: 'port label' },
}

/** Every device on the AV LAN the rig depends on, and what talks to it. */
export const NETWORK = [
	{ device: 'Companion Pi (Raspberry Pi 5)', address: '10.23.0.242', ports: '8000 Companion, 80/8080 Service Health board, 22 SSH', by: 'everything', source: 'read on the Pi' },
	{ device: 'ATEM Television Studio HD8', address: '10.23.0.34', ports: 'UDP 9910 control, TCP 9990 routing', by: 'Companion `atem`, board', source: 'Companion, board' },
	{ device: 'Blackmagic Micro Videohub 16×16', address: '10.23.0.21', ports: 'TCP 9990', by: 'Companion `videohub` (found by Bonjour), board', source: 'Companion, board' },
	{ device: 'HyperDeck Studio Mini', address: '10.23.0.206', ports: 'TCP 9993', by: 'Companion `hyperdeck`', source: 'Companion' },
	{ device: 'PTZ CAM 1 (FoMaKo UV602)', address: '10.23.0.196', ports: 'TCP 5678 VISCA, 80 web API', by: 'Companion `visca2`, ptz_state.py, ptz_web.py, board', source: 'Companion, board' },
	{ device: 'PTZ on .181 (FoMaKo UV602)', address: '10.23.0.181', ports: 'TCP 5678 VISCA, 80 web API', by: 'Companion `visca`, ptz_state.py, ptz_web.py, board', source: 'Companion, board' },
	{ device: 'PP1 iMac (ProPresenter, walk-in music)', address: '10.23.0.204', ports: '1100 ProPresenter API, 22 SSH, 5900 Screen Sharing', by: 'Companion `propresenter`, chrome_tracks.sh, board', source: 'Companion, board' },
	{ device: 'Allen & Heath SQ7', address: '10.23.0.191', ports: 'TCP 51326', by: 'Companion `SQ`, board', source: 'Companion, board' },
	{ device: 'SQ7 Dante card (AllenHth-0e0184)', address: '10.23.0.70', ports: 'Dante', by: 'Companion `dante`', source: 'rig.md Dante' },
	{ device: 'grandMA2 onPC (lighting PC)', address: '10.23.0.99 or .103 (DHCP)', ports: 'Telnet login, OSC 8000 out / 9000 in', by: 'Companion `grandma2`, `MA2osc`, board', source: 'Companion, board' },
	{ device: 'NovaStar VX6S (LED wall)', address: '10.23.0.23', ports: 'TCP 5200', by: 'Companion `novastar`, board', source: 'Companion, board' },
	{ device: 'Projector 1 (Panasonic PT-DW740)', address: '10.23.0.112', ports: 'NTCONTROL 1024, PJLink 4352, web 80', by: 'projector_power.py', source: 'PROTOCOLS.md (2026-07-15)' },
	{ device: 'Projector 2 (Panasonic PT-DW740)', address: '10.23.0.234', ports: 'NTCONTROL 1024, PJLink 4352, web 80', by: 'projector_power.py', source: 'PROTOCOLS.md (2026-07-15)' },
	{ device: 'Projector 3 (Panasonic PT-EW630)', address: '10.23.0.80', ports: 'NTCONTROL 1024, PJLink 4352, web 80', by: 'projector_power.py', source: 'PROTOCOLS.md (2026-07-15)' },
	{ device: 'PA power relay (Digital Loggers DIN relay)', address: '10.23.0.250', ports: 'web 80', by: 'speaker_power.py', source: 'PROTOCOLS.md (2026-07-15)' },
	{ device: 'Shure ULXD4Q "Leads 1-4" Dante', address: '10.23.0.14', ports: 'Dante', by: 'Companion `dante`', source: 'rig.md Dante' },
	{ device: 'Shure ULXD4Q "BGV 1-4" Dante', address: '10.23.0.107', ports: 'Dante', by: 'Companion `dante`', source: 'rig.md Dante' },
	{ device: 'Shure ULXD4Q "BGV+Host" control', address: '10.23.0.253', ports: '2202', by: 'nothing (feeds the desk on XLR)', source: 'rig.md Dante' },
	{ device: 'Shure ULXD4D "Lav 1-2" Dante', address: '10.23.0.143', ports: 'Dante', by: 'Companion `dante`', source: 'rig.md Dante' },
	{ device: 'Tracks MacBook (Dante Virtual Soundcard)', address: '10.23.0.230', ports: 'Dante', by: 'Companion `dante`', source: 'rig.md Dante' },
]

/** Power: what the rig can switch, and what it cannot. */
export const POWER = [
	{ what: 'Front-of-house PA', how: 'Digital Loggers DIN relay at 10.23.0.250 switches its outlets', by: 'Power page, Sunday 8:05 trigger (speaker_power.py)' },
	{ what: 'Projectors (three Panasonic)', how: 'Standby on/off over the network (NTCONTROL, PJLink as fallback)', by: 'Power page, Sunday 8:05 trigger (projector_power.py)' },
	{ what: 'PTZ cameras', how: 'VISCA power on/standby', by: 'CAM Setup pages' },
	{ what: 'Companion Pi', how: 'Wall power, no UPS (a UPS is item 1 on the 2027 budget)', by: 'nothing' },
]

/** What has to be looked at in the room before the drawings are complete. */
export const TODO = [
	'SDI runs: cable, length and any converter between each source and its Videohub input, and each output and its screen',
	'Which PP1 iMac outputs (and converters) feed Videohub inputs 14, 15 and 16',
	'Where the static JVC GY-HM600 is cabled now that it is off the switcher',
	'Audio into the ATEM for the stream, and into the HyperDeck for the recording: which SQ7 output, at what level',
	'SQ7 outputs: main LR to the PA amps, the foyer feed, monitor and in-ear sends; the stage box on SLink',
	'In-ear transmitters (Shure P9T) and which mixes feed them',
	'Network switch ports: which switch and port each device above is on',
	'Power circuits and outlets in the rack, and the relay outlet numbers for the PA',
	'Rack elevation: what sits in each unit of the rack after the 2026-10-26 move',
]
