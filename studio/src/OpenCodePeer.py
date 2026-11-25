"""Submit to the authenticated OpenCode v2 service that launched this MCP."""

import json
import os
import stat
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import psutil

from .NativeWorkIdentity import NativeWorkIdentity
from .SessionPeer import PeerSubmissionUncertain


class OpenCodePeer:
    """Use the native synthetic-message Inbox API; preserve the host's normal permissions."""

    @staticmethod
    def _service() -> dict:
        state = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state")
        path = state / "opencode" / "service.json"
        info = path.lstat()

        if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
            raise RuntimeError("OpenCode service registration is unavailable.")

        if os.name != "nt" and (info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise RuntimeError("OpenCode service registration is not private.")

        with path.open("rb") as stream:
            record = json.loads(stream.read(65537))

        if not isinstance(record, dict):
            raise ValueError("Invalid OpenCode service registration.")

        pid, version, url, password = (record.get(key) for key in ("pid", "version", "url", "password"))
        if (type(pid) is not int or pid not in {parent.pid for parent in psutil.Process().parents()} or
                not isinstance(version, str) or not version.startswith("2.") or
                not isinstance(url, str) or not isinstance(password, str) or not password):
            raise RuntimeError("The authenticated OpenCode v2 parent service is unavailable.")

        endpoint = urlsplit(url)
        if (endpoint.scheme != "http" or endpoint.hostname not in ("127.0.0.1", "::1", "localhost") or
                not endpoint.port or endpoint.username or endpoint.password or
                endpoint.path not in ("", "/") or endpoint.query or endpoint.fragment):
            raise ValueError("OpenCode must advertise an authenticated local service.")

        return record

    def send(self, target: str, message: str) -> dict:
        prefix, separator, nativeID = target.partition(":")
        if prefix != "opencode" or not separator:
            raise ValueError("An exact OpenCode work destination is required.")

        identity = NativeWorkIdentity("opencode", nativeID)
        service = self._service()

        with httpx.Client(base_url=service["url"], auth=("opencode", service["password"]),
                          timeout=20, trust_env=False, follow_redirects=False) as client:
            info = client.get("/api/info")
            info.raise_for_status()
            evidence = info.json()

            if (evidence.get("pid") != service["pid"] or evidence.get("version") != service["version"] or
                    self._service() != service):
                raise RuntimeError("OpenCode service identity changed before submission.")

            try:
                response = client.post(
                    f"/api/session/{identity.nativeID}/synthetic",
                    json={"text": message, "description": "Nuwa coworker message",
                          "delivery": "queue", "resume": True},
                )
                response.raise_for_status()
                data = response.json()["data"]
                if data["sessionID"] != identity.nativeID or data["type"] != "synthetic" or not data["id"]:
                    raise ValueError("Native response does not identify the selected session.")
            except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
                raise PeerSubmissionUncertain("OpenCode submission outcome could not be verified.") from error

        return {"submitted": True, "status": "queued", "consumptionConfirmed": False}
