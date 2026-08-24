# Switcher — ATEM Television Studio HD8

The **plain** HD8, not the ISO variant. It records the program feed only; see the ISO
section in [rig.md](rig.md) for what that costs and how to work around it.

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
3. Recorder input format **and** record format
4. Any converter, scaler or extender in the path

If the chain genuinely cannot do 59.94 end to end, then **record 29.97 deliberately** —
same motion, half the file size. What you must not do is record doubled 59.94.

## TODO(sam)

- [ ] Current video standard setting — the actual value, before changing anything
- [ ] Input mapping: which camera on which input
- [ ] Is tally wired up? (the ATEM page already carries program and preview feedbacks)
- [ ] Is an AUX output free for a locked tight shot to a second recorder?
