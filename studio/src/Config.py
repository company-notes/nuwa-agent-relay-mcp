"""Studio configuration and private on-disk OAuth credentials."""

import json
import os
import secrets
from dataclasses import dataclass, replace
from pathlib import Path
from urllib.parse import urlparse


@dataclass(frozen=True)
class LocalConfig:
    apiURL: str = "https://agent-relay.company-notes.com"
    addressURL: str = "https://address.company-notes.com"
    sessionID: str | None = None

    @classmethod
    def configDir(cls) -> Path:
        override = os.environ.get("NUWA_MCP_HOME")

        if override:
            directory = Path(override).expanduser()

            if not directory.is_absolute():
                raise ValueError("NUWA_MCP_HOME must be an absolute path.")

            return directory

        if os.name == "nt":
            return Path(os.environ["APPDATA"]) / "nuwa-agent-relay-mcp"

        return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "nuwa-agent-relay-mcp"

    @classmethod
    def configPath(cls) -> Path:
        return cls.configDir() / "config.json"

    @classmethod
    def authPath(cls) -> Path:
        return cls.configDir() / "auth.json"

    @classmethod
    def runtimePath(cls) -> Path:
        return cls.configDir() / "runtime.json"

    @classmethod
    def resumePath(cls) -> Path:
        return cls.configDir() / "resume.json"

    @classmethod
    def wakePath(cls) -> Path:
        return cls.configDir() / "wake.json"

    @classmethod
    def wakeInboxPath(cls) -> Path:
        return cls.configDir() / "wake-inbox.sqlite3"

    @classmethod
    def validateOrigin(cls, value: str) -> str:
        parsed = urlparse(value)

        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ValueError("Service URL must be a clean HTTPS origin.")

        return value.rstrip("/")

    @classmethod
    def load(cls) -> "LocalConfig":
        path = cls.configPath()
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

        apiURL = os.environ.get("NUWA_RELAY_URL", data.get("api_url", cls.apiURL))
        addressURL = os.environ.get("NUWA_ADDRESS_URL", data.get("address_url", cls.addressURL))
        sessionID = os.environ.get("NUWA_SESSION_ID", data.get("session_id"))

        return cls(
            apiURL=cls.validateOrigin(apiURL),
            addressURL=cls.validateOrigin(addressURL),
            sessionID=sessionID,
        )

    @classmethod
    def writePrivate(cls, path: Path, data: dict) -> None:
        directory = cls.configDir()
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)

        if os.name != "nt":
            directory.chmod(0o700)

        temporary = path.with_name(path.name + "." + secrets.token_hex(6) + ".tmp")

        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)

            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(data, stream, indent=2, ensure_ascii=False)
                stream.write("\n")

            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

        if os.name != "nt":
            path.chmod(0o600)

    def save(self) -> None:
        self.writePrivate(self.configPath(), {
            "api_url": self.validateOrigin(self.apiURL),
            "address_url": self.validateOrigin(self.addressURL),
            "session_id": self.sessionID,
        })

    def selectSession(
        self, sessionID: str, runtimeToken: str, resumeToken: str | None = None,
    ) -> "LocalConfig":
        if not sessionID or len(sessionID) > 128 or "/" in sessionID:
            raise ValueError("Select an immutable Session ID, not an address.")
        if not runtimeToken or len(runtimeToken) > 256:
            raise ValueError("A valid Runtime capability is required.")
        if resumeToken is not None and (not resumeToken or len(resumeToken) > 256):
            raise ValueError("Resume capability is invalid.")

        updated = replace(self, sessionID=sessionID)
        updated.save()
        self.writePrivate(self.runtimePath(), {
            "session_id": sessionID,
            "runtime_token": runtimeToken,
        })

        if resumeToken is not None:
            self.writePrivate(self.resumePath(), {
                "session_id": sessionID,
                "resume_token": resumeToken,
            })
        else:
            # Never accidentally attach a former Session's Resume token.
            existing = self.resumePath()

            if existing.exists():
                saved = json.loads(existing.read_text(encoding="utf-8"))

                if saved.get("session_id") != sessionID:
                    existing.unlink()

        return updated

    def requireSession(self) -> str:
        if not self.sessionID:
            raise ValueError("No Session selected. Run nuwa-studio-mcp identity first.")

        return self.sessionID

    def requireRuntimeToken(self) -> str:
        sessionID = self.requireSession()
        path = self.runtimePath()

        if not path.exists():
            raise ValueError("No Runtime capability. Claim or Resume the Session first.")

        data = json.loads(path.read_text(encoding="utf-8"))

        if data.get("session_id") != sessionID or not data.get("runtime_token"):
            raise ValueError("Runtime capability does not belong to the selected Session.")

        return data["runtime_token"]

    def requireResumeToken(self, sessionID: str) -> str:
        path = self.resumePath()

        if not path.exists():
            raise ValueError("No local Resume capability for this Session.")

        data = json.loads(path.read_text(encoding="utf-8"))

        if data.get("session_id") != sessionID or not data.get("resume_token"):
            raise ValueError("Resume capability does not match this Session.")

        return data["resume_token"]
