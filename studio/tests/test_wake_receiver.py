"""Focused local Wake Echo end-to-end test with real HTTP and a controlled Relay backend."""

import hashlib
import hmac
import http.client
import json
import os
import threading
import urllib.error
import urllib.request
from uuid import uuid4

import httpx
import pytest

from src.Client import RelayClient
from src.Config import LocalConfig
from src.WakeReceiver import WakeHTTPServer, WakeReceiver
from src.WakeSubscription import WakeSubscription


class TestCredentials:
    def accessToken(self):
        return "session-b-oauth-token"


class WakeFlowBackend:
    """External Relay substitute; real RelayClient + real local HTTP listener."""

    signingSecret = "abc123" * 14

    def __init__(self):
        self.messageID = str(uuid4())
        self.threadID = str(uuid4())
        self.calls = []
        self.messages = [{
            "id": self.messageID,
            "threadId": self.threadID,
            "senderSessionID": "session-a",
            "recipientSessionID": "session-b",
            "kind": "message",
            "body": "Please check my build.",
        }]

    def receive(self, request):
        self.calls.append(request)
        assert request.headers["authorization"] == "Bearer session-b-oauth-token"
        assert request.headers["x-nuwa-runtime-token"] == "runtime-b"
        assert request.url.params["session_id"] == "session-b"

        if request.method == "POST" and request.url.path == "/v2/wake-subscription":
            assert request.content
            return httpx.Response(201, json={"ok": True, "data": {
                "sessionID": "session-b",
                "status": "pending_verification",
                "verificationId": str(uuid4()),
                "callbackHost": "wake-tunnel.example.com",
                "challengeDelivered": False,
                "signingSecret": self.signingSecret,
            }})

        if request.method == "GET" and request.url.path == "/v2/wake-subscription":
            return httpx.Response(200, json={"ok": True, "data": {
                "sessionID": "session-b",
                "enabled": True,
                "callbackHost": "wake-tunnel.example.com",
                "authMode": "hmac",
                "pending": None,
            }})

        if request.method == "DELETE" and request.url.path == "/v2/wake-subscription":
            return httpx.Response(200, json={"ok": True, "data": {"removed": True}})

        if request.method == "GET" and request.url.path == "/v2/messages/" + self.messageID:
            return httpx.Response(200, json={"ok": True, "data": self.messages[0]})

        if request.method == "GET" and request.url.path == "/v2/threads/" + self.threadID:
            return httpx.Response(200, json={"ok": True, "data": self.messages})

        if request.method == "POST" and request.url.path == "/v2/threads/" + self.threadID + "/messages":
            body = json.loads(request.content)
            self.messages.append({
                "id": str(uuid4()),
                "threadId": self.threadID,
                "senderSessionID": "session-b",
                "recipientSessionID": "session-a",
                "kind": "message",
                "body": body["body"],
            })
            return httpx.Response(201, json={"ok": True, "data": self.messages[-1]})

        raise AssertionError(f"Unexpected Relay request {request.method} {request.url}")


