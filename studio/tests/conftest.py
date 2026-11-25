"""Shared isolated user profile for installation scenarios."""

import json
import os
import sqlite3
import subprocess
import tomllib
from pathlib import Path
from uuid import uuid4

import pytest


class InstallerProfile:
    def __init__(self, home: Path):
        self.home = home
        self.env = os.environ.copy()
        self.env.update({
            "HOME": str(home),
            "USERPROFILE": str(home),
            "APPDATA": str(home / "AppData"),
            "LOCALAPPDATA": str(home / "LocalAppData"),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "NUWA_MCP_HOME": str(home / "nuwa"),
            "GROK_HOME": str(home / ".grok"),
            "OMB_DATA_DIR": str(home / ".openmausbot"),
            "CLAUDE_CONFIG_DIR": str(home / ".claude"),
        })
        self.env.pop("NUWA_RELAY_MCP_BINARY", None)

        self.config = home / ".codex" / "config.toml"
        self.config.parent.mkdir()
        self.config.write_text('[mcp_servers.other]\ncommand = "other"\n', encoding="utf-8")
        self.originalConfig = self.config.read_bytes()
        self.skill = home / ".agents" / "skills" / "nuwa-agent-relay"
        self.grokConfig = home / ".grok" / "config.toml"
        self.openCodeConfig = home / ".config" / "opencode" / "opencode.json"
        self.grokConfig.parent.mkdir()
        self.grokConfig.write_text('[mcp_servers.other]\ncommand = "other"\n', encoding="utf-8")
        self.openCodeConfig.parent.mkdir(parents=True)
        self.openCodeConfig.write_text(json.dumps({"mcp": {"servers": {"other": {"type": "local", "command": ["other"]}}}}), encoding="utf-8")

    def verifyPeerDiscovery(self, launcher: str) -> None:
        """Read two saved threads and exclude an archived thread from an isolated Codex DB."""
        identifiers = [str(uuid4()) for _ in range(3)]
        database = self.config.parent / "state_5.sqlite"
        self.env["CODEX_HOME"] = str(self.config.parent)

        with sqlite3.connect(database) as connection:
            connection.execute(
                "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, cwd TEXT, "
                "updated_at INTEGER, archived INTEGER, rollout_path TEXT)"
            )
            connection.executemany(
                "INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?)",
                [(identifier, f"測試工作 {index}", str(self.home), index,
                  int(index == 2), "") for index, identifier in enumerate(identifiers)],
            )

        before = database.read_bytes()
        discovery = json.loads(self.run(launcher, "peer", "list"))
        assert discovery["version"] == "1.6.2"
        assert {session["id"]: session["name"] for session in discovery["sessions"]} == {
            identifier: f"測試工作 {index}" for index, identifier in enumerate(identifiers[:2])
        }
        assert database.read_bytes() == before

    def runResult(self, *command: str, timeout: int = 60):
        return subprocess.run(
            list(command), env=self.env, cwd=self.home, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False,
        )

    def run(self, *command: str, timeout: int = 60):
        result = self.runResult(*command, timeout=timeout)

        assert result.returncode == 0, result.stdout + result.stderr
        return result.stdout

    def verifyAdditionalClients(self, executable: Path | None) -> None:
        grok = tomllib.loads(self.grokConfig.read_text(encoding="utf-8"))["mcp_servers"]
        opencode = json.loads(self.openCodeConfig.read_text(encoding="utf-8"))["mcp"]["servers"]
        assert grok["other"]["command"] == "other"
        assert opencode["other"]["command"] == ["other"]
        name = "nuwa-agent-relay-studio"
        skills = [self.grokConfig.parent / "skills" / "nuwa-agent-relay" / "SKILL.md",
                  self.openCodeConfig.parent / "skills" / "nuwa-agent-relay" / "SKILL.md"]

        if executable is None:
            assert name not in grok and name not in opencode
            assert all(not skill.exists() for skill in skills)
        else:
            assert Path(grok[name]["command"]) == executable
            assert Path(opencode[name]["command"][0]) == executable
            assert all(skill.is_file() for skill in skills)

    def servers(self) -> dict:
        return tomllib.loads(self.config.read_text(encoding="utf-8"))["mcp_servers"]


@pytest.fixture
def installerProfile(tmp_path):
    return InstallerProfile(tmp_path)
