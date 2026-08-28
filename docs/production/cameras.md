# Cameras

**Three cameras, none of them manned.** Since 2026-08-28: **two PTZs and one fixed static**,
not the other way round. The second PTZ went in on ATEM input 1 and took the place of a
static camera.

| ATEM input | Camera | Address |
|---|---|---|
| 1 | **CAM 1** — FoMaKo UV602 PTZ | 10.23.0.196 |
| 2 | CAM 2 — fixed static, unmanned | not on the network |
| 3 | **CAM 3** — FoMaKo UV602 PTZ | 10.23.0.181 |

**They are FoMaKo UV602s** (OEM product name `K30NS`), not PTZOptics. An earlier version of
this file said PTZOptics — that was inferred from the Companion module name
`ptzoptics-visca`, which is a generic VISCA module and says nothing about the make. Both
cameras report identical firmware on every component.

That shapes everything below. There is no camera operator to give framing notes to — the
static shots are whatever they were left pointing at, for the whole service, every service.

## Every camera, every week

| Setting | Value | Why |
|---|---|---|
| Output format | **1080p59.94** exactly | Not 29.97, not 1080i59.94, not 60.00. This is one of only two boxes that can be causing the frame doubling — see switcher-atem.md |
| Shutter | **1/125** at 59.94 | 172.6°, the standard film angle. **The PTZs cannot do 1/120** — their 60Hz shutter table is 1/100, 1/125, 1/180 and the 50Hz values are silently remapped onto it whatever the anti-flicker setting, so a request for 1/120 comes back as 1/125. Never drag it slower to gain exposure — if it needs to, that is a lighting problem |
| Auto shutter | **OFF** | |
| Gain | **0 dB**, manual | Gain is the noise. See the exposure section below — whether 0 dB is *achievable* is currently a lighting question, not a camera one |
| Iris | **F5.6** on the PTZs; match the statics by result, not by f-number | Metered, but unverified against a lit face — see below. Also the sharp end of the lens: at F8 on a 1/2.8" sensor the Airy disk is ~3.7 px wide and the picture is visibly diffraction-softened |
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

## Metered exposure, and why it does not currently work

Measured at the preaching position on 2026-08-28 with a colour meter, incident, dome
toward the camera:

| | |
|---|---|
| Colour temperature | **4640 K** |
| Correct exposure | **F8 at ISO 200, 1/60 s** (358° at 60p) |
| **Converted to the 1/125 the camera can actually do** | **F5.6 at ISO 200** — halving the exposure time is one stop, so open one stop |

Both PTZs are set to F5.6, 1/125, 0 dB. **That setting has never been verified against a
correctly lit face, and the one attempt to verify it failed** — see below. Treat F5.6 as
the metered starting point, not as a proven value.

**The shutter is 1/125, not 1/60.** 180° is 1/(2 × frame rate), so 59.94 wants 1/120 and
the camera's nearest is 1/125. 1/60 would be right only at 29.97, and at 59.94 it is a
360° shutter — double the blur. The meter's own 358° reading is not a recommendation: it
is the meter opening the shutter as far as it will go to find exposure in a dim room.

### The face is not lit

Measured on 2026-08-28 with the lighting desk on its **preaching** state and a person
sitting in the chair at the preaching position, LED wall blanked so only stage light fell
on them:

| Iris | Face |
|---|---|
| F5.6 | 6.8 IRE |
| F2.8 | 7.8 IRE |
| **F1.8, wide open** | **10.0 IRE** |
| F1.8 + maximum gain | 64.8 IRE |

The target is 65–70 IRE. **Wide open at no gain the face sits at 10 IRE**, and the only
combination that reaches target is maximum aperture with maximum gain, which is unusably
noisy. With the wall live the face reached about 21 IRE — meaning what light the camera
sees on a face at that spot is mostly **spill from the LED wall behind them**.

**No aperture fixes this. It is a lighting problem**, which is exactly the case this file's
shutter rule anticipates.

**It also contradicts the recording.** The 2026-08-23 file measured lit skin at 62 IRE
across the sermon. Faces cannot land at 62 IRE off a state that meters at 10, so either a
service runs different lighting from the state recalled on the 28th, or the preaching
position under service conditions is not where it was measured. **Resolve that before
changing any aperture** — re-metering against a real service is the check that settles it,
and until then F5.6 stands because it is what a properly lit face would want.

One trap worth keeping: **do not stop down to tame the LED wall.** The wall is a light you
control — the VW page has a brightness encoder on the NovaStar (`$(novastar:brite)%`, and
it was found sitting at 10). Turn the wall down rather than closing the iris and taking the
face down with it.

The f-number transfers between the two PTZs, which are the same model, and **does not
transfer** to the static camera, which is different glass. Set that one by result — face at
65–70 IRE on a waveform — not by copying F5.6 across.

### Both PTZs were on auto, and are now manual

Read off the cameras on 2026-08-28. Both were on **auto exposure, auto white balance and
auto focus** — the prediction in this file, confirmed on the hardware. Both are now:

| | |
|---|---|
| Exposure | **Manual** |
| Shutter | **1/125** |
| Iris | **F5.6** |
| Gain | **0 dB** |
| White balance | **4600K fixed** |
| Focus | **Auto** — deliberately left, it is the one auto worth keeping |

Their full configurations were dumped and diffed group by group. **Twenty-five settings
differed; they now differ in three**, all of them intended: the two device names
(`CAMERA-1` and `CAMERA-2`), the NDI name that derives from the device id, and one inert
register. Re-run that diff after any change — it is the only way to be sure they still cut
together.

CAM 1 also had four things simply wrong, which are fixed: it was outputting **4K at 30 fps**
into a 1080p59.94 switcher, running **50Hz anti-flicker** in a 60Hz country, had
**auto slow-shutter on**, and carried **noise reduction at 8/8** against CAM 3's 2/4.

