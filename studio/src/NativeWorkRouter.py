"""Route host-scoped native tool calls to the existing remote work connector."""

import asyncio
import os
import webbrowser
from contextlib import asynccontextmanager
from uuid import UUID

import psutil
from fastmcp.server.middleware import Middleware
from fastmcp.tools import ToolResult

from .NativeWorkIdentity import ClaudeHost, NativeWorkIdentity
from .NativeWorkReceiver import NativeWorkReceiver
from .OpenCodePeer import OpenCodePeer
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

    def __init__(self, config, remote, peer=None, reconnectDelay: float = 5):
        self.config = config
        self.remote = remote
        self.peer = peer or SessionPeer()
        self.openCodePeer = peer or OpenCodePeer()
        self.reconnectDelay = reconnectDelay
        self.receivers = {}
        self.offeredPolicies = set()
        self.lock = asyncio.Lock()

    @classmethod
    def _identity(cls, context):
        request = context.fastmcp_context.request_context
        params = request.session.client_params if request else None
        clientName = params.client_info.name.lower() if params else ""
        metadata = (request.meta or {}) if request else {}

        if "codex" in clientName:
            if not isinstance(metadata, dict):
                raise ValueError("Invalid native host metadata.")

            return NativeWorkIdentity("codex", metadata.get("threadId"))

        if "claude" in clientName and "code" in clientName:
            host = ClaudeHost.current()

            return NativeWorkIdentity("claude-code", host.sessionID)

        if "grok" in clientName:
            return NativeWorkIdentity("grok-build", os.environ.get("GROK_SESSION_ID"))

        if "opencode" in clientName:
            if not isinstance(metadata, dict):
                raise ValueError("Invalid native host metadata.")

            return NativeWorkIdentity("opencode", metadata.get("ai.opencode/sessionID"))

        return None

    @asynccontextmanager
    async def lifespan(self, server):
        try:
            yield {}
        finally:
            await asyncio.gather(*(asyncio.to_thread(receiver.stop)
                                   for receiver in self.receivers.values()))
            self.receivers.clear()

    async def _offerCollaboration(self, data: dict) -> None:
        policy = data.get("collaborationPolicy")

        if not isinstance(policy, dict) or policy.get("mode") != "unconfigured":
            return

        policyID = policy.get("id")
        url = policy.get("settingsURL")
        if not isinstance(policyID, str) or str(UUID(policyID)) != policyID:
            raise ValueError("Invalid collaboration policy identity.")

        expected = self.config.apiURL.rstrip("/") + "/manage/session?section=session-replies&collaboration=" + policyID
        if url != expected:
            raise ValueError("Invalid collaboration policy settings URL.")

        if policyID not in self.offeredPolicies:
            opened = await asyncio.to_thread(webbrowser.open, expected)
            if opened:
                self.offeredPolicies.add(policyID)

    async def _start(self, identity: NativeWorkIdentity, result) -> None:
        data = RemoteWorkClient.value(result)
        sessionID = data.get("sessionID")

        if (data.get("bound") is not True or not isinstance(sessionID, str) or
                str(UUID(sessionID)) != sessionID or not data.get("canonical")):
            raise ValueError("Remote MCP did not establish a work Session.")

        await self._offerCollaboration(data)

        # Grok's work identity and manual Inbox are supported; a native
        # submission endpoint must be verified before enabling a receiver.
        if identity.mode == "grok-build":
            return

        current = self.receivers.get(identity)
        if current and current.sessionID == sessionID:
            return

        if current:
            await asyncio.to_thread(current.stop)
            self.receivers.pop(identity)

        peer = self.openCodePeer if identity.mode == "opencode" else self.peer
        receiver = NativeWorkReceiver(
            self.config, self.remote, peer, identity, sessionID,
            self.reconnectDelay,
        )
        self.receivers[identity] = receiver
        receiver.start()

    async def _call(self, identity: NativeWorkIdentity, name: str, arguments: dict):
        if name in self.START or name == "agentAddressReleaseWork":
            async with self.lock:
                if name == "agentAddressReleaseWork":
                    current = self.receivers.pop(identity, None)
                    if current:
                        await asyncio.to_thread(current.stop)

                result = await asyncio.to_thread(
                    self.remote.call, identity.nativeID, name, arguments, name in self.START,
                    mode=identity.mode,
                )

                if name in self.START and not result.is_error:
                    await self._start(identity, result)

                return result

        result = await asyncio.to_thread(
            self.remote.call, identity.nativeID, name, arguments,
            name == "agentAddressGetStatus", mode=identity.mode,
        )

        if name == "agentAddressGetStatus" and not result.is_error:
            async with self.lock:
                await self._offerCollaboration(RemoteWorkClient.value(result))

        return result

    async def on_call_tool(self, context, call_next):
        name = context.message.name

        try:
            identity = self._identity(context)
        except (ValueError, AttributeError, OSError, RuntimeError, psutil.Error):
            return ToolResult(
                content="Current native work identity could not be verified. Reopen the intended work "
                        "(Claude Code: use explicit --resume with its Session ID) and reconnect MCP.",
                is_error=True,
            )

        if not identity:
            return await call_next(context)

        canonical = self.ALIASES.get(name, name)
        allowed = set(self.ALIASES.values()) | self.WORK_TOOLS | {"sendToAgent"}

        if canonical not in allowed:
            return ToolResult(content="Native work uses its own Inbox; this fixed-Session tool is unavailable.",
                              is_error=True)

        try:
            result = await self._call(identity, canonical, context.message.arguments or {})
        except Exception:
            return ToolResult(content="Nuwa work operation could not be confirmed. Check sign-in and work status.",
                              is_error=True)

        return ToolResult.from_mcp_result(result)