class TestWakeReceiver:
    """Tests the real HTTP entry point, HMAC, durable queue and thread reply."""

    def test_coreWakeEchoRoundTrip(self, tmp_path, monkeypatch, caplog):
        monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
        config = LocalConfig(apiURL="https://relay-test.example.com").selectSession("session-b", "runtime-b")
        backend = WakeFlowBackend()
        client = RelayClient(config, TestCredentials(), httpx.MockTransport(backend.receive))
        subscription = WakeSubscription(config, client)
        result = subscription.register("https://wake-tunnel.example.com/wake")

        assert "Wake challenge delivery failed" in caplog.text
        assert backend.signingSecret not in caplog.text
        assert result["status"] == "pending_verification"
        assert "signingSecret" not in result
        assert subscription.status()["localSigningKeyReady"] is True
        assert config.wakePath().exists()

        if os.name != "nt":
            assert config.wakePath().stat().st_mode & 0o777 == 0o600

        receiver = WakeReceiver(config, client)

        with WakeHTTPServer(("127.0.0.1", 0), receiver) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            target = "http://127.0.0.1:%d/wake" % server.server_port

            try:
                payload = {
                    "event": "nuwa.message.available",
                    "eventVersion": 2,
                    "messageID": backend.messageID,
                    "recipientSessionID": "session-b",
                    "relayThreadID": backend.threadID,
                    "senderSessionID": "session-a",
                    "senderCanonicalAddress": "nuwa/alpha/main",
                    "senderDisplayName": "小晴",
                    "recipientAgentID": "agent-b",
                    "recipientCanonicalAddress": "nuwa/beta/main",
                    "recipientBotID": "bot-b",
                    "body": "Please check my build.",
                }
                raw = json.dumps(payload, separators=(",", ":")).encode()
                valid = "sha256=" + hmac.new(
                    backend.signingSecret.encode(), raw, hashlib.sha256,
                ).hexdigest()

                self._request(target, raw, "sha256=invalid", expectedStatus=401)

                otherSession = dict(payload, recipientSessionID="session-a")
                otherRaw = json.dumps(otherSession).encode()
                otherSignature = "sha256=" + hmac.new(
                    backend.signingSecret.encode(), otherRaw, hashlib.sha256,
                ).hexdigest()
                self._request(target, otherRaw, otherSignature, expectedStatus=403)

                invalidVersion = dict(payload, eventVersion=1)
                invalidVersionRaw = json.dumps(invalidVersion).encode()
                invalidVersionSignature = "sha256=" + hmac.new(
                    backend.signingSecret.encode(), invalidVersionRaw, hashlib.sha256,
                ).hexdigest()
                self._request(target, invalidVersionRaw, invalidVersionSignature,
                              expectedStatus=400)

                legacyPayload = {
                    "event": "nuwa.message.available",
                    "messageId": backend.messageID,
                    "sessionID": "session-b",
                }
                legacyRaw = json.dumps(legacyPayload).encode()
                legacySignature = "sha256=" + hmac.new(
                    backend.signingSecret.encode(), legacyRaw, hashlib.sha256,
                ).hexdigest()
                self._request(target, legacyRaw, legacySignature, expectedStatus=400)

                untrustedFields = dict(payload, runtimeToken="untrusted-secret")
                untrustedRaw = json.dumps(untrustedFields).encode()
                untrustedSignature = "sha256=" + hmac.new(
                    backend.signingSecret.encode(), untrustedRaw, hashlib.sha256,
                ).hexdigest()
                self._request(target, untrustedRaw, untrustedSignature, expectedStatus=400)

                accepted = self._request(target, raw, valid, expectedStatus=202)
                assert accepted["accepted"] is True
                assert accepted["duplicate"] is False

                duplicate = self._request(target, raw, valid, expectedStatus=202)
                assert duplicate["duplicate"] is True

                minimal = {
                    "event": "nuwa.message.available",
                    "eventVersion": 2,
                    "messageID": backend.messageID,
                    "recipientSessionID": "session-b",
                }
                minimalRaw = json.dumps(minimal, separators=(",", ":")).encode()
                minimalSignature = "sha256=" + hmac.new(
                    backend.signingSecret.encode(), minimalRaw, hashlib.sha256,
                ).hexdigest()
                minimalResult = self._request(target, minimalRaw, minimalSignature,
                                              expectedStatus=202)
                assert minimalResult["duplicate"] is True
                assert minimalResult["messageID"] == backend.messageID

                assert len(backend.calls) == 2, "Webhook accepts without reading message synchronously"
                receiver.processDue()
                replies = [message for message in backend.messages
                           if message["senderSessionID"] == "session-b"]
                assert len(replies) == 1, "Exactly one automatic Echo reply is expected"
                assert replies[0]["body"] == "Nuwa local echo receipt for " + backend.messageID

                receiver.processDue()
                receiver.handler.process(backend.messageID)
                assert len(backend.messages) == 2, "Echo replay must be idempotent"

                # Receiver restarts using its persisted subscription and inbox.
                restarted = WakeReceiver(config, client)
                assert restarted.accept(raw, valid)["duplicate"] is True
                restarted.processDue()
                assert len(backend.messages) == 2, "Restart must not replay a completed Echo"
            finally:
                server.shutdown()
                thread.join(timeout=3)

        result = subscription.remove()
        assert result == {"removed": True}
        assert not config.wakePath().exists()

    @classmethod
    def _request(cls, url, body, signature, expectedStatus):
        request = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json", "X-Nuwa-Wake-Signature": signature},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                assert response.status == expectedStatus
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            assert error.code == expectedStatus
            return json.loads(error.read())


def test_local_wake_rejects_malformed_content_length_without_handling_it_as_an_exception(
        tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig(apiURL="https://relay-test.example.com").selectSession("session-b", "runtime-b")
    backend = WakeFlowBackend()
    client = RelayClient(config, TestCredentials(), httpx.MockTransport(backend.receive))
    WakeSubscription(config, client).register("https://wake-tunnel.example.com/wake")

    with WakeHTTPServer(("127.0.0.1", 0), WakeReceiver(config, client)) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)

        try:
            connection.putrequest("POST", "/wake")
            connection.putheader("Content-Length", "not-a-number")
            connection.endheaders()
            response = connection.getresponse()
            assert response.status == 411
            assert json.loads(response.read())["error"] == "Content-Length required."
        finally:
            connection.close()
            server.shutdown()
            thread.join(timeout=3)


def test_local_wake_rejects_other_work_credentials_before_listening(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig(apiURL="https://relay-test.example.com").selectSession("session-b", "runtime-b")
    backend = WakeFlowBackend()
    client = RelayClient(config, TestCredentials(), httpx.MockTransport(backend.receive))
    subscription = WakeSubscription(config, client)
    subscription.register("https://wake-tunnel.example.com/wake")

    changed = LocalConfig(apiURL=config.apiURL, sessionID="session-a")

    with pytest.raises(RuntimeError, match="different Session"):
        WakeReceiver(changed, client)