**The remaining static camera is still unknown.** It is not on the network — it goes SDI
straight into the switcher — so nothing about it can be read remotely. White balance
measured stable across the 23rd, so AWB at least appears locked.

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

## Adding another camera

The second PTZ went in on 2026-08-28. What it needed, in order, for next time:

- **Check the output format first.** CAM 1 arrived set to **4KP30** and went straight onto
  ATEM input 1 like that. Set `emVoutFormat` to `1080P59.94` and `VideoIn.nFrameRate` to 60
  before anything else — changing the output format restarts the camera's video pipeline and
  drops every other write made in the same minute.
- **Set it to manual iris, shutter, white balance and low noise reduction.** Out of the box
  it is on auto everything. Numbers: 1/125, F5.6, 0 dB, 4600K.
- **Then dump both cameras and diff them.** Guessing at parity does not work; twenty-five
  settings differed on arrival and several were invisible from the UI.
- **Sweep its moiré band** — it will not be the same as the other camera's.
- **Save its presets last**, after the exposure is right, or they capture the auto settings.
- **Leave WDR / DRC off.** With a wall that swings whole-frame luma 42→99, wide-dynamic-range
  modes pump visibly and lift noise while they do it. A flatter gamma is the right lever on a
  PTZ; a true knee is a static-camera control.

## A preset carries its exposure with it

**This is the one that silently undoes everything else.** On these cameras a preset stores
the exposure and white balance settings alongside the pan, tilt and zoom. Recall a preset
and the camera is put back to whatever those settings were when the preset was saved.

Proved on 2026-08-28: the camera was set to Manual / 1/125 / F5.6 / 0 dB / 4600K, preset 2
was recalled, and it came back Auto / 1/180 / F1.8 / 1 / Auto. Every preset on CAM 3 had
auto-everything baked in, because they were all saved before the cameras were set to
manual.

**So: after changing exposure or white balance, re-save every preset.** Recall it, re-apply
the settings, save it back. The position is preserved because the recall put the camera
there. All six presets on CAM 3 were re-saved this way on the 28th and now recall as
Manual / 1/125 / F5.6 / 0 dB / 4600K. CAM 1 has no presets saved, so anything saved on it
from now on captures the manual settings automatically.

The failure mode if this is skipped: everything looks right at the desk, then the first
preset an operator presses in the service quietly puts that camera back on auto, and
nothing on the deck says so.

## Moiré on the LED wall

The rainbow interference across the wall is **moiré** — the camera's sensor grid beating
against the wall's pixel pitch. It appears in a narrow band of zoom positions and is clean
either side.

Measured by sweeping the zoom range and taking the high-frequency chroma energy over the
wall, on static content:

| | Moiré band | Clean |
|---|---|---|
| **CAM 3** (10.23.0.181) | **52%–60% zoom** | below 50%, above 62% |
| **CAM 1** (10.23.0.196) | **56%–60% zoom** | below 52%, above 65% |

Inside the band it measures 10–25× the clean level, and it is unmistakable on screen. The
bands differ between the two cameras because they sit at different distances and angles to
the wall — **each camera has its own band, and a new camera needs its own sweep.**

**Zoom is the only lever that works.** Tested and found to do nothing:

- **Sharpness** — swept 0 to 15, moiré moved from 1.549 to 1.498. No effect.
- **Shutter** — swept 1/60 to 1/250 against static content; all within noise of each other.
- **Wall brightness** — swept 30 to 90 and got no consistent trend.

Do not spend time on those three. Frame outside the band instead.

**CAM 3's preset 4 "Stage" was sitting at 57%**, dead centre of its band, which is why the
wall rainbowed on the shot most likely to be used. It was moved to 62% and re-saved; it
measures 0.20 where it measured 2.14. All five presets now read clean on a worship
background.

## Reading and setting these cameras

The web UI is only a front end for an HTTP API that needs **no authentication at all** on
the AV LAN:

```bash
# read everything
curl -s -X POST 'http://10.23.0.181/ajaxcom?szCmd={"GetEnv":{"VideoParam":{"nChannel":0}}}'
# what model, and the video output format
curl -s -X POST 'http://10.23.0.181/ajaxcom?szCmd={"GetEnv":{"SysAttr":{"nChannel":-1}}}'
curl -s -X POST 'http://10.23.0.181/ajaxcom?szCmd={"GetEnv":{"VideoOut":{"nChannel":-1}}}'
```

Groups worth knowing: `SysAttr`, `VideoOut`, `VideoIn`, `VideoParam`, `MonoTracking`,
`ArmPtz`, `NetWork`. `{"QueryState":{"QueryVersion":{}}}` returns the component firmware
versions.

**Two traps in the write path**, both of which cost a pass on the 28th:

1. **`SetEnv VideoParam` takes an ARRAY**, not an object:
   `{"SetEnv":{"VideoParam":[{"stExp":{...},"nChannel":0}]}}`. Send an object and it
   returns `{"nRetVal":0}` — success — and does nothing at all.
2. **`antiflicker` is only writable in auto exposure mode.** Set it before switching to
   manual, or dip back to auto to change it.

Always read the value back after writing. Both cameras' full configuration can be dumped
and diffed this way, which is how they were proved identical.

## TODO(sam)

Everything left needs hands on the equipment; none of it is on the network.

- [ ] **Why does the preaching lighting state put nothing on a face?** See the exposure
      section — this is the biggest open image-quality question on the rig.
- [ ] Make and model of the remaining static camera on ATEM input 2
- [ ] Are iris, gain and white balance manual or auto on that static camera?
- [ ] Its shutter speed, which should read 1/125 at 59.94
