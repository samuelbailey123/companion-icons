#!/usr/bin/env python3
"""Tests for projector_power.py using mock NTCONTROL / PJLink TCP servers.

Runs entirely against 127.0.0.1 mock sockets — never touches real projectors.

    cd "~/Desktop/Projector Scripts" && python3 -m unittest -v
"""

import contextlib
import hashlib
import io
import socketserver
import threading
import unittest
from unittest import mock

import projector_power as pp

NT_SALT = "abcdef01"
PJ_SEED = "12345678"
NT_HASH = hashlib.md5(f"admin1:FROM-VAULT-projectors:{NT_SALT}".encode()).hexdigest()
PJ_HASH = hashlib.md5(f"{PJ_SEED}FROM-VAULT-projectors".encode()).hexdigest()


class FakeUnit:
    """Shared scriptable state for one fake projector."""

    def __init__(self, power="0", protected=True, nt_error=None, pj_error=None,
                 nt_banner=None, pj_banner=None, accepts_power=True,
                 nt_mute=False, stuck=False):
        self.power = power  # PJLink-style: 0 standby, 1 on, 2 cooling, 3 warm-up
        self.protected = protected
        self.nt_error = nt_error  # e.g. "ERR3" -> reply 00ERR3
        self.pj_error = pj_error  # e.g. "ERR2" -> reply %1POWR=ERR2
        self.nt_banner = nt_banner  # override banner entirely
        self.pj_banner = pj_banner
        self.accepts_power = accepts_power
        self.nt_mute = nt_mute  # send banner, read command, reply nothing
        self.stuck = stuck  # acknowledge PON/POF but never change state
        self.lock = threading.Lock()


def _recv_cr_line(rfile) -> bytes:
    """Read from a handler's rfile until a bare ``\\r`` (no ``\\n``) or EOF."""
    data = b""
    while not data.endswith(b"\r"):
        byte = rfile.read(1)
        if not byte:
            break
        data += byte
    return data


class _NTHandler(socketserver.StreamRequestHandler):
    """Speaks just enough NTCONTROL for the client under test."""

    def handle(self):
        unit = self.server.unit
        if unit.nt_banner is not None:
            self.wfile.write(unit.nt_banner)
            if not unit.nt_banner:
                return
        elif unit.protected:
            self.wfile.write(f"NTCONTROL 1 {NT_SALT}\r".encode())
        else:
            self.wfile.write(b"NTCONTROL 0\r")
        self.wfile.flush()
        msg = _recv_cr_line(self.rfile).rstrip(b"\r").decode("ascii", "replace")
        if unit.protected and unit.nt_banner is None:
            if not msg.startswith(NT_HASH):
                self.wfile.write(b"00ERRA\r")
                return
            msg = msg[len(NT_HASH):]
        cmd = msg[2:] if msg.startswith("00") else msg
        with unit.lock:
            if unit.nt_mute:
                return
            if unit.nt_error:
                self.wfile.write(f"00{unit.nt_error}\r".encode())
            elif cmd == "QPW":
                state = "001" if unit.power in ("1", "3") else "000"
                self.wfile.write(f"00{state}\r".encode())
            elif cmd in ("PON", "POF") and unit.accepts_power:
                if not unit.stuck:
                    unit.power = "1" if cmd == "PON" else "0"
                self.wfile.write(f"00{cmd}\r".encode())
            else:
                self.wfile.write(b"00ERR1\r")


