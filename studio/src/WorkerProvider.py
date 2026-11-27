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

    def catalog(self, managedNotifications: bool = False) -> list[dict]:
        tools = []

        for tool in self.client.listTools():
            if not isinstance(tool, dict) or tool.get("name") not in self.allowed:
                continue

            schema = tool.get("inputSchema")
            if not isinstance(schema, dict) or schema.get("type") != "object":
                raise LocalMCPError("Worker tool has an invalid input schema.")

            name = tool["name"]

            if managedNotifications and name in self.notificationTools:
                if name == "worker_notification_status":
                    tools.append({
                        "name": name,
                        "description": "Read this dedicated connection's automatic completion notification status. "
                                       "The local Studio manages the route; no private arguments are needed.",
                        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
                    })

                continue

            description = tool.get("description", "")

            if managedNotifications and name in self.notificationDispatchTools | {"work_continue"}:
                properties = dict(schema.get("properties", {}))
                properties.pop("notificationRouteId", None)
                schema = {**schema, "properties": properties}
                description += (" Studio automatically binds or verifies the completion notification route. "
                                "Follow the Session Router Skill for workspace selection and Job identity.")

            tools.append({"name": name, "description": description, "inputSchema": schema})

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

    def connectionNotification(self, connectionID: str, settings: dict | None = None) -> dict:
        return self.client.connectionNotification(connectionID, settings)

    def _managedCall(self, name: str, arguments: dict, connectionID: str) -> dict:
        if any(key in arguments for key in ("notificationRouteId", "notificationSetupToken", "setupId")):
            raise LocalMCPError("Studio manages notification routing for this connection.")

        if name in self.notificationTools and (name != "worker_notification_status" or arguments):
            raise LocalMCPError("Configure dedicated connection notifications in the local Studio authorization page.")

        if name == "worker_notification_status":
            status = self.connectionNotification(connectionID)
            data = {"enabled": status["enabled"], "managedByStudio": True,
                    "preference": "on" if status["enabled"] else "unset"}

            return {"structuredContent": data, "content": [{"type": "text", "text": json.dumps(data)}]}

        if name in self.notificationDispatchTools | {"work_continue"}:
            status = self.connectionNotification(connectionID)

            if not status["enabled"]:
                raise LocalMCPError("Complete Worker and notification authorization in Studio before dispatch.")

            return self.client.call(name, {**arguments, "notificationRouteId": status["notificationRouteId"]})

        return self.client.call(name, arguments)

    def call(self, name: str, arguments: dict, connectionID: str | None = None) -> dict:
        if name not in self.allowed:
            raise LocalMCPError("Worker tool is outside the approved provider scope.")

        if not self._argumentsAllowed(name, arguments):
            raise LocalMCPError("Worker arguments are outside the approved provider scope.")

        if connectionID is not None:
            return self._managedCall(name, arguments, connectionID)

        return self.client.call(name, arguments)
