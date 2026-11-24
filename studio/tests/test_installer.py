"""Exercise Studio's real installer against an isolated Codex profile."""

import os
import subprocess
import sys
import tomllib
from pathlib import Path


class TestStudioInstall:
    def runInstaller(self, home: Path, *arguments: str):
        env = os.environ.copy()
        env.update({
            "HOME": str(home),
            "USERPROFILE": str(home),
            "APPDATA": str(home / "AppData"),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "NUWA_MCP_HOME": str(home / "nuwa"),
        })
        env.pop("NUWA_STUDIO_MCP_BINARY", None)
        result = subprocess.run(
            [sys.executable, "-m", "src", *arguments, "--target", "codex"],
            env=env, cwd=home, capture_output=True, text=True, encoding="utf-8",
            timeout=60, check=False,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        return result.stdout

    def testCodexInstallUpdateAndUninstall(self, tmp_path):
        """Install the official Skill and MCP, preserve unrelated config, then remove both."""
        config = tmp_path / ".codex" / "config.toml"
        config.parent.mkdir()
        config.write_text('[mcp_servers.other]\ncommand = "other"\n', encoding="utf-8")
        originalConfig = config.read_bytes()
        skill = tmp_path / ".agents" / "skills" / "nuwa-agent-relay"

        preview = self.runInstaller(tmp_path, "install", "--print")
        assert "nuwa-agent-relay" in preview
        assert config.read_bytes() == originalConfig
        assert not skill.exists()

        self.runInstaller(tmp_path, "install")
        installed = tomllib.loads(config.read_text(encoding="utf-8"))
        assert Path(installed["mcp_servers"]["nuwa-agent-relay-studio"]["command"]).is_file()
        assert installed["mcp_servers"]["other"]["command"] == "other"
        assert "name: nuwa-agent-relay" in (skill / "SKILL.md").read_text(encoding="utf-8")
        assert (skill / "references" / "work-clients.md").is_file()

        self.runInstaller(tmp_path, "install", "--overwrite")
        assert (skill / "references" / "work-clients.md").is_file()

        self.runInstaller(tmp_path, "uninstall")
        remaining = tomllib.loads(config.read_text(encoding="utf-8"))
        assert "nuwa-agent-relay-studio" not in remaining["mcp_servers"]
        assert remaining["mcp_servers"]["other"]["command"] == "other"
        assert not skill.exists()

    def testInstallSkillWithoutRegisteringMCP(self, tmp_path):
        """Install only the official Skill when the client already has MCP configured."""
        config = tmp_path / ".codex" / "config.toml"
        config.parent.mkdir()
        config.write_text('[mcp_servers.other]\ncommand = "other"\n', encoding="utf-8")
        originalConfig = config.read_bytes()
        skill = tmp_path / ".agents" / "skills" / "nuwa-agent-relay"

        self.runInstaller(tmp_path, "install", "--component", "skill")
        assert (skill / "SKILL.md").is_file()
        assert config.read_bytes() == originalConfig

        self.runInstaller(tmp_path, "uninstall", "--component", "skill")
        assert not skill.exists()
        assert config.read_bytes() == originalConfig
