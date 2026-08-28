# Cameras

**Three cameras, none of them manned.** Two are fixed static shots that nobody touches
during a service; one is a PTZ, driven from the Stream Deck's PTZ page. A second PTZ has
been bought and goes in shortly.

That shapes everything below. There is no camera operator to give framing notes to — the
static shots are whatever they were left pointing at, for the whole service, every service.

## Every camera, every week

| Setting | Value | Why |
|---|---|---|
| Output format | **1080p59.94** exactly | Not 29.97, not 1080i59.94, not 60.00. This is one of only two boxes that can be causing the frame doubling — see switcher-atem.md |
| Shutter | **1/120** at 59.94 (1/60 if you ever run 29.97) | 180° equivalent. Never drag it slower to gain exposure — if it needs to, that is a lighting problem |
| Auto shutter | **OFF** | |
| Gain | **0 dB**, manual | The stage has the light for it — see Metered exposure below. Gain is the noise, and there is no reason to be running any |
| Iris | **f/5.6** on the PTZs; match the statics by result, not by f-number | Metered. Also the sharp end of the lens: at f/8 on a 1/2.8" sensor the Airy disk is ~3.7 px wide and the picture is visibly diffraction-softened |
| White balance | **~4640K**, or better a One Push, locked | Metered at the preaching position on 2026-08-28 with a colour meter: **4640K**. That agrees to within 40K — about a tenth of a mired, invisible — with the figure derived independently from the 2026-08-23 recording (U 127.7–130.1, V 128.0–131.1 on a white shirt; neutral is 128/128). Two unrelated methods agreeing is why this number can be trusted |
| Auto white balance | **OFF** | The LED wall changes colour constantly and AWB drifts with it |
| Zebras | **On, 100%** | The white shirt must not trip them |
| Knee / highlight compression | **On** | Anything above ~90 IRE should roll off rather than clip flat |

Better than dialling 4640K in as a number: **One Push** all of them off the same white card
held at the preaching position, then lock. A number matches a camera to the *light*; one
card matches the cameras to *each other*, which is the actual problem — see fault 3 in the
README. The metered 4640K is then the sanity check that the One Push landed right, not the
setting itself.

**Blank the LED wall while you do it.** The wall is behind the subject, so it contributes
rim and floor bounce rather than key — the 4640K above was metered with the wall live and
is demonstrably unaffected — but blanking costs nothing and removes the one variable that
could quietly ruin a One Push on the card.

## Metered exposure

Measured at the preaching position on 2026-08-28 with a colour meter, incident, dome
toward the camera:

| | |
|---|---|
| Colour temperature | **4640 K** |
| Correct exposure | **f/8 at ISO 200, 1/60 s** (358° at 60p) |
| **Therefore, at the mandated 1/120** | **f/5.6 at ISO 200** — half the exposure time is one stop, so open one stop |

**The headline is that no gain is needed.** f/5.6 at base ISO with a 180° shutter means the
stage is comfortably lit, which is the same conclusion the findings file reached by a
different route when it threw out the "very dark stage" claim. Running gain on this rig is
a choice, not a necessity, and it is the easiest noise to remove.

Two ways to get this wrong:

- **Stopping down to tame the LED wall.** The wall is a light you *control* — the VW page
  has a brightness encoder on the NovaStar (`$(novastar:brite)%`). Turn the wall down so it
  sits under the face; do not close the iris and take the face down with it. This is fault 2
  in the README, restated.
- **Leaving the meter's own shutter angle in place.** 358° is roughly 360°, i.e. 1/60 at
  60p — double the motion blur the rig is specified for. It is a metering convenience, not a
  camera setting. Worth noting that 1/60 is also exactly what someone would set believing it
  to be 180°, if they thought the chain ran at 30p; weak evidence, but it points the same
  way as the frame-doubling fault.

The f-number transfers between two PTZs of the same model and **does not transfer** to the
static cameras, which are different glass. Set those by result — face at 65–70 IRE on a
waveform — not by copying f/5.6 across.

