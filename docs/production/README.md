# Production reference

How the Sunday rig should be configured, and **why** each value is what it is.

This sits in the icon repo because that is where the rig knowledge already lives — the
`tools/` builders each document the page they emit, and `tools/rig.js` is what reads and
writes the live Companion. See [rig.md](rig.md) for the topology.

**The rule: never record a setting without the reason.** A value with no reason gets
"improved" by the next person. A value with a reason attached survives.

| File | What's in it |
|---|---|
| [rig.md](rig.md) | Every device and address, every page, how Companion is backed up — and the open configuration faults |
| [cameras.md](cameras.md) | Per-camera settings, exposure targets, framing discipline |
| [switcher-atem.md](switcher-atem.md) | The 59.94 check — the current worst fault lives here |
| [audio.md](audio.md) | Levels, limiter, and the AAC true-peak trap |
| [recorder.md](recorder.md) | Format, profile, file splitting |
| [checklists.md](checklists.md) | Pre-service and post-service run-throughs |
| [findings/](findings/) | What was measured off real recordings, by date |

Post-production is scripted separately and lives on the media drive at
`Services/_tools/` — render pipeline plus its own README.

## Open faults, worst first

All measured off the 2026-08-23 recording. Evidence in
[findings/2026-08-23.md](findings/2026-08-23.md).

0. **There is no light on a face at the preaching position.** Measured 2026-08-28 with the
   desk on its preaching state and someone in the chair, wall blanked: the face reads
   **10 IRE wide open at no gain**, against a 65–70 target, and only reaches target at
   maximum aperture *and* maximum gain. What the camera sees of a face there is mostly
   spill from the LED wall behind it. **No camera setting fixes this.** It also contradicts
   the 2026-08-23 recording, which measured lit skin at 62 IRE — so either a service runs a
   different lighting state, or the position differs. Settling that is now the biggest
   image-quality question on the rig. See cameras.md.
1. **The chain delivers 29.97p motion inside a 59.94p file.** Every second frame is a
   duplicate. **The switcher is cleared**: the ATEM reports `1080p59.94` over port 9990.
   **One real 30 fps source was found and fixed** — the PTZ added to input 1 on 2026-08-28
   was outputting 4K at 30 fps. The static camera on input 2 is the last unverified box in
   the chain, and it is not on the network.
2. **White clips with no highlight rolloff.** 79% of the speaker's white shirt sits flat
   at the 235 ceiling with nothing recoverable. Needs the camera's knee enabled and
   zebras used. **Do not fix this by stopping down** — see the correction in findings.
3. **Cameras are not matched to each other.** **The two PTZs now are**: both were dumped,
   diffed and set to identical Manual / 1/125 / F5.6 / 0 dB / 4600K on 2026-08-28, and
   twenty-five differing settings came down to three intended ones. The remaining static
   camera on input 2 is not on the network and has never been checked, so it is the one
   that will still cut badly.
4. **Audio is clipped at the desk** — −8 to −11.8 LUFS and up to +3.5 dBTP, so distortion
   is baked in before post sees it. The stream shares that path, so it went out live
   distorted too.
5. **The PTZ makes long moves live on air** — a continuous four-minute zoom during
   worship with no cut away from it.
6. **A 7.6 s recording gap** between segments 02 and 03 — a manual stop/start mid-service.
   Record state is now shown on the deck, on both Home and the ATEM page, so a repeat
   would be visible within seconds. **But the Record key still has no two-step guard**, so
   the mistake is still one stray press away — see recorder.md.
7. **No ISO recording** (plain HD8), so every clip inherits the live cut. See rig.md.
8. **The PTZ is on auto exposure, auto white balance and auto focus** — read off the
   camera on 2026-08-28. It is the reason PTZ shots do not cut with the statics, and the
   PTZ Setup page can fix all three without touching a camera menu. See cameras.md.

**Moiré on the LED wall** is a fault in its own right, and a solved one: each camera has a
narrow band of zoom positions where the sensor grid beats against the wall's pixel pitch —
52–60% on CAM 3, 56–60% on CAM 1 — measuring 10–25× the clean level inside it. CAM 3's
"Stage" preset was sitting dead centre of its band. Zoom is the only lever that works;
sharpness, shutter and wall brightness were each swept and do nothing. See cameras.md.

**A preset carries its exposure and white balance with it**, so recalling one puts the
camera back to whatever those were when it was saved. Every preset on CAM 3 held
auto-everything until they were re-saved on the 28th. Change exposure, re-save the presets,
or the first preset press in a service quietly undoes it.

Separately, the live Companion config carries faults of its own — a Record key with no
guard, four VW feedbacks that cannot parse, and two pages depending on scripts that are not
backed up. Those are listed in [rig.md](rig.md#open-configuration-faults).

Post can hide 6, partly compensate for 3, and do nothing at all about 1 or 2 — those are
destroyed at capture.
