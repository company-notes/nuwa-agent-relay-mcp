"""Stateless HTTPS adapter for the existing Remote MCP work-session tools."""

import json
import os
from uuid import uuid4

import httpx
from mcp.types import CallToolResult

from .Config import LocalConfig
from .WorkInboxStream import WorkInboxStream


class RemoteWorkClient:
    """Reuse the server's OAuth work binding; local code never claims Runtime credentials."""

    def __init__(self, credentials, origin: str | None = None, transport=None, streamConnector=None):
        self.credentials = credentials
        self.origin = LocalConfig.validateOrigin(
            origin or os.environ.get("NUWA_MCP_URL", "https://mcp.agent-relay.company-notes.com"),
        )
        self.transport = transport
        self.streamConnector = streamConnector

    def call(self, threadID: str, tool: str, arguments: dict | None = None,
             firstUse: bool = False, *, mode: str = "codex") -> CallToolResult:
        token = (self.credentials.ensureAccessToken() if firstUse else
                 self.credentials.accessToken())
        requestID = str(uuid4())
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Nuwa-Work-Mode": mode,
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        }
        identityKey = {"codex": "threadId", "claude-code": "sessionId",
                       "opencode": "ai.opencode/sessionID"}.get(mode)
        params = {"name": tool, "arguments": arguments or {}}
        if mode == "grok-build":
            headers["X-Nuwa-Work-ID"] = threadID
        elif identityKey:
            params["_meta"] = {identityKey: threadID}
        else:
            raise ValueError("Unsupported native work mode.")

        request = {
            "jsonrpc": "2.0", "id": requestID, "method": "tools/call",
            "params": params,
        }

        with httpx.Client(timeout=45, follow_redirects=False, transport=self.transport) as client:
            response = client.post(self.origin + "/mcp", headers=headers, json=request)
            response.raise_for_status()
            result = response.json()

        if not isinstance(result, dict) or result.get("id") != requestID or "result" not in result:
            raise RuntimeError("Remote MCP returned an invalid tool response.")

        return CallToolResult.model_validate(result["result"])

    def _inboxHeaders(self, identity) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials.accessToken()}",
            "X-Nuwa-Work-Mode": identity.mode,
            "X-Nuwa-Work-ID": identity.nativeID,
        }

    def _inbox(self, identity, params: dict) -> dict:
        with httpx.Client(timeout=45, follow_redirects=False, transport=self.transport) as client:
            response = client.get(self.origin + "/work-inbox/events",
                                  headers=self._inboxHeaders(identity), params=params)
            response.raise_for_status()
            result = response.json()

        if not isinstance(result, dict) or result.get("ok") is not True or not isinstance(result.get("data"), dict):
            raise RuntimeError("Invalid remote work Inbox response.")

        return result["data"]

    def eventPage(self, identity, cursor: int) -> dict:
        return self._inbox(identity, params={"after_sequence": cursor})

    def openInboxStream(self, identity):
        headers = self._inboxHeaders(identity)
        stream = (WorkInboxStream(self.origin, headers, self.streamConnector) if self.streamConnector
                  else WorkInboxStream(self.origin, headers))

        return stream.open()

    @staticmethod
    def value(result: CallToolResult):
        if result.is_error:
            raise RuntimeError("Remote MCP did not authorize the work operation.")

        if len(result.content) != 1 or result.content[0].type != "text":
            raise RuntimeError("Remote MCP returned an unexpected result.")

        return json.loads(result.content[0].text)
