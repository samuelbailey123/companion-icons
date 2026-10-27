# Start here
Lead: Most of a Sunday runs itself. This guide is what you look at, what you press, and what to do when something is not right.

The rig is driven from a **Stream Deck + XL** at the booth, through **Companion**, which runs on a small computer (a Raspberry Pi) in the rack. Every key on the deck is a Companion key; the same keys are on the iPad at **http://production/deck**.

Before you touch the deck, look at the **Service Health board** on the booth screen, or at **http://production/** on any device on the church network. It gives one verdict ("Ready for 10:30", "2 things need attention", "Service is running") and says what to do about each problem. If the board is happy, the rig is happy.

## How the deck is laid out

The top row is the same on every page: it opens the other pages (Home, Power, PP1, MA2, ATEM, SQ7, VW, PTZ, System). The deck stays on whichever page it was left on, even after a restart.

{{page 1}}

The two bottom rows on most pages are the **touch strip** (readouts you can tap) and the **dials** (turn to adjust; most do nothing when pressed).

## What the colours mean

| Colour | Means |
|---|---|
| Green | On, healthy, or the thing you have selected |
| Red | Off, or **live** — on air, recording, on Program |
| Amber / orange | Needs attention: not answering, armed and waiting for a second press, or no recording card |
| Yellow | Mixed: some of a group on and some off |
| Slate grey | Resting, or away on purpose (a laptop that is not here today) |

> When a key does not change colour after you press it, the device did not do it. Do not keep pressing: read the board.

# A Sunday, minute by minute
Lead: The Stream Deck does the Sunday sequence on its own. Your job is to check it happened, and to stop the stream and the recording afterwards.

## What happens on its own

| Time | What the rig does |
|---|---|
| **8:05** | Projectors and front-of-house speakers turn **on**. This can only turn things on, never off. |
| **10:00** | ProPresenter plays **Pre-Service** (item 1 of the "Sunday Service" playlist) and the switcher cuts to **PP1**. Walk-in music starts on the PP1 iMac. |
| **10:00:20** | If ProPresenter is not showing Pre-Service, the deck fires it again. |
| **10:24:57** | ProPresenter plays the **Countdown** (item 3). The recorder is fed Program, the **HyperDeck starts recording**, and the **ATEM starts the stream**. |
| **10:29:56** | Walk-in music fades out over four seconds and pauses. |
| **10:30** | Service. |

Each line is a Companion trigger; the Reference's Triggers chapter shows exactly what each one sends.

> **Nothing stops on its own.** After the service, stop the stream and the recording yourself (see "After the service").

## Your morning, in order

1. **Read the board.** It should say "Ready for 10:30". Fix anything it lists first.
2. **Check the recorder has a card.** The Record key on Home shows the time left on the card. Amber **NO CARD** means put an SD card in the HyperDeck, and make sure **Remote** is on on its front panel.
3. **Check the Dante key on Home is not red.** Red means a microphone receiver or computer the desk needs is not reaching it. Open it to see which.
4. **Check ProPresenter's "Sunday Service" playlist.** The deck plays items **by position**: Pre-Service must be item 1 and the Countdown item 3. Do not add items above them.
5. **Leave the deck on Home** so you can see Program, Preview, Stream and Record at a glance.

# During the service
Lead: The pages you will use, and the one rule for each.

## Cutting cameras: the ATEM page

Top row is **Program** (what is live), the row below is **Preview** (what is next). Press a Preview key, then **CUT** (instant) or **AUTO** (a dissolve).

{{page 5}}

| ATEM input | Is |
|---|---|
| 1 | CAM 1, the PTZ at 10.23.0.196 |
| 2 | CAM 2, the PTZ at 10.23.0.181 (its deck pages are named "CAM 3") |
| 3 | PP1, ProPresenter |
| 4 | PP1B |
| 5 | Words Overlay |

## Moving cameras: PTZ, Worship and Sermon

The **PTZ** folder opens a chooser. **Worship** and **Sermon** put both cameras side by side, with their presets, tracking and framing. The dials pan, tilt and zoom.

{{page 15}}

> **Never move a camera that is on Program.** Cut away first, move it, then cut back. Hold a locked shot at least ten seconds.

## Slides and timers: the PP1 page

{{page 3 r1c8,r2c7,r2c6,r2c3}}

