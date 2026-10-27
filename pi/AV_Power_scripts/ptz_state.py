#!/usr/bin/env python3
"""Read a VISCA-over-TCP PTZ camera's state and print it as one line of JSON.

Usage: ptz_state.py <host> [port]
"""
import json
import socket
import sys

UNITS_PER_DEGREE = 14.4
ZOOM_RANGE = 0x4000
TIMEOUT = 0.6

HOST = sys.argv[1] if len(sys.argv) > 1 else "10.23.0.181"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5678

WB = {0: "Auto", 1: "3000K", 2: "4000K", 3: "1-Push", 4: "5000K", 5: "Manual", 6: "6500K", 7: "3500K", 8: "4500K", 9: "5500K", 10: "6000K", 11: "7000K", 12: "2400K", 13: "2500K", 14: "2600K", 15: "2700K", 16: "2800K", 17: "2900K", 18: "3100K", 19: "3200K", 20: "3300K", 21: "3400K", 22: "3600K", 23: "3700K", 24: "3800K", 25: "3900K", 26: "4100K", 27: "4200K", 28: "4300K", 29: "4400K", 30: "4600K", 31: "4700K", 33: "4800K", 34: "4900K", 35: "5100K", 36: "5200K", 37: "5300K", 38: "5400K", 39: "5600K", 40: "5700K", 41: "5800K", 42: "5900K", 43: "6100K", 44: "6200K", 45: "6300K", 46: "6400K", 47: "6600K", 48: "6700K", 49: "6800K", 50: "6900K", 51: "7100K"}
SHUTTER = {0: "1/25", 1: "1/50", 2: "1/75", 3: "1/100", 4: "1/120", 5: "1/150", 6: "1/215", 7: "1/300", 8: "1/425", 9: "1/600", 10: "1/1000", 11: "1/1250", 12: "1/1750", 13: "1/2500", 14: "1/3500", 15: "1/6000", 16: "1/10000", 17: "1/30", 18: "1/60", 19: "1/90", 20: "1/100", 21: "1/125", 22: "1/180", 23: "1/250", 24: "1/350", 25: "1/500", 26: "1/725", 27: "1/1000", 28: "1/1500", 29: "1/2000", 30: "1/3000", 31: "1/4000", 32: "1/6000", 33: "1/10000"}
IRIS = {0: "Close", 1: "F11", 2: "F9.6", 3: "F8", 4: "F6.8", 5: "F5.6", 6: "F4.8", 7: "F4", 8: "F3.4", 9: "F2.8", 10: "F2.4", 11: "F2", 12: "F1.8"}
EXPCOMP_ZERO = 7
AE = {0x00: "Auto", 0x03: "Manual", 0x0A: "Shutter", 0x0B: "Iris", 0x0D: "Bright"}
FOCUS = {0x02: "Auto", 0x03: "Manual", 0x04: "1-Push"}
ON_OFF = {0x02: "On", 0x03: "Off"}
POWER = {0x02: "On", 0x03: "Standby"}


def signed16(n):
    return n - 0x10000 if n >= 0x8000 else n


def nibbles(reply, start, count):
    value = 0
    for i in range(count):
        value = (value << 4) | (reply[start + i] & 0x0F)
    return value


def ask(sock, cmd):
    sock.sendall(bytes.fromhex(cmd))
    reply = b""
    while not reply.endswith(b"\xff"):
        chunk = sock.recv(64)
        if not chunk:
            raise ConnectionError("closed")
        reply += chunk
    if len(reply) < 3 or reply[1] != 0x50:
        raise ValueError("error reply")
    return reply


def degrees(raw):
    return f"{signed16(raw) / UNITS_PER_DEGREE:+.1f}\u00b0"


def level(n, auto=False):
    return "Off" if n == 0 else "Auto" if auto and n == 8 else str(n)


def expcomp(on, n):
    return ("+" if n > EXPCOMP_ZERO else "") + str(n - EXPCOMP_ZERO) if on else "Off"


BLANK = {"online": "DOWN", "pan": "--", "tilt": "--", "zoom": "--", "focus": "--", "ae": "--", "wb": "--",
         "backlight": "--", "power": "--", "menu": "--", "shutter": "--", "iris": "--", "gain": "--",
         "sharp": "--", "expcomp": "--", "wdr": "--", "nr": "--"}


def read(host, port):
    with socket.create_connection((host, port), timeout=TIMEOUT) as sock:
        sock.settimeout(TIMEOUT)

        def field(cmd, convert):
            try:
                return convert(ask(sock, cmd))
            except Exception:  # noqa: BLE001 - one unanswered inquiry must not blank the others
                return "--"

        # Power first: in standby the camera answers this and little else.
        power = field("81090400ff", lambda r: POWER.get(r[2], "?"))
        if power == "Standby":
            return dict(BLANK, online="OK", power="Standby")
        pt = field("81090612ff", lambda r: (degrees(nibbles(r, 2, 4)), degrees(nibbles(r, 6, 4))))
        # Exposure compensation is two inquiries, on/off and level, shown as one signed value.
        ec_on = field("8109043eff", lambda r: r[2] == 0x02)
        ec_level = field("8109044eff", lambda r: nibbles(r, 4, 2))
        return {
            "online": "OK",
            "pan": pt if pt == "--" else pt[0],
            "tilt": pt if pt == "--" else pt[1],
            "zoom": field("81090447ff", lambda r: f"{max(0, min(100, round(nibbles(r, 2, 4) * 100 / ZOOM_RANGE)))}%"),
            "focus": field("81090438ff", lambda r: FOCUS.get(r[2], "?")),
            "ae": field("81090439ff", lambda r: AE.get(r[2], "?")),
            "wb": field("81090435ff", lambda r: WB.get(r[2], "?")),
            "backlight": field("81090433ff", lambda r: ON_OFF.get(r[2], "?")),
            "power": power,
            "menu": field("81090606ff", lambda r: ON_OFF.get(r[2], "?")),
            # The setup page's values. Labels come from the camera's own lists (tables.js), not
            # the module's Sony scales, which name every one of these wrongly on this camera.
            "shutter": field("8109044aff", lambda r: SHUTTER.get(nibbles(r, 4, 2), "?")),
            "iris": field("8109044bff", lambda r: IRIS.get(nibbles(r, 4, 2), "?")),
            "gain": field("8109044cff", lambda r: str(nibbles(r, 4, 2))),
            "sharp": field("81090442ff", lambda r: str(nibbles(r, 4, 2))),
            "expcomp": "--" if "--" in (ec_on, ec_level) else expcomp(ec_on, ec_level),
            # The camera answers the WDR inquiry with a short reply, y0 50 0p FF, not the six
            # bytes its own list documents; the level is the nibble before the terminator either way.
            "wdr": field("81090451ff", lambda r: level(r[-2] & 0x0F)),
            "nr": field("81090454ff", lambda r: level(r[2] & 0x0F, auto=True)),
        }


def main():
    try:
        state = read(HOST, PORT)
    except Exception:  # noqa: BLE001 - any failure means "not reachable", and the output must stay JSON
        state = dict(BLANK)
    sys.stdout.write(json.dumps(state))


if __name__ == "__main__":
    main()
