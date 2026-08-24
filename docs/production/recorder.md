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

Find out whether that was a manual stop or the recorder rolling over. If it rolls over,
check media health and confirm seamless splitting is enabled.

Companion could catch this next time: a key that goes red when recording stops would have
surfaced it live. The ATEM page already has a guarded Record key and the ATEM publishes
`$(atem:record_duration_hm)`.

## TODO(sam)

- [ ] Exact recorder model
- [ ] Current input and record format settings
- [ ] Can it do High profile? Higher audio bitrate?
- [ ] What caused the stop/start between segments 02 and 03 on 2026-08-23?
- [ ] Media type, and how full it was
