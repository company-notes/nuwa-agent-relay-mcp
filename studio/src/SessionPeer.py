"""Native-session message submission through the published session-peer CLI."""

import json
import subprocess
import sys
from enum import IntEnum


class PeerSubmission(IntEnum):
    QUEUED = 1
    POSTED = 2


class PeerSubmissionUncertain(RuntimeError):
    """Submission may have reached a live session; operator review is required."""


class SessionPeer:
    """Submit once to an already running Codex or Claude Code session."""

    MAX_MESSAGE_LENGTH = 32768

    def __init__(self, runner=None):
        self.runner = runner or subprocess.run

    @classmethod
    def _command(cls) -> list[str]:
        if getattr(sys, "frozen", False):
            return ["session-peer"]
        return [sys.executable, "-m", "session_peer"]

    def send(self, target: str, message: str) -> dict:
        if not target or len(target) > 256 or any(char.isspace() for char in target):
            raise ValueError("Choose one explicit session-peer destination.")
        if not message or len(message) > self.MAX_MESSAGE_LENGTH:
            raise ValueError("Native session message must contain 1–32768 characters.")

        arguments = [
            *self._command(), "send", "--to", target,
            "--message", "-", "--output-format", "json",
            "--no-from", "--no-reply-to",
        ]
        try:
            result = self.runner(
                arguments, input=message, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=25, check=False,
            )
        except (subprocess.TimeoutExpired, OSError) as error:
            raise PeerSubmissionUncertain("Native session submission outcome is unknown.") from error

        try:
            payload = json.loads(result.stdout)
        except (ValueError, TypeError) as error:
            raise PeerSubmissionUncertain("Native session did not return structured submission evidence.") from error

        if result.returncode != 0 or payload.get("ok") is not True:
            if payload.get("submitted") is False and payload.get("retryAllowed") is True:
                raise RuntimeError("Native session rejected the request before submission.")
            raise PeerSubmissionUncertain("Native session delivery was not positively confirmed.")

        if payload.get("submitted") is not True or payload.get("status") not in ("queued", "posted"):
            raise PeerSubmissionUncertain("Native session delivery response lacks submission evidence.")

        return {
            "submitted": True,
            "status": payload["status"],
            "consumptionConfirmed": False,
        }

    def list(self) -> dict:
        arguments = [*self._command(), "list", "--output-format", "json"]
        result = self.runner(
            arguments, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=20, check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("Native session discovery failed.")

        payload = json.loads(result.stdout)
        if not isinstance(payload, dict) or "sessions" not in payload:
            raise RuntimeError("Native session discovery returned an unexpected result.")

        return payload
