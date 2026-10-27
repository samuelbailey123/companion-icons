# AV Device Protocol Reference

Technical reference for every control channel used (or deliberately not
used) by the scripts in this folder. All findings were verified against the
live devices on 2026-07-15.

## Device inventory

| Device | Model | IP | Serial | Firmware | Web auth |
|---|---|---|---|---|---|
| Projector 1 | PT-DW740 | 10.23.0.112 | SH2646019 | main 1.06 / net 1.00 | Basic, realm `PROJECTOR` |
| Projector 2 | PT-DW740 | 10.23.0.234 | SH2656033 | main 1.03 / net 1.00 | Basic, realm `PROJECTOR` |
| Projector 3 | PT-EW630 | 10.23.0.80 | DC3330047 | main 1.01 / net 2.00 | Basic, realm `Name9228` |
| Speaker relay | DLI DIN relay | 10.23.0.250 | DIN320502 | — | Basic (page `FOH Speaker Power`) |

All three projectors expose the same three channels: web UI (TCP 80),
NTCONTROL (TCP 1024), PJLink (TCP 4352). One account drives all three
channels per projector.

## NTCONTROL (TCP 1024) — primary projector channel

One command per TCP connection — the projector drops the connection after
each response, so reconnect for every command.

1. Connect. The projector immediately sends a banner:
   - `NTCONTROL 1 <salt>\r` — protected mode; `<salt>` is 8 random hex chars,
     new per connection.
   - `NTCONTROL 0\r` — unprotected mode (no web password set).
2. In protected mode compute `md5hex("<user>:<password>:<salt>")`.
3. Send `<md5hex>00<CMD>\r` (unprotected: just `00<CMD>\r`). No separators.
4. Read the reply up to `\r`: `00` + payload.

| Command | Meaning | Success reply |
|---|---|---|
| `PON` | Power on | `00PON` |
| `POF` | Power off (standby) | `00POF` |
| `QPW` | Query power | `00000` = standby, `00001` = on |

Errors: `ERR1` undefined command, `ERR2` out of range, `ERR3` busy /
unavailable now, `ERR4` timeout, `ERR5` wrong length, `ERRA` bad
credentials, `ER401`/`ER402` processing/parameter errors. On `ERRA`,
reconnect for a fresh salt. Lowercase hash digests are accepted (verified
live on all three units).

## PJLink class 1 (TCP 4352) — projector fallback channel

Standards-based (JBMIA). Same per-connection pattern:

1. Banner `PJLINK 0\r` = no auth, send commands directly; `PJLINK 1
   <seed>\r` = auth: prefix the first command with
   `md5hex(<seed><password>)` — direct concatenation, no separator.
   On these projectors the PJLink password is the web-control password.
2. Commands: `%1POWR 1\r` (on), `%1POWR 0\r` (standby) → reply
   `%1POWR=OK`; query `%1POWR ?\r` → `%1POWR=0` standby, `=1` on,
   `=2` cooling, `=3` warm-up.
3. Errors come back as `%1POWR=ERR2/ERR3/ERR4`; `PJLINK ERRA` = bad auth.

Power state machine: standby → warm-up(3) → on(1) → cooling(2) → standby.
The scripts treat warm-up/cooling as "command accepted, completing".

## Projector web UIs (TCP 80) — manual fallback only

### PT-DW740 (10.23.0.112 / .234)

Old-generation "Projector Control Window". Buttons are plain GET image-map
links, Basic auth, no CSRF:

- Power: `GET /cgi-bin/power_ctl.cgi?key=pow_on&lang=e&from=BASIC_CTL`
  (`key=pow_off` for standby). No Referer required.
- Other controls: `GET /cgi-bin/proj_ctl.cgi?key=shutter_on|shutter_off|
  osd_on|osd_off|rgb1|rgb2|dvi|video|svideo|hdmi&lang=e&osd=on`.
- Status: `GET /cgi-bin/projector_status.cgi?lang=e` — in the POWER row the
  active state ("ON"/"STANDBY") is wrapped in `<font color="#00ff12">`
  (green), inactive in `#999999`. Same convention for INPUT/LAMP fields.
  Page also carries PROJECTOR TYPE, serial, firmware, runtime, self-test.

### PT-EW630 (10.23.0.80)

Newer generation (Crestron RoomView era), gzip-encoded pages (`curl
--compressed`). Its web power flow is **two-step**: the POWER buttons open a
confirmation page `GET /base_conf.htm?CTL=on|off&KEY=<epoch-ms>` whose OK
control then fires the real command (`act.htm?SET=…`, the endpoint all
non-power buttons use, e.g. `act.htm?SET=shut_on`). Because of this and the
server's flakiness, the scripts never use the EW630 web UI.

- Status: `GET /pj_status.htm` — server-injected JS vars: `num0` (0 =
  standby, 1 = on), `num1` (AV mute), `dat0` model, `dat1` serial.

## DLI web power switch (10.23.0.250) — speakers

Digital Loggers DIN relay, HTTP only, Basic auth. Session cookie `DLILPC`
exists but is not required — every request works with Basic auth alone.

- Outlet map: 5 = Left Main, 6 = Left Sub, 7 = Right Main, 8 = Right Sub.
  Outlets 1–4 unused; the scripts never touch them.
- Switch one outlet: `GET /outlet?<n>=ON|OFF` (also `CCL` = power cycle).
- ALL outlets: `GET /outlet?a=ON|OFF|CCL` — **deliberately not used**, it
  would also switch the unused outlets 1–4.
- State read-back: `GET /index.htm` embeds `<!-- state=f0 lock=00 -->` —
  `state` is a hex bitmask, bit (n−1) set = outlet n is ON (`f0` = outlets
  5–8 on). `lock` marks outlets whose state is locked in the relay config.
- Relay applies its own ~2 s sequencing between switch operations.

## Script behavior contracts

Both scripts follow the same pattern: check current state first (skip
devices already correct), send the command, then poll the device until it
*reports* the requested state; up to 6 attempts with linear backoff (2 s,
4 s, …). Exit code 0 only when every device confirmed. `status` never
changes state. Replies are capped at 4 KB and malformed banners raise clean
per-device errors, so one bad device can never crash a whole run.
