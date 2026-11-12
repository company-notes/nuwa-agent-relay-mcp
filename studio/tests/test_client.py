import json

import httpx
import pytest

from src.Client import AddressClient, RelayClient
from src.Config import LocalConfig


class FakeCredentials:
    def accessToken(self) -> str:
        return "test-oauth"


def test_relay_client_forwards_selected_session_and_private_runtime_token(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig().selectSession("session-a", "runtime-private")
    requests = []

    def backend(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True, "data": {"ready": True}})

    client = RelayClient(config, FakeCredentials(), httpx.MockTransport(backend))

    assert client.inbox() == {"ready": True}
    assert client.sendMessage("org/reviewer/main", "hello") == {"ready": True}
    assert client.receipt("msg-1", refreshArchive=True) == {"ready": True}
    assert client.acceptHandoff("handoff/1") == {"ready": True}

    assert all(request.url.params["session_id"] == "session-a" for request in requests)
    assert all(request.headers["x-nuwa-runtime-token"] == "runtime-private" for request in requests)
    assert all(request.headers["authorization"] == "Bearer test-oauth" for request in requests)
    assert all("runtime-private" not in str(request.url) for request in requests)
    assert requests[2].url.params["refresh"] == "archive"
    assert "/handoff%2F1/accept" in str(requests[3].url)
    assert all(request.url.path.startswith("/v2/") for request in requests)


def test_address_client_uses_v2_without_runtime_capability():
    requests = []

    def backend(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True, "data": {"organization": None}})

    address = AddressClient("https://address.company-notes.com", FakeCredentials(),
                            transport=httpx.MockTransport(backend))

    assert address.status()["organization"] is None
    assert requests[0].url.path == "/v2/account/status"
    assert "session_id" not in requests[0].url.params
    assert "x-nuwa-runtime-token" not in requests[0].headers


def test_missing_session_or_runtime_token_fails_before_network(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))

    def backend(request):
        pytest.fail("Missing Session Runtime capability cannot make a Relay request.")

    relay = RelayClient(LocalConfig(), FakeCredentials(), httpx.MockTransport(backend))

    with pytest.raises(ValueError, match="No Session"):
        relay.inbox()

    selected = LocalConfig(sessionID="session-a")
    relay = RelayClient(selected, FakeCredentials(), httpx.MockTransport(backend))

    with pytest.raises(ValueError, match="No Runtime capability"):
        relay.inbox()


def test_studio_wake_registration_targets_only_selected_session(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig().selectSession("session-b", "runtime-b")
    requests = []

    def backend(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True, "data": {"status": "active"}})

    relay = RelayClient(config, FakeCredentials(), httpx.MockTransport(backend))
    relay.registerWake("https://api2.cursor.sh/automations/webhook/example",
                       "bearer", "private-provider-token")
    relay.verifyWake("verification-1", "challenge-1")

    assert requests[0].url.path == "/v2/wake-subscription"
    assert requests[1].url.path == "/v2/wake-subscription/verification"
    assert all(request.url.params["session_id"] == "session-b" for request in requests)
    assert all(request.headers["x-nuwa-runtime-token"] == "runtime-b" for request in requests)
    assert json.loads(requests[0].content)["authMode"] == "bearer"
