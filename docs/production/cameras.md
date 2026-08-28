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
| White balance | **Manual 4600K**, locked | Stage light is 4600K. Measured neutral on 2026-08-23 (U 127.7–130.1, V 128.0–131.1 on a white shirt; neutral is 128/128) — the value is right, the job is to *lock* it |
| Auto white balance | **OFF** | The LED wall changes colour constantly and AWB drifts with it |
| Iris / gain | **Manual**, locked | |
| Zebras | **On, 100%** | The white shirt must not trip them |
| Knee / highlight compression | **On** | Anything above ~90 IRE should roll off rather than clip flat |

Better than a 4600K preset: white-balance all of them off the same white card held at the
preaching position, then lock. That matches them *to each other*, which is the actual
problem — see fault 3 in the README.

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
  live.** Out of the box it will be on auto everything.
- **Match it to the existing PTZ off the same white card.** Two cameras of the same model
  matched to each other will cut together far better than either matched to the static
  cameras.

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
