"""Shared isolated user profile for installation scenarios."""

import os
import subprocess
import tomllib
from pathlib import Path

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

    def runResult(self, *command: str, timeout: int = 60):
        return subprocess.run(
            list(command), env=self.env, cwd=self.home, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False,
        )

    def run(self, *command: str, timeout: int = 60):
        result = self.runResult(*command, timeout=timeout)

        assert result.returncode == 0, result.stdout + result.stderr
        return result.stdout

    def servers(self) -> dict:
        return tomllib.loads(self.config.read_text(encoding="utf-8"))["mcp_servers"]


@pytest.fixture
def installerProfile(tmp_path):
    return InstallerProfile(tmp_path)
