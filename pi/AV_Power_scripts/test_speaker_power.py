#!/usr/bin/env python3
"""Tests for speaker_power.py against a mock DLI relay HTTP server.

Runs entirely against 127.0.0.1 — never touches the real relay.

    cd "~/Desktop/AV Power Scripts" && python3 -m unittest test_speaker_power -v
"""

import base64
import contextlib
import http.server
import io
import threading
import unittest
from unittest import mock

import speaker_power as sp

GOOD_AUTH = "Basic " + base64.b64encode(b"media:FROM-VAULT-speaker-relay").decode()


class FakeRelay:
    """Scriptable state for the mock DLI power switch."""

    def __init__(self, mask=0xF0, require_auth=True, broken_page=False,
                 fail_switches=False, stuck=False):
        self.mask = mask
        self.require_auth = require_auth
        self.broken_page = broken_page  # serve HTML without the state comment
        self.fail_switches = fail_switches  # 500 on /outlet requests
        self.stuck = stuck  # accept /outlet requests but never change state
        self.lock = threading.Lock()


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence per-request stderr noise
        pass

    def _reply(self, code, body=b""):
        self.send_response(code)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        relay = self.server.relay
        if relay.require_auth and self.headers.get("Authorization") != GOOD_AUTH:
            self._reply(401)
            return
        with relay.lock:
            if self.path == "/index.htm":
                if relay.broken_page:
                    self._reply(200, b"<html><body>no state here</body></html>")
                else:
                    body = f"<html><!-- state={relay.mask:02x} lock=00 -->ok</html>"
                    self._reply(200, body.encode())
            elif self.path.startswith("/outlet?"):
                if relay.fail_switches:
                    self._reply(500)
                    return
                outlet, _, action = self.path[len("/outlet?"):].partition("=")
                bit = 1 << (int(outlet) - 1)
                if not relay.stuck:
                    relay.mask = relay.mask | bit if action == "ON" else relay.mask & ~bit
                self._reply(200, b"<html>ok</html>")
            else:
                self._reply(404)


class MockedTestCase(unittest.TestCase):
    """Base: one mock relay + patched base URL, fast retries, no real waits."""

    relay_kwargs = {}

    def setUp(self):
        self.relay = FakeRelay(**self.relay_kwargs)
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.relay = self.relay
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.server_close)
        for patch in (
            mock.patch.object(sp, "BASE_URL", f"http://127.0.0.1:{self.server.server_address[1]}"),
            mock.patch.object(sp, "BACKOFF_BASE", 0.0),
            mock.patch.object(sp, "VERIFY_WINDOW", 0.0),
            mock.patch.object(sp, "ATTEMPTS", 2),
        ):
            patch.start()
            self.addCleanup(patch.stop)


class TestRelayProtocol(MockedTestCase):
    def test_get_states_all_on(self):
        self.assertEqual(sp.get_states(), {5: True, 6: True, 7: True, 8: True})

    def test_get_states_mixed(self):
        self.relay.mask = 0x50  # outlets 5 and 7 on
        self.assertEqual(sp.get_states(), {5: True, 6: False, 7: True, 8: False})

    def test_switch_outlet_on_and_off(self):
        self.relay.mask = 0x00
        sp.switch_outlet(5, True)
        self.assertEqual(self.relay.mask, 0x10)
        sp.switch_outlet(5, False)
        self.assertEqual(self.relay.mask, 0x00)

    def test_bad_credentials_raise(self):
        with mock.patch.object(sp, "PASSWORD", "wrong"):
            with self.assertRaisesRegex(sp.SpeakerError, "401"):
                sp.get_states()

    def test_missing_state_comment_raises(self):
        self.relay.broken_page = True
        with self.assertRaisesRegex(sp.SpeakerError, "bitmask not found"):
            sp.get_states()

    def test_unreachable_relay_raises(self):
        with mock.patch.object(sp, "BASE_URL", "http://127.0.0.1:1"):
            with self.assertRaisesRegex(sp.SpeakerError, "failed"):
                sp.get_states()


