"""Scenario tests for two native works through the real local MCP and remote HTTPS adapter."""

import asyncio
import json
import os
import threading
from uuid import uuid4

import httpx
from fastmcp import Client as MCPClient
from mcp.types import Implementation

from src.Config import LocalConfig
from src.RemoteWorkClient import RemoteWorkClient
from src.Server import StudioMCP


class WorkCredentials:
    def ensureAccessToken(self):
        return self.accessToken()

    def accessToken(self):
        return "oauth-work-test"


class WorkService:
    """Substitute only the external remote work service; assert the wire contract."""

    def __init__(self):
        self.sessions = {}
        self.messages = {}
        self.replies = []
        self.lock = threading.Lock()
        self.polls = {}

    def handle(self, request):
        assert request.method == "POST"
        assert request.url.path == "/mcp"
        assert request.headers["authorization"] == "Bearer oauth-work-test"
        mode = request.headers["x-nuwa-work-mode"]
        assert mode in ("codex", "claude-code")
        rpc = json.loads(request.content)
        assert rpc["method"] == "tools/call"
        params = rpc["params"]
        name = params["name"]
        threadID = params["_meta"]["threadId" if mode == "codex" else "sessionId"]
        arguments = params["arguments"]
        assert "threadId" not in arguments
        assert "from" not in arguments

        with self.lock:
            if name == "agentAddressStartWork":
                created = threadID not in self.sessions

                if created:
                    self.sessions[threadID] = {
                        "bound": True, "sessionID": str(uuid4()),
                        "canonical": "nuwa/" + mode + "/" + arguments["sessionName"],
                    }
                    self.messages[threadID] = []

                value = dict(self.sessions[threadID], created=created)
            elif name == "agentAddressGetStatus":
                value = {"session": self.sessions.get(threadID)}
            elif name == "relayInbox":
                self.polls[threadID] = self.polls.get(threadID, 0) + 1
                value = list(self.messages[threadID])
            elif name == "relayReplyThread":
                self.replies.append((threadID, arguments))
                value = {"threadId": arguments["threadID"], "id": str(uuid4())}
            elif name == "agentAddressReleaseWork":
                value = {"released": True, "sessionID": self.sessions[threadID]["sessionID"]}
            else:
                raise AssertionError(f"Unexpected remote tool: {name}")

        return httpx.Response(200, json={
            "jsonrpc": "2.0", "id": rpc["id"], "result": {
                "content": [{"type": "text", "text": json.dumps(value)}], "isError": False,
            },
        })

    def receive(self, threadID, body):
        with self.lock:
            message = {
                "id": str(uuid4()), "threadId": str(uuid4()), "kind": "message",
                "senderCanonicalAddress": "nuwa/reviewer/main",
                "recipientSessionID": self.sessions[threadID]["sessionID"], "body": body,
            }
            self.messages[threadID].insert(0, message)

        return message


class NativeQueue:
    """Substitute only native submission; no model account is available in CI."""

    def __init__(self):
        self.submissions = []
        self.lock = threading.Lock()

    def send(self, target, message):
        with self.lock:
            self.submissions.append((target, message))

        return {"submitted": True, "status": "queued", "consumptionConfirmed": False}

    def snapshot(self):
        with self.lock:
            return list(self.submissions)


