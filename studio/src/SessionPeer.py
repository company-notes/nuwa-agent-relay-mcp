"""Local native work submission through the published session-peer CLI."""

import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from .NativeWorkIdentity import ClaudeHost, NativeWorkIdentity


logger = logging.getLogger(__name__)


class PeerSubmissionUncertain(RuntimeError):
    """Submission may have reached the native queue; review before retrying."""


class SessionPeer:
    """Use the same bounded child process for wheels and frozen Windows executables."""

    CHILD_COMMAND = "_session-peer"
    MAX_MESSAGE_BYTES = 32768
    TIMEOUT = 45

    @classmethod
    def validateTarget(cls, target: str) -> str:
        if not isinstance(target, str):
            raise ValueError("Choose an exact native work destination.")

        prefix, separator, nativeID = target.partition(":")
        if not separator or prefix not in ("codex", "claude"):
            raise ValueError("Choose codex:<UUID> or claude:<UUID>.")

        NativeWorkIdentity.canonicalID(nativeID)

        return target

    @classmethod
    def runChild(cls, arguments: list[str]) -> None:
        import session_peer

        raise SystemExit(session_peer.main(arguments))

    @classmethod
    def _command(cls) -> list[str]:
        if getattr(sys, "frozen", False):
            if os.name == "nt":
                interpreter = Path(sys._MEIPASS) / "peer-runtime" / "python.exe"
                if not interpreter.is_file():
                    raise RuntimeError("The bundled session-peer interpreter is missing.")

                return [str(interpreter), "-X", "utf8", "-m", "session_peer"]

            return [sys.executable, cls.CHILD_COMMAND]

        return [sys.executable, "-X", "utf8", "-m", "session_peer"]

    @classmethod
    def _invoke(cls, arguments: list[str], message: str | None = None):
        return subprocess.run(
            [*cls._command(), *arguments, "--output-format", "json", "--no-update-notice"],
            input=message, text=True, encoding="utf-8", errors="strict",
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=cls.TIMEOUT, check=False,
        )

    @classmethod
    def _decode(cls, output: str) -> dict:
        payload = json.loads(output)
        if not isinstance(payload, dict):
            raise ValueError("Expected a structured session-peer result.")

        return payload

    def _claudeDestination(self, nativeID: str) -> tuple[int, str]:
        host = ClaudeHost.current(nativeID)
        if not host.socket:
            raise RuntimeError("Claude Code has not registered a native inbox.")

        listing = self._invoke(["list", "--agent", "claude", "--with-target-generation"])
        payload = self._decode(listing.stdout)

        if listing.returncode != 0 or payload.get("ok") is not True:
            raise RuntimeError("Claude Code inbox discovery failed.")

        sessions = payload.get("sessions")
        if not isinstance(sessions, list):
            raise RuntimeError("Claude Code inbox discovery returned invalid data.")

        matches = [row for row in sessions if isinstance(row, dict) and
                   row.get("pid") == host.pid and row.get("socket") == host.socket and
                   row.get("reachable") is True]

        if len(matches) != 1:
            raise RuntimeError("Claude Code inbox is unavailable or ambiguous.")

        generation = matches[0].get("targetGeneration")
        if not isinstance(generation, str) or not generation.startswith("tg1:"):
            raise RuntimeError("Claude Code inbox generation could not be verified.")

        if ClaudeHost.current(nativeID) != host:
            raise RuntimeError("Claude Code inbox changed before submission.")

        return host.pid, generation

    def send(self, target: str, message: str) -> dict:
        target = self.validateTarget(target)

        if not message or len(message.encode("utf-8")) > self.MAX_MESSAGE_BYTES:
            raise ValueError("Native session message exceeds the UTF-8 size limit.")

        prefix, nativeID = target.split(":", 1)
        destination = target
        generation = None
        pid = None

        if prefix == "claude":
            pid, generation = self._claudeDestination(nativeID)
            destination = str(pid)

        arguments = [
            "send", "--to", destination, "--message", "-", "--no-from", "--no-reply-to",
        ]
        if generation is not None:
            arguments.extend(["--target-generation", generation])

        try:
            result = self._invoke(arguments, message)
            payload = self._decode(result.stdout)
        except (subprocess.TimeoutExpired, OSError, ValueError) as error:
            logger.warning("Session-peer submission outcome unknown (errorType=%s)", type(error).__name__)
            raise PeerSubmissionUncertain("Native submission outcome is unknown.") from error

        if result.returncode != 0 or payload.get("ok") is not True:
            resolution = payload.get("codexHomeResolution")
            notSaved = (isinstance(resolution, dict) and
                        resolution.get("reason") == "thread_not_yet_persisted" and
                        payload.get("submitted") is not True)

            if notSaved or (payload.get("submitted") is False and payload.get("retryAllowed") is True):
                raise RuntimeError("Native session rejected the request before submission.")

            raise PeerSubmissionUncertain("Native session delivery was not positively confirmed.")

        if prefix == "claude":
            selected = payload.get("target")
            if (payload.get("dryRun") is not False or not isinstance(selected, dict) or
                    selected.get("pid") != pid or payload.get("targetGeneration") != generation):
                raise PeerSubmissionUncertain("Claude Code response lacks exact submission evidence.")

            return {"submitted": True, "status": "posted", "consumptionConfirmed": False}

        if (payload.get("submitted") is not True or payload.get("status") != "queued" or
                payload.get("target") != {"agent": "codex", "id": nativeID}):
            raise PeerSubmissionUncertain("Native session response lacks exact submission evidence.")

        return {
            "submitted": True,
            "status": payload["status"],
            "consumptionConfirmed": False,
        }

    def list(self) -> dict:
        result = self._invoke(["list", "--agent", "codex"])
        payload = self._decode(result.stdout)

        if result.returncode != 0 or payload.get("ok") is not True:
            raise RuntimeError("Native session discovery failed; inspect the Codex installation.")

        if not isinstance(payload.get("sessions"), list):
            raise RuntimeError("Native session discovery returned an unexpected result.")

        return payload
