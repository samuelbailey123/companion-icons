# Recording

**Since 2026-10-26 the service records on a HyperDeck, and the ATEM only streams** (Sam: "we
added a disk recorder to the network so let's use that. we will be recording on that and
streaming on the HD8"). Everything below the HyperDeck section is how the ATEM recorded before
that, kept because the board still tends the ATEM's drive and recording could move back.

## The HyperDeck

Read off the deck over its control port (TCP 9993) on 2026-10-26.

| | |
|---|---|
| Model | Blackmagic **HyperDeck Studio Mini**, unique id `7c2e0d0cbd95` |
| Address | **10.23.0.206** on the AV LAN (DHCP: give it a reservation, or it will drift like the rest) |
| Feed | Videohub OUT 13 "Deck Recorder", which carried IN 4 "Program" that night. SDI in, 1080p59.94 in and out |
| Media | **Two SD card slots, nothing else**: it cannot record to the 4 TB USB drive. Both slots were **empty** on 2026-10-26 |
| Format | H.264 High, AAC, 2 channels embedded, timecode from the clip. That is High profile where the ATEM gave Main |
| Remote | Enabled on the deck's front panel; Companion cannot record without it |

**What starts it.** The Record keys on Home r2c3 and ATEM r3c1 toggle it, the PP1 Countdown key
starts it, and the Sunday 10:24:57 trigger (which copies the Countdown key) starts it. Nothing on
the deck starts the ATEM's recording any more. Built by `tools/record-hyperdeck.js`; the trigger's
action was swapped on the rig in place, because the trigger copies the key only when it is built.

**What the deck shows.** The Record keys are red with the clip's running time while it records.
Idle, they show the time left on the card, or go amber with **NO CARD** when neither slot has
one. The Service Health board's recording card reads the same through Companion (it has no
session of its own: some HyperDecks take one control connection, and Companion's must win).

**Not yet proven with a card in.** On 2026-10-26 a Record press reached the deck and was refused
with `105 no disk`, as it should be. The module's `slotId`, `recordingTime` and its spelling of the
recording status cannot be read until a card is in, so check on the first one: the key should
show hours left, a press should turn it red and count up, and the board should go to REC.

**Cards.** At the 40–52 Mb/s the ATEM's H.264 ran at, an hour is about 23 GB, so a 128 GB card
holds roughly five hours. The deck's own rate is unmeasured until the first file. Use cards from
Blackmagic's supported media list for the Studio Mini and format them in the deck.

## Before 2026-10-26: the ATEM recorded

The ATEM Television Studio HD8 recorded its own program feed directly to disk.

### Media

A **4 TB SanDisk** drive — the same physical drive that mounts as `/Volumes/Hard Drive`
for post. It holds hundreds of hours and sits at well under 1% used, so **space is not a
consideration** and was not a factor in anything that went wrong.

Note the drive therefore travels between the church and the edit desk. Nothing durable
should live on it for that reason: it is media and scratch, not storage. Documentation
lives in git; the render pipeline lives at `Services/_tools/` on the drive alongside the
media it operates on.

### Which disk

Read off the switcher on 2026-10-09 and tested on it, idle, on 2026-10-10.

| Disk | Id | Free |
|---|---|---|
| `Hard Drive` — the USB drive above | 301 | 115 h |
| `Internal` — the HD8's own SSD | 1 | 62 h |

**What records is the disk the switcher flags Active.** That is usually the first working-set
slot, but not always, and three things move it:

| What happens | Slots | Active |
|---|---|---|
| **Power reset** with the drive in | Internal, then the drive | Internal |
| Drive unplugged | empty, then Internal | Internal |
| Drive plugged into a running switcher | the drive, then Internal (Sam, 2026-10-09) | the drive |
| Switch Disk (the module's `recordSwitchDisk`), idle | unchanged | moves to the other slot |
| Setting the slot order | as set | stays on the slot position it was on |

The rig power-cycles every Sunday morning, so left alone **every Sunday starts with Internal
recording**. That was the "records to internal" fault.

**The fix is in the Service Health board** (Decima-Labs/service-health, `driveCommand` in
`src/atem.ts`), not on the deck. It already holds a session to the switcher; while the switcher is
idle and a formatted drive is present it makes the drive the first slot and then the Active disk,
checking the state after each step. Proven on the switcher on 2026-10-10: with the power-reset
order set by hand, the drive was back first and Active within 20 ms. It cannot be done from
Companion: `bmd-atem` 4.4.0 has only the Switch Disk toggle and reports only the first slot's
name, as `$(atem:record_disk_volume)`, so a deck-side "switch if Internal" would toggle back on
the next press and its own readout could name the drive while Internal records.

What the deck shows (`tools/record-disk.js`, on the rig since 2026-10-09): the Record keys on Home
r2c3 and ATEM r3c1 name the first slot while idle and turn amber when it is `Internal` or there is
`NO DRIVE`. The board keeps the first slot and the Active disk the same, so the key reads true; if
the board is down after a power reset the key is amber, which is also true.

### What it produced

2026-08-23: 1080p59.94 container, H.264 **Main** profile, yuv420p, bt709 limited range,
40–52 Mbps, AAC-LC 128 kbps stereo. Metadata carries uuid
`1947523EAB1A4015AA81B6A4AE2DFE43-0`.

Two things worth changing if the HD8 exposes them:

- **Main profile → High.** A free quality win at the same bitrate (8×8 transform).
- **128 kbps AAC → higher.** Low for a music-heavy service.

## The 7.6 second gap

**Cause: known.** A manual stop/start mid-service. Not the recorder rolling over, not
media, not disk space — all three are cleared.

The useful fix is not "be more careful". It is making the mistake visible and hard to
make, and there are two cheap moves:

1. **A record-state indicator on the deck. — Shipped.** Both Home `2,3` and ATEM `3,1`
   carry a Record key showing `$(atem:record_duration_hm)` with the module's own
   `recordStatus` feedback colouring it, so a stopped recording is now visible at a glance
   on two pages.
2. **The Record key's two-step guard did not ship.** Checked against the live config on
   2026-08-28: the Stream key has two steps — arm, then fire — and the Record key beside
   it has one, going straight into `recordStartStop` on a single press. An accidental
   single press is exactly this failure, and it is still one press away. **This is the
   open half of the fix.**

## TODO(sam)

Needs ATEM Software Control — Companion publishes nothing about the encoder.

- [ ] Can the HD8 be set to High profile? A higher audio bitrate?