class _PJHandler(socketserver.StreamRequestHandler):
    """Speaks just enough PJLink class 1 for the client under test."""

    def handle(self):
        unit = self.server.unit
        if unit.pj_banner is not None:
            self.wfile.write(unit.pj_banner)
        elif unit.protected:
            self.wfile.write(f"PJLINK 1 {PJ_SEED}\r".encode())
        else:
            self.wfile.write(b"PJLINK 0\r")
        self.wfile.flush()
        msg = _recv_cr_line(self.rfile).rstrip(b"\r").decode("ascii", "replace")
        if unit.protected and unit.pj_banner is None:
            if not msg.startswith(PJ_HASH):
                self.wfile.write(b"PJLINK ERRA\r")
                return
            msg = msg[len(PJ_HASH):]
        with unit.lock:
            if unit.pj_error:
                self.wfile.write(f"%1POWR={unit.pj_error}\r".encode())
            elif msg == "%1POWR ?":
                self.wfile.write(f"%1POWR={unit.power}\r".encode())
            elif msg in ("%1POWR 1", "%1POWR 0") and unit.accepts_power:
                unit.power = msg[-1]
                self.wfile.write(b"%1POWR=OK\r")
            else:
                self.wfile.write(b"%1POWR=ERR2\r")


class MockServers:
    """NTCONTROL + PJLink mock listeners on ephemeral localhost ports."""

    def __init__(self, unit: FakeUnit):
        self.nt = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _NTHandler)
        self.pj = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _PJHandler)
        self.nt.unit = self.pj.unit = unit
        for srv in (self.nt, self.pj):
            threading.Thread(target=srv.serve_forever, daemon=True).start()

    def patches(self):
        """Context-manager patches pointing projector_power at the mocks."""
        return (
            mock.patch.object(pp, "NT_PORT", self.nt.server_address[1]),
            mock.patch.object(pp, "PJLINK_PORT", self.pj.server_address[1]),
            mock.patch.object(pp, "SOCKET_TIMEOUT", 3.0),
        )

    def close(self):
        for srv in (self.nt, self.pj):
            srv.shutdown()
            srv.server_close()


