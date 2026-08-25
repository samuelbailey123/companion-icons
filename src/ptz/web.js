/**
 * The camera's AI-tracking settings, through its web API.
 *
 * The camera's own VISCA list documents tracking commands (`8x 01 0B …` for figure size,
 * sensitivity, placement, lost-target action) and every one of them draws a syntax error
 * from this firmware — checked on 2026-08-23, set and inquiry alike. The web UI does it
 * differently: a form login at `/login/login`, then `POST /ajaxcom?szCmd=<JSON>` with
 * `{"SetEnv":{"MonoTracking":{…}}}` / `{"GetEnv":{"MonoTracking":{"nChannel":-1}}}`. That is
 * what `ptz_web.py` speaks, read out of the UI's bundle.
 *
 * Codes, from the same bundle (the dropdown order is NOT the code order):
 *   nBodyPos.emBodyPosMod  1 close-up · 0 half body · 2 full body · 3 custom
 *   nTrackMode             0 real-time · 1 area · 2 stage · 3 scene
 *   nSpeed                 0 fast · 1 middle · 2 slow
 *   nSensitivity           0 high · 1 middle · 2 low
 *   nCenterPos             0 left · 1 centre · 2 right
 *   nHeadRoomRatio         0..4 = 5/10 .. 9/10
 *   nLostReac              0 home · 4 preset 0 · 2 stay where it lost them
 *   bEnable                1 on · 0 off
 *
 * THE CREDENTIALS NEVER TOUCH COMPANION. The script reads `user:pass` from `.ptz_web` beside
 * itself on the Pi; the deck only ever runs `ptz_web.py <host> <verb> <arg>`, so nothing
 * secret lands in the config export, the import bundles, this repo or Companion's log.
 *
 * EVERY WRITE PRINTS THE NEW STATE, and the key stores that straight into the tracking
 * variable, so the deck reflects a change the instant it is made rather than on the next
 * poll. The poll still runs, more slowly, to catch changes made from the camera's web page.
 */

import { exec } from './actions.js'

/** Beside the VISCA poller, with the credentials file next to it. */
export const SCRIPT_PATH = '/home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py'
export const CREDENTIALS_FILE = '.ptz_web'

/** The custom variable holding the script's one-line JSON summary. */
export const TRACK = 'ptz_track'

/** Seconds between tracking polls. Each is a login plus a read, so not every second. */
export const INTERVAL_SECONDS = 5

/** Values the summary reports, as the captions show them. */
export const BODY = { close: 'Close-up', half: 'Half body', full: 'Full body', custom: 'Custom' }
export const MODE = ['Real-time', 'Area', 'Stage', 'Scene']
export const SPEED = ['Fast', 'Middle', 'Slow']
export const SENSITIVITY = ['High', 'Middle', 'Low']
export const PLACEMENT = ['Left', 'Centre', 'Right']
export const HEADROOM = ['5/10', '6/10', '7/10', '8/10', '9/10']
export const LOST = { 0: 'Home', 4: 'Preset 0', 2: 'Stay' }

/** `jsonpath()` over the tracking JSON. */
export const track = (field) => `jsonpath($(internal:custom_${TRACK}), '$.${field}')`

/** An exec that runs the script and keeps its printed state. */
export const webExec = (id, host, args) => exec(id, `python3 ${SCRIPT_PATH} ${host} ${args}`, TRACK, 6000)

