#!/usr/bin/env python3
"""Power control for the three Panasonic projectors (10.23.0.112 / .234 / .80).

Primary channel : NTCONTROL — Panasonic's native command protocol on TCP 1024
                  (MD5-salted auth; commands framed as ``<md5>00PON\\r``).
Fallback channel: PJLink on TCP 4352 (``%1POWR 1\\r`` / ``%1POWR 0\\r``).

These are the same channels the projectors' web UIs drive behind the scenes,
but they respond instantly and reliably — including on 10.23.0.80, whose web
server is flaky. Every command retries with backoff and the final state is
verified with a read-back query.

Usage:
    python3 projector_power.py on       # power ON all projectors
    python3 projector_power.py off      # power OFF (standby) all projectors
    python3 projector_power.py status   # read-only power state query
    python3 projector_power.py state    # bare aggregate token: on/off/mixed/unreachable
                                        # stdout is consumed by Bitfocus Companion, so it
                                        # must stay a bare token — no newline, no log lines

Credentials are the projectors' fixed web-control account (the same account
drives NTCONTROL and PJLink). If they are ever changed on the projectors,
update the two constants below to match.
"""

import argparse
import hashlib
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

USERNAME = "admin1"
PASSWORD = "FROM-VAULT-projectors"  # redacted for the public repo: 1Password › Projectors (Panasonic) web + PJLink

NT_PORT = 1024
PJLINK_PORT = 4352
SOCKET_TIMEOUT = 8.0
# Brief state queries use a short timeout so a Companion poll finishes fast
# even when the whole AV network is unreachable.
STATE_TIMEOUT = 4.0
MAX_REPLY_BYTES = 4096  # protocol replies are tens of bytes; cap runaway peers
ATTEMPTS = 6
BACKOFF_BASE = 2.0  # seconds; grows linearly per attempt
VERIFY_WINDOW = 20.0  # seconds to poll for the expected state


@dataclass(frozen=True)
class Projector:
    """One projector: display name, model, and IP address."""

    name: str
    model: str
    ip: str


PROJECTORS = (
    Projector("Projector 1", "PT-DW740", "10.23.0.112"),
    Projector("Projector 2", "PT-DW740", "10.23.0.234"),
    Projector("Projector 3", "PT-EW630", "10.23.0.80"),
)


class ProjectorError(Exception):
    """A control command failed on one channel (or all channels/retries)."""


def log(proj: Projector, level: str, message: str) -> None:
    """Print one timestamped, per-projector log line."""
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {level:<5} {proj.name} ({proj.ip}): {message}", flush=True)


def _read_until_cr(sock: socket.socket) -> bytes:
    """Read from *sock* until a carriage return or the peer closes."""
    data = b""
    while not data.endswith(b"\r"):
        chunk = sock.recv(256)
        if not chunk:
            break
        data += chunk
        if len(data) > MAX_REPLY_BYTES:
            raise ProjectorError(f"reply exceeded {MAX_REPLY_BYTES} bytes without terminator")
    return data


# --------------------------------------------------------------------------
# NTCONTROL (TCP 1024) — primary channel
# --------------------------------------------------------------------------

def ntcontrol_send(ip: str, command: str, timeout: float = SOCKET_TIMEOUT) -> str:
    """Send one NTCONTROL *command* (e.g. ``PON``) and return the reply payload.

    Handles the ``NTCONTROL 1 <salt>`` protected-mode handshake by prefixing
    the command with ``md5(user:pass:salt)``. Raises ProjectorError on any
    protocol error, ``ERR*`` reply, or socket failure.
    """
    try:
        with socket.create_connection((ip, NT_PORT), timeout=timeout) as sock:
            sock.settimeout(timeout)
            banner = _read_until_cr(sock).decode("ascii", "replace").strip()
            if banner.startswith("NTCONTROL 1"):
                parts = banner.split()
                if len(parts) < 3:
                    raise ProjectorError(f"malformed NTCONTROL banner: {banner!r}")
                seed = f"{USERNAME}:{PASSWORD}:{parts[2]}".encode()
                prefix = hashlib.md5(seed).hexdigest().encode()
            elif banner.startswith("NTCONTROL 0"):
                prefix = b""
            else:
                raise ProjectorError(f"unexpected NTCONTROL banner: {banner!r}")
            sock.sendall(prefix + b"00" + command.encode("ascii") + b"\r")
            reply = _read_until_cr(sock).decode("ascii", "replace").strip()
    except OSError as exc:
        raise ProjectorError(f"NTCONTROL socket error: {exc}") from exc
    if not reply:
        raise ProjectorError("NTCONTROL: empty reply (bad credentials?)")
    payload = reply[2:] if reply.startswith("00") else reply
    if "ERR" in payload.upper():
        raise ProjectorError(f"NTCONTROL error reply: {payload!r}")
    return payload


