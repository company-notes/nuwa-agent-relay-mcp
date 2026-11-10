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


def test_studio_fastmcp_exposes_independent_tools_and_routes_calls():
    async def verify():
        backend = DummyRelayClient()
        server = StudioMCP(LocalConfig(workAddressID="test-work"), backend).createServer()

        async with MCPClient(server) as client:
            tools = await client.list_tools()
            names = {tool.name for tool in tools}

            assert len(names) == 18
            assert {"checkInbox", "sendMessage", "sendToAgent", "getReceipt", "acknowledgeRead",
                    "registerWake", "verifyWake", "getWakeSubscription", "removeWakeSubscription"} <= names

            inbox = await client.call_tool("checkInbox", {})
            assert not inbox.is_error
            assert backend.calls == ["inbox"]

            sent = await client.call_tool("sendMessage", {
                "to": "org/host/work", "body": "test message",
            })
            assert not sent.is_error
            assert backend.calls[-1] == ("sendMessage", "org/host/work", "test message")

            agentMessage = await client.call_tool("sendToAgent", {
                "to": "@beta/reviewer",
                "message": "Review the latest deployment",
                "subject": "Review",
            })
            assert not agentMessage.is_error
            assert backend.calls[-1] == ("sendMessage", "@beta/reviewer", "Review the latest deployment")

    asyncio.run(verify())

class TestOAuthCredentials:
    def accessToken(self):
        return "oauth-sender"


def test_studio_send_to_agent_reaches_relay_using_the_selected_work():
    """Core client flow: FastMCP tool → real RelayClient → one Work-scoped HTTP POST."""
    requests = []

    def relayBackend(request):
        requests.append(request)

        return httpx.Response(201, json={
            "ok": True,
            "data": {
                "id": "msg-123",
                "threadId": "thread-456",
                "messageId": "msg-123",
            },
        })

    async def verify():
        config = LocalConfig(workAddressID="work-a")
        relay = RelayClient(config, TestOAuthCredentials(), httpx.MockTransport(relayBackend))
        server = StudioMCP(config, relay).createServer()

        async with MCPClient(server) as client:
            result = await client.call_tool("sendToAgent", {
                "to": "@beta/reviewer",
                "message": "Please review the deployment.",
                "subject": "Review request",
                "artifactLinks": ["https://files.example.com/report"],
            })

            assert not result.is_error, "MCP sendToAgent should submit a Work message"
            assert "thread-456" in str(result), "MCP should forward the Relay thread identifier"

    asyncio.run(verify())

    assert len(requests) == 1, "A single sendToAgent call must make exactly one Relay request"
    request = requests[0]
    assert request.method == "POST"
    assert request.url.path == "/v1/messages"
    assert request.url.params["work_address_id"] == "work-a"
    assert request.headers["authorization"] == "Bearer oauth-sender"
    assert json.loads(request.content) == {
        "to": "@beta/reviewer",
        "body": "Please review the deployment.",
        "subject": "Review request",
        "artifactLinks": ["https://files.example.com/report"],
    }

class DummyWakeClient(DummyRelayClient):
    def registerWake(self, callbackURL, authMode="hmac", bearerToken=None):
        self.calls.append(("registerWake", callbackURL, authMode, bearerToken))
        return {
            "status": "pending_verification",
            "workAddressId": "work-b",
            "verificationId": "5e1f1504-c00e-4434-b783-37b1ba2a0670",
            "callbackHost": "api2.cursor.sh",
            "challengeDelivered": True,
        }

    def verifyWake(self, verificationID, challenge):
        self.calls.append(("verifyWake", verificationID, challenge))
        return {"status": "active", "workAddressId": "work-b"}

    def wakeSubscription(self):
        return {"enabled": True, "callbackHost": "api2.cursor.sh",
                "authMode": "bearer", "pending": None}


def test_studio_mcp_agent_can_register_bearer_webhook_and_verify_without_cli():
    """The same Skill workflow must work through Studio MCP Tools, not only Remote."""
    async def verify():
        backend = DummyWakeClient()
        server = StudioMCP(LocalConfig(workAddressID="work-b"), backend).createServer()

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
            assert callbackURL not in str(pending)

            confirmed = await client.call_tool("verifyWake", {
                "verificationID": "5e1f1504-c00e-4434-b783-37b1ba2a0670",
                "challenge": "received-only-by-hook",
            })
            assert not confirmed.is_error
            assert "active" in str(confirmed)

            status = await client.call_tool("getWakeSubscription", {})
            assert not status.is_error
            assert "api2.cursor.sh" in str(status)
            assert backend.calls == [
                ("registerWake", callbackURL, "bearer", credential),
                ("verifyWake", "5e1f1504-c00e-4434-b783-37b1ba2a0670",
                 "received-only-by-hook"),
            ]

    asyncio.run(verify())
