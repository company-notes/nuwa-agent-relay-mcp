"""Stateless HTTPS adapter for the existing Remote MCP work-session tools."""

import json
import os
from uuid import uuid4

import httpx
from mcp.types import CallToolResult

from .Config import LocalConfig


class RemoteWorkClient:
    """Reuse the server's OAuth work binding; local code never claims Runtime credentials."""

    def __init__(self, credentials, origin: str | None = None, transport=None):
        self.credentials = credentials
        self.origin = LocalConfig.validateOrigin(
            origin or os.environ.get("NUWA_MCP_URL", "https://mcp.agent-relay.company-notes.com"),
        )
        self.transport = transport

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

    @staticmethod
    def value(result: CallToolResult):
        if result.is_error:
            raise RuntimeError("Remote MCP did not authorize the work operation.")

        if len(result.content) != 1 or result.content[0].type != "text":
            raise RuntimeError("Remote MCP returned an unexpected result.")

        return json.loads(result.content[0].text)
