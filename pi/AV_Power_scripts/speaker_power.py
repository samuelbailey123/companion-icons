#!/usr/bin/env python3
"""Power control for the FOH speakers via the DLI web power switch (10.23.0.250).

The speakers are plugged into a Digital Loggers DIN relay ("FOH Speaker
Power", serial DIN320502). Its web UI's ON/OFF links are plain authenticated
GET requests, so this script drives the four speaker outlets directly:

    5: Left Main    6: Left Sub    7: Right Main    8: Right Sub

Outlets 1-4 are unused and are deliberately never touched (no ``outlet?a=``
all-outlet commands). The relay page embeds the live outlet bitmask in an
HTML comment (``<!-- state=f0 -->``), which is read back to verify every
switch actually happened.

Usage:
    python3 speaker_power.py on       # switch all four speaker outlets ON
    python3 speaker_power.py off      # switch all four speaker outlets OFF
    python3 speaker_power.py status   # read-only outlet state report
    python3 speaker_power.py state    # bare token: on|off|mixed|unreachable

The ``state`` action's stdout is consumed by Bitfocus Companion (polled every
~10s to drive button colours), so it must stay exactly one bare token — no
trailing newline and no log lines — and always exits 0.

Credentials are the relay's fixed web account. If it is ever changed on the
relay, update the two constants below to match.
"""

import argparse
import base64
import re
import sys
import time
import urllib.error
import urllib.request

USERNAME = "media"
PASSWORD = "FROM-VAULT-speaker-relay"  # redacted for the public repo: 1Password › PA power relay (DLI DIN)

BASE_URL = "http://10.23.0.250"
HTTP_TIMEOUT = 10.0
ATTEMPTS = 6
BACKOFF_BASE = 2.0  # seconds; grows linearly per attempt
VERIFY_WINDOW = 15.0  # seconds to poll for the expected outlet states

# Outlet number -> speaker name. Only these outlets are ever switched.
OUTLETS = {
    5: "Left Main",
    6: "Left Sub",
    7: "Right Main",
    8: "Right Sub",
}

_STATE_RE = re.compile(r"<!--\s*state=([0-9a-fA-F]{1,2})\s")


class SpeakerError(Exception):
    """A relay request failed, or the state read-back could not be parsed."""


def log(level: str, message: str) -> None:
    """Print one timestamped log line."""
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {level:<5} Speakers (10.23.0.250): {message}", flush=True)


def _request(path: str) -> str:
    """GET *path* from the relay with Basic auth; return the response body."""
    token = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()
    request = urllib.request.Request(
        BASE_URL + path, headers={"Authorization": f"Basic {token}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return response.read(65536).decode("ascii", "replace")
    except (urllib.error.URLError, OSError) as exc:
        raise SpeakerError(f"request to {path} failed: {exc}") from exc


def get_states() -> dict:
    """Return {outlet number: is_on} parsed from the relay's state bitmask."""
    body = _request("/index.htm")
    match = _STATE_RE.search(body)
    if not match:
        raise SpeakerError("state bitmask not found in relay page")
    mask = int(match.group(1), 16)
    return {n: bool(mask & (1 << (n - 1))) for n in OUTLETS}


def switch_outlet(number: int, turn_on: bool) -> None:
    """Switch one outlet — the same request the web UI's ON/OFF links issue."""
    _request(f"/outlet?{number}={'ON' if turn_on else 'OFF'}")


def _pending(turn_on: bool) -> list:
    """Outlet numbers not yet in the requested state."""
    states = get_states()
    return [n for n in OUTLETS if states[n] != turn_on]


def _verify(turn_on: bool, window: float) -> bool:
    """Poll until every outlet matches the requested state, within *window*."""
    deadline = time.monotonic() + window
    while True:
        try:
            if not _pending(turn_on):
                return True
        except SpeakerError:
            pass
        if time.monotonic() >= deadline:
            return False
        time.sleep(2)


def set_power(turn_on: bool) -> bool:
    """Drive all speaker outlets to the requested state; True on success."""
    desired = "ON" if turn_on else "OFF"
    for attempt in range(1, ATTEMPTS + 1):
        try:
            pending = _pending(turn_on)
        except SpeakerError as exc:
            log("WARN", f"attempt {attempt}/{ATTEMPTS}: state read failed: {exc}")
            time.sleep(BACKOFF_BASE * attempt)
            continue
        if not pending:
            log("INFO", f"all speaker outlets confirmed {desired}")
            return True
        try:
            for number in pending:
                switch_outlet(number, turn_on)
                log("INFO", f"outlet {number} ({OUTLETS[number]}) switched {desired}")
        except SpeakerError as exc:
            log("WARN", f"attempt {attempt}/{ATTEMPTS}: switch failed: {exc}")
            time.sleep(BACKOFF_BASE * attempt)
            continue
        if _verify(turn_on, VERIFY_WINDOW):
            log("INFO", f"all speaker outlets confirmed {desired}")
            return True
        log("WARN", f"not all outlets {desired} yet, retrying")
    log("ERROR", f"gave up after {ATTEMPTS} attempts")
    return False


def brief_state() -> str:
    """Single-shot state token for automation: on, off, mixed or unreachable."""
    try:
        states = get_states()
    except SpeakerError:
        return "unreachable"
    if all(states.values()):
        return "on"
    if not any(states.values()):
        return "off"
    return "mixed"


def run(action: str) -> int:
    """Apply *action* (on/off/status/state); return a process exit code."""
    if action == "state":
        # Bitfocus Companion reads stdout: bare token, no newline, always exit 0.
        print(brief_state(), end="")
        return 0

    if action == "status":
        try:
            states = get_states()
        except SpeakerError as exc:
            log("ERROR", f"status query failed: {exc}")
            return 1
        for number, name in OUTLETS.items():
            log("INFO", f"outlet {number} ({name}) is {'ON' if states[number] else 'OFF'}")
        return 0

    turn_on = action == "on"
    verb = "SPEAKERS ON" if turn_on else "SPEAKERS OFF"
    print(f"--- {verb}: outlets {', '.join(map(str, OUTLETS))} ---", flush=True)
    success = set_power(turn_on)
    print(f"--- done: speakers {'confirmed ' + ('ON' if turn_on else 'OFF') if success else 'NOT confirmed'} ---", flush=True)
    return 0 if success else 1


def main(argv=None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="FOH speaker power control (DLI relay)")
    parser.add_argument("action", choices=("on", "off", "status", "state"))
    args = parser.parse_args(argv)
    return run(args.action)


if __name__ == "__main__":
    sys.exit(main())
