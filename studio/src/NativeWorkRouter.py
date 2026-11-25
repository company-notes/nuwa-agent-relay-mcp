"""Route host-scoped Codex tool calls to the existing remote work connector."""

import asyncio
from contextlib import asynccontextmanager
from uuid import UUID

from fastmcp.server.middleware import Middleware
from fastmcp.tools import ToolResult

from .NativeWorkReceiver import NativeWorkReceiver
from .RemoteWorkClient import RemoteWorkClient
from .SessionPeer import SessionPeer


class NativeWorkRouter(Middleware):
    """Never substitute the last selected global Session for a native work."""

    ALIASES = {
        "checkInbox": "relayInbox", "checkAgentInbox": "relayAgentInbox",
        "getMessage": "relayMessage", "getThreadHistory": "relayThreadHistory",
        "sendHandoff": "relaySendHandoff", "acceptHandoff": "relayAcceptHandoff",
        "replyHandoff": "relayReplyHandoff", "replyThread": "relayReplyThread",
        "getReceipt": "relayReceipt", "acknowledgeRead": "relayAcknowledgeRead",
        "getWakeEvents": "relayWakeEvents", "getWakeSubscription": "relayWakeSubscription",
        "removeWakeSubscription": "relayRemoveWake",
        "provisionAgentMailbox": "relayProvisionAgentMailbox",
    }
    START = {"agentAddressStartWork", "agentAddressSelectSession"}
    WORK_TOOLS = START | {"agentAddressGetStatus", "agentAddressReleaseWork"}

    def __init__(self, config, remote, peer=None, interval: float = 5):
        self.config = config
        self.remote = remote
        self.peer = peer or SessionPeer()
        self.interval = interval
        self.receivers = {}
        self.lock = asyncio.Lock()

    @classmethod
    def _identity(cls, context):
        request = context.fastmcp_context.request_context
        params = request.session.client_params if request else None
        clientName = params.client_info.name.lower() if params else ""
        metadata = request.meta or {} if request else {}

        if "codex" not in clientName:
            return None

        threadID = metadata.get("threadId")
        if not isinstance(threadID, str) or str(UUID(threadID)) != threadID:
            raise ValueError("Codex must supply its native thread ID in tool-call metadata.")

        return threadID

    @asynccontextmanager
    async def lifespan(self, server):
        try:
            yield {}
        finally:
            await asyncio.gather(*(asyncio.to_thread(receiver.stop)
                                   for receiver in self.receivers.values()))
            self.receivers.clear()

    async def _start(self, threadID: str, result) -> None:
        data = RemoteWorkClient.value(result)
        sessionID = data.get("sessionID")
        if (data.get("bound") is not True or not isinstance(sessionID, str) or
                str(UUID(sessionID)) != sessionID or not data.get("canonical")):
            raise ValueError("Remote MCP did not establish a work Session.")

        current = self.receivers.get(threadID)
        if current and current.sessionID == sessionID:
            return

        if current:
            await asyncio.to_thread(current.stop)
            self.receivers.pop(threadID)

        receiver = NativeWorkReceiver(
            self.config, self.remote, self.peer, threadID, sessionID,
            data.get("created") is True, self.interval,
        )
        self.receivers[threadID] = receiver
        receiver.start()

    async def _call(self, threadID: str, name: str, arguments: dict):
        if name in self.START or name == "agentAddressReleaseWork":
            async with self.lock:
                if name == "agentAddressReleaseWork":
                    current = self.receivers.pop(threadID, None)
                    if current:
                        await asyncio.to_thread(current.stop)

                result = await asyncio.to_thread(
                    self.remote.call, threadID, name, arguments, name in self.START,
                )

                if name in self.START and not result.is_error:
                    await self._start(threadID, result)

                return result

        return await asyncio.to_thread(self.remote.call, threadID, name, arguments)

    async def on_call_tool(self, context, call_next):
        name = context.message.name

        try:
            threadID = self._identity(context)
        except (ValueError, AttributeError):
            return ToolResult(content="Native Codex thread identity is missing or invalid.", is_error=True)

        if not threadID:
            return await call_next(context)

        canonical = self.ALIASES.get(name, name)
        allowed = set(self.ALIASES.values()) | self.WORK_TOOLS | {"sendToAgent"}
        if canonical not in allowed:
            return ToolResult(content="Native work uses its own Inbox; this fixed-Session tool is unavailable.",
                              is_error=True)

        try:
            result = await self._call(threadID, canonical, context.message.arguments or {})
        except Exception:
            return ToolResult(content="Nuwa work operation could not be confirmed. Check sign-in and work status.",
                              is_error=True)

        return ToolResult.from_mcp_result(result)
