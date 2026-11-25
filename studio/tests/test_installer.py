"""Exercise the installed Relay MCP CLI against an isolated Codex profile."""

import json
import os
import sysconfig
from pathlib import Path


class TestStudioInstall:
    def runLauncher(self, profile, *arguments: str):
        name = "nuwa-relay-mcp.exe" if os.name == "nt" else "nuwa-relay-mcp"
        launcher = Path(sysconfig.get_path("scripts")) / name
        assert launcher.is_file(), "The installed distribution must expose nuwa-relay-mcp"

        return profile.run(str(launcher), *arguments)

    def runInstaller(self, profile, *arguments: str):
        return self.runLauncher(profile, *arguments, "--target", "codex")

    def testBundledPeerDiscovery(self, installerProfile):
        """An installed CLI must discover native sessions without another session-peer installation."""
        output = self.runLauncher(installerProfile, "peer", "list")
        result = json.loads(output)
        assert result["version"] == "1.6.2"
        assert isinstance(result["sessions"], list)

    def testCodexInstallUpdateAndUninstall(self, installerProfile):
        """Install the official Skill and MCP, preserve unrelated config, then remove both."""
        profile = installerProfile
        preview = self.runInstaller(profile, "install", "--print")
        assert "nuwa-agent-relay" in preview
        assert profile.config.read_bytes() == profile.originalConfig
        assert not profile.skill.exists()

        self.runInstaller(profile, "install")
        installed = profile.servers()
        assert Path(installed["nuwa-agent-relay-studio"]["command"]).is_file()
        assert installed["other"]["command"] == "other"
        assert "name: nuwa-agent-relay" in (profile.skill / "SKILL.md").read_text(encoding="utf-8")
        assert (profile.skill / "references" / "work-clients.md").is_file()

        self.runInstaller(profile, "install", "--overwrite")
        assert (profile.skill / "references" / "work-clients.md").is_file()

        self.runInstaller(profile, "uninstall")
        remaining = profile.servers()
        assert "nuwa-agent-relay-studio" not in remaining
        assert remaining["other"]["command"] == "other"
        assert not profile.skill.exists()

    def testInstallSkillWithoutRegisteringMCP(self, installerProfile):
        """Install only the official Skill when the client already has MCP configured."""
        profile = installerProfile
        self.runInstaller(profile, "install", "--component", "skill")
        assert (profile.skill / "SKILL.md").is_file()
        assert profile.config.read_bytes() == profile.originalConfig

        self.runInstaller(profile, "uninstall", "--component", "skill")
        assert not profile.skill.exists()
        assert profile.config.read_bytes() == profile.originalConfig
