# Audio — Allen & Heath SQ7

Driven from the SQ7 page: DCA 1–8 across row 1 with level and mute state, plus the
Stream / Foyer / MAIN readouts on the touchstrip. The DCAs are what a service is actually
mixed on.

## Targets

| | Target | Measured 2026-08-23 |
|---|---|---|
| Integrated loudness | **−14 LUFS** | −8.0 / −11.8 / −9.5 across the three files |
| True peak | **−1.5 dBTP**, never above | +1.8 / +1.4 / **+3.5** dBTP |
| Speech loudness range | ~8–11 LU | 13.2 LU on the sermon — too wide |

All three files exceeded 0 dBFS, so **real distortion is baked into the recording** — the
decoded audio reaches ±1.367 on file 03. Post cannot undo that.

Being 6 LU hot buys nothing. Every platform normalises it back down and you keep the
distortion.

## The stream is affected too

**The livestream and the recording come off the same audio path.** So the +3.5 dBTP
clipping measured on the 23rd did not just land in the recording — it went out live as
well, and everyone watching heard it.

That raises the priority of the limiter: it is not a post-production convenience, it is
the only thing standing between a hot desk and distortion reaching the congregation
online. It also means one fix covers both outputs.

## At the desk

- Pull the feed to the recorder down about **6 dB**.
- Put a **limiter at −1.5 dBTP** on that feed so nothing can reach 0 dBFS.
- More compression on the pulpit mic — 13.2 LU of range is too wide for speech.
- Check the SQ7's output meters are not pinned. If they are, the problem is upstream of
  the recorder and the limiter is only hiding it.

## Note for post

Encoding to AAC adds roughly **0.8 dB** of true peak. Audio measuring −1.1 dBTP going in
comes out at −0.3. The post pipeline limits to −2.5 dBFS before the encoder to absorb
this — see `Services/_tools/02-grade-join.sh` on the media drive.

## TODO(sam)

Attempted on 2026-08-28 and not answerable: the SQ7 was powered down, and in any case
Companion's SQ module publishes DCA and matrix levels but nothing about output routing or
insert processing. Both of these need the desk itself.

- [ ] Which SQ7 output feeds the recorder, and at what level
- [ ] Is there a limiter on that path already?
