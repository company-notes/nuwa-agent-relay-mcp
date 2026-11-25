import json
import os

import pytest

from src.CLI import StudioCLI
from src.Config import LocalConfig
from src.Installer import StudioInstaller


def test_private_session_and_runtime_capability_files_are_isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    selected = LocalConfig.load().selectSession("session-a", "runtime-secret", "resume-secret")

    assert selected.requireSession() == "session-a"
    assert selected.requireRuntimeToken() == "runtime-secret"
    assert selected.requireResumeToken("session-a") == "resume-secret"
    assert LocalConfig.load().requireSession() == "session-a"
    assert LocalConfig.load().requireRuntimeToken() == "runtime-secret"

    publicConfig = json.loads(LocalConfig.configPath().read_text())
    runtime = json.loads(LocalConfig.runtimePath().read_text())

    assert publicConfig["session_id"] == "session-a"
    assert "runtime-secret" not in json.dumps(publicConfig)
    assert runtime == {"session_id": "session-a", "runtime_token": "runtime-secret"}
    assert json.loads(LocalConfig.resumePath().read_text()) == {
        "session_id": "session-a", "resume_token": "resume-secret",
    }

    if os.name != "nt":
        assert LocalConfig.configPath().stat().st_mode & 0o777 == 0o600
        assert LocalConfig.runtimePath().stat().st_mode & 0o777 == 0o600
        assert LocalConfig.resumePath().stat().st_mode & 0o777 == 0o600


def test_missing_session_mismatched_token_and_unsafe_origin_fail_fast(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load()

    with pytest.raises(ValueError, match="No Session"):
        config.requireSession()

    with pytest.raises(ValueError):
        config.selectSession("org/agent/main", "runtime-secret")

    selected = config.selectSession("session-a", "runtime-a")
    LocalConfig.runtimePath().write_text(
        json.dumps({"session_id": "session-b", "runtime_token": "runtime-b"}),
    )

    with pytest.raises(ValueError, match="does not belong"):
        selected.requireRuntimeToken()

    with pytest.raises(ValueError):
        LocalConfig.validateOrigin("http://127.0.0.1:8787")

    with pytest.raises(ValueError):
        LocalConfig.validateOrigin("https://relay.example.com/redirect")


def test_studio_identity_parser_requires_explicit_claim_or_resume():
    parser = StudioCLI.createParser()
    args = parser.parse_args(["identity", "--create", "--agent-name", "reviewer"])
    assert args.create
    assert args.agent_name == "reviewer"

    resumed = parser.parse_args([
        "identity", "--resume-session-id", "session-a", "--resume-token-env", "RESUME_TOKEN",
    ])
    assert resumed.resume_session_id == "session-a"


def test_installer_uses_project_manifest():
    manifest = StudioInstaller.manifestPath()
    payload = json.loads(manifest.read_text())

    assert payload["entrypoint"] == "nuwa-relay-mcp"
    assert payload["binaryEnvVar"] == "NUWA_RELAY_MCP_BINARY"
    assert payload["serverName"] == "nuwa-agent-relay-studio"


def test_cli_keeps_wake_receiver_and_message_tooling_available():
    helpText = StudioCLI.createParser().format_help()

    assert "wake" in helpText or "identity" in helpText
    assert "send-to-agent" in helpText or "identity" in helpText


def test_logout_clears_runtime_and_local_wake_secrets(tmp_path, monkeypatch):
    from src.Auth import OAuthCredentials

    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load().selectSession("session-b", "old-runtime", "old-resume")
    LocalConfig.writePrivate(config.authPath(), {"access_token": "old-oauth"})
    LocalConfig.writePrivate(config.wakePath(), {"signing_secret": "private-wake"})

    OAuthCredentials(config).logout()

    assert not config.authPath().exists()
    assert not config.runtimePath().exists()
    assert not config.resumePath().exists()
    assert not config.wakePath().exists()

    with pytest.raises(ValueError, match="No Runtime capability"):
        config.requireRuntimeToken()

def test_studio_claim_stores_resume_secret_and_requires_explicit_resume(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    parser = StudioCLI.createParser()

    class AddressStub:
        resumed = False

        def claimAgent(self, agentName, sessionName):
            assert agentName == "analyst"
            assert sessionName == "main"
            return {
                "session": {"id": "session-new", "canonical": "org/analyst/main"},
                "runtimeToken": "runtime-first",
                "resumeToken": "resume-private",
            }

        def resumeSession(self, sessionID, resumeToken):
            self.resumed = True
            assert sessionID == "session-new"
            assert resumeToken == "resume-private"
            return {
                "session": {"id": sessionID, "canonical": "org/analyst/main"},
                "runtimeToken": "runtime-second",
            }

    address = AddressStub()
    config = LocalConfig.load()
    created = parser.parse_args(["identity", "--create",
                                 "--agent-name", "analyst", "--session-name", "main"])

    assert StudioCLI.selectIdentity(created, config, address) == "org/analyst/main"
    assert LocalConfig.load().requireRuntimeToken() == "runtime-first"
    assert LocalConfig.load().requireResumeToken("session-new") == "resume-private"
    assert address.resumed is False

    resumed = parser.parse_args(["identity", "--resume-session-id", "session-new"])
    assert StudioCLI.selectIdentity(resumed, LocalConfig.load(), address) == "org/analyst/main"
    assert address.resumed is True
    assert LocalConfig.load().requireRuntimeToken() == "runtime-second"

    with pytest.raises(ValueError, match="does not match"):
        LocalConfig.load().requireResumeToken("session-other")
