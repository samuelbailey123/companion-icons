# The rig

What is in the room, how it is addressed, and which Companion page drives it.

Addresses, pages and device identities here were **read off the live rig on 2026-08-28**,
not reconstructed — where this file and a `tools/` builder disagree, this file is what the
rig actually does. Anything still marked `TODO(sam)` cannot be read over the network at
all and needs hands on the equipment.

## Control

| | |
|---|---|
| Companion | Build `5.0.7+9763-stable-cec2f88e6f` (2026-10-27) on a Raspberry Pi 5, 8 GB, Debian 13 CompanionPi image (`internal:hostname` reads `CompanionPi`). Runs as user `companion`; settings in `/etc/companion/config.yaml`, which must keep `enableShellCommandSupport: true` |
| Address | **http://10.23.0.242:8000** on the AV LAN — see Network below. Not reachable off-site |
| Updates | **Companion updates itself unattended.** On 2026-08-28 it went 5.0.3 → 5.0.4 and restarted on its own; Pi uptime was 40d, so the Pi did not reboot. The same thing landing on a Sunday morning takes the deck down mid-service |
| Admin API | tRPC over a WebSocket at `/trpc`, **unauthenticated** — anyone on the AV LAN can read the config and the log |
| Surfaces | Stream Deck + and Stream Deck XL. The XL grid is 9 columns; row 0 is the folder row on every page, row 4 the touchstrip, row 5 the encoders |
| Config in/out | `node tools/rig.js export <out.json>` reads the live config; `import` pushes selected sections. See the header of that file for why it exists and why it never touches `connections` or `userconfig`. |
| Reading it without the tool | The export half is one plain HTTP GET: `curl -s http://10.23.0.242:8000/int/export/full \| gunzip > rig.json`. Useful when you are on the LAN with no checkout |
| Backup | `tools/rig.js export` **is** the backup. Run it before any change. **The file carries the ProPresenter and grandMA2 passwords in clear text** — treat an export as a credential, not as a document: keep it in the private Drive folder, never here. The Pi's nightly `companion-backup.timer` (03:17) writes to a USB drive labelled `storage`, which **was not plugged in on 2026-10-27** (fault 7). The Recovery Guide in `manual/` has the restore steps |

`tools/rig.js` talks tRPC over a WebSocket at `/trpc`, the same way Companion's own web UI
does. The rig address is hardcoded there on purpose so the tool can never be pointed at
the wrong Companion by a typo.

## Pages

**Eighteen.** The folder row across the top of every page but Videohub holds nine: Home, Power,
PP1, MA2, ATEM, SQ7, VW, PTZ, System. The other nine are sub-pages, opened from a key. Read off the
live rig on 2026-10-27; the Reference in `manual/` draws every one of them, key by key, and is
regenerated from the rig, so it wins wherever this table has gone stale.