- **Freeze Slide** holds every audience screen (and the stream's words) on the current slide; **All Screens** releases it.
- **Speaker 45 min**, **Worship 25 min** and **Hosting 7 min** set and start ProPresenter's timers; the strip shows them, and the strip keys add or take away a minute.
- **Pre-Service** and **Countdown** are the same as the Sunday automation, if you ever need to fire them by hand. **Countdown also starts the recording and the stream.**

## Walk-in music: the Tracks page

Open it from **Tracks** on the PP1 page. Previous, Play/Pause, Skip, **Fade Out**, and a volume dial. The music is YouTube Music in Chrome on the PP1 iMac.

{{page 14}}

## Screens and the LED wall: the VW page

Press a **destination** (top row: projectors, LED wall, backwall, mini screen), then a **source** (Program, Aux 1, Aux 2, Multiview). The strip shows what each screen has; the dial sets the LED wall's brightness. **Video hub** opens every port on the router.

{{page 7}}

> The router also feeds the switcher's inputs 1–6. On the Videohub page, routing to **ATEM 1–6** changes what the switcher sees: do not touch those during a service.

# Stream and record
Lead: Both start on their own at 10:24:57. Here is how to read them, start them by hand, and stop them.

## The keys

They are on **Home** (row 3) and on the **ATEM** page (bottom left).

| Key | Shows | To start or stop |
|---|---|---|
| **Stream** | Red **ON AIR** with the time while streaming | **Two presses.** The first arms it (amber "GO LIVE?"), the second starts or stops the stream. |
| **Record** | Red with the running time while recording; idle, the time left on the card; amber **NO CARD** with no card | **One press.** There is no second step. |

> **The Record key stops the recording on a single press.** That is how a 7.6-second gap got into the 2026-08-23 recording. Do not press it during a service unless you mean to stop.

## If they did not start

1. Look at the board: it shows recording and streaming state.
2. **Record:** press it once. It turns red and counts up.
3. **Stream:** press it twice. It turns red, **ON AIR**.
4. Or press **Countdown** on the PP1 page, which does both, plus the countdown video, but only if the countdown has not played yet.

# After the service
Lead: Stop the stream, stop the recording, power down.

1. **Stream:** press twice. The key loses its red **ON AIR**.
2. **Record:** press once. The key shows the time left on the card again.
3. **Power** page: turn **Projectors** and **PA** off when the room is done. Each key goes red once its devices confirm they are off. Orange means a device did not answer: press again, or check it is powered.
4. Leave the deck on **Home**.
5. Getting the recording off the card and into post is the "Post-service" checklist at the back of this guide.

# When something is wrong
Lead: Find the symptom, do the first thing in the row, and only then the next.

| You see | First | Then |
|---|---|---|
| Board says a device is down | Check it is powered on and its network cable is in | Its address may have changed: see "Addresses drift" in the Reference |
| Projectors or PA key is **orange** | Wait a minute: each press retries several times and waits for the device to confirm. Then press again | Check the projector or the speaker power switch has power and network |
| Record shows **NO CARD** | Put an SD card in the HyperDeck; turn on **Remote** on its front panel | Format the card in the HyperDeck |
| Recording did not start at 10:24:57 | Press **Record** once | Check the board's recording card |
| Stream did not start | Press **Stream** twice | Check the ATEM's internet cable; the stream key lives in the ATEM |
| Pre-Service did not play at 10:00 | PP1 page → **Pre-Service** | ATEM page → cut to **PP1** |
| Walk-in music silent | Tracks page → **Play / Pause** | On the PP1 iMac, check Chrome is open on YouTube Music and signed in |
| **Dante** key is red | Open it: the red source is the missing one | Turn that receiver or computer on, or check its network cable |
| A screen shows the wrong thing | VW page: destination, then source | Videohub page shows every port |
| A camera will not move | Its CAM page: is the strip showing values? | Board: is the camera "Awake"? Power-cycle the camera |
| Lights do not respond | Is the lighting PC on? (board: Lighting desk) | Its address changes with DHCP: see the Reference, Connections |
| The whole deck is dark or frozen | Unplug the deck's USB and plug it back in | Open **http://10.23.0.242:8000** on a computer: if Companion does not load, the Pi needs a power cycle |
| Everything on the board is red at once | The network switch or the rack's power | — |

> **During a service, change nothing on the rig that you do not have to.** No imports, no trigger edits, no restarts. Fix after the recording ends.

> Companion **updates itself** when a new version is out, and restarts while it does. If the deck drops out for a minute on its own, that is probably why; it comes back on the page it was on.
