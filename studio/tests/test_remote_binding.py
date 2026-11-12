import json

import httpx
import pytest

from src.CLI import StudioCLI
from src.Client import RemoteBindingClient
from src.Config import LocalConfig
from src.RemoteSessionTransfer import RemoteSessionTransfer


class AddressLease:
    def __init__(self):
        self.released = []

    def releaseRuntime(self, sessionID, runtimeToken):
        self.released.append((sessionID, runtimeToken))
        return {"id": sessionID}


def test_user_transfers_one_session_to_private_remote_mcp_without_exposing_secrets(
        tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load().selectSession(
        "session-a", "runtime-local-private", "resume-private-secret",
    )
    requests = []
    address = AddressLease()

    def backend(request):
        requests.append(request)

        if request.method == "GET":
            return httpx.Response(200, json={"ok": True, "data": {"bound": False}})

        assert request.method == "POST"
        assert json.loads(request.content) == {
            "sessionID": "session-a",
            "resumeToken": "resume-private-secret",
        }

        return httpx.Response(201, json={
            "ok": True,
            "data": {"bound": True, "sessionID": "session-a"},
        })

    remote = RemoteBindingClient("https://mcp-staging.example.com",
                                 "mcp-client-oauth-private", httpx.MockTransport(backend))
    result = RemoteSessionTransfer(config, address, remote).transfer()

    assert result == {"bound": True, "sessionID": "session-a"}
    assert address.released == [("session-a", "runtime-local-private")]
    assert not config.runtimePath().exists()
    assert config.requireResumeToken("session-a") == "resume-private-secret"
    assert len(requests) == 2
    assert all(request.headers["authorization"] == "Bearer mcp-client-oauth-private"
               for request in requests)
    assert all("private" not in str(request.url) for request in requests)
    assert requests[1].url.path == "/session-bindings"
    assert "runtime-local-private" not in requests[1].content.decode()


def test_active_local_wake_prevents_unsafe_remote_runtime_transfer(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load().selectSession("session-b", "runtime-b", "resume-b")
    LocalConfig.writePrivate(config.wakePath(), {"signing_secret": "private-wake"})
    address = AddressLease()

    def unexpected(request):
        pytest.fail("Remote binding must not be contacted while local Wake is still active.")

    remote = RemoteBindingClient("https://mcp-staging.example.com", "mcp-oauth-b",
                                 httpx.MockTransport(unexpected))

    with pytest.raises(ValueError, match="Unregister"):
        RemoteSessionTransfer(config, address, remote).transfer()

    assert address.released == []
    assert config.requireRuntimeToken() == "runtime-b"


def test_existing_remote_binding_refuses_to_release_local_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load().selectSession("session-b", "runtime-b", "resume-b")
    address = AddressLease()

    def backend(request):
        assert request.method == "GET"
        return httpx.Response(200, json={
            "ok": True, "data": {"bound": True, "sessionID": "session-existing"},
        })

    remote = RemoteBindingClient("https://mcp-staging.example.com", "mcp-oauth-b",
                                 httpx.MockTransport(backend))

    with pytest.raises(ValueError, match="already has"):
        RemoteSessionTransfer(config, address, remote).transfer()

    assert address.released == []
    assert config.requireRuntimeToken() == "runtime-b"


def test_explicit_remote_revocation_does_not_need_a_local_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load()
    address = AddressLease()

    def backend(request):
        assert request.method == "DELETE"
        assert request.url.path == "/session-bindings"

        return httpx.Response(200, json={"ok": True, "data": {"revoked": True}})

    remote = RemoteBindingClient("https://mcp-staging.example.com", "mcp-oauth-b",
                                 httpx.MockTransport(backend))

    assert RemoteSessionTransfer(config, address, remote).revoke() == {"revoked": True}
    assert address.released == []


def test_cli_remote_binding_requires_explicit_transfer_consent():
    parser = StudioCLI.createParser()
    args = parser.parse_args([
        "remote-bind", "--mcp-origin", "https://mcp-staging.example.com",
        "--mcp-oauth-token-env", "NUWA_REMOTE_MCP_OAUTH",
        "--authorize-runtime-transfer",
    ])

    assert args.authorize_runtime_transfer is True
    assert args.mcp_oauth_token_env == "NUWA_REMOTE_MCP_OAUTH"


def test_remote_client_rejects_insecure_origins_and_invalid_oauth_tokens():
    with pytest.raises(ValueError):
        RemoteBindingClient("http://mcp.example.com", "oauth")

    with pytest.raises(ValueError):
        RemoteBindingClient("https://mcp.example.com", "private\nheader-injection")
