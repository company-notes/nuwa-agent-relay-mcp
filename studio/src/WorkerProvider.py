"""Expose only the explicitly approved Worker Gateway tools."""

import json
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

        self.allowed = frozenset(json.loads(config.read_text(encoding="utf-8"))["tools"])

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

    def call(self, name: str, arguments: dict) -> dict:
        if name not in self.allowed:
            raise LocalMCPError("Worker tool is outside the approved provider scope.")

        if not isinstance(arguments, dict) or "notificationRouteId" in arguments:
            raise LocalMCPError("Worker arguments are outside the pilot provider scope.")

        return self.client.call(name, arguments)
