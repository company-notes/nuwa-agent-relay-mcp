import asyncio
import json

import httpx
from fastmcp import Client as MCPClient

from src.Client import RelayClient
from src.Config import LocalConfig
from src.Server import StudioMCP


class DummyRelayClient:
    def __init__(self):
        self.calls = []

    def inbox(self):
        self.calls.append("inbox")
        return {"messages": []}

    def sendMessage(self, to, body, subject=None, artifactLinks=None):
        self.calls.append(("sendMessage", to, body))
        return {"id": "message-1"}


def test_studio_mcp_exposes_session_tools_without_work_aliases():
    async def verify():
        backend = DummyRelayClient()
        server = StudioMCP(LocalConfig(sessionID="session-a"), backend).createServer()

        async with MCPClient(server) as client:
            tools = await client.list_tools()
            names = {tool.name for tool in tools}

            assert "sendToAgent" in names
            assert "checkInbox" in names
            assert "checkAgentInbox" in names
            assert "provisionAgentMailbox" in names
            assert "checkHostInbox" not in names
            assert "provisionHostMailbox" not in names
            assert "sendMessage" not in names

            inbox = await client.call_tool("checkInbox", {})
            assert not inbox.is_error

            send = await client.call_tool("sendToAgent", {
                "to": "nuwa/reviewer/main", "message": "Review the deployment",
            })
            assert not send.is_error
            assert backend.calls == ["inbox", ("sendMessage", "nuwa/reviewer/main",
                                               "Review the deployment")]

    asyncio.run(verify())


class TestOAuthCredentials:
    def accessToken(self):
        return "oauth-sender"


def test_studio_send_to_agent_uses_private_runtime_capability(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    requests = []

    def backend(request):
        requests.append(request)
        return httpx.Response(201, json={
            "ok": True,
            "data": {"id": "msg-123", "threadId": "thread-456", "messageId": "msg-123"},
        })

    async def verify():
        config = LocalConfig().selectSession("session-a", "runtime-a")
        relay = RelayClient(config, TestOAuthCredentials(), httpx.MockTransport(backend))
        server = StudioMCP(config, relay).createServer()

        async with MCPClient(server) as client:
            response = await client.call_tool("sendToAgent", {
                "to": "nuwa/reviewer/main",
                "message": "Please review the deployment.",
                "subject": "Review request",
            })
            assert not response.is_error
            assert "thread-456" in str(response)

    asyncio.run(verify())

    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST"
    assert request.url.path == "/v2/messages"
    assert request.url.params["session_id"] == "session-a"
    assert request.headers["authorization"] == "Bearer oauth-sender"
    assert request.headers["x-nuwa-runtime-token"] == "runtime-a"
    assert "runtime-a" not in str(request.url)
    assert json.loads(request.content) == {
        "to": "nuwa/reviewer/main",
        "body": "Please review the deployment.",
        "subject": "Review request",
        "artifactLinks": [],
    }


class DummyWakeClient(DummyRelayClient):
    def registerWake(self, callbackURL, authMode="hmac", bearerToken=None):
        self.calls.append(("registerWake", callbackURL, authMode, bearerToken))
        return {
            "status": "pending_verification",
            "sessionID": "session-b",
            "verificationId": "5e1f1504-c00e-4434-b783-37b1ba2a0670",
            "callbackHost": "api2.cursor.sh",
            "challengeDelivered": True,
        }

    def verifyWake(self, verificationID, challenge):
        self.calls.append(("verifyWake", verificationID, challenge))
        return {"status": "active", "sessionID": "session-b"}

    def wakeSubscription(self):
        return {
            "enabled": True, "callbackHost": "api2.cursor.sh",
            "authMode": "bearer", "pending": None,
        }


def test_studio_mcp_verifies_signed_wake_with_selected_session():
    async def verify():
        backend = DummyWakeClient()
        server = StudioMCP(LocalConfig(sessionID="session-b"), backend).createServer()

        async with MCPClient(server) as client:
            callbackURL = "https://api2.cursor.sh/automations/webhook/agent-managed"
            credential = "private-provider-generated-token"

            pending = await client.call_tool("registerWake", {
                "callbackURL": callbackURL,
                "authMode": "bearer",
                "bearerToken": credential,
            })
            assert not pending.is_error
            assert "pending_verification" in str(pending)
            assert credential not in str(pending)

            confirmed = await client.call_tool("verifyWake", {
                "verificationID": "5e1f1504-c00e-4434-b783-37b1ba2a0670",
                "challenge": "received-only-by-hook",
            })
            assert not confirmed.is_error

            status = await client.call_tool("getWakeSubscription", {})
            assert not status.is_error
            assert "api2.cursor.sh" in str(status)

    asyncio.run(verify())
