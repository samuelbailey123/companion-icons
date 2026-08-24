# Cameras

Two manually-operated cameras plus one controllable PTZ, driven from the PTZ page. Output
is locked to 1080p and staying there — the goal is making 1080p look good, not chasing
resolution.

## Every camera, every week

| Setting | Value | Why |
|---|---|---|
| Output format | **1080p59.94** exactly | Not 29.97, not 1080i59.94, not 60.00. A mismatch anywhere in the chain is what produces the duplicated frames. Check the camera menu directly — the ATEM's input display can show the *converted* format, not the native one |
| Shutter | **1/120** at 59.94 (1/60 if you ever run 29.97) | 180° equivalent. Never drag it slower to gain exposure — if it needs to, that is a lighting problem |
| Auto shutter | **OFF** | |
| White balance | **Manual 4600K**, locked | Stage light is 4600K. Measured neutral on 2026-08-23 (U 127.7–130.1, V 128.0–131.1 on a white shirt; neutral is 128/128) — the current setting is right, the job is to *lock* it |
| Auto white balance | **OFF** | The LED wall changes colour constantly and AWB drifts with it. This is most of what makes multicam footage feel unstable |
| Iris / gain | **Manual**, locked | |
| Zebras | **On, 100%** | The white shirt must not trip them |
| Knee / highlight compression | **On** | Anything above ~90 IRE should roll off rather than clip flat |

Better than a 4600K preset: white-balance every camera off the same white card held at the
preaching position, then lock. That matches them *to each other*, which is the actual
problem — see fault 3 in the README.

## Exposure targets

| Subject | Target | Measured 2026-08-23 |
|---|---|---|
| Face | **65–70 IRE** | 62 IRE median on the sermon close shots |
| White shirt | **~90 IRE** (Y≈215) | 96 IRE, with 79% of it clipped flat at 235 |

Faces are close to right. **The problem is the highlights, not the exposure level.** Do
not simply stop down — faces would go genuinely dark. Use the knee, and put more light on
the face rather than the chest.

An earlier version of this note claimed the face was at 49 IRE and 47 IRE below the
shirt. That was a bad measurement (the sample box landed on his beard and mouth) and the
advice it produced — stop down — would have made the picture worse. Full correction in
the findings.

## Framing

- Engage pan/tilt locks when the shot is static.
- Hold a locked frame for at least 10 seconds. Constant micro-reframing is more
  distracting than a slightly imperfect static frame.
- Keep the off-stage black edge out of shot — it intruded up to 161 px into frame on some
  shots on 2026-08-23.
- **Move the PTZ off-air only.** On 2026-08-23 it ran a continuous four-minute zoom live
  during worship. Cut away, then reframe. PTZ presets recalled off-air are safer than live
  joystick moves and make framing repeatable week to week.

## TODO(sam)

- [ ] Makes and models of the two manned cameras
- [ ] PTZ make and model (~$500 tier), and whether it records to SD or publishes RTSP/NDI
- [ ] The actual menu values currently set on each, so they can be diffed against the table
- [ ] Which camera is on which ATEM input
