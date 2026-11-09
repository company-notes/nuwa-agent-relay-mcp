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

            assert len(names) == 17
            assert {"checkInbox", "sendMessage", "sendToAgent", "getReceipt", "acknowledgeRead",
                    "registerWake", "getWakeSubscription", "removeWakeSubscription"} <= names

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
