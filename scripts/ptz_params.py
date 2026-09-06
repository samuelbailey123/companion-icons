#!/usr/bin/env python3
"""Read, diff and copy a FoMaKo PTZ's VideoParam block through its web API.

Usage: ptz_params.py diff <src> <dst> | ptz_params.py copy <src> <dst> | ptz_params.py dump <host>
Credentials come from .ptz_web beside ptz_web.py on the Pi.
"""
import json, sys
sys.path.insert(0, "/home/samuelbailey/Desktop/AV_Power_scripts")
import ptz_web

SKIP = ("List", "nChannel")
EXCLUDE = {("stImg", "nAutoFlip")}  # mounting-dependent, never copied

def params(host):
    op = ptz_web.session(host)
    val = ptz_web.ajax(op, host, {"GetEnv": {"VideoParam": {"nChannel": -1}}})
    return op, (val[0] if isinstance(val, list) else val)

def leaves(d, path=()):
    for k, v in d.items():
        if k.endswith("List") or k == "nChannel":
            continue
        if isinstance(v, dict):
            yield from leaves(v, path + (k,))
        else:
            yield path + (k,), v

def diff(a, b):
    fa, fb = dict(leaves(a)), dict(leaves(b))
    return {p: (fb.get(p), fa.get(p)) for p in sorted(set(fa) | set(fb)) if fa.get(p) != fb.get(p) and p not in EXCLUDE}

def nested(path, value, out):
    cur = out
    for k in path[:-1]:
        cur = cur.setdefault(k, {})
    cur[path[-1]] = value

verb, hosts = sys.argv[1], sys.argv[2:]
if verb == "dump":
    _, p = params(hosts[0]); print(json.dumps(p, indent=1)); sys.exit()
src, dst = hosts
_, ps = params(src)
opd, pd = params(dst)
d = diff(ps, pd)
print(f"{len(d)} differences ({dst} -> {src}):")
for p, (old, new) in d.items():
    print(f"  {'.'.join(p)}: {old} -> {new}")
if verb == "copy" and d:
    blocks = {}
    for p, (_, new) in d.items():
        nested(p, new, blocks)
    for block, body in blocks.items():
        # the UI merges the exposure sub-objects whole, so send them whole
        if block == "stExp":
            for sub in ("stIris", "stShutter", "stExpMode"):
                if sub in body:
                    body[sub] = ps["stExp"][sub]
        try:
            ptz_web.ajax(opd, dst, {"SetEnv": {"VideoParam": [{block: body, "nChannel": 0}]}})
            print(f"  set {block}: ok")
        except Exception as e:
            print(f"  set {block} whole: {e}; retrying per field")
            for p, (_, new) in d.items():
                if p[0] != block:
                    continue
                one = {}
                nested(p, new, one)
                try:
                    ptz_web.ajax(opd, dst, {"SetEnv": {"VideoParam": [{**one, "nChannel": 0}]}})
                    print(f"    {'.'.join(p)}: ok")
                except Exception as e2:
                    print(f"    {'.'.join(p)}: {e2}")
    _, pd2 = params(dst)
    left = diff(ps, pd2)
    print(f"after copy: {len(left)} differences remain" + (": " + ", ".join(".".join(p) for p in left) if left else ""))