class MockedTestCase(unittest.TestCase):
    """Base: one fake unit + patched ports, fast retries, no real sleeps."""

    unit_kwargs = {}

    def setUp(self):
        self.unit = FakeUnit(**self.unit_kwargs)
        self.servers = MockServers(self.unit)
        self.addCleanup(self.servers.close)
        for patch in self.servers.patches() + (
            mock.patch.object(pp, "BACKOFF_BASE", 0.0),
            mock.patch.object(pp, "VERIFY_WINDOW", 0.0),
            mock.patch.object(pp, "ATTEMPTS", 2),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.proj = pp.Projector("Test", "PT-TEST", "127.0.0.1")
        for patch in (mock.patch.object(pp, "PROJECTORS", (self.proj,)),):
            patch.start()
            self.addCleanup(patch.stop)


class TestNTControl(MockedTestCase):
    def test_qpw_standby(self):
        self.assertEqual(pp.nt_query_power("127.0.0.1"), "standby")

    def test_qpw_on(self):
        self.unit.power = "1"
        self.assertEqual(pp.nt_query_power("127.0.0.1"), "on")

    def test_pon_sets_state(self):
        self.assertEqual(pp.ntcontrol_send("127.0.0.1", "PON"), "PON")
        self.assertEqual(self.unit.power, "1")

    def test_pof_sets_state(self):
        self.unit.power = "1"
        self.assertEqual(pp.ntcontrol_send("127.0.0.1", "POF"), "POF")
        self.assertEqual(self.unit.power, "0")

    def test_unprotected_mode(self):
        self.unit.protected = False
        self.assertEqual(pp.nt_query_power("127.0.0.1"), "standby")

    def test_error_reply_raises(self):
        self.unit.nt_error = "ERR3"
        with self.assertRaisesRegex(pp.ProjectorError, "ERR3"):
            pp.ntcontrol_send("127.0.0.1", "PON")

    def test_bad_credentials_rejected(self):
        with mock.patch.object(pp, "PASSWORD", "wrong"):
            with self.assertRaisesRegex(pp.ProjectorError, "ERRA"):
                pp.ntcontrol_send("127.0.0.1", "QPW")

    def test_unexpected_banner_raises(self):
        self.unit.nt_banner = b"HELLO\r"
        with self.assertRaisesRegex(pp.ProjectorError, "banner"):
            pp.ntcontrol_send("127.0.0.1", "QPW")

    def test_empty_reply_raises(self):
        self.unit.nt_banner = b""
        with self.assertRaisesRegex(pp.ProjectorError, "empty reply|banner"):
            pp.ntcontrol_send("127.0.0.1", "QPW")

    def test_connection_refused_raises(self):
        with mock.patch.object(pp, "NT_PORT", 1):
            with self.assertRaisesRegex(pp.ProjectorError, "socket error"):
                pp.ntcontrol_send("127.0.0.1", "QPW", timeout=1.0)

    def test_empty_command_reply_raises(self):
        self.unit.nt_mute = True
        with self.assertRaisesRegex(pp.ProjectorError, "empty reply"):
            pp.ntcontrol_send("127.0.0.1", "QPW")

    def test_malformed_banner_missing_salt_raises(self):
        self.unit.nt_banner = b"NTCONTROL 1\r"
        with self.assertRaisesRegex(pp.ProjectorError, "malformed"):
            pp.ntcontrol_send("127.0.0.1", "QPW")

    def test_oversized_reply_raises(self):
        self.unit.nt_banner = b"x" * (pp.MAX_REPLY_BYTES + 100)
        with self.assertRaisesRegex(pp.ProjectorError, "exceeded"):
            pp.ntcontrol_send("127.0.0.1", "QPW")

    def test_unknown_qpw_payload(self):
        self.unit.nt_error = None
        with mock.patch.object(pp, "ntcontrol_send", return_value="XYZ"):
            self.assertTrue(pp.nt_query_power("127.0.0.1").startswith("unknown"))

    def test_query_passes_timeout_down(self):
        with mock.patch.object(pp, "ntcontrol_send", return_value="001") as send:
            self.assertEqual(pp.nt_query_power("127.0.0.1", timeout=1.5), "on")
        send.assert_called_once_with("127.0.0.1", "QPW", timeout=1.5)


class TestPJLink(MockedTestCase):
    def test_query_states(self):
        for code, name in pp.PJLINK_STATES.items():
            self.unit.power = code
            self.assertEqual(pp.pjlink_query_power("127.0.0.1"), name)

    def test_query_unknown_state(self):
        self.unit.power = "9"
        self.assertEqual(pp.pjlink_query_power("127.0.0.1"), "unknown(9)")

    def test_power_on_and_off(self):
        self.assertEqual(pp.pjlink_send("127.0.0.1", "POWR 1"), "OK")
        self.assertEqual(self.unit.power, "1")
        self.assertEqual(pp.pjlink_send("127.0.0.1", "POWR 0"), "OK")
        self.assertEqual(self.unit.power, "0")

    def test_no_auth_mode(self):
        self.unit.protected = False
        self.assertEqual(pp.pjlink_query_power("127.0.0.1"), "standby")

    def test_bad_password_raises(self):
        with mock.patch.object(pp, "PASSWORD", "wrong"):
            with self.assertRaisesRegex(pp.ProjectorError, "authentication"):
                pp.pjlink_send("127.0.0.1", "POWR ?")

    def test_error_reply_raises(self):
        self.unit.pj_error = "ERR2"
        with self.assertRaisesRegex(pp.ProjectorError, "ERR2"):
            pp.pjlink_send("127.0.0.1", "POWR 1")

    def test_unexpected_banner_raises(self):
        self.unit.pj_banner = b"NOPE\r"
        with self.assertRaisesRegex(pp.ProjectorError, "banner"):
            pp.pjlink_send("127.0.0.1", "POWR ?")

    def test_malformed_banner_missing_seed_raises(self):
        self.unit.pj_banner = b"PJLINK 1\r"
        with self.assertRaisesRegex(pp.ProjectorError, "malformed"):
            pp.pjlink_send("127.0.0.1", "POWR ?")

    def test_connection_refused_raises(self):
        with mock.patch.object(pp, "PJLINK_PORT", 1):
            with self.assertRaisesRegex(pp.ProjectorError, "socket error"):
                pp.pjlink_send("127.0.0.1", "POWR ?", timeout=1.0)

    def test_query_passes_timeout_down(self):
        with mock.patch.object(pp, "pjlink_send", return_value="0") as send:
            self.assertEqual(pp.pjlink_query_power("127.0.0.1", timeout=1.5), "standby")
        send.assert_called_once_with("127.0.0.1", "POWR ?", timeout=1.5)


class TestOrchestration(MockedTestCase):
    def test_query_power_falls_back_to_pjlink(self):
        self.unit.power = "1"
        with mock.patch.object(pp, "NT_PORT", 1):
            self.assertEqual(pp.query_power("127.0.0.1"), "on")

    def test_query_power_passes_timeout_to_both_channels(self):
        with mock.patch.object(pp, "nt_query_power", side_effect=pp.ProjectorError("x")) as ntq, \
                mock.patch.object(pp, "pjlink_query_power", return_value="on") as pjq:
            self.assertEqual(pp.query_power("127.0.0.1", timeout=2.5), "on")
        ntq.assert_called_once_with("127.0.0.1", timeout=2.5)
        pjq.assert_called_once_with("127.0.0.1", timeout=2.5)

    def test_send_power_falls_back_to_pjlink(self):
        with mock.patch.object(pp, "NT_PORT", 1):
            self.assertEqual(pp._send_power(self.proj, True), "PJLink")
        self.assertEqual(self.unit.power, "1")

    def test_send_power_prefers_ntcontrol(self):
        self.assertEqual(pp._send_power(self.proj, False), "NTCONTROL")

    def test_verify_state_accepts_transitional(self):
        self.unit.power = "3"  # warm-up counts as heading to 'on'
        with mock.patch.object(pp, "NT_PORT", 1):  # force PJLink (richer states)
            self.assertTrue(pp._verify_state(self.proj, "on", window=0.0))

    def test_verify_state_times_out(self):
        self.assertFalse(pp._verify_state(self.proj, "on", window=0.0))

    def test_verify_state_polls_until_match(self):
        with mock.patch.object(pp, "query_power", side_effect=["standby", "on"]), \
                mock.patch.object(pp.time, "sleep"):
            self.assertTrue(pp._verify_state(self.proj, "on", window=60.0))

    def test_verify_state_survives_query_errors(self):
        with mock.patch.object(pp, "query_power", side_effect=pp.ProjectorError("x")):
            self.assertFalse(pp._verify_state(self.proj, "on", window=0.0))

    def test_set_power_on_success(self):
        self.assertTrue(pp.set_power(self.proj, True))
        self.assertEqual(self.unit.power, "1")

    def test_set_power_off_success(self):
        self.unit.power = "1"
        self.assertTrue(pp.set_power(self.proj, False))
        self.assertEqual(self.unit.power, "0")

    def test_set_power_already_in_state(self):
        self.unit.power = "1"
        with mock.patch.object(pp, "_send_power") as send:
            self.assertTrue(pp.set_power(self.proj, True))
        send.assert_not_called()

    def test_set_power_gives_up_when_unreachable(self):
        with mock.patch.object(pp, "NT_PORT", 1), mock.patch.object(pp, "PJLINK_PORT", 1):
            self.assertFalse(pp.set_power(self.proj, True))

    def test_set_power_retries_when_not_confirmed(self):
        self.unit.accepts_power = False  # commands answered ERR1, state never changes
        self.unit.nt_error = None
        self.assertFalse(pp.set_power(self.proj, True))

    def test_set_power_retries_when_accepted_but_stuck(self):
        self.unit.stuck = True  # PON acknowledged but state never changes
        self.assertFalse(pp.set_power(self.proj, True))


class TestProjectorState(MockedTestCase):
    def test_on(self):
        self.unit.power = "1"
        self.assertEqual(pp.projector_state(self.proj), "on")

    def test_warm_up_counts_as_on(self):
        self.unit.power = "3"
        self.assertEqual(pp.projector_state(self.proj), "on")

    def test_standby_counts_as_off(self):
        self.assertEqual(pp.projector_state(self.proj), "off")

    def test_cooling_counts_as_off(self):
        self.unit.power = "2"
        with mock.patch.object(pp, "NT_PORT", 1):  # force PJLink (reports cooling)
            self.assertEqual(pp.projector_state(self.proj), "off")

    def test_unknown_payload_is_unreachable(self):
        with mock.patch.object(pp, "query_power", return_value="unknown(9)"):
            self.assertEqual(pp.projector_state(self.proj), "unreachable")

    def test_both_channels_dead_is_unreachable(self):
        with mock.patch.object(pp, "NT_PORT", 1), mock.patch.object(pp, "PJLINK_PORT", 1):
            self.assertEqual(pp.projector_state(self.proj), "unreachable")

    def test_uses_short_state_timeout(self):
        with mock.patch.object(pp, "query_power", return_value="on") as query:
            self.assertEqual(pp.projector_state(self.proj), "on")
        query.assert_called_once_with(self.proj.ip, timeout=pp.STATE_TIMEOUT)


class TestBriefState(MockedTestCase):
    def test_all_on(self):
        self.unit.power = "1"
        self.assertEqual(pp.brief_state(), "on")

    def test_all_off(self):
        self.assertEqual(pp.brief_state(), "off")

    def test_all_unreachable(self):
        with mock.patch.object(pp, "NT_PORT", 1), mock.patch.object(pp, "PJLINK_PORT", 1):
            self.assertEqual(pp.brief_state(), "unreachable")

    def test_mixed(self):
        projs = (self.proj, pp.Projector("Test 2", "PT-TEST", "127.0.0.1"))
        with mock.patch.object(pp, "PROJECTORS", projs), \
                mock.patch.object(pp, "projector_state", side_effect=["on", "off"]):
            self.assertEqual(pp.brief_state(), "mixed")


class TestCLI(MockedTestCase):
    def test_status_exit_zero(self):
        self.assertEqual(pp.run("status"), 0)

    def test_status_exit_one_when_unreachable(self):
        with mock.patch.object(pp, "NT_PORT", 1), mock.patch.object(pp, "PJLINK_PORT", 1):
            self.assertEqual(pp.run("status"), 1)

    def test_run_on(self):
        self.assertEqual(pp.run("on"), 0)
        self.assertEqual(self.unit.power, "1")

    def test_run_off_failure_exit_code(self):
        with mock.patch.object(pp, "NT_PORT", 1), mock.patch.object(pp, "PJLINK_PORT", 1):
            self.assertEqual(pp.run("off"), 1)

    def test_run_state_prints_bare_token_no_newline(self):
        self.unit.power = "1"
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            self.assertEqual(pp.run("state"), 0)
        self.assertEqual(buf.getvalue(), "on")  # Companion needs exactly this

    def test_run_state_exit_zero_even_when_unreachable(self):
        with mock.patch.object(pp, "NT_PORT", 1), mock.patch.object(pp, "PJLINK_PORT", 1):
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(pp.run("state"), 0)
        self.assertEqual(buf.getvalue(), "unreachable")

    def test_main_dispatch(self):
        self.assertEqual(pp.main(["status"]), 0)

    def test_main_state(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            self.assertEqual(pp.main(["state"]), 0)
        self.assertEqual(buf.getvalue(), "off")

    def test_main_rejects_bad_action(self):
        with self.assertRaises(SystemExit):
            pp.main(["explode"])


if __name__ == "__main__":
    unittest.main()