def nt_query_power(ip: str, timeout: float = SOCKET_TIMEOUT) -> str:
    """Return power state via NTCONTROL QPW: 'on', 'standby', or 'unknown(...)'."""
    payload = ntcontrol_send(ip, "QPW", timeout=timeout)
    if payload.endswith("1"):
        return "on"
    if payload.endswith("0"):
        return "standby"
    return f"unknown({payload})"


# --------------------------------------------------------------------------
# PJLink (TCP 4352) — fallback channel
# --------------------------------------------------------------------------

def pjlink_send(ip: str, body: str, timeout: float = SOCKET_TIMEOUT) -> str:
    """Send one PJLink class-1 command body (e.g. ``POWR 1``); return the reply.

    Handles the ``PJLINK 1 <seed>`` auth handshake with md5(seed+password).
    Raises ProjectorError on auth failure, ``ERR*`` reply, or socket failure.
    """
    try:
        with socket.create_connection((ip, PJLINK_PORT), timeout=timeout) as sock:
            sock.settimeout(timeout)
            banner = _read_until_cr(sock).decode("ascii", "replace").strip()
            if banner.upper().startswith("PJLINK 1"):
                parts = banner.split()
                if len(parts) < 3:
                    raise ProjectorError(f"malformed PJLink banner: {banner!r}")
                prefix = hashlib.md5((parts[2] + PASSWORD).encode()).hexdigest().encode()
            elif banner.upper().startswith("PJLINK 0"):
                prefix = b""
            else:
                raise ProjectorError(f"unexpected PJLink banner: {banner!r}")
            sock.sendall(prefix + b"%1" + body.encode("ascii") + b"\r")
            reply = _read_until_cr(sock).decode("ascii", "replace").strip()
    except OSError as exc:
        raise ProjectorError(f"PJLink socket error: {exc}") from exc
    if "ERRA" in reply.upper():
        raise ProjectorError("PJLink authentication failed")
    _, _, result = reply.partition("=")
    if result.upper().startswith("ERR"):
        raise ProjectorError(f"PJLink error reply: {reply!r}")
    return result


PJLINK_STATES = {"0": "standby", "1": "on", "2": "cooling", "3": "warm-up"}


def pjlink_query_power(ip: str, timeout: float = SOCKET_TIMEOUT) -> str:
    """Return power state via PJLink ``POWR ?`` query."""
    result = pjlink_send(ip, "POWR ?", timeout=timeout)
    return PJLINK_STATES.get(result, f"unknown({result})")


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------

def query_power(ip: str, timeout: float = SOCKET_TIMEOUT) -> str:
    """Power state via NTCONTROL, falling back to PJLink."""
    try:
        return nt_query_power(ip, timeout=timeout)
    except ProjectorError:
        return pjlink_query_power(ip, timeout=timeout)


def projector_state(proj: Projector) -> str:
    """Brief poll state for one projector: 'on', 'off', or 'unreachable'.

    Never prints or logs — callers feed the result straight to Companion.
    """
    try:
        state = query_power(proj.ip, timeout=STATE_TIMEOUT)
    except ProjectorError:
        return "unreachable"
    if state in ("on", "warm-up"):
        return "on"
    if state in ("standby", "cooling"):
        return "off"
    return "unreachable"


