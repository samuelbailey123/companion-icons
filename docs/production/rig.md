# The rig

What is in the room, how it is addressed, and which Companion page drives it.

Addresses, pages and device identities here were **read off the live rig on 2026-08-28**,
not reconstructed — where this file and a `tools/` builder disagree, this file is what the
rig actually does. Anything still marked `TODO(sam)` cannot be read over the network at
all and needs hands on the equipment.

## Control

| | |
|---|---|
| Companion | Build `5.0.4+9717-stable-a69c14dec2` on a Raspberry Pi (`internal:hostname` reads `CompanionPi`) |
| Address | **http://10.23.0.242:8000** on the AV LAN — see Network below. Not reachable off-site |
| Updates | **Companion updates itself unattended.** On 2026-08-28 it went 5.0.3 → 5.0.4 and restarted on its own; Pi uptime was 40d, so the Pi did not reboot. The same thing landing on a Sunday morning takes the deck down mid-service |
| Admin API | tRPC over a WebSocket at `/trpc`, **unauthenticated** — anyone on the AV LAN can read the config and the log |
| Surfaces | Stream Deck + and Stream Deck XL. The XL grid is 9 columns; row 0 is the folder row on every page, row 4 the touchstrip, row 5 the encoders |
| Config in/out | `node tools/rig.js export <out.json>` reads the live config; `import` pushes selected sections. See the header of that file for why it exists and why it never touches `connections` or `userconfig`. **`tools/rig.js` is not on `main`** — it currently lives only on the `atem-stream-record` branch |
| Reading it without the tool | The export half is one plain HTTP GET: `curl -s http://10.23.0.242:8000/int/export/full \| gunzip > rig.json`. Useful when you are on the LAN with no checkout |
| Backup | `tools/rig.js export` **is** the backup. Run it before any change. **The file carries the ProPresenter and grandMA2 passwords in clear text** — treat an export as a credential, not as a document |

`tools/rig.js` talks tRPC over a WebSocket at `/trpc`, the same way Companion's own web UI
does. The rig address is hardcoded there on purpose so the tool can never be pointed at
the wrong Companion by a typo.

## Pages

**Ten**, in this order, each with the folder row across the top. Read off the live rig on
2026-08-28 — the Mics page is gone, replaced by PTZ, and PTZ Setup was added behind it.

| # | Page | Drives | Notes |
|---|---|---|---|
| 1 | Home | nothing — status only | Projectors, PA, PROGRAM, PREVIEW, Stream, Record, three ATEM macros. **No longer carries mic batteries, packs, internet or CPU temp** — those moved to System or went away with the Mics page. The deck resumes on its last page, so this is where you land after a restart |
| 2 | Power | Projectors, PA | One state-aware toggle per system; direction is worked out from polled state, not a step counter |
| 3 | PP1 | ProPresenter | Speaker and Worship are duration presets on one shared timer — 45 min and 25 min, not two timers |
| 4 | MA2 | grandMA2 lighting | Executors 101–109 across row 1, Go Next / Go Back / BLACKOUT below, four encoders on row 5 |
| 5 | ATEM | Television Studio HD8 | Program bus over preview bus, CUT and AUTO at column 8. The eight bus keys are inputs 1–7 plus Media Player 1 — **input 8, the PTZ, has no key on either bus** |
| 6 | SQ7 | Allen & Heath SQ7 | DCA 1–8 with level and mute state, Mute DCAs key. Stream / Foyer / MAIN readouts on the touchstrip |
| 7 | VW | Blackmagic Videohub + LED wall | Five destinations over four sources: tap a destination to arm, tap a source to route. Two direct routes, four Videohub readouts, and a brightness encoder for the wall |
| 8 | System | the Pi itself | CPU temp, load, memory, disk, power, internet, address, uptime, Companion, storage. Fed by an `internal: exec` trigger because Companion publishes no OS-level variables |
| 9 | PTZ | the PTZOptics PTZ | 48 controls: six presets, a nudge cluster, zoom/focus, tracking, and pan/tilt/zoom/focus/speed/preset encoders. Fed by `ptz_state.py` on a **1-second** trigger and `ptz_web.py` on a 5-second one |
| 10 | PTZ Setup | the same camera | Exposure, white balance, backlight, power, tracking mode and body framing |

There is **no Mics page any more.** The four Shure connections still run, but nothing on
the deck reads them.

## Devices

Read off the live Companion on 2026-08-28 and confirmed against each device on the LAN.

