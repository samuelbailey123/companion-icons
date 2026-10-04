#!/usr/bin/env python3
"""Read or set a FoMaKo PTZ's picture settings over VISCA/TCP.

Usage:
  ptz_image.py <host> get
  ptz_image.py <host> raw <hex>                 send one command, print reply
  ptz_image.py <host> set <name>=<value> ...    e.g. set sharpness=0 iris=max
"""
import socket, sys, json

PORT = 5678
TIMEOUT = 1.5

AE = {0x00: "Auto", 0x03: "Manual", 0x0A: "Shutter", 0x0B: "Iris", 0x0D: "Bright"}
ON_OFF = {0x02: "On", 0x03: "Off"}
VIDEO = {0x1C: "4KP60", 0x1D: "4KP59.94", 0x1B: "4KP50", 0x19: "4KP30", 0x1E: "4KP29.97", 0x1A: "4KP25",
         0x00: "1080P60", 0x0A: "1080P59.94", 0x01: "1080P50", 0x06: "1080P30", 0x0D: "1080P29.97",
         0x07: "1080P25", 0x04: "720P60", 0x0C: "720P59.94", 0x05: "720P50"}
GAMMA = {0: "0.45", 1: "0.48", 2: "0.50", 3: "0.55", 4: "0.63"}

def nib(r, start, count):
    v = 0
    for i in range(count):
        v = (v << 4) | (r[start + i] & 0x0F)
    return v

def txrx(sock, hexcmd):
    sock.sendall(bytes.fromhex(hexcmd.replace(" ", "")))
    out = []
    while True:
        reply = b""
        while not reply.endswith(b"\xff"):
            chunk = sock.recv(64)
            if not chunk:
                raise ConnectionError("closed")
            reply += chunk
        out.append(reply)
        # inquiries: one reply (y0 50 ...). commands: ACK (41) then completion (51) or error (60/6y)
        if reply[1] == 0x50 or reply[1] & 0xF0 == 0x60 or reply[1] & 0xF0 == 0x50:
            return out
        if reply[1] & 0xF0 == 0x40:
            continue

def inq(sock, hexcmd):
    r = txrx(sock, hexcmd)[-1]
    if r[1] != 0x50:
        raise ValueError("error " + r.hex())
    return r

def cmd(sock, hexcmd):
    replies = txrx(sock, hexcmd)
    last = replies[-1]
    ok = last[1] == 0x51 or (last[1] & 0xF0) == 0x50
    return ok, " ".join(x.hex() for x in replies)

INQ = {
    "ae":         ("81 09 04 39 FF", lambda r: AE.get(r[2], hex(r[2]))),
    "shutter":    ("81 09 04 4A FF", lambda r: nib(r, 4, 2)),
    "iris":       ("81 09 04 4B FF", lambda r: nib(r, 4, 2)),
    "gain":       ("81 09 04 4C FF", lambda r: nib(r, 4, 2)),
    "gain_limit": ("81 09 04 2C FF", lambda r: r[2] & 0x0F),
    "bright":     ("81 09 04 4D FF", lambda r: nib(r, 4, 2)),
    "expcomp":    ("81 09 04 3E FF", lambda r: ON_OFF.get(r[2], hex(r[2]))),
    "expcomp_lv": ("81 09 04 4E FF", lambda r: nib(r, 4, 2)),
    "backlight":  ("81 09 04 33 FF", lambda r: ON_OFF.get(r[2], hex(r[2]))),
    "wdr":        ("81 09 04 51 FF", lambda r: r[5] & 0x0F),
    "nr2d":       ("81 09 04 53 FF", lambda r: r[2] & 0x0F),
    "nr3d":       ("81 09 04 54 FF", lambda r: r[2] & 0x0F),
    "sharpness":  ("81 09 04 42 FF", lambda r: nib(r, 4, 2)),
    "gamma":      ("81 09 04 5B FF", lambda r: GAMMA.get(r[2] & 0x0F, hex(r[2]))),
    "brightness": ("81 09 04 A1 FF", lambda r: nib(r, 4, 2)),
    "contrast":   ("81 09 04 A2 FF", lambda r: nib(r, 4, 2)),
    "saturation": ("81 09 04 49 FF", lambda r: r[5] & 0x0F),
    "flicker":    ("81 09 04 55 FF", lambda r: {0: "Off", 1: "50Hz", 2: "60Hz"}.get(r[2] & 0x0F, hex(r[2]))),
    "wb":         ("81 09 04 35 FF", lambda r: hex(r[2])),
    "rgain":      ("81 09 04 43 FF", lambda r: nib(r, 4, 2)),
    "bgain":      ("81 09 04 44 FF", lambda r: nib(r, 4, 2)),
    "focus":      ("81 09 04 38 FF", lambda r: {2: "Auto", 3: "Manual", 4: "1-Push"}.get(r[2], hex(r[2]))),
    "video":      ("81 09 06 23 FF", lambda r: VIDEO.get(r[2], hex(r[2]))),
    "zoom":       ("81 09 04 47 FF", lambda r: nib(r, 2, 4)),
    "version":    ("81 09 00 02 FF", lambda r: r[2:-1].hex()),
}

