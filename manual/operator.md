# Operator Guide

How to run a Sunday from the Stream Deck, and what to do when something does not work. You do not
need to know how any of it is built: that is the Reference and the Recovery Guide.

## What you are driving

| | Where | What it is for |
|---|---|---|
| **The deck** | The Stream Deck + XL at the desk, and the smaller Stream Deck + beside it | Every control: switcher, cameras, slides, lights, sound, screens, power |
| **The board** | The booth screen, or **http://production/** on any device on the AV network | One verdict ("Ready for 10:30", "2 things need attention") and what to do about each problem. Its **Deck** tab is the same Stream Deck on an iPad |
| **Companion** | **http://10.23.0.242:8000** | The software behind the deck. Look, don't edit, unless the Recovery Guide sends you there |

All three only work on the **AV network** (the church's production LAN, addresses starting
`10.23.0.`). Church Wi-Fi is not enough.

## How the deck is laid out

- **The top row is the folder row**, the same on every page: **Home, Power, PP1, MA2, ATEM, SQ7,
  VW, PTZ, System**. Press one to jump there.
- **The three rows under it are keys.** Below them is **the touchstrip** (readouts), and under
  that **six knobs** that turn and press.
- **Some keys open a sub-page** that has no folder-row key of its own:
  - Home → **Dante** (is every microphone reaching the desk?), also from SQ7
  - PP1 → **Tracks** (walk-in music)
  - VW → **Videohub** (every router output and input; **Back** returns to VW)
  - PTZ → **CAM 1**, **CAM 3**, their **Setup** pages, and **Worship** / **Sermon** (both cameras
    on one page)
- **Colours mean the same thing everywhere:** green is on, running or healthy; red is live,
  recording or a fault; amber is a warning (a route down, no card); grey is off or idle.
- **The deck comes back on the page it was left on** after a restart, so check which page you are
  on before pressing anything.

{{page-map}}

The Home page, where the deck should be left:

{{grid:1}}

## What happens on its own on a Sunday

Companion runs these at the times shown; you do not press anything. The board's "Run" card shows
the same list with a tick as each one lands.

| Time | What happens |
|---|---|
| **8:05** | Projectors and PA power **on** (never off: this only ever switches on) |
| **10:00** | Walk-in music starts on the PP1 iMac. ProPresenter shows **Pre-Service** and the switcher cuts to **PP1** |
| **10:00:20** | If Pre-Service did not start, it is fired once more |
| **10:24:57** | **Countdown** plays; the router puts **Program** on the recorder; the **HyperDeck starts recording**; the **stream starts** |
| **10:29:56** | Walk-in music fades out over four seconds and pauses |

**What still needs a person:** ending the stream and the recording after the service, cameras,
cuts, slides, lights and the mix, and powering down.

## Before the service

Work down this list from about 9:30.

1. **Look at the board.** It should say *Ready for 10:30* with everything green. Anything it lists
   under *needs attention* comes with what to do about it; do that first.
2. **Home page:** Projectors and PA green. If not, see *Power* below.
3. **Recording:** the **Record** key on Home shows the hours left on the card. **NO CARD** in amber
   means there is no SD card in the HyperDeck: put one in (format it in the deck) before 10:24.
4. **Dante** key on Home is green. Red means a microphone source is not reaching the desk: open it
   and see which.
5. **Cameras:** press **PTZ**, check both cameras answer (their pan/tilt/zoom readouts move when
   you nudge). Put each on its first preset.
6. **Slides:** ProPresenter is on the Sunday Service playlist.
7. **Lights:** MA2 page, the opening look is ready.
8. Go back to the **Home** page and leave the deck there.

The full engineering checklist (camera formats, exposure, audio levels) is in the Reference,
*Checklists*. It is for setting the rig up, not for every Sunday.

## During the service

### Switching (ATEM page)

{{grid:5}}

- **Top row: what is on Program** (live). **Second row: Preview** (next). Press a Preview key to
  choose the next shot, then **CUT** (instant) or **AUTO** (a mix).
- The keys are captioned with the switcher's own input names (Cam 1, Cam 2, PP1, ...).
- **Stream** has a two-step guard: press once to arm, again to fire. It starts by itself at
  10:24:57; you only need it to **stop** the stream at the end.
