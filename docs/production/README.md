# Production reference

How the Sunday rig should be configured, and **why** each value is what it is.

This sits in the icon repo because that is where the rig knowledge already lives — the
`tools/` builders each document the page they emit, and `tools/rig.js` is what reads and
writes the live Companion. See [rig.md](rig.md) for the topology.

**The rule: never record a setting without the reason.** A value with no reason gets
"improved" by the next person. A value with a reason attached survives.

| File | What's in it |
|---|---|
| [rig.md](rig.md) | Every device, its page, and how Companion is addressed and backed up |
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

1. **The chain delivers 29.97p motion inside a 59.94p file.** Every second frame is a
   duplicate, on every camera. Costs nothing to fix and is the biggest single
   image-quality win available. **Not yet traced to a box** — start at the switcher.
2. **White clips with no highlight rolloff.** 79% of the speaker's white shirt sits flat
   at the 235 ceiling with nothing recoverable. Needs the camera's knee enabled and
   zebras used. **Do not fix this by stopping down** — see the correction in findings.
3. **Cameras are not matched to each other.** Skin level varies noticeably between the
   wide and close shots of the same subject in the same service.
4. **Audio is clipped at the desk** — −8 to −11.8 LUFS and up to +3.5 dBTP, so distortion
   is baked in before post sees it.
5. **The PTZ makes long moves live on air** — a continuous four-minute zoom during
   worship with no cut away from it.
6. **A 7.6 s recording gap** between segments 02 and 03, cause unknown.
7. **No ISO recording** (plain HD8), so every clip inherits the live cut. See rig.md.

Post can hide 6, partly compensate for 3, and do nothing at all about 1 or 2 — those are
destroyed at capture.
