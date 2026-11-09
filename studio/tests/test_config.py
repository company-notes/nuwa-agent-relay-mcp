import json
import os

import pytest

from src.Config import LocalConfig
from src.Installer import StudioInstaller


def test_private_config_files_have_disk_key_conventions_and_work_selection(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load()
    selected = config.selectWork("work-owned")

    assert selected.requireWork() == "work-owned"
    assert LocalConfig.load().requireWork() == "work-owned"

    raw = json.loads(LocalConfig.configPath().read_text())
    assert raw["work_address_id"] == "work-owned"
    assert raw["api_url"] == "https://agent-relay.company-notes.com"

    if os.name != "nt":
        assert LocalConfig.configPath().stat().st_mode & 0o777 == 0o600


def test_missing_work_and_unsafe_origins_fail_fast(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load()

    with pytest.raises(ValueError, match="No Work"):
        config.requireWork()

    with pytest.raises(ValueError):
        config.selectWork("org/host/handle")

    with pytest.raises(ValueError):
        LocalConfig.validateOrigin("http://127.0.0.1:8787")

    with pytest.raises(ValueError):
        LocalConfig.validateOrigin("https://relay.example.com/redirect")


def test_installer_uses_project_manifest():
    manifest = StudioInstaller.manifestPath()
    payload = json.loads(manifest.read_text())

    assert payload["entrypoint"] == "nuwa-studio-mcp"
    assert payload["binaryEnvVar"] == "NUWA_STUDIO_MCP_BINARY"
    assert payload["serverName"] == "nuwa-agent-relay-studio"

def test_cli_exposes_real_local_wake_receiver_setup_commands():
    """Local Studio must register and listen for signed Wake without a Bot platform."""
    from src.CLI import StudioCLI

    parser = StudioCLI.createParser()
    helpText = parser.format_help()

    assert "wake" in helpText, "Studio CLI must expose Wake setup and local receiver"
    assert "send-to-agent" in helpText, "A Work should send without requiring an AI GUI"
    assert "thread" in helpText, "The sender must be able to inspect the echo reply"