export const SCRIPT = `#!/usr/bin/env python3
"""Read or change a FoMaKo PTZ camera's AI-tracking settings through its web API.

Usage:
  ptz_web.py <host> get
  ptz_web.py <host> track <on|off>
  ptz_web.py <host> body <close|half|full>
  ptz_web.py <host> set <field>=<int> [...]      e.g. set nSpeed=0 nCenterPos=1

Prints one line of JSON summarising the tracking block afterwards, always, so the value is
safe to show on a key. Credentials are read from the file .ptz_web beside this script,
as user:pass, never taken on the command line.
"""
import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request

TIMEOUT = 3
BODY = {"close": 1, "half": 0, "full": 2, "custom": 3}
BODY_NAME = {1: "Close-up", 0: "Half body", 2: "Full body", 3: "Custom"}
MODE = {0: "Real-time", 1: "Area", 2: "Stage", 3: "Scene"}
SPEED = {0: "Fast", 1: "Middle", 2: "Slow"}
SENSITIVITY = {0: "High", 1: "Middle", 2: "Low"}
PLACEMENT = {0: "Left", 1: "Centre", 2: "Right"}
HEADROOM = {0: "5/10", 1: "6/10", 2: "7/10", 3: "8/10", 4: "9/10"}
LOST = {0: "Home", 4: "Preset 0", 2: "Stay"}


def credentials():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".ptz_web")
    with open(path, encoding="utf-8") as f:
        user, password = f.read().strip().split(":", 1)
    return user, password


def session(host):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    user, password = credentials()
    data = urllib.parse.urlencode({"username": user, "password": password}).encode()
    with opener.open(f"http://{host}/login/login", data=data, timeout=TIMEOUT) as r:
        reply = json.loads(r.read().decode())
    if reply.get("success") != 1:
        raise RuntimeError("login refused")
    return opener


def ajax(opener, host, cmd):
    url = f"http://{host}/ajaxcom?szCmd=" + urllib.parse.quote(json.dumps(cmd, separators=(",", ":")))
    with opener.open(urllib.request.Request(url, method="POST"), timeout=TIMEOUT) as r:
        reply = json.loads(r.read().decode())
    if reply.get("nRetVal") != 0:
        raise RuntimeError(f"camera refused {list(cmd)[0]}")
    return reply.get("stValue")


def get_tracking(opener, host):
    return ajax(opener, host, {"GetEnv": {"MonoTracking": {"nChannel": -1}}})


def set_tracking(opener, host, fields):
    ajax(opener, host, {"SetEnv": {"MonoTracking": fields}})


def summary(block):
    return {
        "online": "OK",
        "tracking": "On" if block.get("bEnable") == 1 else "Off",
        "body": BODY_NAME.get((block.get("nBodyPos") or {}).get("emBodyPosMod"), "?"),
        "mode": MODE.get(block.get("nTrackMode"), "?"),
        "speed": SPEED.get(block.get("nSpeed"), "?"),
        "sensitivity": SENSITIVITY.get(block.get("nSensitivity"), "?"),
        "placement": PLACEMENT.get(block.get("nCenterPos"), "?"),
        "headroom": HEADROOM.get(block.get("nHeadRoomRatio"), "?"),
        "lost": LOST.get(block.get("nLostReac"), "?"),
    }


def main(argv):
    host, verb = argv[1], argv[2]
    opener = session(host)
    if verb == "track":
        set_tracking(opener, host, {"bEnable": 1 if argv[3] == "on" else 0})
    elif verb == "body":
        set_tracking(opener, host, {"nBodyPos": {"emBodyPosMod": BODY[argv[3]]}})
    elif verb == "set":
        fields = {}
        for kv in argv[3:]:
            k, v = kv.split("=", 1)
            fields[k] = int(v)
        set_tracking(opener, host, fields)
    elif verb != "get":
        raise SystemExit(__doc__)
    sys.stdout.write(json.dumps(summary(get_tracking(opener, host))))


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception:  # noqa: BLE001 - the deck needs JSON, not a traceback
        sys.stdout.write(json.dumps({"online": "DOWN", "tracking": "--", "body": "--", "mode": "--", "speed": "--",
                                     "sensitivity": "--", "placement": "--", "headroom": "--", "lost": "--"}))
`

/**
 * The slower poll that keeps the tracking readouts honest against the camera's web page.
 *
 * @param {string} host
 * @returns {object} a Companion trigger in export shape
 */
export function trackingTrigger(host) {
	return {
		type: 'trigger',
		options: { name: 'Poll PTZ tracking', enabled: true, sortOrder: 101, relativeDelay: false },
		actions: [webExec('ptz-track-exec', host, 'get')],
		condition: [],
		events: [{ id: 'ptz-track-every-5s', type: 'interval', enabled: true, options: { seconds: INTERVAL_SECONDS } }],
		localVariables: [],
	}
}

export const TRIGGER_ID = 'trigger-ptz-track'
