"""Run the approved local MCP Provider independently of native work threads."""

import json
import logging
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

    def pair(self, code: str, *, notificationsRequired: bool = True) -> None:
        path = self.config.workerBridgePath()

        if path.exists():
            raise RuntimeError("Revoke the existing local Worker pairing first.")

        route = self.bridge.pair(code)
        self.config.writePrivate(path, {"route": route, "notifications_required": notificationsRequired})

    def _pairing(self) -> dict:
        path = self.config.workerBridgePath()

        if not path.is_file():
            raise RuntimeError("Pair Studio with the authorized assistant first.")

        return json.loads(path.read_text(encoding="utf-8"))

    def route(self) -> str:
        return self._pairing()["route"]

    def notificationsRequired(self) -> bool:
        return self._pairing().get("notifications_required") is True

    def notificationsReady(self) -> bool:
        if not self.config.workerBridgePath().is_file() or not self.notificationsRequired():
            return False

        return self.provider.connectionNotification(self.route())["enabled"]

    def authorizeNotifications(self, settings: dict) -> None:
        pairing = self._pairing()
        status = self.provider.connectionNotification(pairing["route"], settings)

        if not status["enabled"]:
            raise LocalMCPError("Gateway did not confirm the notification receiver.")

        self.config.writePrivate(self.config.workerBridgePath(), {**pairing, "notifications_required": True})

    def revoke(self) -> None:
        self.bridge.revoke(self.route())
        self.config.workerBridgePath().unlink()

    def _catalog(self) -> list[dict]:
        try:
            return self.provider.catalog(self.notificationsRequired())
        except (LocalMCPError, httpx.HTTPError, OSError, ValueError) as error:
            logger.warning("Worker Provider unavailable (errorType=%s)", type(error).__name__)

            return []

    def _execute(self, request: dict, route: str) -> dict:
        try:
            pairing = self._pairing()

            if pairing["route"] != route:
                raise LocalMCPError("The active Worker authorization changed.")

            connectionID = route if pairing.get("notifications_required") is True else None

            return self.provider.call(request["name"], request["arguments"], connectionID)
        except (LocalMCPError, httpx.HTTPError, OSError, ValueError) as error:
            logger.warning("Worker tool could not be confirmed (errorType=%s)", type(error).__name__)

            return {"isError": True, "content": [{
                "type": "text",
                "text": "Local Worker operation could not be confirmed. Check existing jobs; "
                        "reuse the original requestId for an uncertain dispatch. If automatic notifications "
                        "are not configured, finish authorization on the local Studio page first.",
            }]}

    def exchange(self, route: str) -> None:
        request = self.bridge.poll(route, self._catalog())

        if request is None:
            return

        if (not isinstance(request, dict) or not isinstance(request.get("requestID"), str) or
                str(UUID(request["requestID"])) != request["requestID"] or
                not isinstance(request.get("name"), str) or not isinstance(request.get("arguments"), dict)):
            raise ValueError("Invalid remote Worker request.")

        result = self._execute(request, route)

        self.bridge.result(route, request["requestID"], result)

    def serve(self) -> None:
        if not self.config.workerBridgePath().is_file() or self.config.workerStopPath().exists():
            return

        route = self.route()
        lock = self.config.workerBridgePath().with_suffix(".lock")

        with FileLock(str(lock), timeout=0):
            while self.config.workerBridgePath().is_file() and not self.config.workerStopPath().exists():
                try:
                    self.exchange(route)
                except WorkerBridgeRejected as error:
                    logger.warning("Worker bridge rejected exchange (status=%s)", error.status)

                    if error.status in (401, 403):
                        logger.warning("Worker authorization expired or was revoked; reconnect from Studio.")
                        return

                    time.sleep(2)
                except (httpx.HTTPError, OSError, ValueError, RuntimeError) as error:
                    # A new exchange never repeats the previous tool invocation.
                    logger.warning("Worker bridge exchange interrupted (errorType=%s)", type(error).__name__)
                    time.sleep(2)
