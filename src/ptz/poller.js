/**
 * Reading the camera back: a one-second poll that feeds every readout on the page.
 *
 * The ptzoptics-visca module sends commands but publishes no variables, so nothing on the
 * deck would know where the camera is pointing. The same mechanism the System page uses —
 * `internal: exec` on a trigger, writing stdout into a custom variable — fills the gap: a
 * small Python script on the Pi opens its own VISCA/TCP connection (the camera accepts
 * several at once, checked), asks eight inquiries, and prints one line of JSON. The trigger
 * stores that line in one custom variable, and every caption and condition on the page reads
 * its field with `jsonpath()`.
 *
 * WHY NOT ONE VARIABLE PER FIELD. It was tried: a trigger does not wait for `exec` to finish
 * before running the next action in its chain (measured — half the samples were torn), so
 * unpacking in the same trigger lags the JSON by a poll, and a key that branches on the
 * stale copy toggles the wrong way. Reading the JSON directly cannot lag.
 *
 * DEGREES ARE A CONVERSION, NOT A READING. The camera reports pan and tilt in its own units.
 * 14.4 per degree is the PTZOptics-family scale (pan ±0x0990 for ±170°, tilt 0x0510 for 90°),
 * and this camera's positions sit where that scale predicts; it has not been verified
 * against a protractor. `UNITS_PER_DEGREE` in the script is the one number to change if the
 * readout ever disagrees with the picture.
 */

import { exec } from './actions.js'
import * as V from './variables.js'

/** Where the script lives on the Pi: next to the AV power scripts the Power page already runs. */
export const SCRIPT_PATH = '/home/samuelbailey/Desktop/AV_Power_scripts/ptz_state.py'

/** Seconds between polls. */
export const INTERVAL_SECONDS = 1

/**
 * The poller script. Python 3 only, no third-party modules; the Pi has 3.13.
 *
 * Every inquiry is read-only. A camera that does not answer within a second is reported as
 * DOWN with every other field blank, and the script always exits 0 with valid JSON so the
 * variable can never hold a traceback.
 */
export const SCRIPT = `#!/usr/bin/env python3
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

WB = {0x00: "Auto", 0x05: "Manual", 0x03: "1-Push"}
# Colour temperatures, straight from the camera's VISCA list: the codes are not in order.
WB.update({0x0C: "2400K", 0x0D: "2500K", 0x0E: "2600K", 0x0F: "2700K", 0x10: "2800K", 0x11: "2900K",
           0x01: "3000K", 0x12: "3100K", 0x13: "3200K", 0x14: "3300K", 0x15: "3400K", 0x07: "3500K",
           0x16: "3600K", 0x17: "3700K", 0x18: "3800K", 0x19: "3900K", 0x02: "4000K", 0x1A: "4100K",
           0x1B: "4200K", 0x1C: "4300K", 0x1D: "4400K", 0x08: "4500K", 0x1E: "4600K", 0x1F: "4700K",
           0x21: "4800K", 0x22: "4900K", 0x04: "5000K", 0x23: "5100K", 0x24: "5200K", 0x25: "5300K",
           0x26: "5400K", 0x09: "5500K", 0x27: "5600K", 0x28: "5700K", 0x29: "5800K", 0x2A: "5900K",
           0x0A: "6000K", 0x2B: "6100K", 0x2C: "6200K", 0x2D: "6300K", 0x2E: "6400K", 0x06: "6500K",
           0x2F: "6600K", 0x30: "6700K", 0x31: "6800K", 0x32: "6900K", 0x0B: "7000K", 0x33: "7100K"})
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
    while not reply.endswith(b"\\xff"):
        chunk = sock.recv(64)
        if not chunk:
            raise ConnectionError("closed")
        reply += chunk
    if len(reply) < 3 or reply[1] != 0x50:
        raise ValueError("error reply")
    return reply


def degrees(raw):
    return f"{signed16(raw) / UNITS_PER_DEGREE:+.1f}\\u00b0"


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
            return {"online": "OK", "pan": "--", "tilt": "--", "zoom": "--", "focus": "--",
                    "ae": "--", "wb": "--", "backlight": "--", "power": "Standby", "menu": "--"}
        pt = field("81090612ff", lambda r: (degrees(nibbles(r, 2, 4)), degrees(nibbles(r, 6, 4))))
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
        }


def main():
    try:
        state = read(HOST, PORT)
    except Exception:  # noqa: BLE001 - any failure means "not reachable", and the output must stay JSON
        state = {"online": "DOWN", "pan": "--", "tilt": "--", "zoom": "--", "focus": "--",
                 "ae": "--", "wb": "--", "backlight": "--", "power": "--", "menu": "--"}
    sys.stdout.write(json.dumps(state))


if __name__ == "__main__":
    main()
`

/**
 * The trigger that runs the poll.
 *
 * @param {string} host  camera address, passed to the script so the config carries it
 * @returns {object} a Companion trigger in export shape
 */
export function pollTrigger(host) {
	return {
		type: 'trigger',
		options: { name: 'Poll PTZ camera', enabled: true, sortOrder: 100, relativeDelay: false },
		actions: [exec('ptz-poll-exec', `python3 ${SCRIPT_PATH} ${host}`, V.STATE)],
		condition: [],
		events: [{ id: 'ptz-poll-every-second', type: 'interval', enabled: true, options: { seconds: INTERVAL_SECONDS } }],
		localVariables: [],
	}
}

/** The trigger id, so a rebuild replaces the previous copy instead of stacking another. */
export const TRIGGER_ID = 'trigger-ptz-poll'