| Device | Role | Address |
|---|---|---|
| ATEM Television Studio HD8 | Vision mixer, program record | **10.23.0.31**, control on UDP 9910. Also answers the Blackmagic routing protocol on TCP 9990, which is how its identity was confirmed: unique ID `1947523eab1a4015aa81b6a4ae2dfe43`, the same uuid stamped into the recordings |
| Blackmagic Micro Videohub, 16×16 | Routing to projectors and outputs | **10.23.0.21**:9990. Input labels: 1 Program Out, 2 Aux 1, 3 Aux 2, 4 SDI Multiview |
| Allen & Heath SQ7 | Audio console | **10.23.0.188** |
| grandMA2 | Lighting | **10.23.0.101** for the console login; OSC out to :8000 and feedback in on :9000 |
| Shure ULXD4Q × 3 + ULXD4D × 1 | Wireless, **14** channels — not 16 | `10.23.0.20` "BGV 1-4" (Q), `10.23.0.23` "Lead 1-4" (Q), `10.23.0.253` "BGV+Host" (Q), `10.23.0.214` "Preach" — **a ULXD4D, two channels only**, Lav 1 and Lav 2. All on :2202 |
| ProPresenter | Presentation | **10.23.0.111**:1100. A follower is configured at 10.23.0.11 but `control_follower` is off, and nothing is listening there |
| NovaStar VX6S | LED wall processor | **10.23.0.19**:5200 |
| PTZOptics PTZ | Camera, VISCA over IP | **10.23.0.181**:5678, with a web interface on :80 that `ptz_web.py` drives |
| Static cameras × 2 | Fixed, unmanned | TODO(sam) — makes and models. Neither is on the network; they go SDI into the switcher |
| Raspberry Pi | Companion host | 10.23.0.242 |

**Addresses drift.** Every one of these except the Pi had moved at least once by
2026-08-28, and three of the four Shure receivers were pointing at dead hosts. The ATEM
and the Videohub survived it only because their modules re-discover over Bonjour; the
Shure module has no such fallback, which is why those were the ones that broke. The
Videohub's stored `host` is still `192.168.10.150`, an address on a subnet that does not
exist here — it works purely on Bonjour. **Check the addresses whenever a page goes
quiet, and prefer a pinned address over a discovered one.**

## Network

**10.23.0.x is a dedicated AV LAN** — church production gear only, nothing else on it. It
covers roughly half the building, with a direct line to backstage.

That is the right design, and it is also why none of this is readable from off-site: being
on church wifi is not enough, you have to be on that LAN. Anything that needs the live
Companion (`tools/rig.js export`, reading connection addresses, reading the log) has to
happen on site.

**Being on the LAN is still not enough for everything.** Companion exposes no variable for
the ATEM's video standard, so the 59.94 check cannot be automated from here at all — it
needs ATEM Software Control or the switcher's front panel. The same goes for camera menus
and for the SQ7's output routing. On-site splits into two jobs, and only one of them is
scriptable.

## Open configuration faults

Found by reading the live config on 2026-08-28. None of these are network problems, so
none of them will fix themselves.

1. **The Record key has no two-step guard.** Home `2,3` and ATEM `3,1` are a single press
   straight into `recordStartStop`. The Stream key beside it has the guard — two steps,
   arm then fire — and Record does not. This is exactly the 7.6 s gap from 2026-08-23: one
   stray press stops the recording. The record *state* indicator did ship, on both keys,
   so the other half of that fix is in.
2. **Four VW feedbacks never evaluate.** The source row's "this is what is routed to the
   armed destination" highlight uses
   `$(videohub:output_$(internal:custom_vh_dest)_input_id) == N` — a `$()` nested inside a
   variable name, which Companion's expression parser rejects. It logs
   `Unexpected token (1:44)` four times on every boot. `custom_vh_dest` is also
   non-persisting, so it is empty after every restart even once the expression parses.
3. **The PTZ cannot be cut to from the deck.** It is on ATEM input 8, but the ATEM page's
   program and preview buses carry inputs 1–7 and Media Player 1. With a second PTZ going
   in, that gap gets worse.
4. **Two pages depend on scripts that are not backed up.** The Power page and both PTZ
   pages shell out to `/home/samuelbailey/Desktop/AV_Power_scripts/{speaker,projector}_power.py`,
   `ptz_state.py` and `ptz_web.py` — a personal Desktop folder on the Pi, owned by a
   different user than the one Companion runs as. They are not in this repo and
   `rig.js export` does not capture them. Losing that folder silently kills the Power page
   and every PTZ readout.
5. **The PTZ poll runs at 1 Hz, always.** `trigger-ptz-poll` fires every second whether or
   not anyone is on the PTZ page. The Pi is not struggling (load 0.02, 62 °C, 16% memory,
   3% disk), so this is a tidiness point rather than an urgent one.
6. **Credentials are readable by anyone on the AV LAN.** Companion echoes each module's
   config into its log on connect, passwords included, and both the log and the config
   export are served without authentication. Record where a credential lives, assume
   anything in a Companion connection is visible on this LAN, and keep export files
   somewhere that reflects that.

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