def d2(v):  # 0p 0q
    return f"0{(v >> 4) & 0xF:X} 0{v & 0xF:X}"

SET = {
    "ae":         lambda v: "81 01 04 39 %02X FF" % {"auto": 0, "manual": 3, "shutter": 0xA, "iris": 0xB, "bright": 0xD}[v],
    "shutter":    lambda v: "81 01 04 4A 00 00 %s FF" % d2(int(v)),
    "iris":       lambda v: "81 01 04 4B 00 00 %s FF" % d2(int(v)),
    "gain":       lambda v: "81 01 04 4C 00 00 %s FF" % d2(int(v)),
    "gain_limit": lambda v: "81 01 04 2C 0%X FF" % int(v),
    "bright":     lambda v: "81 01 04 4D 00 00 %s FF" % d2(int(v)),
    "expcomp":    lambda v: "81 01 04 3E %02X FF" % {"on": 2, "off": 3}[v],
    "expcomp_lv": lambda v: "81 01 04 4E 00 00 %s FF" % d2(int(v)),
    "backlight":  lambda v: "81 01 04 33 %02X FF" % {"on": 2, "off": 3}[v],
    "wdr":        lambda v: "81 01 04 51 00 00 00 0%X FF" % int(v),
    "nr2d":       lambda v: "81 01 04 53 0%X FF" % int(v),
    "nr3d":       lambda v: "81 01 04 54 0%X FF" % int(v),
    "sharpness":  lambda v: "81 01 04 42 00 00 %s FF" % d2(int(v)),
    "gamma":      lambda v: "81 01 04 5B 0%X FF" % int(v),
    "brightness": lambda v: "81 01 04 A1 00 00 %s FF" % d2(int(v)),
    "contrast":   lambda v: "81 01 04 A2 00 00 %s FF" % d2(int(v)),
    "saturation": lambda v: "81 01 04 49 00 00 00 0%X FF" % int(v),
    "lowlight":   lambda v: "81 01 04 2D %02X FF" % {"on": 1, "off": 0}[v],
    "flicker":    lambda v: "81 01 04 23 0%X FF" % {"off": 0, "50": 1, "60": 2}[v],
    "focus":      lambda v: "81 01 04 38 %02X FF" % {"auto": 2, "manual": 3, "onepush": 4}[v],
    "iris_up":    lambda v: "81 01 04 0B 02 FF",
    "iris_down":  lambda v: "81 01 04 0B 03 FF",
    "iris_reset": lambda v: "81 01 04 0B 00 FF",
    "sharp_up":   lambda v: "81 01 04 02 02 FF",
    "sharp_down": lambda v: "81 01 04 02 03 FF",
    "sharp_reset":lambda v: "81 01 04 02 00 FF",
}

def get(sock, names=None):
    out = {}
    for k, (q, conv) in INQ.items():
        if names and k not in names:
            continue
        try:
            out[k] = conv(inq(sock, q))
        except Exception as e:
            out[k] = "ERR"
    return out

def main():
    host, verb = sys.argv[1], sys.argv[2]
    with socket.create_connection((host, PORT), timeout=TIMEOUT) as sock:
        sock.settimeout(TIMEOUT)
        if verb == "get":
            names = sys.argv[3:] or None
            print(json.dumps(get(sock, names)))
        elif verb == "raw":
            ok, rep = cmd(sock, sys.argv[3])
            print("ok" if ok else "FAIL", rep)
        elif verb == "set":
            for kv in sys.argv[3:]:
                k, _, v = kv.partition("=")
                ok, rep = cmd(sock, SET[k](v))
                print(f"{k}={v}: {'ok' if ok else 'FAIL'} {rep}")
            print(json.dumps(get(sock)))

if __name__ == "__main__":
    main()
