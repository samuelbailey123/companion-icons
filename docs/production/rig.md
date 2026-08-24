# The rig

What is in the room, how it is addressed, and which Companion page drives it.

Most of this is reconstructed from the `tools/` builders in this repo — each one documents
the page it emits, so the page layouts here are authoritative. Anything marked
`TODO(sam)` could not be read out of code and needs someone at the desk.

## Control

| | |
|---|---|
| Companion | v5 on a Raspberry Pi (`internal:hostname` reads `CompanionPi`) |
| Address | **http://10.23.0.242:8000** on the AV LAN — see Network below. Not reachable off-site |
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
| Cameras | 2 fixed static (unmanned) + 1 PTZ, second PTZ going in | TODO(sam) — makes and models |
| Raspberry Pi | Companion host | 10.23.0.242 |

## Network

**10.23.0.x is a dedicated AV LAN** — church production gear only, nothing else on it. It
covers roughly half the building, with a direct line to backstage.

That is the right design, and it is also why none of this is readable from off-site: being
on church wifi is not enough, you have to be on that LAN. Anything that needs the live
Companion (`tools/rig.js export`, reading connection addresses, checking the ATEM's video
standard) has to happen on site.

## Video outputs

| Output | Feeds |
|---|---|
| AUX 1 | The LED wall **and** the two projectors either side of it |
| AUX 2 | The back-wall projector |

Both AUXes are therefore in use. **They are not immovable:** the back-wall projector could
be fed from the VideoHub instead — take the switcher's output into the router and route it
to that projector — which frees AUX 2. Worth doing only if there is a use case that earns
it; see the ISO section below.

Credentials do not go in this file. Record **where** they live — a password manager entry
name — not what they are.

## The ISO problem

The HD8 is the **plain** variant, and it records its own **program feed only** — there is
no separate recorder in the chain at all. That has a
direct consequence for post, and it is the single biggest constraint on making clips:

> Every clip inherits whatever the operator cut to at that moment. There is no second
> angle to fall back on, and no way to recover a shot that was framed badly or was on the
> wrong camera.

This bit us on 2026-08-23: the best line in the sermon landed while the switcher was on
the house-wide, so the vertical crop for that clip had to follow the speaker across
1074 px of stage instead of sitting on a clean close-up.

The cameras cannot help here: all three go SDI straight into the switcher and none of
them records locally. So the only routes to a clean tight angle are:

1. **Free AUX 2 via the VideoHub** (reroute the back-wall projector, as above), park a
   locked tight shot on it — and record it. **That last part needs a device that does not
   currently exist in the rig.** The Pi could potentially do it with a capture input, or a
   cheap standalone SDI recorder would.
2. **Cut better.** Free, but every future clip stays dependent on live decisions.

Be honest about the cost: option 1 is a reroute plus a recorder plus a camera dedicated to
not being on program. That is real money and a real constraint for a benefit that is
mostly about social clips. It is worth doing if clips matter; it is not worth doing to fix
one bad week.
