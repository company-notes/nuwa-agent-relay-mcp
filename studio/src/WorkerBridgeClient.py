"""Private HTTPS request/result channel for an explicitly paired Studio."""

import re

import httpx

from .Config import LocalConfig


class WorkerBridgeRejected(RuntimeError):
    def __init__(self, status: int):
        super().__init__(f"Worker bridge returned HTTP {status}.")
        self.status = status


class WorkerBridgeClient:
    def __init__(self, credentials, origin: str | None = None, transport=None):
        self.credentials = credentials
        self.origin = LocalConfig.remoteMCPOrigin(origin)
        self.transport = transport

    @classmethod
    def routeFromCode(cls, code: str) -> tuple[str, str]:
        if not re.fullmatch(r"[a-f0-9]{64}\.[a-f0-9]{64}", code):
            raise ValueError("Invalid Studio pairing code.")

        route, secret = code.split(".")
        return route, secret

    def _exchange(self, operation: str, route: str, body: dict) -> dict:
        if not re.fullmatch(r"[a-f0-9]{64}", route):
            raise ValueError("Invalid saved Studio route.")

        with httpx.Client(timeout=35, follow_redirects=False, transport=self.transport) as client:
            response = client.post(
                self.origin + "/worker-bridge/" + operation,
                headers={"Authorization": "Bearer " + self.credentials.accessToken()},
                json={"route": route, **body},
            )

        if response.status_code != 200:
            raise WorkerBridgeRejected(response.status_code)

        data = response.json()

        if not isinstance(data, dict):
            raise RuntimeError("Invalid Worker bridge response.")

        return data

    def pair(self, code: str) -> str:
        route, secret = self.routeFromCode(code)
        result = self._exchange("pair", route, {"secret": secret})

        if result.get("paired") is not True:
            raise RuntimeError("Studio pairing was not confirmed.")

        return route

    def poll(self, route: str, tools: list[dict]) -> dict | None:
        result = self._exchange("poll", route, {"tools": tools})

        if "request" not in result:
            raise RuntimeError("Invalid Worker request envelope.")

        return result["request"]

    def result(self, route: str, requestID: str, result: dict) -> None:
        data = self._exchange("result", route, {"requestID": requestID, "result": result})

        if data.get("accepted") is not True:
            raise RuntimeError("Worker result was not acknowledged.")

    def revoke(self, route: str) -> None:
        data = self._exchange("revoke", route, {})

        if data.get("revoked") is not True:
            raise RuntimeError("Studio revocation was not confirmed.")
