#!/usr/bin/env python3
"""Re-save presets so they carry the current picture settings.

Usage: ptz_resave.py <host> <reference-params.json> <preset> [...]
For each preset: VISCA recall, wait for motion to settle, read what the recall did to the
picture settings, re-apply the reference block through the web API, VISCA save, verify.
"""
import json, os, socket, sys, time
sys.path.insert(0, "/home/samuelbailey/Desktop/AV_Power_scripts")
import ptz_web

host, ref_file, presets = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]]
ref = json.load(open(ref_file))
EXCLUDE_IMG = {"nAutoFlip", "nFlipH", "nFlipV"}

def visca(cmd, tries=4):
  for attempt in range(tries):
   try:
    with socket.create_connection((host, 5678), timeout=2) as s:
          s.sendall(bytes.fromhex(cmd.replace(" ", "")))
          replies = []
          while True:
              r = b""
              while not r.endswith(b"\xff"):
                  c = s.recv(64)
                  if not c: raise ConnectionError("closed")
                  r += c
              replies.append(r)
              # inquiry answer, ACK (motion completes later; the position poll waits for it) or error
              if r[1] == 0x50 or r[1] == 0x41 or (r[1] & 0xF0) == 0x60 or r[1] == 0x51: return replies
   except (TimeoutError, socket.timeout, ConnectionError):
    if attempt == tries - 1: raise
    time.sleep(1.0)
def nib(r, a, n):
    v = 0
    for i in range(n): v = (v << 4) | (r[a + i] & 0xF)
    return v
def inq(cmd, minlen=4):
    for attempt in range(5):
        r = visca(cmd)[-1]
        if r[1] == 0x50 and len(r) >= minlen: return r
        time.sleep(0.5)
    raise ValueError(f"inquiry {cmd} kept answering {r.hex()}")
def command(cmd):
    for attempt in range(4):
        r = visca(cmd)[-1]
        if r[1] in (0x41, 0x51) or (r[1] & 0xF0) == 0x60: return r
        time.sleep(0.5)
    return r
def picture():
    return {"sharpness": nib(inq("81 09 04 42 FF", 7), 4, 2), "iris": nib(inq("81 09 04 4B FF", 7), 4, 2),
            "luminance": nib(inq("81 09 04 A1 FF", 7), 4, 2), "focus": {2: "Auto", 3: "Manual", 4: "1-Push"}.get(inq("81 09 04 38 FF")[2], "?")}
def position():
    pt = inq("81 09 06 12 FF", 11); z = inq("81 09 04 47 FF", 7)
    return (nib(pt, 2, 4), nib(pt, 6, 4), nib(z, 2, 4))
def settle(limit=15):
    last, same, t0 = None, 0, time.time()
    while time.time() - t0 < limit:
        time.sleep(0.6)
        p = position()
        same = same + 1 if p == last else 0
        last = p
        if same >= 2: return p
    return last

op = ptz_web.session(host)
def strip_lists(d):
    return {k: (strip_lists(v) if isinstance(v, dict) else v) for k, v in d.items() if not k.endswith("List")}
def blocks():
    img = {k: v for k, v in ref["stImg"].items() if k not in EXCLUDE_IMG}
    exp = {k: v for k, v in ref["stExp"].items() if not isinstance(v, dict)}
    exp["stIris"] = ref["stExp"]["stIris"]          # the UI sends this sub-object whole, list included
    color = strip_lists(ref["stColor"])
    return (("stImg", img), ("stExp", exp), ("stAF", ref["stAF"]), ("stColor", color), ("stNR", ref["stNR"]))
def apply_reference():
    global op
    for block, body in blocks():
        for attempt in range(3):
            try:
                ptz_web.ajax(op, host, {"SetEnv": {"VideoParam": [{block: body, "nChannel": 0}]}})
                break
            except Exception as e:
                time.sleep(1.0)
                op = ptz_web.session(host)
                if attempt == 2: print(f"    {block}: FAILED {e}")

print(f"{host}: before {picture()} at {position()}")
for n in presets:
    rep = [command(f"81 01 04 3F 02 {n:02X} FF")]
    if rep[-1][1] not in (0x41, 0x51):
        print(f"  preset {n}: recall refused ({rep[-1].hex()}), skipped"); continue
    pos = settle()
    after_recall = picture()
    time.sleep(1.0)
    if os.environ.get('RESAVE_VERIFY'):
        print(f"  preset {n}: at {pos}; recall left {after_recall}"); continue
    apply_reference()
    time.sleep(0.5); rep = [command(f"81 01 04 3F 01 {n:02X} FF")]; time.sleep(1.5)
    saved = rep[-1][1] in (0x41, 0x51)
    print(f"  preset {n}: at {pos}; recall left {after_recall}; re-applied; save {'ok' if saved else 'FAILED ' + rep[-1].hex()}; now {picture()}")
