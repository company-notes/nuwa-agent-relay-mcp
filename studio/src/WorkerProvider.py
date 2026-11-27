"""Expose only the explicitly approved Worker Gateway tools."""

import json
import re
from importlib.resources import files
from pathlib import Path

from .LocalMCPClient import LocalMCPClient, LocalMCPError
from .WorkerCredential import WorkerCredential


class WorkerProvider:
    ENDPOINT = "http://127.0.0.1:3791/mcp"

    def __init__(self, client=None):
        self.client = client or LocalMCPClient(self.ENDPOINT, WorkerCredential.read)
        config = files("src").joinpath("worker-provider.json")

        if not config.is_file():
            config = Path(__file__).resolve().parents[2] / "worker-provider.json"

        policy = json.loads(config.read_text(encoding="utf-8"))
        self.notificationTools = policy["notificationTools"]
        self.notificationDispatchTools = frozenset(policy["notificationDispatchTools"])
        self.notificationRoutePattern = re.compile(policy["notificationRoutePattern"])
        self.notificationSetupPattern = re.compile(policy["notificationSetupPattern"])
        self.allowed = frozenset(policy["tools"]) | frozenset(self.notificationTools)

    def catalog(self) -> list[dict]:
        tools = []

        for tool in self.client.listTools():
            if not isinstance(tool, dict) or tool.get("name") not in self.allowed:
                continue

            schema = tool.get("inputSchema")
            if not isinstance(schema, dict) or schema.get("type") != "object":
                raise LocalMCPError("Worker tool has an invalid input schema.")

            tools.append({"name": tool["name"], "description": tool.get("description", ""),
                          "inputSchema": schema})

        return tools

    def _argumentsAllowed(self, name: str, arguments: dict) -> bool:
        if not isinstance(arguments, dict):
            return False

        fields = self.notificationTools.get(name)

        if fields is not None and not arguments.keys() <= set(fields):
            return False

        if "notificationRouteId" in arguments:
            routeID = arguments["notificationRouteId"]
            if (not ((fields is not None and "notificationRouteId" in fields) or
                     name in self.notificationDispatchTools) or not isinstance(routeID, str) or
                    not self.notificationRoutePattern.fullmatch(routeID)):
                return False

        if "notificationSetupToken" in arguments:
            token = arguments["notificationSetupToken"]
            if (fields is None or "notificationSetupToken" not in fields or not isinstance(token, str) or
                    not self.notificationRoutePattern.fullmatch(token)):
                return False

        if fields is not None and "setupId" in fields:
            setupID = arguments.get("setupId")
            return isinstance(setupID, str) and bool(self.notificationSetupPattern.fullmatch(setupID))

        return True

    def call(self, name: str, arguments: dict) -> dict:
        if name not in self.allowed:
            raise LocalMCPError("Worker tool is outside the approved provider scope.")

        if not self._argumentsAllowed(name, arguments):
            raise LocalMCPError("Worker arguments are outside the approved provider scope.")

        return self.client.call(name, arguments)
