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

Read off the switcher on 2026-10-09.

| Disk | Id | Free |
|---|---|---|
| `Hard Drive` — the USB drive above | 301 | 116 h |
| `Internal` — the HD8's own SSD | 1 | 62 h |

The switcher records to the **first** disk of its working set, or the second when the first slot
is empty.

- **Drive in:** Hard Drive first, Internal second. The 2026-10-09 evening event recorded to the
  drive. Sam reports that plugging the drive in puts it straight into the first slot.
- **Drive out:** the first slot is empty and Internal is second, so a recording goes to the
  switcher's SSD. That is the "records to internal" fault: it is what the switcher does whenever
  the drive is not in at the moment Record is pressed.

So nothing switches disks automatically; the drive being in is what matters, and both screens say
so before anyone presses Record:

- The Record keys (Home r2c3, ATEM r3c1, `tools/record-disk.js`) name the disk while idle and turn
  amber when it is not the drive, the value line reading `Internal` or `NO DRIVE`. On the rig since
  2026-10-09.
- The Service Health board treats Internal as no recording drive (Decima-Labs/service-health#3).

`bmd-atem` 4.4.0 publishes only the first slot's name, as `$(atem:record_disk_volume)`; it is blank
while that slot is empty. Its only disk action is `recordSwitchDisk`, a toggle, which nothing uses.

### TODO(sam)

- [ ] Watch one plug-in with the switcher on: the drive should land in the first slot and the
      Record keys go back to grey reading `Hard Drive`. Not yet seen by anything but Sam; the
      switcher was powered off before it could be watched.

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
