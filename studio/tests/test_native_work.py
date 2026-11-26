"""Scenario tests for two native works through the real local MCP and remote HTTPS adapter."""

import asyncio
import base64
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Empty, Queue
from uuid import uuid4

import httpx
import pytest
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


class WorkSocket:
    """External service notification transport substitute."""

    def __init__(self, service, threadID):
        self.service = service
        self.threadID = threadID
        self.events = Queue()

    def __enter__(self):
        with self.service.lock:
            self.service.sockets.setdefault(self.threadID, []).append(self)

        return self

    def __exit__(self, *args):
        with self.service.lock:
            self.service.sockets[self.threadID].remove(self)

    def recv(self, timeout):
        try:
            return self.events.get(timeout=timeout)
        except Empty as error:
            raise TimeoutError from error


class WorkService:
    """Substitute only the external remote work service; assert the wire contract."""

    def __init__(self):
        self.sessions = {}
        self.messages = {}
        self.replies = []
        self.sends = []
        self.lock = threading.Lock()
        self.polls = {}
        self.pages = {}
        self.sockets = {}
        policyID = str(uuid4())
        self.policy = {"id": policyID, "mode": "manual", "revision": 1,
                       "settingsURL": "https://agent-relay.company-notes.com/manage?collaboration=" + policyID}

    def connect(self, url, additional_headers, **options):
        assert url == "wss://mcp-test.example.com/work-inbox/events/stream"
        assert additional_headers["Authorization"] == "Bearer oauth-work-test"

        return WorkSocket(self, additional_headers["X-Nuwa-Work-ID"])

    def signal(self, threadID):
        with self.lock:
            for socket in self.sockets.get(threadID, []):
                socket.events.put(json.dumps({"inboxChanged": True}))

    def _events(self, request):
        threadID = request.headers["x-nuwa-work-id"]

        with self.lock:
            rows = list(reversed(self.messages[threadID]))

            self.pages[threadID] = self.pages.get(threadID, 0) + 1
            cursor = int(request.url.params["after_sequence"])
            items = [{"sequence": index + 1, "messageID": row["id"]}
                     for index, row in enumerate(rows) if index >= cursor]
            value = {"items": items, "cursor": len(rows), "hasMore": False}

        return httpx.Response(200, json={"ok": True, "data": value})

    def handle(self, request):
        assert request.headers["authorization"] == "Bearer oauth-work-test"

        if request.method == "GET":
            assert request.url.path == "/work-inbox/events"

            return self._events(request)

        assert request.method == "POST"
        assert request.url.path == "/mcp"
        assert request.headers["authorization"] == "Bearer oauth-work-test"
        mode = request.headers["x-nuwa-work-mode"]
        assert mode in ("codex", "claude-code", "grok-build", "opencode")
        rpc = json.loads(request.content)
        assert rpc["method"] == "tools/call"
        params = rpc["params"]
        name = params["name"]
        threadID = (request.headers["x-nuwa-work-id"] if mode == "grok-build" else
                    params["_meta"][{"codex": "threadId", "claude-code": "sessionId",
                                     "opencode": "ai.opencode/sessionID"}[mode]])
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

                value = dict(self.sessions[threadID], created=created, collaborationPolicy=dict(self.policy))
            elif name == "agentAddressGetStatus":
                value = {"session": self.sessions.get(threadID), "collaborationPolicy": dict(self.policy)}
            elif name == "relayInbox":
                self.polls[threadID] = self.polls.get(threadID, 0) + 1
                value = list(self.messages[threadID])
            elif name == "relayMessage":
                value = next(row for row in self.messages[threadID] if row["id"] == arguments["messageID"])
            elif name == "sendToAgent":
                self.sends.append((threadID, arguments))
                value = {"id": str(uuid4()), "threadId": str(uuid4())}
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

    def receive(self, threadID, body, kind="message"):
        with self.lock:
            message = {
                "id": str(uuid4()), "threadId": str(uuid4()), "kind": kind,
                "senderCanonicalAddress": "nuwa/reviewer/main",
                "recipientSessionID": self.sessions[threadID]["sessionID"], "body": body,
            }
            self.messages[threadID].insert(0, message)

        self.signal(threadID)

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
        service.policy["mode"] = "unconfigured"
        opened = []
        monkeypatch.setattr("webbrowser.open", lambda url: opened.append(url) or True)
        peer = NativeQueue()
        remote = RemoteWorkClient(WorkCredentials(), "https://mcp-test.example.com",
                                  httpx.MockTransport(service.handle), streamConnector=service.connect)
        config = LocalConfig()
        threadA, threadB = str(uuid4()), str(uuid4())

        async def scenario():
            def server():
                return StudioMCP(config, workClient=remote, peer=peer, reconnectDelay=0.05).createServer()

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
                assert opened == [service.policy["settingsURL"]]
                service.policy["mode"] = "autonomous"
                status = await self.call(client, threadA, "agentAddressGetStatus")
                assert status["collaborationPolicy"]["mode"] == "autonomous"

                firstMessage = service.receive(threadA, "Review the build")
                secondMessage = service.receive(threadB, "Fix the parser")
                await self.waitUntil(lambda: len(peer.snapshot()) == 2)

                submissions = dict(peer.snapshot())
                assert firstMessage["threadId"] in submissions["codex:" + threadA]
                assert firstMessage["body"] in submissions["codex:" + threadA]
                assert firstMessage["id"] in submissions["codex:" + threadA]
                assert "messageID" in submissions["codex:" + threadA]
                assert secondMessage["threadId"] in submissions["codex:" + threadB]
                assert secondMessage["body"] in submissions["codex:" + threadB]
                assert secondMessage["body"] not in submissions["codex:" + threadA]

                reply = await self.call(client, threadA, "relayReplyThread", {
                    "threadID": firstMessage["threadId"], "messageID": firstMessage["id"],
                    "body": "Build reviewed.", "autonomous": True,
                })
                assert reply["threadId"] == firstMessage["threadId"]
                assert service.replies == [(threadA, {
                    "threadID": firstMessage["threadId"], "messageID": firstMessage["id"],
                    "body": "Build reviewed.", "autonomous": True,
                })]

                await self.call(client, threadA, "agentAddressReleaseWork")
                await self.call(client, threadB, "agentAddressReleaseWork")

            thirdMessage = service.receive(threadA, "Reply received while offline", kind="reply")
            async with MCPClient(server(), client_info=codex) as restarted:
                resumed = await self.call(restarted, threadA, "agentAddressStartWork")
                assert resumed["canonical"] == first["canonical"]
                assert resumed["sessionID"] == first["sessionID"]
                assert not resumed["created"]
                assert resumed["collaborationPolicy"]["mode"] == "autonomous"
                assert opened == [service.policy["settingsURL"]]

                await self.waitUntil(lambda: len(peer.snapshot()) == 3)
                assert len(peer.snapshot()) == 3, "An offline reply must reach the resumed native work"
                assert peer.snapshot()[-1][0] == "codex:" + threadA
                assert thirdMessage["body"] in peer.snapshot()[-1][1]

                pages = service.pages[threadA]
                service.signal(threadA)
                await self.waitUntil(lambda: service.pages[threadA] > pages)
                assert not service.polls, "Idle native receivers must not poll the remote Inbox"
                assert len(peer.snapshot()) == 3, "Previously submitted messages cannot be replayed"

                idlePages = service.pages[threadA]
                await asyncio.sleep(1.1)
                assert service.pages[threadA] == idlePages, "An idle connection must not fetch the remote Inbox"

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
                                  httpx.MockTransport(service.handle), streamConnector=service.connect)

        async def scenario():
            def server():
                return StudioMCP(LocalConfig(), workClient=remote, peer=peer, reconnectDelay=0.05).createServer()

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


    @pytest.mark.parametrize("mode, clientName", [
        ("grok-build", "grok-cli"),
        ("opencode", "opencode"),
    ])
    def testNativeClientInitializesDistinctWorkAndResumes(self, tmp_path, monkeypatch, mode, clientName):
        """Ask for an address, start work, exchange a message, and recover the same address."""
        monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
        service = WorkService()
        remote = RemoteWorkClient(WorkCredentials(), "https://mcp-test.example.com",
                                  httpx.MockTransport(service.handle), streamConnector=service.connect)
        nativeID = str(uuid4()) if mode == "grok-build" else "ses_" + uuid4().hex
        secondID = str(uuid4()) if mode == "grok-build" else "ses_" + uuid4().hex
        identity = Implementation(name=clientName, version="2.2.3")

        async def work(identifier, name=None):
            if mode == "grok-build":
                monkeypatch.setenv("GROK_SESSION_ID", identifier)

            meta = {"ai.opencode/sessionID": identifier} if mode == "opencode" else None
            server = StudioMCP(LocalConfig(), workClient=remote, reconnectDelay=0.05).createServer()

            async with MCPClient(server, client_info=identity) as client:
                status = await client.call_tool("agentAddressGetStatus", {}, meta=meta, raise_on_error=False)

                assert not status.is_error, status.content
                args = {"sessionName": name, "sessionDisplayName": name} if name else {}
                result = await client.call_tool("agentAddressStartWork", args, meta=meta)
                started = json.loads(result.content[0].text)
                message = service.receive(identifier, "Review the API")
                inbox = await client.call_tool("relayInbox", {}, meta=meta)
                assert message["id"] in inbox.content[0].text

                reply = await client.call_tool("relayReplyThread", {
                    "threadID": message["threadId"], "body": "Reviewed.",
                }, meta=meta)
                assert not reply.is_error
                sent = await client.call_tool("sendToAgent", {
                    "to": "nuwa/reviewer/main", "message": "Independent message",
                }, meta=meta)
                assert not sent.is_error

                await client.call_tool("agentAddressReleaseWork", {}, meta=meta)
                return started

        async def scenario():
            first = await work(nativeID, "review-api")
            second = await work(secondID, "fix-parser")
            resumed = await work(nativeID)

            assert first["canonical"] == "nuwa/" + mode + "/review-api"
            assert second["sessionID"] != first["sessionID"]
            assert resumed["canonical"] == first["canonical"]
            assert [identifier for identifier, _ in service.replies] == [nativeID, secondID, nativeID]
            assert [identifier for identifier, _ in service.sends] == [nativeID, secondID, nativeID]

        asyncio.run(scenario())

    def testOpenCodeNativeInboxRoutesOnlyToTheBoundWork(self, tmp_path, monkeypatch):
        """Exercise native delivery through the authenticated local HTTP contract."""
        monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path / "nuwa"))
        monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path))
        service = WorkService()
        remote = RemoteWorkClient(WorkCredentials(), "https://mcp-test.example.com",
                                  httpx.MockTransport(service.handle), streamConnector=service.connect)
        firstID, secondID = "ses_" + uuid4().hex, "ses_" + uuid4().hex
        password = uuid4().hex
        submissions = []
        lock = threading.Lock()
        owner = os.getppid()
        auth = "Basic " + base64.b64encode(("opencode:" + password).encode()).decode()

        class NativeService(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def respond(self, value):
                payload = json.dumps(value).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def do_GET(self):
                assert self.headers["Authorization"] == auth
                assert self.path == "/api/info"
                self.respond({"pid": owner, "version": "2.2.3"})

            def do_POST(self):
                assert self.headers["Authorization"] == auth
                identifier = self.path.split("/")[3]
                assert self.path == f"/api/session/{identifier}/synthetic"
                assert identifier in (firstID, secondID)
                payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))

                with lock:
                    submissions.append((identifier, payload))

                self.respond({"data": {
                    "id": "msg_" + uuid4().hex, "sessionID": identifier, "type": "synthetic",
                }})

        with ThreadingHTTPServer(("127.0.0.1", 0), NativeService) as native:
            registration = tmp_path / "opencode" / "service.json"
            registration.parent.mkdir()
            registration.write_text(json.dumps({
                "pid": owner, "version": "2.2.3",
                "url": f"http://127.0.0.1:{native.server_port}", "password": password,
            }), encoding="utf-8")
            registration.chmod(0o600)
            worker = threading.Thread(target=native.serve_forever, daemon=True)
            worker.start()

            def snapshot():
                with lock:
                    return list(submissions)

            async def scenario():
                server = StudioMCP(LocalConfig(), workClient=remote, reconnectDelay=0.05).createServer()
                identity = Implementation(name="opencode", version="2.2.3")

                async with MCPClient(server, client_info=identity) as client:
                    for identifier, name in ((firstID, "review"), (secondID, "fix")):
                        result = await client.call_tool("agentAddressStartWork", {
                            "sessionName": name, "sessionDisplayName": name,
                        }, meta={"ai.opencode/sessionID": identifier})
                        assert not result.is_error

                    first = service.receive(firstID, "Review only")
                    second = service.receive(secondID, "Fix only")
                    await self.waitUntil(lambda: len(snapshot()) >= 2)

                    delivered = dict(snapshot())
                    assert len(snapshot()) == 2
                    for identifier, message in ((firstID, first), (secondID, second)):
                        payload = delivered[identifier]
                        assert message["threadId"] in payload["text"]
                        assert message["body"] in payload["text"]
                        assert payload["delivery"] == "queue" and payload["resume"] is True
                    assert second["body"] not in delivered[firstID]["text"]

                    pages = service.pages[firstID]
                    service.signal(firstID)
                    await self.waitUntil(lambda: service.pages[firstID] > pages)
                    assert not service.polls
                    assert len(snapshot()) == 2

            try:
                asyncio.run(scenario())
            finally:
                native.shutdown()
                worker.join()
