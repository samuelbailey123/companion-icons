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