| # | Page | Drives | Opened from | Notes |
|---|---|---|---|---|
| 1 | Home | nothing — status only | folder row | Projectors, PA, Dante, PROGRAM, PREVIEW, Stream, Record, three ATEM macros. The deck resumes on its last page, so check where it is after a restart |
| 2 | Power | Projectors, PA | folder row | One state-aware toggle per system; direction is worked out from polled state, not a step counter |
| 3 | PP1 | ProPresenter | folder row | Clear keys, Next/Previous, **Freeze Slide** at r1c8 (`tools/pp1-freeze.js`, released by **All Screens** at r2c7), **Pre-Service** at r2c3 and **Countdown** at r2c6 (both trigger by playlist index: re-run their tools if items are added above them), Stage layout swap, and the Hosting / Speaker / Worship timers with their readouts on the strip |
| 4 | MA2 | grandMA2 lighting | folder row | Since 2026-10-27 the whole lighting is one fader on the desk, Fader 1 on fader page 5 (Executor 5.1), and the page is built round it: knob 1, **Lights**, sets it 0–100 in steps of 5, with its level on the strip above; **Go Next** (r2c0) and **Go Back** (r3c0) send `Go Executor 5.1` / `GoBack Executor 5.1`, stepping its cues whatever the desk has selected; BLACKOUT stays at r3c8 (`src/ma2.js`). The level is what the deck last sent, not read back from the desk, so move the fader on the console and the strip is wrong until the knob is turned. `fader2_level`–`fader4_level` and `selected_exec` are left over from the old four knobs and drive nothing |
| 5 | ATEM | Television Studio HD8 | folder row | Program bus over preview bus, CUT and AUTO at column 8, guarded Stream, Record (the HyperDeck), three macros |
| 6 | SQ7 | Allen & Heath SQ7 | folder row | DCA 1–8 with level and mute state, Mute DCAs key, Dante at r2c8. Stream / Foyer / MAIN readouts on the touchstrip. The bottom row (r3c0–r3c5) opens the six fader folders, pages 19–24 (`src/sq7-faders.js`, since 2026-10-27) |
| 7 | VW | Blackmagic Videohub + LED wall | folder row | **The whole router** since 2026-10-27: every output (OUT 1–16) over every input (IN 1–16), captioned with the router's own labels. Tap an output, then an input. **No folder row**: a Home key at r0c8 leaves. The touchstrip and knob are VW's as before: screen readouts and the LED wall's brightness (`tools/switch-page.js`) |
| 8 | System | the Pi itself | folder row | CPU temp, load, memory, disk, power, internet, address, uptime, Companion, storage. Fed by an `internal: exec` trigger |
| 9 | PTZ | nothing: a chooser | folder row | Opens CAM 1, CAM 3, their Setup pages, Worship and Sermon. The camera keys are captioned with each camera's ATEM input |
| 10 | CAM 1 | the PTZ on 10.23.0.196 | PTZ | Presets, save, nudge, zoom/focus, tracking, and pan/tilt/zoom/focus/speed/preset encoders. Fed by `ptz_state.py` every second and `ptz_web.py` every 5 s |
| 11 | CAM 1 Setup | the same camera | PTZ, CAM 1 | Exposure, white balance, backlight, power, tracking mode and body framing |
| 12 | CAM 3 | the PTZ on 10.23.0.181 (the switcher's "Cam 2" since 2026-10-26) | PTZ | As CAM 1, built by the same code |
| 13 | CAM 3 Setup | the same camera | PTZ, CAM 3 | As CAM 1 Setup |
| 14 | Tracks | walk-in music on the PP1 iMac | PP1 r2c4 | Play/pause, previous, skip, fade out, title and volume (`tools/pp1-tracks.js`) |
| 15 | Worship | both PTZs | PTZ, Sermon | Both cameras side by side: presets, save, speed, autofocus, pan/tilt/zoom knobs |
| 16 | Sermon | both PTZs | PTZ, Worship | Both cameras for the sermon: tracking, framing, who to follow, and pan/tilt/zoom by hand |
| 17 | Dante | nothing: read only | Home r1c2, SQ7 r2c8 | Every Dante source into the SQ7 and whether its routes are up (`tools/dante-page.js`) |
| 18 | Videohub | nothing now | nothing | The router page as it was before it became VW. Nothing opens it since 2026-10-27; safe to delete (the pages after it would renumber, so delete it only after moving or rebuilding 19–24) |
| 19–24 | DCA 1-4, DCA 5-8, Leads, BGV, Lav, FX | SQ7 faders | SQ7 r3c0–r3c5 | One knob per fader: turn for level (1 dB a click), press to mute; the strip shows the desk's own dB, red when muted. Leads CH 1–4, BGV CH 5–8, Lav CH 13–14 and FX returns 1–4 are their level into Main (`tools/sq7-faders.js`) |

**Both cameras run one page layout.** Pages 11 and 12 are emitted by the same
`buildPage`/`buildSetupPage` calls as 9 and 10, and the build asserts they are identical
once the connection, host, page numbers and variable prefix are normalised away — so they
cannot drift apart. See `tools/ptz2-page.js`.

**The four PTZ pages share one folder-row slot.** The row is exactly nine columns for nine
pages and was already full, so pages 10, 11 and 12 are sub-pages reached from page 9. The
swap key at row 1 column 8 of each run page moves between the two cameras, and is captioned
with that camera's **ATEM input number** so the deck and the switcher agree. It took the
slot that held preset 6, which was unnamed and saved at preset 5's identical position.

There is **no Mics page any more.** The four Shure connections still run, but nothing on
the deck reads them.

## Planning Center

**Nothing on the deck drives or shows Planning Center any more.** The NEXT / PREV step keys on
Worship and Sermon and the four readouts on Home row 3 were added on 2026-10-06 and taken off on
2026-10-10 (Sam: "take it off the stream deck"). Their builder is in git history at `bf094f0`
(`src/pco-live.js`).

Planning Center now lives on the Service Health board's Services page
(http://10.23.0.242:8080/services, Decima-Labs/service-health): the current item, the whole order
of service with Planning Center's times, notes and teams.

| | |
|---|---|
| Connection | `pco` — Bitfocus `planningcenter-serviceslive` v2.7.0, polling every 3 s, pinned to service type **919088** (Sunday Service). **Kept:** the board reads its variables for the current item and time left |
| Advancing LIVE | With the step keys gone, LIVE moves only when someone advances it in Planning Center itself |
| Credential | Sam's Personal Access Token "pco-lint (read-only plan linter)", shared with the `pco-lint` report (Decima-Labs/pco-lint). It lives in `~/.config/pco/lint.env` on Sam's Mac, in that repo's secrets, in this Companion connection, and since 2026-10-10 in `~/.config/service-health/pco.env` on the Pi (0600) for the board. **Like every connection here it is readable in Companion's export and log by anyone on the AV LAN** (fault 6 below). Revoke it at api.planningcenteronline.com/personal_access_tokens if the Pi is ever compromised |
| Planning Center's own settings | Two things found on 2026-10-10 that are fixes there, not here: the organisation's time zone is `America/Guatemala` (no daylight saving, so absolute times are an hour late for half the year), and "Prayer Works" is marked as part of the service, which puts Worship at 11:00 in Planning Center's times |

## Dante

**Page 17, Dante**, a sub-page of SQ7, opened by the **Dante** folder at Home r1c2 (beside
Projectors and PA, so the Stream Deck + and the iPad deck show it too) and at SQ7 r2c8. Both go red
when the patch is not normal. On the rig since 2026-10-11, `tools/dante-page.js`, logic in
`src/dante.js`. It reports and changes nothing: no key on it has an action beyond the folder row.

| | |
|---|---|
| Connection | `dante` — Bitfocus `audinate-dantecontroller` **1.1.2**, bound to the Pi's 10.23.0.242, 5 s sweep, a device dropped after 15 s unheard. The module can make and clear routes; nothing on the deck asks it to |
| Row 1 | One key per source into the SQ7: Leads, BGV 1-4, BGV+Host, Lav 1-2, Tracks, PP1, Devan, Josue, then **Routing**. Green = on the network with every route subscribed; amber = on the network, a route down; red = a source the desk needs is missing. The three laptops show "Not here" in slate when away, and BGV+Host shows "On XLR" (below). Routing is green only when every required route is up, and the SQ7's Dante key goes red with it |
| Row 2 | Each device's sample rate and Dante latency under its source; the SQ7's own card at r2c8 |
| r3c0 | Sample rate: red if any device present is not at 48 kHz |
| Not shown | The PTP clock leader — module 1.1.2 cannot read it. On 2026-10-11 the SQ7 card led and the rest followed |

**The routes are the desk's own subscriptions**, read off the network on 2026-10-11, not a
design. Repatch in Dante Controller and `SOURCES` in `src/dante.js` has to follow, or the page
reports the new patch as broken.

| Dante device | Address | Into SQ7 |
|---|---|---|
| `AllenHth-0e0184` — SQ7 Dante card, 64×64, clock leader | 10.23.0.70 | — |
| `ULXD4Q-LEADS-1-4` | 10.23.0.14 | 1-4 |
| `ULXD4Q-BGV-1-4` | 10.23.0.107 | 5-8 |
| `ULXD4Q-BGV-5-6-HOST-1-2` | not on the network — feeds the desk over XLR | 9-12 subscribed but unused |
| `ULXD4D-LAV-1-2` | 10.23.0.143 | 13-14 |
| `TCBs-MacBook-Pro-Tracks` — Dante Virtual Soundcard | 10.23.0.230 | 15-22 |
| `iMac-PP1` — Dante Virtual Soundcard | 10.23.0.204 | 23-24 and 45-46 |
| `Devans-Mac-mini`, `Josues-MacBook-Pro` | away on 2026-10-11 | 33-41 and 51-64; 42-44 and 47-49 |

The receivers' Dante interfaces have their own addresses, separate from the :2202 control
addresses in Devices below. **The BGV+Host receiver is not on Dante, by design**: it reaches the
desk over its XLR outputs (Sam, 2026-10-11). Its control port answers at 10.23.0.253 and names a
Dante interface `ULXD4Q-BGV-5-6-HOST-1-2` that is not cabled, and the SQ7 still holds Dante
subscriptions on inputs 9-12 to it, left over and harmless. The page shows it "On XLR" in slate and
leaves it out of the Routing check; if it is ever cabled for Dante it lights up like the others.

Dante Controller will not see these devices over WiFiman or any routed VPN: it finds them by
multicast. Off site, use this page through Companion's web UI, or remote into a Mac on the LAN.

## Devices

Read off the live Companion on 2026-08-28 and confirmed against each device on the LAN.

| Device | Role | Address |
|---|---|---|
| ATEM Television Studio HD8 | Vision mixer and **stream** (recording moved to the HyperDeck on 2026-10-26) | **10.23.0.34** (2026-10-26), control on UDP 9910. Also answers the Blackmagic routing protocol on TCP 9990, which is how its identity was confirmed: unique ID `1947523eab1a4015aa81b6a4ae2dfe43`, the same uuid stamped into the recordings. That same port reports its video standard — `1080p59.94` — and its aux routing, and accepts routing changes |
| Blackmagic Micro Videohub, 16×16 | Routing to the screens **and to the switcher's inputs 1–6** | **10.23.0.21**:9990. Re-patched on 2026-10-26: see Video routing below |
| HyperDeck Studio Mini | **Records the service** since 2026-10-26, from Videohub OUT 13 | **10.23.0.206**:9993, Companion connection `hyperdeck` (bmd-hyperdeck 3.2.0). SD cards only. See recorder.md |
| Allen & Heath SQ7 | Audio console | **10.23.0.191** (2026-10-26) |
| grandMA2 | Lighting | **10.23.0.99** (2026-10-26) for the console login; OSC out to :8000 and feedback in on :9000 |
| Shure ULXD4Q × 3 + ULXD4D × 1 | Wireless, **14** channels — not 16 | `10.23.0.20` "BGV 1-4" (Q), `10.23.0.23` "Lead 1-4" (Q), `10.23.0.253` "BGV+Host" (Q), `10.23.0.214` "Preach" — **a ULXD4D, two channels only**, Lav 1 and Lav 2. All on :2202 |
| ProPresenter | Presentation, on the PP1 iMac | **10.23.0.204**:1100 (2026-10-27; it was 10.23.0.111). A follower is configured at 10.23.0.11 but `control_follower` is off, and nothing is listening there |
| NovaStar VX6S | LED wall processor | **10.23.0.23**:5200 (was .19 until August 2026) |
| FoMaKo UV602 PTZ — **CAM 3** pages, shown as **CAM 2** | Camera, VISCA over IP, **ATEM input 2 since 2026-10-26** (was 3). The chooser, tally and captions read `ptz_atem_input`; the pages keep their CAM 3 names | **10.23.0.181**:5678, with an unauthenticated HTTP API on :80 that `ptz_web.py` drives |
| FoMaKo UV602 PTZ — **CAM 1** | Camera, added 2026-08-28, ATEM input 1 | **10.23.0.196**:5678, same API |
| JVC GY-HM600 static — **CAM 2** | Fixed, unmanned. **Not on the switcher since 2026-10-26**: both camera inputs are the PTZs "for this moment" (Sam) | Not on the network: it has no network option at all, and its only remote input is LANC. Goes HD-SDI into the switcher |
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
   straight into the HyperDeck's `recordStopToggle` (the ATEM's `recordStartStop` before
   2026-10-26). The Stream key beside it has the guard — two steps,
   arm then fire — and Record does not. This is exactly the 7.6 s gap from 2026-08-23: one
   stray press stops the recording. The record *state* indicator did ship, on both keys,
   so the other half of that fix is in.
2. ~~**Four VW feedbacks never evaluate.**~~ **Fixed 2026-10-26.** The source row's
   highlight built a variable name out of `custom_vh_dest`, which Companion's expression
   parser rejects. VW and the Videohub page now use the bmd-videohub module's own selected
   destination (`select_destination`, `route_source`, and the `selected_*` feedbacks), so
   there is no expression to fail, and both pages share one selection. `vh_dest` is unused.
   After a Companion restart nothing is selected, and an input press then sends nothing:
   checked on the rig by watching the router while pressing one.
3. ~~**The PTZ cannot be cut to from the deck.**~~ **Gone with the 2026-10-26 re-patch**: the
   two PTZs are ATEM inputs 1 and 2 now, and the ATEM page's buses carry inputs 1–7 and Media
   Player 1. Inputs 7 and 8 are not fed by the router.
4. ~~**Two pages depend on scripts that are not backed up.**~~ **Backed up 2026-10-27** in
   `pi/`, passwords swapped for their 1Password entries; refresh with `node tools/pi-backup.js`
   whenever a script on the Pi changes. They still live in a personal Desktop folder on the Pi,
   `/home/samuelbailey/Desktop/AV_Power_scripts`, which every key calls by full path.
5. **The PTZ poll runs at 1 Hz, always.** `trigger-ptz-poll` fires every second whether or
   not anyone is on the PTZ page. The Pi is not struggling (load 0.02, 62 °C, 16% memory,
   3% disk), so this is a tidiness point rather than an urgent one.
6. **Credentials are readable by anyone on the AV LAN.** Companion echoes each module's
   config into its log on connect, passwords included, and both the log and the config
   export are served without authentication. Record where a credential lives, assume
   anything in a Companion connection is visible on this LAN, and keep export files
   somewhere that reflects that.

Found by the manual build on 2026-10-27:

7. **The nightly Companion backup is not running.** `companion-backup.timer` fires at 03:17
   and fails with "Dependency failed": it needs `/mnt/storage`, a USB drive labelled `storage`,
   and none is plugged in. Until one is, the only backups are exports taken by hand.
8. **The PA relay's password is effectively public.** It is the same word as the PP1 iMac's
   account name, which `chrome_tracks.sh` (in this public repo) has to name. Change it on the
   relay and in 1Password.
9. **The grandMA2 connection's password is a short dictionary word.** Change it on the
   lighting PC and in the Companion connection.
10. **Two notes on the rig have gone stale.** The *Sunday pre-service* trigger's note says it
    cuts to input 7; it cuts to input 3 (PP1) since 2026-10-26. The PP1 *Countdown* key's note
    says it starts the ATEM recording; it records on the HyperDeck and starts the stream.
11. **Companion lists 25 surfaces besides the two Stream Decks**: one Service Health deck
    session per browser that has opened the board's Deck tab, and four "timing probe"
    satellites left from testing. Harmless, but the stale ones clutter Surfaces.

## Video routing

**The rack moved into the back on 2026-10-26 and the Videohub was re-patched.** It now sits in
front of the switcher as well as behind it: router outputs 1–6 feed ATEM inputs 1–6, so a
route to OUT 1–6 changes what the switcher sees. The ports, by the labels Sam gave them that
day (read over :9990):

| In | Label | Out | Label |
|---|---|---|---|
| 1 | Aux 1 (ATEM) | 1–6 | ATEM 1–6 |
| 2 | Multiview | 7 | Output 7 (unlabelled) |
| 3 | Aux 2 (ATEM) | 8 | Backwall Projector |
| 4 | Program | 9, 10 | Mini Screen 1, 2 |
| 5, 6 | Input 5, 6 (unlabelled) | 11 | Seetec Mono |
| 7 | Camera 1 | 12 | Output 12 (unlabelled; the off-air test port) |
| 8 | Camera 2 | 13 | Deck Recorder |
| 9–13 | Input 9–13 (unlabelled) | 14 | LED Wall |
| 14 | Words Overlay | 15 | Left Projector |
| 15, 16 | PP1B, PP1 | 16 | Right Projector |

On the ATEM that makes input 1 "Cam 1", 2 "Cam 2", 3 "PP1", 4 "PP1B", 5 "Words Overlay". The
Sunday 10:00 pre-service cut moved from input 7 to 3 the same day. On 2026-10-26 the wall and
both projectors were taking PP1 straight from the router, not from an ATEM aux.

The deck reads these labels live, so renaming a port in Videohub Setup renames its key. VW's
curated keys are by number (`src/vw.js`), so a re-patch means re-running
`tools/switch-page.js`, which refuses a VW page it does not recognise.

Credentials do not go in this file. Record **where** they live — a password manager entry
name — not what they are.

## The ISO problem

The HD8 is the **plain** variant, and the HyperDeck that records since 2026-10-26 takes one SDI
feed, the program — so there is still no second angle. That has a
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
