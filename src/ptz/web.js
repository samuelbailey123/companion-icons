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
import { AE_MODES, IRIS, SHUTTER, WB_LABELS, pyDict } from './tables.js'

/** Beside the VISCA poller, with the credentials file next to it. */
export const SCRIPT_PATH = '/home/samuelbailey/Desktop/AV_Power_scripts/ptz_web.py'
export const CREDENTIALS_FILE = '.ptz_web'

/** The custom variable holding the script's one-line JSON summary. */
export const TRACK = 'ptz_track'
/** Where a Match press keeps its result: the tracking variable must not be overwritten by it. */
export const MATCH = 'ptz_match'

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

/** `jsonpath()` over the match JSON. */
export const matched = (field) => `jsonpath($(internal:custom_${MATCH}), '$.${field}')`

/** The saved look's variable and `jsonpath()` over it. */
export const LOOK = 'ptz_look'
export const look = (field) => `jsonpath($(internal:custom_${LOOK}), '$.${field}')`

/** Save, apply or read the look. Apply is a read, up to five block writes and a read back. */
export const lookExec = (id, host, verb) => exec(id, `python3 ${SCRIPT_PATH} ${host} look ${verb}`, LOOK, 20000)

/**
 * Copy the other camera's picture settings onto this one. Two logins, two reads, up to five
 * block writes and a read back: allowed twenty seconds, well past the few it takes.
 */
export const matchExec = (id, host, other) => exec(id, `python3 ${SCRIPT_PATH} ${host} match ${other}`, MATCH, 20000)

export const SCRIPT = `#!/usr/bin/env python3
"""Read or change a FoMaKo PTZ camera's AI-tracking settings through its web API.

Usage:
  ptz_web.py <host> get
  ptz_web.py <host> track <on|off>
  ptz_web.py <host> body <close|half|full>
  ptz_web.py <host> set <field>=<int> [...]      e.g. set nSpeed=0 nCenterPos=1
  ptz_web.py <host> match <other-host>           copy the other camera's picture settings here
  ptz_web.py <host> look save                    keep the picture settings as they are now
  ptz_web.py <host> look apply                   put the kept picture settings back
  ptz_web.py <host> look get                     what is kept, without touching the camera

Prints one line of JSON summarising the tracking block afterwards, always, so the value is
safe to show on a key; 'match' and 'look' print their own one-line summaries instead.
Credentials are read from the file .ptz_web beside this script, as user:pass, never taken on
the command line. The look lives in ptz_look_<host>.json beside this script, with the
previous one kept as .prev.json.
"""
import http.cookiejar
import json
import os
import sys
import time
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


# Picture settings that belong to the mounting, not the picture: never copied between cameras.
MATCH_EXCLUDE = {("stImg", "nAutoFlip"), ("stImg", "nFlipH"), ("stImg", "nFlipV")}


def video_params(opener, host):
    val = ajax(opener, host, {"GetEnv": {"VideoParam": {"nChannel": -1}}})
    return val[0] if isinstance(val, list) else val


def leaves(d, path=()):
    for k, v in d.items():
        if k.endswith("List") or k == "nChannel":
            continue
        if isinstance(v, dict):
            yield from leaves(v, path + (k,))
        else:
            yield path + (k,), v


def nested(path, value, out):
    cur = out
    for k in path[:-1]:
        cur = cur.setdefault(k, {})
    cur[path[-1]] = value


def apply_params(opener, host, source):
    """Apply every picture setting in 'source' that differs from the camera, block by block.

    The web UI merges the exposure sub-objects whole (iris, shutter, mode, lists and all), so
    those are sent as the source holds them. A block the camera refuses is retried one field
    at a time, so one bad key cannot block the rest. Returns (applied, left).
    """
    before = video_params(opener, host)
    want, have = dict(leaves(source)), dict(leaves(before))
    diff = {p: v for p, v in want.items() if p in have and have[p] != v and p not in MATCH_EXCLUDE}
    blocks = {}
    for p, v in diff.items():
        nested(p, v, blocks)
    for block, body in blocks.items():
        if block == "stExp":
            for sub in ("stIris", "stShutter", "stExpMode"):
                if sub in body:
                    body[sub] = source["stExp"][sub]
        try:
            ajax(opener, host, {"SetEnv": {"VideoParam": [{block: body, "nChannel": 0}]}})
        except Exception:  # noqa: BLE001 - fall back to one field at a time
            for p, v in diff.items():
                if p[0] != block:
                    continue
                one = {}
                nested(p, v, one)
                try:
                    ajax(opener, host, {"SetEnv": {"VideoParam": [{**one, "nChannel": 0}]}})
                except Exception:  # noqa: BLE001 - counted as "left" below
                    pass
    after = dict(leaves(video_params(opener, host)))
    left = [p for p, v in diff.items() if after.get(p) != v]
    return len(diff) - len(left), len(left)


def match(opener, host, other):
    """Copy the other camera's picture settings onto this one."""
    applied, left = apply_params(opener, host, video_params(session(other), other))
    return {"online": "OK", "from": other, "copied": applied, "left": left}


WB = ${pyDict(WB_LABELS)}
AE = ${pyDict(AE_MODES)}
SHUTTER = ${pyDict(SHUTTER)}
IRIS = ${pyDict(IRIS)}


def look_path(host):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), f"ptz_look_{host}.json")


def look_summary(look, applied=0, left=0):
    """The kept look's headline values, in the labels the poller prints, so a key can compare."""
    p = look["params"]
    return {
        "online": "OK", "saved": look["saved"], "applied": applied, "left": left,
        "wb": WB.get(p["stColor"]["stWbMode"]["emWbMode"], "?"),
        "ae": AE.get(p["stExp"]["stExpMode"]["emExpMode"], "?"),
        "shutter": SHUTTER.get(p["stExp"]["stShutter"]["nShutter"], "?"),
        "iris": IRIS.get(p["stExp"]["stIris"]["nIris"], "?"),
        "gain": str(p["stExp"]["again"]),
        "sharp": str(p["stImg"]["sharpness"]),
    }


def look(opener, host, verb):
    """Keep the picture settings as they are (save), put them back (apply), or read them (get)."""
    path = look_path(host)
    if verb == "save":
        kept = {"host": host, "saved": time.strftime("%Y-%m-%d %H:%M:%S"), "params": video_params(opener, host)}
        if os.path.exists(path):
            os.replace(path, path[:-5] + ".prev.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(kept, f, indent=1)
        return look_summary(kept)
    with open(path, encoding="utf-8") as f:
        kept = json.load(f)
    if verb == "apply":
        applied, left = apply_params(opener, host, kept["params"])
        return look_summary(kept, applied, left)
    if verb == "get":
        return look_summary(kept)
    raise SystemExit(__doc__)


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
    if verb == "match":
        sys.stdout.write(json.dumps(match(opener, host, argv[3])))
        return
    if verb == "look":
        sys.stdout.write(json.dumps(look(opener, host, argv[3])))
        return
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
        if len(sys.argv) > 2 and sys.argv[2] == "match":
            sys.stdout.write(json.dumps({"online": "DOWN", "from": sys.argv[3] if len(sys.argv) > 3 else "--", "copied": "--", "left": "--"}))
        elif len(sys.argv) > 2 and sys.argv[2] == "look":
            sys.stdout.write(json.dumps({"online": "DOWN", "saved": "--", "applied": "--", "left": "--", "wb": "--", "ae": "--",
                                         "shutter": "--", "iris": "--", "gain": "--", "sharp": "--"}))
        else:
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
