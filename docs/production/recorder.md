# Recording

**There is no separate recorder.** The ATEM Television Studio HD8 records its own program
feed directly to disk. That is a useful simplification: it removes an entire box from the
fault hunt, because there is no recorder/switcher format mismatch possible.

## Media

A **4 TB SanDisk** drive — the same physical drive that mounts as `/Volumes/Hard Drive`
for post. It holds hundreds of hours and sits at well under 1% used, so **space is not a
consideration** and was not a factor in anything that went wrong.

Note the drive therefore travels between the church and the edit desk. Nothing durable
should live on it for that reason: it is media and scratch, not storage. Documentation
lives in git; the render pipeline lives at `Services/_tools/` on the drive alongside the
media it operates on.

## Which disk

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

## What it produced

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
