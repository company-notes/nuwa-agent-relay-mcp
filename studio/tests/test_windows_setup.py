"""Run the real Windows Setup and its installed stdio MCP on a disposable profile."""

import asyncio
import json
import os
import sys
import struct
import time
from contextlib import asynccontextmanager
from importlib.metadata import version
from pathlib import Path

import pytest

if os.name == "nt":
    import winreg
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from src.Config import LocalConfig
from src.WorkerServiceManager import WindowsWorkerService, WorkerTaskState


@pytest.mark.skipif(
    os.name != "nt" or not os.environ.get("NUWA_TEST_WINDOWS_SETUP"),
    reason="Requires a built Windows Setup on a disposable Windows test account",
)
class TestWindowsSetup:
    REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\nuwa-relay-mcp"
    PROTOCOL_KEY = r"Software\Classes\nuwa-studio-worker"

    @classmethod
    def verifyWorkerProtocol(cls, worker):
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, cls.PROTOCOL_KEY) as key:
            assert winreg.QueryValueEx(key, "URL Protocol")[0] == ""

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, cls.PROTOCOL_KEY + r"\shell\open\command") as key:
            assert winreg.QueryValueEx(key, "")[0] == f'"{worker}" pair'

    @classmethod
    def registration(cls):
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, cls.REG_KEY) as key:
            return {
                name: winreg.QueryValueEx(key, name)[0]
                for name in ("DisplayName", "DisplayVersion", "InstallLocation", "UninstallString")
            }

    @classmethod
    @asynccontextmanager
    async def runningMCP(cls, executable, profile):
        params = StdioServerParameters(command=str(executable), args=[], env=profile.env)

        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                yield session

    @classmethod
    async def verifyMCP(cls, executable, profile):
        async with cls.runningMCP(executable, profile) as session:
            tools = await session.list_tools()
            assert {"sendToAgent", "relayReplyThread"} <= {tool.name for tool in tools.tools}

    @classmethod
    async def verifyBlockedUpgrade(cls, setup, destination, executable, profile, identity):
        """A busy MCP stays alive and all installed data remains unchanged."""
        async with cls.runningMCP(executable, profile) as session:
            paths = [executable, profile.config, profile.skill / "SKILL.md", identity]
            before = {path: path.read_bytes() for path in paths}
            registration = cls.registration()

            result = await asyncio.to_thread(
                profile.runResult, str(setup), "/S", f"/D={destination}", timeout=90,
            )

            assert result.returncode == 20, (
                "A locked installation must return the update-deferred status, "
                f"not fail with the default extraction error: {result.returncode}"
            )
            assert cls.registration() == registration
            assert {path: path.read_bytes() for path in paths} == before

            tools = await session.list_tools()
            assert {"sendToAgent", "relayReplyThread"} <= {tool.name for tool in tools.tools}

    @classmethod
    def verifyClaudeRegistration(cls, profile, claude, executable):
        details = profile.run(str(claude), "mcp", "get", "nuwa-agent-relay-studio")
        assert str(executable).lower() in details.lower()

    @classmethod
    def verifyClaudeAbsent(cls, profile, claude):
        result = profile.runResult(
            str(claude), "mcp", "remove", "-s", "user", "nuwa-agent-relay-studio",
        )

        assert result.returncode != 0, "Claude MCP registration must be absent"
        assert 'No MCP server named "nuwa-agent-relay-studio" in user scope' in (
            result.stderr + result.stdout
        )

    @classmethod
    def waitForWorker(cls, manager, log):
        deadline = time.monotonic() + 45

        while time.monotonic() < deadline:
            if manager.status() == WorkerTaskState.RUNNING and log.is_file():
                if "Worker bridge exchange interrupted" in log.read_text(encoding="utf-8"):
                    return

            time.sleep(0.5)

        pytest.fail("The registered Worker task did not start and reach its exchange loop")

    @classmethod
    def waitForUninstall(cls, executable, uninstaller):
        deadline = time.monotonic() + 60

        while time.monotonic() < deadline:
            try:
                cls.registration()
            except FileNotFoundError:
                if not executable.exists() and not uninstaller.exists():
                    return
            time.sleep(0.25)

        pytest.fail("Windows uninstall did not remove the program and registry entry")

    def testInstallUpgradeAndRemove(self, installerProfile, monkeypatch):
        """Run Setup, verify registered MCP starts, upgrade, and uninstall without losing identity data."""
        profile = installerProfile
        setup = Path(os.environ["NUWA_TEST_WINDOWS_SETUP"]).resolve()
        destination = profile.home / "application"
        executable = destination / "nuwa-relay-mcp.exe"
        uninstaller = destination / "Uninstall.exe"
        worker = destination / WindowsWorkerService.EXECUTABLE
        monkeypatch.setenv("NUWA_MCP_HOME", profile.env["NUWA_MCP_HOME"])
        manager = WindowsWorkerService(LocalConfig(), worker)
        expectedVersion = version("nuwa-relay-mcp")
        assert setup.is_file(), "Windows Setup must exist before running acceptance"
        claude = Path(os.environ["NUWA_TEST_CLAUDE_CLI"]).resolve()
        assert claude.is_file(), "Real Claude Code CLI is required for Setup acceptance"
        profile.env["CLAUDE_CLI_PATH"] = str(claude)
        profile.env["DISABLE_AUTOUPDATER"] = "1"

        self.verifyClaudeAbsent(profile, claude)
        profile.run(str(claude), "mcp", "add-json", "-s", "user", "nuwa-unrelated",
                    json.dumps({"command": sys.executable, "args": ["--version"]}))

        identity = Path(profile.env["NUWA_MCP_HOME"]) / "auth.json"
        identity.parent.mkdir()
        identity.write_text("local identity sentinel", encoding="utf-8")

        profile.run(str(setup), "/S", f"/D={destination}", timeout=300)
        assert executable.is_file()
        assert worker.is_file()
        assert manager.status() == WorkerTaskState.READY
        self.verifyWorkerProtocol(worker)

        # A GUI-subsystem binary starts without allocating a console, and an
        # unpaired install exits without calling the cloud or local Gateway.
        data = worker.read_bytes()
        peOffset = struct.unpack_from("<I", data, 0x3c)[0]
        assert struct.unpack_from("<H", data, peOffset + 24 + 68)[0] == 2
        profile.run(str(worker), "serve", "--home", profile.env["NUWA_MCP_HOME"], timeout=90)
        assert (LocalConfig.configDir() / "worker-serve.log").is_file()

        assert profile.run(str(executable), "--version").strip() == expectedVersion
        profile.verifyPeerDiscovery(str(executable))
        assert self.registration() == {
            "DisplayName": "Nuwa Relay MCP",
            "DisplayVersion": expectedVersion,
            "InstallLocation": str(destination),
            "UninstallString": f'"{uninstaller}"',
        }
        assert Path(profile.servers()["nuwa-agent-relay-studio"]["command"]) == executable
        assert profile.servers()["other"]["command"] == "other"
        assert (profile.skill / "SKILL.md").is_file()
        assert (profile.skill / "references" / "work-clients.md").is_file()
        self.verifyClaudeRegistration(profile, claude, executable)
        profile.verifyAdditionalClients(executable)
        assert (profile.home / ".claude" / "skills" / "nuwa-agent-relay" / "SKILL.md").is_file()
        asyncio.run(asyncio.wait_for(self.verifyMCP(executable, profile), timeout=90))

        # The isolated invalid auth file prevents cloud access. A saved pairing
        # exercises the real scheduled startup and graceful installer upgrade.
        LocalConfig.writePrivate(LocalConfig.workerBridgePath(), {"route": "a" * 64})
        workerLog = LocalConfig.configDir() / "worker-serve.log"
        workerLog.unlink()
        manager.start()

        self.waitForWorker(manager, workerLog)

        asyncio.run(asyncio.wait_for(
            self.verifyBlockedUpgrade(setup, destination, executable, profile, identity), timeout=120,
        ))

        # Retry the same installer after the running MCP has closed normally.
        profile.run(str(setup), "/S", f"/D={destination}", timeout=300)
        self.waitForWorker(manager, workerLog)
        self.verifyWorkerProtocol(worker)
        assert self.registration()["DisplayVersion"] == expectedVersion
        assert Path(profile.servers()["nuwa-agent-relay-studio"]["command"]) == executable
        assert (profile.skill / "SKILL.md").is_file()

        self.verifyClaudeRegistration(profile, claude, executable)
        profile.verifyAdditionalClients(executable)

        profile.run(str(uninstaller), "/S", timeout=300)
        self.waitForUninstall(executable, uninstaller)
        assert not worker.exists()
        assert manager.status() == WorkerTaskState.ABSENT
        with pytest.raises(FileNotFoundError):
            winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.PROTOCOL_KEY)
        assert LocalConfig.workerBridgePath().is_file()
        assert "nuwa-agent-relay-studio" not in profile.servers()
        assert profile.servers()["other"]["command"] == "other"
        assert not profile.skill.exists()
        assert identity.read_text(encoding="utf-8") == "local identity sentinel"
        assert not (profile.home / ".claude" / "skills" / "nuwa-agent-relay").exists()
        self.verifyClaudeAbsent(profile, claude)
        profile.verifyAdditionalClients(None)
        profile.run(str(claude), "mcp", "remove", "-s", "user", "nuwa-unrelated")
