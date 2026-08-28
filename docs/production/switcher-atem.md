# Switcher — ATEM Television Studio HD8

The **plain** HD8, not the ISO variant. It records the program feed only; see the ISO
section in [rig.md](rig.md) for what that costs and how to work around it.

At **10.23.0.31**, control on UDP 9910. It also answers the Blackmagic routing protocol on
TCP 9990, which reports its unique ID as `1947523eab1a4015aa81b6a4ae2dfe43` — the same
uuid stamped into the recording files, so there is no doubt this is the box that records
the service.

Driven from the ATEM page: program bus over preview bus, CUT and AUTO at column 8, and
two-step guarded Stream and Record keys (first press arms, second fires). The model spec
in the `bmd-atem` module declares `streaming: true` and `recording: true`, which is what
those keys rely on.

## The one that matters

**Settings → Video → Video Standard must read `1080p59.94`.**

If it is set to a 29.97 standard, that alone explains the frame doubling across every
camera.

Evidence it is a single point in the chain rather than one bad camera: at a hard cut in
the 2026-08-23 recording the duplicate-pair phase ran straight through unbroken, and the
cut landed exactly on a pair boundary. A switcher cannot cut mid-pair, so the program feed
reaching the recorder was already 29.97.

Check in this order and find the one box that is not 59.94:

1. Each camera's own output format — in the camera menu, not the ATEM's display
2. **ATEM video standard**
3. Any converter, scaler or extender in the path

There is **no separate recorder** — the HD8 records its own program feed — so the fault is
in one of only two places: a camera's output format, or the switcher's video standard.
That is a much shorter hunt than it first looked.

If the chain genuinely cannot do 59.94 end to end, then **record 29.97 deliberately** —
same motion, half the file size. What you must not do is record doubled 59.94.

## Input mapping

Read off the switcher on 2026-08-28.

| Input | Label | On the deck |
|---|---|---|
| 1 | Camera 1 | program + preview |
| 2 | Camera 2 | program + preview |
| 3 | Camera 3 | program + preview |
| 4 | Camera 4 | program + preview |
| 5 | Words Overlay | program + preview |
| 6 | PP1B | program + preview |
| 7 | PP1 | program + preview |
| 8 | Camera 8 — **the PTZ** | **nothing** |
| 3010 | Media Player 1 | program + preview, in the eighth slot |

Inputs 1–8 all report BNC connected. **The PTZ is the one source you cannot cut to from
the deck**: the eighth key on each bus is Media Player 1, not input 8. Worth fixing before
the second PTZ goes in.

## TODO(sam)

Neither of these is readable over the network — Companion exposes no variable for the
video standard or the encoder settings, so both need ATEM Software Control or the front
panel.

- [ ] Current video standard setting — the actual value, before changing anything
- [ ] Can it be set to H.264 High profile, and a higher audio bitrate?

## Tally

**Not wired.** No camera shows whether it is live. Since two cameras are static and
unmanned that matters less than it sounds — but it is exactly the gap behind the PTZ
being zoomed for four minutes on air.

The deck covers it in practice: the ATEM page already carries program and preview
feedbacks, so whoever is driving the PTZ can see what is live before touching it. Worth
knowing that is the only indication there is.

## Outputs

AUX 1 feeds the LED wall and the two flanking projectors; AUX 2 feeds the back-wall
projector. Both in use, but AUX 2 can be freed by rerouting the back-wall projector
through the VideoHub — see rig.md.
