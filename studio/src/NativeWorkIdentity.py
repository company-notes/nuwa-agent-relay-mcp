"""Stable native work identity and its local host evidence."""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import psutil


@dataclass(frozen=True)
class NativeWorkIdentity:
    mode: str
    nativeID: str

    @classmethod
    def canonicalID(cls, value: str) -> str:
        if not isinstance(value, str) or str(UUID(value)) != value:
            raise ValueError("A canonical native Session UUID is required.")

        return value

    def __post_init__(self):
        self.canonicalID(self.nativeID)

        if self.mode not in ("codex", "claude-code"):
            raise ValueError("Unsupported native work mode.")

    @property
    def target(self) -> str:
        prefix = "codex" if self.mode == "codex" else "claude"

        return f"{prefix}:{self.nativeID}"


@dataclass(frozen=True)
class ClaudeHost:
    """Resolve only this stdio process's launching Claude session."""

    pid: int
    sessionID: str
    socket: str | None

    MAX_RECORD_BYTES = 1024 * 1024

    @classmethod
    def current(cls, expectedID: str | None = None):
        sessionID = NativeWorkIdentity.canonicalID(os.environ.get("CLAUDE_CODE_SESSION_ID"))
        if expectedID is not None and expectedID != sessionID:
            raise ValueError("Claude Code Session identity changed.")

        configured = os.environ.get("CLAUDE_CONFIG_DIR") or os.environ.get("ANTHROPIC_CONFIG_DIR")
        root = Path(configured).expanduser() if configured else Path.home() / ".claude"
        records = root / "sessions"

        # A Claude subprocess can outlive /clear or an implicit resume.
        # The nearest host registry record must still agree with its launch environment.
        for process in psutil.Process().parents():
            path = records / f"{process.pid}.json"
            if not path.exists():
                continue

            if not path.is_file() or path.is_symlink():
                raise ValueError("Claude Code Session record is unavailable.")

            with path.open("rb") as stream:
                raw = stream.read(cls.MAX_RECORD_BYTES + 1)

            if len(raw) > cls.MAX_RECORD_BYTES:
                raise ValueError("Claude Code Session record is too large.")

            record = json.loads(raw)
            if (not isinstance(record, dict) or record.get("pid") != process.pid or
                    record.get("sessionId") != sessionID):
                raise ValueError("Claude Code changed Session; reopen the intended work.")

            socket = record.get("messagingSocketPath")
            if socket is not None and not isinstance(socket, str):
                raise ValueError("Claude Code inbox metadata is invalid.")

            return cls(process.pid, sessionID, socket)

        raise ValueError("Claude Code host Session record is unavailable.")
