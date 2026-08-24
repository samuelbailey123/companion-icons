# Checklists

## Pre-service

The first block matters most — every item in it is destroyed at capture if you get it
wrong, and no amount of post fixes it.

### Format — do this first

- [ ] Every camera menu reads `1080p59.94` (check the camera, not the ATEM display)
- [ ] ATEM video standard reads `1080p59.94`
- [ ] Recorder **input** format reads `1080p59.94`
- [ ] Recorder **record** format reads `1080p59.94`
- [ ] Any converter / scaler / extender in the path is 59.94

**Then prove it.** Record 10 seconds and run:

```bash
ffmpeg -i test.mp4 -an -filter_complex \
  "[0:v]split=2[a][b];[b]trim=start_frame=1,setpts=PTS-STARTPTS[b2];[a][b2]psnr" \
  -f null - 2>&1 | tail -3
```

Then read the per-frame log. **Good:** consecutive-frame PSNR is roughly even.
**Bad:** it alternates high/low with a gap of 10 dB or more — that is every second frame
carrying no new picture, and it is what is wrong today.

### Cameras

- [ ] Shutter `1/120`, auto-shutter off, on all cameras
- [ ] White balance manual `4600K`, AWB off — better, white-card them all off the same
      card at the preaching position
- [ ] Iris and gain manual on all cameras
- [ ] Zebras at 100% — the white shirt must not trip them
- [ ] Knee / highlight compression enabled
- [ ] Pan/tilt locks engaged on static shots
- [ ] The off-stage black edge is out of frame on every camera

### Audio

- [ ] SQ7 output meters not pinned
- [ ] Feed to the recorder pulled down ~6 dB
- [ ] Limiter engaged at −1.5 dBTP on the recorder feed
- [ ] Pulpit mic compression increased

### Recording and control

- [ ] Seamless file splitting confirmed on
- [ ] Enough space on the media, and the media is healthy
- [ ] `node tools/rig.js export` run, so there is a current Companion backup
- [ ] Deck is on the page you want to start from (it resumes wherever it was left)

### Operators

- [ ] Move the PTZ **off-air only** — cut away before reframing
- [ ] Hold locked frames at least 10 seconds; do not micro-reframe
- [ ] Face is the priority for light and focus, not the chest

### Last thing

- [ ] Record 10 s and confirm the white shirt still holds fabric detail

---

## Post-service

### Getting the files off

- [ ] Copy the recorder files to `Services/YYYY-MM-DD/originals/` on the media drive
- [ ] Name them `YYYY-MM-DD Sunday Service NN.mp4`
- [ ] **Never modify anything in `originals/`** — every later step reads from it
- [ ] Note any stops or restarts during the service, and roughly when

### Run the pipeline

Scripted at `Services/_tools/` on the media drive; its README explains each step and why.

```bash
./01-fix-source.sh YYYY-MM-DD   # de-duplicate frames, normalise loudness
./02-grade-join.sh ...          # lift the face, dissolve any recording gap
./03-title-card.sh ...          # 3s card into a 1.5s dissolve
./04-transcribe.sh ...          # whisper transcript, for chapters and clips
./05-clips.sh ...               # 16:9 and 9:16 clips
python3 cover.py                # thumbnail
python3 cover.py card.png 1.5   # title card
```

Each script prints a verification command when it finishes. **Run them.**

### Before uploading

- [ ] Loudness reads −14 LUFS integrated, true peak under −1.5 dBTP
- [ ] Full decode is clean: `ffmpeg -v error -i final.mp4 -f null -`
- [ ] Opening title card and dissolve look right
- [ ] Any recording gap is covered by a dissolve, not a jump cut
- [ ] Chapter times match the file being uploaded — the title-card version is ~3 s offset
      from the no-card master

### Write down what went wrong

Anything noticed during the service — a stop, a bad cut, a camera that drifted — goes in
`docs/production/findings/YYYY-MM-DD.md`. That file is what makes next week better.
