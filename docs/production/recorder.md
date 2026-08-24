# Recorder

Blackmagic Design. Records the ATEM's program feed to the media drive as
`Sunday Service NN.mp4`, sequential segments of one continuous service.

Recorder metadata seen in the files: uuid `1947523EAB1A4015AA81B6A4AE2DFE43-0`,
`com.apple.proapps.cameraName: 0`.

## Format

Both the **input format** and the **record format** must read `1080p59.94`. If the ATEM
outputs 29.97 and the recorder is set to 59.94, the recorder duplicates every frame —
which is one candidate explanation for the current fault.

What it actually produced on 2026-08-23: 1080p59.94 container, H.264 **Main** profile,
yuv420p, bt709 limited range, 40–52 Mbps, AAC-LC 128 kbps stereo.

Two things worth changing if the recorder offers them:

- **Main profile → High.** A free quality win at the same bitrate (8×8 transform).
- **128 kbps AAC → 192.** Low for a music-heavy service.

## File splitting

A **7.6 second gap** appeared between segments 02 and 03 on 2026-08-23 — file 02 ends at
16:14:57.4, file 03 starts at 16:15:05.0, and the speaker is visibly in a different
position across the join. The 01→02 split was a clean 0.5 s file roll, so the recorder
*can* split seamlessly.

**Cause: known.** It was a manual stop/start by the operator mid-service, not the
recorder rolling over and not a media fault. So seamless splitting is not implicated and
the media is not suspect.

The useful fix is not "be more careful" — it is making the mistake visible and hard to
make. Two things, both cheap:

1. **A record-state indicator on the deck.** The ATEM publishes
   `$(atem:record_duration_hm)`, so a key that goes red the moment recording stops would
   have surfaced this within seconds instead of after the service. Nothing on the deck
   currently shows record state at a glance.
2. **The Record key is already two-step guarded** (first press arms, second fires) — the
   same guard the Stream key has. Worth confirming that guard is what shipped, since an
   accidental single-press stop is exactly the failure this was.

## TODO(sam)

- [ ] Exact recorder model
- [ ] Current input and record format settings
- [ ] Can it do High profile? Higher audio bitrate?
- [ ] Media type, and how full it was