- **Record** starts and stops the HyperDeck. It turns red and counts while recording. One press
  stops it, so leave it alone until the service is over.

### Cameras (PTZ page)

{{grid:9}}

The Worship page, both cameras side by side:

{{grid:15}}

- The PTZ page is a **chooser**: pick **CAM 1** or **CAM 3** for one camera, or **Worship** /
  **Sermon** for both side by side.
- **Preset keys** (1 Wide, 2 Stage, ...) move the camera to a saved shot. **Only move a camera
  that is not live**: cut away first. A camera key turns **red and says LIVE** while it is on
  Program.
- To save a new shot: press **Save** (it arms), then the preset key to save into.
- The knobs pan, tilt, zoom and focus. Pressing a knob stops it.
- Do not change white balance on the cameras: it is set by hand and stays put.

### Slides (PP1 page)

{{grid:3}}

- **Next / Previous** step the slides. **Clear** keys clear one layer (audio, messages, props,
  announcements, slide, media, video inputs); **Clear All** clears everything.
- **Freeze Slide** holds the audience screens and the stream overlay on the current slide while
  you work ahead; **All Screens** releases it.
- **Hosting / Speaker / Worship** set and start the stage timers (7, 45 and 25 minutes). The
  touchstrip shows them; the knobs add or take a minute.
- **Tracks** opens the walk-in music page: play/pause, skip, fade out, and a volume knob.

### Sound (SQ7 page)

{{grid:6}}

- DCA 1–8 across the top with their level and mute state. **Mute DCAs** mutes them together.
- The touchstrip reads the Stream, Foyer and Main levels.

### Lights (MA2 page)

{{grid:4}}

- Executors 101–109 across the top, **Go Next / Go Back / BLACKOUT** below, four knobs on the
  bottom row.

### Screens (VW page)

{{grid:7}}

- Tap a **destination** (a screen) to select it, then a **source** to send there. **Videohub**
  opens every router port. The knob sets the LED wall's brightness.
- Routes to router outputs **1–6 change what the switcher sees** (they feed ATEM inputs 1–6), so
  do not use the Videohub page during a service unless you mean to.

## After the service

1. **Stop the stream:** ATEM page, **Stream**, press twice.
2. **Stop the recording:** **Record** (Home or ATEM). It goes back to showing hours left.
3. **Power page:** Projectors off, PA off.
4. Hand the SD card to whoever edits, or leave it in the HyperDeck as agreed.
5. Write anything that went wrong in a note for the team (what, when, which page).

## When something is wrong

| What you see | What to do |
|---|---|
| A key does nothing, or a page's readouts are blank | The device behind it is off or has a new address. Check the board: it names the device. Power it on; if it is on and still blank, see *Addresses* in the Recovery Guide |
| The whole deck is dark or frozen | Companion is restarting (it **updates itself**, sometimes on a Sunday). Wait two minutes. If it does not come back, unplug and replug the deck's USB; then see *The Pi* in the Recovery Guide |
| Board says the switcher is down | Check the ATEM in the rack has power. Cuts can still be made on its front panel |
| Recording did not start at 10:24:57 | Press **Record** on Home. If it shows **NO CARD**, there is no SD card: put one in |
| Stream did not start | ATEM page, **Stream**: press, then press again |
| Projectors or PA did not come on | **Power** page: press the key; it works out from the gear's own state whether to switch on or off. If nothing changes, the power relay or projector is unreachable: switch it on by hand |
| Walk-in music silent | **Tracks** page, **Play / Pause**. If that fails, play it on the PP1 iMac directly (YouTube Music in Chrome) |
| A camera does not move | Is it LIVE? Then it is fine: cut away first. Otherwise check its readouts: if they are red the camera is not answering. Check it has power |
| Slides do not advance | Is ProPresenter running on the PP1 iMac? Advance it there |
| Dante key red | A microphone receiver or computer is missing from the audio network. Open the Dante page: the red key names it |

If nothing here helps: **every device has its own front panel or app.** The deck is a convenience,
not the only way in. The Reference lists every device and its address.
