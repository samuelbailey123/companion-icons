# Read this first
Lead: If the person who built this rig is not available, this book is how you put it back together. Work from the bottom up.

The rig is five layers. Each one needs the one below it, so rebuild in this order and test each before moving on:

1. **Power and network.** The rack, the AV LAN switch, the UniFi gateway (addresses and the name `production`).
2. **The Companion Pi** at 10.23.0.242: the computer, its operating system, and Companion itself.
3. **Companion's configuration:** every page, key, trigger and connection.
4. **The Pi's scripts:** power for projectors and speakers, the PTZ pollers, walk-in music.
5. **The Service Health board** at http://production/, which runs on the same Pi.

The devices themselves (switcher, router, desk, cameras, ProPresenter) keep their own settings; the last chapters say where.

> **Do not experiment on a Sunday.** Rebuild on a weekday, and prove each layer off-air before a service depends on it.

{{control}}

# Where everything lives
Lead: Every backup, script, credential and repository, and which one to reach for.

## Backups of Companion's configuration

| Copy | Where | How fresh |
|---|---|---|
| **Nightly on the Pi** | `/mnt/storage/companion-backups/companion-config-YYYYMMDD-HHMMSS.tar.gz` on the Pi's storage drive | Every night at 03:17; the last 30 days are kept |
| **Private off-Pi copy** | Sam's Google Drive, private: the newest `companion-export-*.json`. **Not made yet on 2026-10-27**: take a live export (below) and upload it | Whenever someone uploads one |
| **Live export** | `node tools/rig.js export rig.json` from a laptop on the AV LAN, or `curl -s http://10.23.0.242:8000/int/export/full \| gunzip > rig.json` | Right now |

> **A Companion export contains every connection's password in plain text.** Treat each copy as a password: keep it out of email, chat and public repositories.

The nightly job is a script and two systemd units on the Pi: `/usr/local/bin/companion-backup.sh`, `companion-backup.service` and `companion-backup.timer` (copies are in the Pi backup folder beside these PDFs). It fails, and writes nothing, if the storage drive is not mounted at `/mnt/storage`.

## Code and documents

| What | Where |
|---|---|
| This manual's generator, every page builder (`tools/*.js`), the icon library, and the production notes | GitHub **samuelbailey123/companion-icons** (public, so it holds no passwords) |
| The Service Health board | GitHub **Decima-Labs/service-health**, deployed to `/home/samuelbailey/service-health` on the Pi |
| The Planning Center plan linter | GitHub **Decima-Labs/pco-lint** |
| The Pi's scripts | On the Pi in `/home/samuelbailey/Desktop/AV_Power_scripts`; a copy, with passwords removed, in the **Pi backup** folder beside these PDFs |
| These PDFs | Decima Server: `samuelbailey/Churches/Triumph Church/Beaumont/Rig Manual` |
| Post-production scripts | `Services/_tools/` beside the footage on the Decima Server |

## Credentials

None are written in this manual. Each is in **1Password** under the entry named here.

{{credentials}}

# Rebuild the Companion Pi
Lead: A Raspberry Pi running Debian (64-bit ARM), with Companion as its own user and the scripts and board under samuelbailey.

## 1. The computer

1. Give it the address **10.23.0.242**. Set a DHCP reservation for its network port in UniFi (1Password: "Rig — UniFi"), so it never moves: every script, the board and the `production` name point at that address.
2. Install Companion's Raspberry Pi image (**CompanionPi**, from bitfocus.io). It creates the `companion` user that runs Companion and sets it to start at boot.
3. Install the version the rig was read on (the cover of each book says which). This Pi has **updated Companion by itself** before (5.0.3 to 5.0.4 on 2026-08-28, with a restart); an update landing on a Sunday morning would restart the deck mid-service, so turn automatic updates off if the image offers it.
4. Create the user **samuelbailey** (1Password: "Rig — Companion Pi"). The scripts and the board run as this user, and every key that runs a script names `/home/samuelbailey/...` by its full path.
5. Mount the storage drive at **/mnt/storage**, so the nightly backup has somewhere to write.

Check: **http://10.23.0.242:8000** shows Companion's admin page.

## 2. Put the configuration back

Use the newest copy you have, in this order of preference.

**From the Pi's nightly backup** (the Pi died but its drive did not):

```bash
sudo systemctl stop companion        # the service's name on CompanionPi; check with: systemctl list-units | grep -i companion
sudo tar xzf /mnt/storage/companion-backups/companion-config-YYYYMMDD-HHMMSS.tar.gz -C /home/companion
sudo chown -R companion:companion /home/companion/.config
sudo systemctl start companion
```

**From an export** (the drive is gone too): in Companion's web page, **Import / Export → Import**, choose the `.json` export, and import **everything**. Credentials come with it.

**From nothing** (no backup survived): the pages can be rebuilt from the page builders in companion-icons, `node tools/<page>.js` and then `node tools/rig.js import <bundle> buttons,triggers`. Connections and their passwords then have to be added by hand: the Reference's Connections chapter lists every one with its settings.

Check: every connection in Companion is green, and a readout on each page is moving. Companion's status dots can say "OK" for a device at a dead address, so look at the keys, not the list.

## 3. Put the scripts back

Copy the **Pi backup / AV_Power_scripts** folder to `/home/samuelbailey/Desktop/AV_Power_scripts` on the Pi (that exact path: the keys call it). Then put the passwords back, from 1Password:

