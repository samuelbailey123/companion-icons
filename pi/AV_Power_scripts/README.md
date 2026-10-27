# AV Power Scripts

![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)

One-click power control for the sanctuary AV system: the three Panasonic
projectors and the FOH speakers. Four double-clickable scripts live on the
Desktop:

| Script | What it does |
|---|---|
| `Projectors ON.command` | Powers on all three projectors |
| `Projectors OFF.command` | Puts all three projectors into standby |
| `Speakers ON.command` | Switches on all four FOH speaker outlets |
| `Speakers OFF.command` | Switches off all four FOH speaker outlets |

Each opens a Terminal window, shows a per-device log, and ends with a clear
summary. Success is only declared when every device **confirmed** its new
state — not just when the commands were sent.

## The hardware

| Device | Model | IP | Notes |
|---|---|---|---|
| Projector 1 | Panasonic PT-DW740 | 10.23.0.112 | Status page reports SELF TEST: Error — worth checking |
| Projector 2 | Panasonic PT-DW740 | 10.23.0.234 | |
| Projector 3 | Panasonic PT-EW630 | 10.23.0.80 | Flaky web UI; native control ports respond fine |
| FOH speakers | DLI DIN relay (web power switch) | 10.23.0.250 | Outlets 5–8: Left Main, Left Sub, Right Main, Right Sub |

## How it works

The web pages you normally log into are just front-ends — every button on
them fires a plain HTTP or TCP request. The scripts skip the browser and
issue those requests directly:

- **Projectors** — Panasonic's native NTCONTROL protocol (TCP 1024) as the
  primary channel, with standards-based PJLink (TCP 4352) as an automatic
  fallback. All three projectors are driven in parallel. This is why the
  flaky web server on 10.23.0.80 doesn't matter: its native ports answer
  instantly, so no more refreshing and waiting.
- **Speakers** — the DLI relay's outlet endpoints
  (`/outlet?5=ON` … `/outlet?8=OFF`), switching only the four speaker
  outlets. Unused outlets 1–4 are never touched. State is verified by
  reading back the relay's live outlet bitmask.

Everything retries up to 6 times with backoff and then polls the device
until it reports the requested state (projector warm-up/cooling count as
success — the projector finishes those on its own).

Full wire-level details are in [PROTOCOLS.md](PROTOCOLS.md).

## Command-line use

```bash
cd ~/Desktop/"AV Power Scripts"
python3 projector_power.py on|off|status|state
python3 speaker_power.py on|off|status|state
```

`status` is always read-only and safe. Exit code 0 = every device
confirmed; 1 = at least one didn't (see the log for which).

`state` is a machine-readable variant of `status` for automation
(Bitfocus Companion polls it into a button-color variable): it prints
exactly one bare token — `on`, `off`, `mixed`, or `unreachable` — with
no newline and no log lines, and always exits 0. It is single-shot with
a short timeout; the poller supplies the retries.

## Credentials

Logins are hardcoded at the top of each script (they are fixed on the
devices): the projectors' web-control account in `projector_power.py`, the
relay's account in `speaker_power.py`. If a device password is ever changed,
update the `USERNAME` / `PASSWORD` constants in the matching script.

## Tests

Both suites run entirely against local mock devices — they never touch the
real hardware:

```bash
cd ~/Desktop/"AV Power Scripts"
python3 -m unittest                # 88 tests, 100% passing
python3 -m coverage run -m unittest && python3 -m coverage report   # 100%
```

## Troubleshooting

- **"gave up after 6 attempts"** — the device is unreachable: check mains
  power and the network cable/switch. Run the matching `status` command to
  see which unit and channel is failing.
- **"authentication failed" / HTTP 401** — the device's password changed;
  update the constants at the top of the script (see Credentials).
- **The 10.23.0.80 web page still times out in a browser** — expected; its
  embedded web server is slow. The scripts don't use it.
- **Projectors won't power off right after powering on** — lamps need to
  finish warm-up first; the retries usually ride this out, but if a run
  fails, wait a minute and run it again.
- **Speakers script reports an outlet stuck** — check the relay's own web
  page (http://10.23.0.250/index.htm, login in `speaker_power.py`); the
  relay may have outlet locking enabled for that socket.
- **A device was replaced / IP changed** — edit the `PROJECTORS` tuple in
  `projector_power.py` or `BASE_URL`/`OUTLETS` in `speaker_power.py`, then
  re-run the tests.

## Stream Deck (Bitfocus Companion)

These scripts also drive the Stream Deck buttons via Bitfocus Companion
on the Linux box at 10.10.0.242 (scripts deployed to
`~/Desktop/AV_Power_scripts` — underscores, no spaces). The setup:

- **Press actions** run the scripts detached (`nohup ... &`) so
  Companion's 20 s action timeout never kills the retry/verify logic.
- **Polling triggers** (`Poll PA state`, `Poll projector state`) run
  `speaker_power.py state` / `projector_power.py state` every 10 s and
  store the token in the custom variables `$(custom:pa_state)` /
  `$(custom:projector_state)`.
- **Button feedbacks** color the buttons from those variables:
  green = on, red = off, orange = unreachable, yellow = mixed. A button
  that never turns the expected color after a press — or goes orange —
  is the failure signal.
