"""Authenticated local MCP transport; credentials stay in the local process."""

import json
import re
from base64 import urlsafe_b64encode
from uuid import uuid4

import httpx


class LocalMCPError(RuntimeError):
    pass


class LocalMCPClient:
    def __init__(self, endpoint: str, credential, transport=None):
        self.endpoint = endpoint
        self.credential = credential
        self.transport = transport

    def _request(self, client, method: str, params: dict, version: str | None = None):
        requestID = str(uuid4())
        headers = {}
        if version:
            headers["MCP-Protocol-Version"] = version

        response = client.post(self.endpoint, headers=headers, json={
            "jsonrpc": "2.0", "id": requestID, "method": method, "params": params,
        })

        if response.status_code != 200:
            raise LocalMCPError(f"Local MCP returned HTTP {response.status_code}.")

        message = response.json()

        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or message.get("id") != requestID:
            raise LocalMCPError("Local MCP returned an invalid response.")

        if "error" in message or not isinstance(message.get("result"), dict):
            raise LocalMCPError("Local MCP rejected the request.")

        return message["result"]

    def _initialize(self, client) -> str:
        result = self._request(client, "initialize", {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "Nuwa Studio", "version": "1.0"},
        })
        version = result.get("protocolVersion")

        if version != "2025-06-18":
            raise LocalMCPError("Local MCP protocol version is unsupported.")

        # The current Worker Gateway is stateless and forwards JSON requests.
        # MCP lifecycle notifications have no response body.
        response = client.post(self.endpoint, headers={"MCP-Protocol-Version": version}, json={"jsonrpc": "2.0", "method": "notifications/initialized"})

        if response.status_code not in (200, 202, 204):
            raise LocalMCPError(f"Local MCP initialization notification returned HTTP {response.status_code}.")

        return version

    def _client(self):
        return httpx.Client(timeout=125, follow_redirects=False, trust_env=False,
                            transport=self.transport, headers={
                                "Authorization": "Bearer " + self.credential(),
                                "Accept": "application/json, text/event-stream",
                            })

    def assistantNotification(self, connectionID: str, identity: dict, settings: dict | None = None) -> dict:
        if not re.fullmatch(r"[a-f0-9]{64}", connectionID):
            raise LocalMCPError("Invalid local Worker connection identifier.")
        if not isinstance(identity, dict):
            raise LocalMCPError("Provide your own Bot ID or Agent Address.")

        encoded = urlsafe_b64encode(json.dumps(identity, separators=(",", ":")).encode("utf-8")).decode("ascii").rstrip("=")
        url = self.endpoint.removesuffix("/mcp") + "/notifications/assistants/" + connectionID + "/" + encoded

        with self._client() as client:
            response = client.get(url) if settings is None else client.put(url, json=settings)

        if response.status_code != 200:
            raise LocalMCPError(f"Local Gateway assistant authorization failed (HTTP {response.status_code}).")

        status = response.json()

        if (not isinstance(status, dict) or not isinstance(status.get("registered"), bool) or
                not isinstance(status.get("enabled"), bool) or
                (status["registered"] and not re.fullmatch(r"[a-f0-9]{64}", str(status.get("notificationRouteId", ""))))):
            raise LocalMCPError("Local Gateway returned an invalid assistant notification status.")

        return status

    def listTools(self) -> list[dict]:
        with self._client() as client:
            version = self._initialize(client)
            result = self._request(client, "tools/list", {}, version)

        tools = result.get("tools")

        if not isinstance(tools, list) or result.get("nextCursor"):
            raise LocalMCPError("Local MCP returned an unsupported tool catalog.")

        return tools

    def call(self, name: str, arguments: dict) -> dict:
        with self._client() as client:
            version = self._initialize(client)
            result = self._request(client, "tools/call", {"name": name, "arguments": arguments}, version)

        if not isinstance(result.get("content"), list):
            raise LocalMCPError("Local MCP returned an invalid tool result.")

        return result