class TestSetPower(MockedTestCase):
    def test_turn_off_all(self):
        self.assertTrue(sp.set_power(False))
        self.assertEqual(self.relay.mask, 0x00)

    def test_turn_on_all(self):
        self.relay.mask = 0x00
        self.assertTrue(sp.set_power(True))
        self.assertEqual(self.relay.mask, 0xF0)

    def test_only_pending_outlets_switched(self):
        self.relay.mask = 0x30  # 5,6 on; 7,8 off
        with mock.patch.object(sp, "switch_outlet", wraps=sp.switch_outlet) as spy:
            self.assertTrue(sp.set_power(True))
        self.assertEqual([c.args[0] for c in spy.call_args_list], [7, 8])

    def test_already_in_state_is_noop(self):
        with mock.patch.object(sp, "switch_outlet") as spy:
            self.assertTrue(sp.set_power(True))
        spy.assert_not_called()

    def test_unused_outlets_untouched(self):
        self.relay.mask = 0xF1  # outlet 1 on (not ours), speakers on
        self.assertTrue(sp.set_power(False))
        self.assertEqual(self.relay.mask, 0x01)  # outlet 1 must stay on

    def test_gives_up_when_unreachable(self):
        with mock.patch.object(sp, "BASE_URL", "http://127.0.0.1:1"):
            self.assertFalse(sp.set_power(True))

    def test_retries_when_switch_requests_fail(self):
        self.relay.mask = 0x00
        self.relay.fail_switches = True
        self.assertFalse(sp.set_power(True))

    def test_retries_when_state_never_changes(self):
        self.relay.mask = 0x00
        self.relay.stuck = True
        self.assertFalse(sp.set_power(True))

    def test_verify_polls_until_match(self):
        with mock.patch.object(sp, "_pending", side_effect=[[5], []]), \
                mock.patch.object(sp.time, "sleep"):
            self.assertTrue(sp._verify(True, window=60.0))

    def test_verify_survives_read_errors(self):
        with mock.patch.object(sp, "_pending", side_effect=sp.SpeakerError("x")):
            self.assertFalse(sp._verify(True, window=0.0))


class TestBriefState(MockedTestCase):
    def test_all_on(self):
        self.assertEqual(sp.brief_state(), "on")

    def test_all_off(self):
        self.relay.mask = 0x00
        self.assertEqual(sp.brief_state(), "off")

    def test_mixed(self):
        self.relay.mask = 0x50  # outlets 5 and 7 on
        self.assertEqual(sp.brief_state(), "mixed")

    def test_unreachable(self):
        with mock.patch.object(sp, "BASE_URL", "http://127.0.0.1:1"):
            self.assertEqual(sp.brief_state(), "unreachable")


class TestCLI(MockedTestCase):
    def test_status_exit_zero(self):
        self.assertEqual(sp.run("status"), 0)

    def test_status_exit_one_when_unreachable(self):
        with mock.patch.object(sp, "BASE_URL", "http://127.0.0.1:1"):
            self.assertEqual(sp.run("status"), 1)

    def test_run_on_and_off(self):
        self.assertEqual(sp.run("off"), 0)
        self.assertEqual(self.relay.mask, 0x00)
        self.assertEqual(sp.run("on"), 0)
        self.assertEqual(self.relay.mask, 0xF0)

    def test_run_failure_exit_code(self):
        with mock.patch.object(sp, "BASE_URL", "http://127.0.0.1:1"):
            self.assertEqual(sp.run("on"), 1)

    def test_state_prints_bare_token_no_newline(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(sp.run("state"), 0)
        self.assertEqual(out.getvalue(), "on")

    def test_state_exit_zero_when_unreachable(self):
        out = io.StringIO()
        with mock.patch.object(sp, "BASE_URL", "http://127.0.0.1:1"), \
                contextlib.redirect_stdout(out):
            self.assertEqual(sp.run("state"), 0)
        self.assertEqual(out.getvalue(), "unreachable")

    def test_main_dispatch(self):
        self.assertEqual(sp.main(["status"]), 0)

    def test_main_state(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sp.main(["state"]), 0)

    def test_main_rejects_bad_action(self):
        with self.assertRaises(SystemExit):
            sp.main(["explode"])


if __name__ == "__main__":
    unittest.main()