**The PTZ is on auto for everything.** Read straight off the camera on 2026-08-28 through
the poller the deck already runs (`ptz_state.py`, surfaced as `$(internal:custom_ptz_state)`):

```json
{"online":"OK","pan":"-10.4°","tilt":"-1.9°","zoom":"57%",
 "focus":"Auto","ae":"Auto","wb":"Auto","backlight":"Off","power":"On"}
```

Auto focus, auto exposure, auto white balance. That is the prediction in this file
confirmed on the actual camera, and it is the most likely single reason PTZ shots do not
cut with the statics. **The PTZ Setup page already has keys for all three** — Exp, WB and
the tracking controls — so switching them to manual is a job on the deck, not in a camera
menu.

**The two static cameras are still unknown.** They are not on the network — both go SDI
straight into the switcher — so nothing about them can be read remotely. White balance
measured stable across the 23rd, so AWB at least appears locked. Iris could not be tested
independently of the shots being differently framed.

## Exposure targets

| Subject | Target | Measured 2026-08-23 |
|---|---|---|
| Face | **65–70 IRE** | 62 IRE median on the sermon close shots |
| White shirt | **~90 IRE** (Y≈215) | 96 IRE, with 79% of it clipped flat at 235 |

Faces are close to right. **The problem is the highlights, not the exposure level.** Do
not stop down — faces would go genuinely dark. Use the knee, and put more light on the
face than the chest.

An earlier version of this note claimed the face was at 49 IRE. That was a bad
measurement — the sample box landed on the speaker's beard and mouth — and the advice it
produced would have made the picture worse. Correction in the findings.

## Framing — the cheap win

Because the static cameras never move, **a badly framed static camera is badly framed all
service, every service.** On 2026-08-23 one of them carried an off-stage black band up to
161 px into frame, appearing on roughly a fifth of sampled shots — that is that camera,
every time it was live.

The corollary is the good news: **frame them once, carefully, and it is fixed permanently.**
That is probably the highest value-per-minute job on this whole list. Worth doing with a
monitor, checking the edges rather than the middle, and checking what the shot looks like
when the speaker walks to the far side of the stage.

For the PTZ:

- **Move it off-air only.** On 2026-08-23 it ran a continuous four-minute zoom live during
  worship. Cut away, reframe, cut back.
- **Use presets.** Recalled off-air they are repeatable week to week and impossible to
  drift. The PTZ page is the natural place for them.
- Tally is **not** wired to the cameras, so nothing on the camera itself shows it is live —
  but the ATEM page on the deck does carry program and preview feedback, so the deck is
  where to look before moving it.

## The second PTZ

Going in soon. Two notes:

- **Set it to manual iris, shutter, white balance, and low noise reduction before it goes
  live.** Out of the box it will be on auto everything — the existing PTZ still is.
  Numbers to start from: 1/120, 0 dB, f/5.6.
- **Match it to the existing PTZ off the same white card.** Two cameras of the same model
  matched to each other will cut together far better than either matched to the static
  cameras, and the f-number does transfer between two of the same model.
- **Leave WDR / DRC off.** With a wall that swings whole-frame luma 42→99, wide-dynamic-range
  modes pump visibly and lift noise while they do it. A flatter gamma is the right lever on a
  PTZ; a true knee is a static-camera control.

## Answered on 2026-08-28

- **The PTZ is a PTZOptics**, driven over VISCA-on-IP at `10.23.0.181:5678`, with a web
  interface on port 80 that the tracking poller uses.
- **Iris, exposure, white balance and focus are all on auto** on that PTZ — see above.
- **Which camera is on which ATEM input**, from the switcher's own labels:
  1 Camera 1, 2 Camera 2, 3 Camera 3, 4 Camera 4, 5 Words Overlay, 6 PP1B, 7 PP1,
  8 Camera 8 — input 8 being the PTZ, per the deck's `ptz_atem_input`.

## TODO(sam)

Everything left needs hands on a camera; none of it is on the network.

- [ ] Makes and models of the two static cameras (and of the second PTZ when it lands)
- [ ] Are iris, gain and white balance manual or auto on each **static** camera?
- [ ] Current shutter speed on each
