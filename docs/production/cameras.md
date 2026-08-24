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

**TODO(sam): are they currently manual or auto?** White balance measured stable across the
23rd, so AWB at least appears locked. Iris could not be tested independently of the shots
being differently framed. PTZs in particular ship with everything on auto, and that is
most of why PTZ footage tends to look worse than the cameras beside it.

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

## TODO(sam)

- [ ] Makes and models: the two static cameras and both PTZs
- [ ] Are iris, gain and white balance currently manual or auto on each?
- [ ] Current shutter speed on each
- [ ] Which camera is on which ATEM input