def brief_state() -> str:
    """Aggregate all projectors into one token: on/off/unreachable/mixed."""
    with ThreadPoolExecutor(max_workers=len(PROJECTORS)) as pool:
        states = set(pool.map(projector_state, PROJECTORS))
    return states.pop() if len(states) == 1 else "mixed"


def _send_power(proj: Projector, turn_on: bool) -> str:
    """Send the power command on the first channel that accepts it.

    Returns the channel name used; raises ProjectorError if both fail.
    """
    try:
        ntcontrol_send(proj.ip, "PON" if turn_on else "POF")
        return "NTCONTROL"
    except ProjectorError as nt_exc:
        log(proj, "WARN", f"NTCONTROL failed ({nt_exc}); trying PJLink")
        pjlink_send(proj.ip, f"POWR {1 if turn_on else 0}")
        return "PJLink"


def _verify_state(proj: Projector, desired: str, window: float = VERIFY_WINDOW) -> bool:
    """Poll for up to *window* seconds until the state matches *desired*.

    A transitional state heading the right way (warm-up for 'on', cooling
    for 'standby') also counts as success — the projector has accepted the
    command and is completing it on its own.
    """
    acceptable = {desired, "warm-up" if desired == "on" else "cooling"}
    deadline = time.monotonic() + window
    while True:
        try:
            if query_power(proj.ip) in acceptable:
                return True
        except ProjectorError:
            pass
        if time.monotonic() >= deadline:
            return False
        time.sleep(2)


def set_power(proj: Projector, turn_on: bool) -> bool:
    """Drive one projector to the requested state; True on success."""
    desired = "on" if turn_on else "standby"
    for attempt in range(1, ATTEMPTS + 1):
        try:
            state = query_power(proj.ip)
            if state == desired:
                log(proj, "INFO", f"already {desired}")
                return True
        except ProjectorError as exc:
            log(proj, "WARN", f"status query failed ({exc}); proceeding anyway")
        try:
            channel = _send_power(proj, turn_on)
            log(proj, "INFO", f"power-{'on' if turn_on else 'off'} accepted via {channel}")
        except ProjectorError as exc:
            log(proj, "WARN", f"attempt {attempt}/{ATTEMPTS} failed on both channels: {exc}")
            time.sleep(BACKOFF_BASE * attempt)
            continue
        if _verify_state(proj, desired, VERIFY_WINDOW):
            log(proj, "INFO", f"confirmed {desired}")
            return True
        log(proj, "WARN", f"state not yet '{desired}', retrying")
    log(proj, "ERROR", f"gave up after {ATTEMPTS} attempts")
    return False


def run(action: str) -> int:
    """Apply *action* (on/off/status/state) to every projector in parallel.

    Returns a process exit code: 0 if every projector succeeded, 1 otherwise.
    'state' always returns 0 and prints exactly one bare token (no newline) —
    its stdout is stored verbatim by Bitfocus Companion to drive button colors.
    """
    if action == "state":
        print(brief_state(), end="")
        return 0

    if action == "status":
        failures = 0
        for proj in PROJECTORS:
            try:
                log(proj, "INFO", f"power is {query_power(proj.ip)}")
            except ProjectorError as exc:
                log(proj, "ERROR", f"status query failed: {exc}")
                failures += 1
        return 1 if failures else 0

    turn_on = action == "on"
    verb = "POWER ON" if turn_on else "POWER OFF (standby)"
    print(f"--- {verb}: {len(PROJECTORS)} projectors ---", flush=True)
    with ThreadPoolExecutor(max_workers=len(PROJECTORS)) as pool:
        results = list(pool.map(lambda p: set_power(p, turn_on), PROJECTORS))
    ok = sum(results)
    print(f"--- done: {ok}/{len(PROJECTORS)} projectors confirmed ---", flush=True)
    return 0 if all(results) else 1


def main(argv=None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Panasonic projector power control")
    parser.add_argument("action", choices=("on", "off", "status", "state"))
    args = parser.parse_args(argv)
    return run(args.action)


if __name__ == "__main__":
    sys.exit(main())
