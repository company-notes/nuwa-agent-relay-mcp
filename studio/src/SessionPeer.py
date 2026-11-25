"""Local Codex submission through the published session-peer CLI."""

import json
import logging
import subprocess
import sys
from uuid import UUID


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
        if not isinstance(target, str) or not target.startswith("codex:"):
            raise ValueError("Choose an explicit local codex:<thread UUID> destination.")

        try:
            threadID = str(UUID(target.removeprefix("codex:")))
        except ValueError as error:
            raise ValueError("Choose a full Codex thread UUID.") from error

        if target != "codex:" + threadID:
            raise ValueError("Choose the canonical full Codex thread UUID.")

        return target

    @classmethod
    def runChild(cls, arguments: list[str]) -> None:
        import session_peer

        raise SystemExit(session_peer.main(arguments))

    @classmethod
    def _command(cls) -> list[str]:
        if getattr(sys, "frozen", False):
            return [sys.executable, cls.CHILD_COMMAND]

        return [sys.executable, "-m", "session_peer"]

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

    def send(self, target: str, message: str) -> dict:
        target = self.validateTarget(target)
        if not message or len(message.encode("utf-8")) > self.MAX_MESSAGE_BYTES:
            raise ValueError("Native session message exceeds the UTF-8 size limit.")

        arguments = [
            "send", "--to", target, "--message", "-", "--no-from", "--no-reply-to",
        ]
        try:
            result = self._invoke(arguments, message)
            payload = self._decode(result.stdout)
        except (subprocess.TimeoutExpired, OSError, ValueError) as error:
            logger.warning("Session-peer submission outcome unknown (errorType=%s)", type(error).__name__)
            raise PeerSubmissionUncertain("Native submission outcome is unknown.") from error

        if result.returncode != 0 or payload.get("ok") is not True:
            if payload.get("submitted") is False and payload.get("retryAllowed") is True:
                raise RuntimeError("Native session rejected the request before submission.")

            raise PeerSubmissionUncertain("Native session delivery was not positively confirmed.")

        if (payload.get("submitted") is not True or payload.get("status") != "queued" or
                payload.get("target") != {"agent": "codex", "id": target.removeprefix("codex:")}):
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
