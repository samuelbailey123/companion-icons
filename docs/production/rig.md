# The rig

What is in the room, how it is addressed, and which Companion page drives it.

Most of this is reconstructed from the `tools/` builders in this repo — each one documents
the page it emits, so the page layouts here are authoritative. Anything marked
`TODO(sam)` could not be read out of code and needs someone at the desk.

## Control

| | |
|---|---|
| Companion | v5 on a Raspberry Pi (`internal:hostname` reads `CompanionPi`) |
| Address | **http://10.23.0.242:8000** — church network only, not reachable off-site |
| Surfaces | Stream Deck + and Stream Deck XL. The XL grid is 9 columns; row 0 is the folder row on every page, row 4 the touchstrip, row 5 the encoders |
| Config in/out | `node tools/rig.js export <out.json>` reads the live config; `import` pushes selected sections. See the header of that file for why it exists and why it never touches `connections` or `userconfig` |
| Backup | `tools/rig.js export` **is** the backup. Run it before any change |

`tools/rig.js` talks tRPC over a WebSocket at `/trpc`, the same way Companion's own web UI
does. The rig address is hardcoded there on purpose so the tool can never be pointed at
the wrong Companion by a typo.

## Pages

Nine, each with the folder row across the top.

| Page | Drives | Notes |
|---|---|---|
| Home | nothing — status only | Projectors, PA, program, preview, mic batteries, muted, packs, internet, CPU temp. The deck resumes on its last page, so this is where you land after a restart |
| ATEM | Television Studio HD8 | Program bus (8 sources) over preview bus, CUT and AUTO at column 8. Stream and Record keys are two-step guarded — first press arms, second fires |
| VW | Blackmagic VideoHub + LED wall | Destination row over source row: tap a destination to arm, tap a source to route. Plus a brightness encoder for the wall |
| MA2 | grandMA2 lighting | Executors 101–109 across row 1, Go Next / Go Back / BLACKOUT below, four encoders on row 5 |
| SQ7 | Allen & Heath SQ7 | DCA 1–8 with level and mute state, Mute DCAs key. Stream / Foyer / MAIN readouts on the touchstrip |
| PTZ | PTZ cameras | Has a `ptz_state.py` poller running on the Pi, driven by a Companion trigger |
| Mics | 4 × Shure ULXD4Q | **Read-only page — nothing on it has an action.** 16 channels: BGV 1–4, Lead 1–4, Lav 1–2, Host+BGV ×4 |
| PP1 | ProPresenter | Speaker and Worship are duration presets on one shared timer — 45 min and 25 min, not two timers |
| Power | Projectors, PA | One state-aware toggle per system; direction is worked out from polled state, not a step counter |
| System | the Pi itself | CPU temp, load, memory, disk, power, internet, address, uptime, Companion, storage. Fed by an `internal: exec` trigger because Companion publishes no OS-level variables |

## Devices

| Device | Role | Address |
|---|---|---|
| ATEM Television Studio HD8 | Vision mixer, program record | TODO(sam) |
| Blackmagic VideoHub | Routing to projectors and outputs | TODO(sam) |
| Allen & Heath SQ7 | Audio console | TODO(sam) |
| grandMA2 | Lighting | TODO(sam) |
| Shure ULXD4Q × 4 | Wireless, 16 channels | TODO(sam) |
| ProPresenter | Presentation | TODO(sam) |
| Cameras | 2 manned + 1 PTZ | TODO(sam) — makes and models |
| Raspberry Pi | Companion host | 10.23.0.242 |

Credentials do not go in this file. Record **where** they live — a password manager entry
name — not what they are.

## The ISO problem

The HD8 is the **plain** variant, so it records the **program feed only**. That has a
direct consequence for post, and it is the single biggest constraint on making clips:

> Every clip inherits whatever the operator cut to at that moment. There is no second
> angle to fall back on, and no way to recover a shot that was framed badly or was on the
> wrong camera.

This bit us on 2026-08-23: the best line in the sermon landed while the switcher was on
the house-wide, so the vertical crop for that clip had to follow the speaker across
1074 px of stage instead of sitting on a clean close-up.

Three ways out, cheapest first:

1. **Record a camera's own output separately.** Many PTZs record to SD or publish an
   RTSP/NDI stream that can be recorded on the Pi or any spare machine. Costs nothing if
   the camera already does it — check the PTZ's spec first.
2. **Feed an AUX output to a second recorder.** The HD8 has AUX; park a locked tight shot
   on it and record that alongside the program feed.
3. **Cut better.** Free, but it makes every future clip dependent on live decisions.

A locked, tight, never-cut shot of the speaker is what makes clips and vertical reframing
trivial. Option 1 or 2 gets it without buying a camera.