class TestNativeWork:
    @staticmethod
    async def waitUntil(predicate):
        async with asyncio.timeout(8):
            while not predicate():
                await asyncio.sleep(0.025)

    @staticmethod
    async def call(client, threadID, name, arguments=None):
        result = await client.call_tool(name, arguments or {}, meta={"threadId": threadID})
        assert not result.is_error

        return json.loads(result.content[0].text)

    def testTwoWorksReceiveAndReplyWithTheirOwnIdentityAndResume(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
        service = WorkService()
        peer = NativeQueue()
        remote = RemoteWorkClient(WorkCredentials(), "https://mcp-test.example.com",
                                  httpx.MockTransport(service.handle))
        config = LocalConfig()
        threadA, threadB = str(uuid4()), str(uuid4())

        async def scenario():
            def server():
                return StudioMCP(config, workClient=remote, peer=peer, pollInterval=0.05).createServer()

            codex = Implementation(name="codex-cli", version="0.172.0")
            async with MCPClient(server(), client_info=codex) as client:
                denied = await client.call_tool("relayInbox", {}, raise_on_error=False)
                assert denied.is_error, "A Codex client without host context must fail closed"

                first = await self.call(client, threadA, "agentAddressStartWork", {
                    "sessionName": "review-build", "sessionDisplayName": "Review build",
                })
                second = await self.call(client, threadB, "agentAddressStartWork", {
                    "sessionName": "fix-parser", "sessionDisplayName": "Fix parser",
                })

                assert first["canonical"] == "nuwa/codex/review-build"
                assert second["canonical"] == "nuwa/codex/fix-parser"
                assert first["sessionID"] != second["sessionID"]

                firstMessage = service.receive(threadA, "Review the build")
                secondMessage = service.receive(threadB, "Fix the parser")
                await self.waitUntil(lambda: len(peer.snapshot()) == 2)

                submissions = dict(peer.snapshot())
                assert firstMessage["threadId"] in submissions["codex:" + threadA]
                assert firstMessage["body"] in submissions["codex:" + threadA]
                assert secondMessage["threadId"] in submissions["codex:" + threadB]
                assert secondMessage["body"] in submissions["codex:" + threadB]
                assert secondMessage["body"] not in submissions["codex:" + threadA]

                reply = await self.call(client, threadA, "relayReplyThread", {
                    "threadID": firstMessage["threadId"], "body": "Build reviewed.",
                })
                assert reply["threadId"] == firstMessage["threadId"]
                assert service.replies == [(threadA, {
                    "threadID": firstMessage["threadId"], "body": "Build reviewed.",
                })]

                await self.call(client, threadA, "agentAddressReleaseWork")
                await self.call(client, threadB, "agentAddressReleaseWork")

            thirdMessage = service.receive(threadA, "Follow-up after restart")
            async with MCPClient(server(), client_info=codex) as restarted:
                resumed = await self.call(restarted, threadA, "agentAddressStartWork")
                assert resumed["canonical"] == first["canonical"]
                assert resumed["sessionID"] == first["sessionID"]
                assert not resumed["created"]

                await self.waitUntil(lambda: len(peer.snapshot()) == 3)
                assert peer.snapshot()[-1][0] == "codex:" + threadA
                assert thirdMessage["body"] in peer.snapshot()[-1][1]

                polls = service.polls[threadA]
                await self.waitUntil(lambda: service.polls[threadA] >= polls + 2)
                assert len(peer.snapshot()) == 3, "Previously submitted messages cannot be replayed"

        asyncio.run(scenario())


    def testClaudeCodeWorkAddressUsesHostSessionAndResumes(self, tmp_path, monkeypatch):
        """An installed Claude Code work can initialize its own address and resume it."""
        monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path / "nuwa"))
        monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "claude"))
        threadID = str(uuid4())
        monkeypatch.setenv("CLAUDE_CODE_SESSION_ID", threadID)
        records = tmp_path / "claude" / "sessions"
        records.mkdir(parents=True)
        record = records / f"{os.getppid()}.json"
        record.write_text(json.dumps({"pid": os.getppid(), "sessionId": threadID}), encoding="utf-8")
        service = WorkService()
        peer = NativeQueue()
        remote = RemoteWorkClient(WorkCredentials(), "https://mcp-test.example.com",
                                  httpx.MockTransport(service.handle))

        async def scenario():
            def server():
                return StudioMCP(LocalConfig(), workClient=remote, peer=peer, pollInterval=0.05).createServer()

            claude = Implementation(name="claude-code", version="2.1.332")
            async with MCPClient(server(), client_info=claude) as client:
                result = await client.call_tool("agentAddressStartWork", {
                    "sessionName": "file-share", "sessionDisplayName": "File Share",
                }, raise_on_error=False)

                assert not result.is_error, result.content
                first = json.loads(result.content[0].text)
                assert first["canonical"] == "nuwa/claude-code/file-share"
                message = service.receive(threadID, "Review the file sharing workflow")
                await self.waitUntil(lambda: len(peer.snapshot()) == 1)
                assert peer.snapshot()[0][0] == "claude:" + threadID
                assert message["threadId"] in peer.snapshot()[0][1]

                status = await client.call_tool("agentAddressGetStatus", {})
                assert json.loads(status.content[0].text)["session"]["sessionID"] == first["sessionID"]
                await client.call_tool("agentAddressReleaseWork", {})

            async with MCPClient(server(), client_info=claude) as restarted:
                resumed = await restarted.call_tool("agentAddressStartWork", {})
                assert json.loads(resumed.content[0].text)["canonical"] == first["canonical"]

                # Claude retains the startup env after /clear; a changed host record must
                # block the old work rather than route a fresh tool call through it.
                record.write_text(json.dumps({
                    "pid": os.getppid(), "sessionId": str(uuid4()),
                }), encoding="utf-8")
                denied = await restarted.call_tool("agentAddressGetStatus", {}, raise_on_error=False)
                assert denied.is_error

        asyncio.run(scenario())
