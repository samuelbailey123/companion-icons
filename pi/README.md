# The Pi's scripts

A backup of what runs on the Companion Pi outside Companion itself. Until 2026-10-27 these existed
only on the Pi's SD card.

| Folder | On the Pi | What it is |
|---|---|---|
| `AV_Power_scripts/` | `/home/samuelbailey/Desktop/AV_Power_scripts` | Projector and PA power, the PTZ pollers and picture tools, the walk-in music driver. Companion's keys and triggers call them by that full path. Their own `README.md` and `PROTOCOLS.md` explain each one |
| `system/` | `/usr/local/bin`, `/etc/systemd/system` | The nightly Companion configuration backup and its timer |

**Passwords are not here.** `projector_power.py` and `speaker_power.py` carry a device password as a
constant; in this copy each reads `FROM-VAULT-…` and names its 1Password entry. Put the real one back
when restoring. Keys, `.ptz_web` (the cameras' login) and logs are never copied.

**Refresh after any change on the Pi:** `node tools/pi-backup.js`, then commit this folder. It copies
over SSH and redacts before writing (`src/pi-backup.js`). Restoring is in the Recovery Guide,
`manual/Recovery Guide.pdf`.

The tests travel with the scripts: `cd pi/AV_Power_scripts && python3 -m unittest` (88 tests, run
against this redacted copy on 2026-10-27).