| File | What to fill in | 1Password entry |
|---|---|---|
| `projector_power.py` | `USERNAME` and `PASSWORD` near the top | Rig — Panasonic projectors |
| `speaker_power.py` | `USERNAME` and `PASSWORD` near the top | Rig — DLI speaker power switch |
| `.ptz_web` (new file, beside `ptz_web.py`) | one line, `user:password`, mode 0600 | Rig — PTZ camera web UI |
| `.chrome_tracks_key` (new file) | the private SSH key the Pi uses to reach the PP1 iMac, mode 0640, readable by the `companion` user | Rig — PP1 tracks SSH key |

The scripts' own tests run against fake devices and never touch the real ones: `cd ~/Desktop/AV_Power_scripts && python3 -m unittest`.

Put the nightly backup back too:

```bash
sudo cp companion-backup.sh /usr/local/bin/ && sudo chmod 755 /usr/local/bin/companion-backup.sh
sudo cp companion-backup.service companion-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now companion-backup.timer
```

Check: the Power page shows the projectors' and speakers' real state within ten seconds, the CAM pages' strips show values, and the Tracks page shows a song title.

## 4. Put the Service Health board back

Follow "Deploy to the Pi" in the service-health repository's README. In short: install Node with asdf at the version in `.tool-versions`, copy the repository to `/home/samuelbailey/service-health`, run `npm ci --omit=dev`, then install and start `deploy/service-health.service`. It serves on port 80 and 8080.

It needs the Planning Center token in `~/.config/service-health/pco.env` (`PCO_APP_ID=` and `PCO_SECRET=` lines, mode 0600; 1Password: "Rig — Planning Center PAT").

The name **production** is a DNS record on the UniFi gateway (Settings → Policy Table → DNS) pointing at 10.23.0.242.

Check: **http://production/** shows the board with every device listed.

# The devices
Lead: What each device keeps in itself, and how to get it back to how the rig expects it.

| Device | Address | What it keeps | How to restore |
|---|---|---|---|
| ATEM Television Studio HD8 | 10.23.0.34 | Video standard **1080p59.94**, input names, macros, the **stream key** (1Password: "Rig — YouTube stream key") | ATEM Software Control on a Mac on the AV LAN. Companion finds it by Bonjour |
| Blackmagic Micro Videohub | 10.23.0.21 | Port names and routing | Blackmagic Videohub Setup. The names are in the Reference's video chapter; the deck reads them live |
| HyperDeck Studio Mini | 10.23.0.206 | Record format; **Remote** must be on | Front panel. Records to SD cards only |
| Allen & Heath SQ7 | 10.23.0.191 | The mix, scenes, DCA assignments, Dante patch | Not readable over the network. Save a show file to USB from the desk and keep it with these books |
| grandMA2 onPC | 10.23.0.99 (DHCP: it has also been .103) | The lighting show | Save the show file from the lighting PC and keep a copy off it |
| ProPresenter, PP1 iMac | 10.23.0.204 | Library, the "Sunday Service" playlist, the "Freeze" macro, stage layouts, timers | ProPresenter's own backup. The "Freeze" macro has to be made by hand (Slide Destination, Stage Only): its API cannot add macro actions |
| NovaStar VX6S | 10.23.0.23 | LED wall screen settings and brightness | NovaStar's own software; not readable by the deck |
| PTZ cameras ×2 | 10.23.0.196 (CAM 1), 10.23.0.181 | Presets, exposure, white balance, tracking | Each camera's saved look is in `ptz_look_<address>.json` in the Pi backup; the CAM Setup pages re-apply it ("look apply") |
| Shure ULX-D receivers ×4 | Dante interfaces 10.23.0.14, .107, .143; the BGV+Host receiver is on XLR | Frequencies, channel names | Shure Wireless Workbench. No Companion connection reads them any more |
| Dante | — | The routes into the SQ7 | Dante Controller on a Mac on the AV LAN (not over the VPN). The Reference's Audio chapter lists every route |
| Panasonic projectors ×3 | 10.23.0.112, .234, .80 | Inputs, network control | Projector menus; network control login in 1Password |
| DLI web power switch | 10.23.0.250 | Outlets 5–8 power the FOH speakers | Its web page; login in 1Password |

> **Addresses drift.** Most of these get their address from DHCP and have moved before. When one moves, fix it in Companion's connection (or the script that names it), and give it a DHCP reservation in UniFi so it does not move again.

# Keep this manual true
Lead: The books are generated from the live rig. Rebuild them whenever the rig changes.

On a laptop on the AV LAN, in a checkout of **samuelbailey123/companion-icons**:

```bash
node tools/manual-collect.js ~/rig-snapshot      # reads Companion, the Videohub and the ATEM; changes nothing
node tools/manual.js ~/rig-snapshot ~/rig-html   # builds the three books as HTML
python3 scripts/manual_pdf.py ~/rig-html "/Volumes/Decima Server/samuelbailey/Churches/Triumph Church/Beaumont/Rig Manual"
```

The snapshot folder holds Companion's export, **with passwords**: keep it private and delete it when done. The build refuses to write a book that contains any of them.

What the build cannot read is in the Reference's last chapter, **Site walk**. Fill it in by hand once, and add what you learn to `docs/production/rig.md` so the next rebuild prints it.
