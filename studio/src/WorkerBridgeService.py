"""Run the approved local MCP Provider independently of native work threads."""

import json
import logging
import subprocess
import time
from uuid import UUID

import httpx
from filelock import FileLock

from .LocalMCPClient import LocalMCPError
from .WorkerBridgeClient import WorkerBridgeRejected


logger = logging.getLogger(__name__)


class WorkerBridgeService:
    def __init__(self, config, bridge, provider):
        self.config = config
        self.bridge = bridge
        self.provider = provider

    def pair(self, code: str) -> None:
        path = self.config.workerBridgePath()

        if path.exists():
            raise RuntimeError("Revoke the existing local Worker pairing first.")

        route = self.bridge.pair(code)
        self.config.writePrivate(path, {"route": route})

    def route(self) -> str:
        path = self.config.workerBridgePath()

        if not path.is_file():
            raise RuntimeError("Pair Studio with the authorized assistant first.")

        return json.loads(path.read_text(encoding="utf-8"))["route"]

    def revoke(self) -> None:
        self.bridge.revoke(self.route())
        self.config.workerBridgePath().unlink()

    def _catalog(self) -> list[dict]:
        try:
            return self.provider.catalog()
        except (LocalMCPError, httpx.HTTPError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            logger.warning("Worker Provider unavailable (errorType=%s)", type(error).__name__)

            return []

    def _execute(self, request: dict) -> dict:
        try:
            return self.provider.call(request["name"], request["arguments"])
        except (LocalMCPError, httpx.HTTPError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            logger.warning("Worker tool could not be confirmed (errorType=%s)", type(error).__name__)

            return {"isError": True, "content": [{
                "type": "text",
                "text": "Local Worker operation could not be confirmed. Check existing jobs; "
                        "reuse the original requestId for an uncertain dispatch.",
            }]}

    def exchange(self, route: str) -> None:
        request = self.bridge.poll(route, self._catalog())

        if request is None:
            return

        if (not isinstance(request, dict) or not isinstance(request.get("requestID"), str) or
                str(UUID(request["requestID"])) != request["requestID"] or
                not isinstance(request.get("name"), str) or not isinstance(request.get("arguments"), dict)):
            raise ValueError("Invalid remote Worker request.")

        result = self._execute(request)
        self.bridge.result(route, request["requestID"], result)

    def serve(self) -> None:
        route = self.route()
        lock = self.config.workerBridgePath().with_suffix(".lock")

        with FileLock(str(lock), timeout=0):
            while True:
                try:
                    self.exchange(route)
                except WorkerBridgeRejected as error:
                    logger.warning("Worker bridge rejected exchange (status=%s)", error.status)

                    if error.status in (401, 403):
                        raise RuntimeError("Worker authorization expired or was revoked.") from error

                    time.sleep(2)
                except (httpx.HTTPError, OSError, ValueError, RuntimeError) as error:
                    # A new exchange never repeats the previous tool invocation.
                    logger.warning("Worker bridge exchange interrupted (errorType=%s)", type(error).__name__)
                    time.sleep(2)
