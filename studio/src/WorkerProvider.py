"""Expose approved Worker tools with assistant-scoped notification routing."""

import json
from importlib.resources import files
from pathlib import Path

from .LocalMCPClient import LocalMCPClient, LocalMCPError
from .WorkerCredential import WorkerCredential


class WorkerProvider:
    ENDPOINT = "http://127.0.0.1:3791/mcp"
    STATUS = "worker_notification_status"
    PRIVATE_FIELDS = frozenset({"notificationRouteId", "notificationSetupToken", "setupId", "connectionId"})

    def __init__(self, client=None):
        self.client = client or LocalMCPClient(self.ENDPOINT, WorkerCredential.read)
        config = files("src").joinpath("worker-provider.json")

        if not config.is_file():
            config = Path(__file__).resolve().parents[2] / "worker-provider.json"

        policy = json.loads(config.read_text(encoding="utf-8"))
        self.allowed = frozenset(policy["tools"])
        self.identityTools = frozenset(policy["identityTools"])
        self.identitySchema = policy["assistantIdentitySchema"]

    def catalog(self) -> list[dict]:
        tools = []

        for tool in self.client.listTools():
            name = tool.get("name") if isinstance(tool, dict) else None

            if name not in self.allowed:
                continue

            schema = tool.get("inputSchema")
            if not isinstance(schema, dict) or schema.get("type") != "object":
                raise LocalMCPError("Worker tool has an invalid input schema.")

            description = tool.get("description", "")
            if name == self.STATUS:
                schema = {"type": "object", "properties": {}, "additionalProperties": False}
                description = "Check your assistant identity's local owner registration and automatic notification status."

            if name in self.identityTools:
                properties = {key: value for key, value in schema.get("properties", {}).items()
                              if key not in self.PRIVATE_FIELDS}
                properties["assistantIdentity"] = self.identitySchema
                required = [key for key in schema.get("required", []) if key not in self.PRIVATE_FIELDS]
                schema = {**schema, "properties": properties, "required": [*required, "assistantIdentity"]}
                description += " Supply your own stable assistantIdentity; Studio resolves its locally authorized route."

            tools.append({"name": name, "description": description, "inputSchema": schema})

        return tools

    def assistantNotification(self, connectionID: str, identity: dict, settings: dict | None = None) -> dict:
        return self.client.assistantNotification(connectionID, identity, settings)

    def call(self, name: str, arguments: dict, connectionID: str) -> dict:
        if name not in self.allowed or not isinstance(arguments, dict) or self.PRIVATE_FIELDS & arguments.keys():
            raise LocalMCPError("Worker tool or arguments are outside the approved provider scope.")
        if name not in self.identityTools:
            if "assistantIdentity" in arguments:
                raise LocalMCPError("Assistant identity is not a parameter of this tool.")

            return self.client.call(name, arguments)
        if "assistantIdentity" not in arguments:
            raise LocalMCPError("assistantIdentity is required. Retrieve your own Bot ID or canonical Agent Address.")
        if name == self.STATUS and arguments.keys() != {"assistantIdentity"}:
            raise LocalMCPError("Notification status accepts only assistantIdentity.")

        status = self.assistantNotification(connectionID, arguments["assistantIdentity"])

        if name == self.STATUS:
            data = {"registered": status["registered"], "enabled": status["enabled"], "managedByStudio": True}

            return {"structuredContent": data, "content": [{"type": "text", "text": json.dumps(data)}]}
        if not status["registered"]:
            raise LocalMCPError("This assistant is not registered. Complete owner authorization in local Studio before dispatch.")

        routed = {key: value for key, value in arguments.items() if key != "assistantIdentity"}
        routed["notificationRouteId"] = status["notificationRouteId"]

        return self.client.call(name, routed)
