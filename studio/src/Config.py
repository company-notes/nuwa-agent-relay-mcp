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
    workAddressID: str | None = None

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
    def wakePath(cls) -> Path:
        return cls.configDir() / "wake.json"

    @classmethod
    def wakeInboxPath(cls) -> Path:
        return cls.configDir() / "wake-inbox.sqlite3"

    @staticmethod
    def validateOrigin(value: str) -> str:
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
        workAddressID = os.environ.get("NUWA_WORK_ADDRESS_ID", data.get("work_address_id"))

        return cls(
            apiURL=cls.validateOrigin(apiURL),
            addressURL=cls.validateOrigin(addressURL),
            workAddressID=workAddressID,
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
            "work_address_id": self.workAddressID,
        })

    def selectWork(self, workAddressID: str) -> "LocalConfig":
        if not workAddressID or len(workAddressID) > 128 or "/" in workAddressID:
            raise ValueError("Use an immutable Work ID, not a name/address.")

        updated = replace(self, workAddressID=workAddressID)
        updated.save()

        return updated

    def requireWork(self) -> str:
        if not self.workAddressID:
            raise ValueError("No Work selected. Run nuwa-studio-mcp identity first.")

        return self.workAddressID
