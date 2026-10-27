#!/usr/bin/env python3
"""Read or change a FoMaKo PTZ camera's AI-tracking settings through its web API.

Usage:
  ptz_web.py <host> get
  ptz_web.py <host> track <on|off>
  ptz_web.py <host> body <close|half|full>
  ptz_web.py <host> set <field>=<int> [...]      e.g. set nSpeed=0 nCenterPos=1
  ptz_web.py <host> select <x> <y>               track the person at this point of the 1920x1080 frame
  ptz_web.py <host> match <other-host>           copy the other camera's picture settings here
  ptz_web.py <host> look save                    keep the picture settings as they are now
  ptz_web.py <host> look apply                   put the kept picture settings back
  ptz_web.py <host> look get                     what is kept, without touching the camera
  ptz_web.py <host> recall <n>                   go to preset n and keep the picture as it is

Prints one line of JSON summarising the tracking block afterwards, always, so the value is
safe to show on a key; 'match', 'look' and 'recall' print their own one-line summaries instead.
Credentials are read from the file .ptz_web beside this script, as user:pass, never taken on
the command line. The look lives in ptz_look_<host>.json beside this script, with the
previous one kept as .prev.json.
"""
import http.cookiejar
import json
import os
import socket
import sys
import time
import urllib.parse
import urllib.request

TIMEOUT = 3
VISCA_PORT = 5678
SETTLE_SECONDS = 12
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


def visca(host, command):
    """Send one VISCA command over IP and return the camera's first reply."""
    with socket.create_connection((host, VISCA_PORT), timeout=TIMEOUT) as s:
        s.sendall(bytes.fromhex(command))
        reply = b""
        while not reply.endswith(bytes([0xFF])):
            chunk = s.recv(64)
            if not chunk:
                break
            reply += chunk
        return reply


def recall(host, n):
    """Go to preset n and keep the picture the camera had before.

    A preset on these cameras carries the picture settings it was saved with, so the ones read
    just before the recall are put back as soon as it is sent, and again once the camera stops
    moving in case it lays the preset's own on arrival. If the picture cannot be read the
    camera still goes to the preset.
    """
    try:
        opener = session(host)
        held = video_params(opener, host)
    except Exception:  # noqa: BLE001 - the shot matters more than the picture
        opener = held = None
    visca(host, "8101043F02%02XFF" % n)
    if held is None:
        return {"online": "OK", "preset": n, "kept": "--", "left": "--"}
    applied, left = apply_params(opener, host, held)
    last, same, started = None, 0, time.time()
    while same < 2 and time.time() - started < SETTLE_SECONDS:
        time.sleep(0.5)
        here = (visca(host, "81090612FF"), visca(host, "81090447FF"))
        same = same + 1 if here == last else 0
        last = here
    more, left = apply_params(opener, host, held)
    return {"online": "OK", "preset": n, "kept": applied + more, "left": left}


WB = {0: "Auto", 1: "3000K", 2: "4000K", 3: "1-Push", 4: "5000K", 5: "Manual", 6: "6500K", 7: "3500K", 8: "4500K", 9: "5500K", 10: "6000K", 11: "7000K", 12: "2400K", 13: "2500K", 14: "2600K", 15: "2700K", 16: "2800K", 17: "2900K", 18: "3100K", 19: "3200K", 20: "3300K", 21: "3400K", 22: "3600K", 23: "3700K", 24: "3800K", 25: "3900K", 26: "4100K", 27: "4200K", 28: "4300K", 29: "4400K", 30: "4600K", 31: "4700K", 33: "4800K", 34: "4900K", 35: "5100K", 36: "5200K", 37: "5300K", 38: "5400K", 39: "5600K", 40: "5700K", 41: "5800K", 42: "5900K", 43: "6100K", 44: "6200K", 45: "6300K", 46: "6400K", 47: "6600K", 48: "6700K", 49: "6800K", 50: "6900K", 51: "7100K"}
AE = {0: "Auto", 3: "Manual", 10: "Shutter", 11: "Iris", 13: "Bright"}
SHUTTER = {0: "1/25", 1: "1/50", 2: "1/75", 3: "1/100", 4: "1/120", 5: "1/150", 6: "1/215", 7: "1/300", 8: "1/425", 9: "1/600", 10: "1/1000", 11: "1/1250", 12: "1/1750", 13: "1/2500", 14: "1/3500", 15: "1/6000", 16: "1/10000", 17: "1/30", 18: "1/60", 19: "1/90", 20: "1/100", 21: "1/125", 22: "1/180", 23: "1/250", 24: "1/350", 25: "1/500", 26: "1/725", 27: "1/1000", 28: "1/1500", 29: "1/2000", 30: "1/3000", 31: "1/4000", 32: "1/6000", 33: "1/10000"}
IRIS = {0: "Close", 1: "F11", 2: "F9.6", 3: "F8", 4: "F6.8", 5: "F5.6", 6: "F4.8", 7: "F4", 8: "F3.4", 9: "F2.8", 10: "F2.4", 11: "F2", 12: "F1.8"}


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
    if verb == "recall":
        sys.stdout.write(json.dumps(recall(host, int(argv[3]))))
        return
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
    elif verb == "select":
        # What the web page sends when the picture is clicked: a point in a 1920x1080 frame,
        # with the click-to-select switch on. The camera takes the person there.
        set_tracking(opener, host, {"stSelect": {"bEnable": 1, "x": int(argv[3]), "y": int(argv[4])}})
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
        elif len(sys.argv) > 2 and sys.argv[2] == "recall":
            sys.stdout.write(json.dumps({"online": "DOWN", "preset": sys.argv[3] if len(sys.argv) > 3 else "--", "kept": "--", "left": "--"}))
        elif len(sys.argv) > 2 and sys.argv[2] == "look":
            sys.stdout.write(json.dumps({"online": "DOWN", "saved": "--", "applied": "--", "left": "--", "wb": "--", "ae": "--",
                                         "shutter": "--", "iris": "--", "gain": "--", "sharp": "--"}))
        else:
            sys.stdout.write(json.dumps({"online": "DOWN", "tracking": "--", "body": "--", "mode": "--", "speed": "--",
                                         "sensitivity": "--", "placement": "--", "headroom": "--", "lost": "--"}))
