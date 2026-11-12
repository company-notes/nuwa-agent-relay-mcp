"""Wake callback registration and credential lifecycle for one Session."""

import json
import logging
from urllib.parse import urlparse

from .Config import LocalConfig


logger = logging.getLogger(__name__)


class WakeSubscription:
    """Own one Session's signing secret and the Relay subscription lifecycle."""

    def __init__(self, config: LocalConfig, client):
        self.config = config
        self.client = client

    @classmethod
    def validateCallbackURL(cls, callbackURL: str) -> str:
        parsed = urlparse(callbackURL)

        if (parsed.scheme != "https" or not parsed.hostname or
                parsed.username or parsed.password or parsed.query or parsed.fragment or
                parsed.port not in (None, 443)):
            raise ValueError("Wake callback must be a public HTTPS URL without URL credentials.")

        return callbackURL

    def register(self, callbackURL: str, authMode: str = "hmac",
                 bearerToken: str | None = None) -> dict:
        callbackURL = self.validateCallbackURL(callbackURL)
        selectedSessionID = self.config.requireSession()
        response = self.client.registerWake(callbackURL, authMode, bearerToken)

        if (response.get("sessionID") != selectedSessionID or
                response.get("status") != "pending_verification"):
            raise RuntimeError("Relay did not return a pending registration for this Session.")

        if authMode == "hmac":
            signingSecret = response.get("signingSecret")

            if not isinstance(signingSecret, str) or len(signingSecret) < 32:
                raise RuntimeError("Relay did not return a valid Wake signing secret.")

            LocalConfig.writePrivate(self.config.wakePath(), {
                "api_url": self.config.apiURL,
                "session_id": selectedSessionID,
                "callback_host": urlparse(callbackURL).hostname,
                "signing_secret": signingSecret,
            })

        if not response.get("challengeDelivered"):
            logger.warning("Wake challenge delivery failed (sessionID=%s)", selectedSessionID)

        return {
            "status": "pending_verification",
            "sessionID": selectedSessionID,
            "callbackHost": urlparse(callbackURL).hostname,
            "authMode": authMode,
            "verificationID": response["verificationId"],
            "challengeDelivered": bool(response.get("challengeDelivered")),
        }

    def verify(self, verificationID: str, challenge: str) -> dict:
        return self.client.verifyWake(verificationID, challenge)

    def load(self) -> dict:
        path = self.config.wakePath()

        if not path.exists():
            raise RuntimeError("Wake signing secret missing. Run wake register first.")

        details = json.loads(path.read_text(encoding="utf-8"))

        if (details["session_id"] != self.config.requireSession() or
                details["api_url"] != self.config.apiURL):
            raise RuntimeError("Wake credentials belong to a different Session or Relay origin.")

        return details

    def status(self) -> dict:
        response = self.client.wakeSubscription()
        detailsReady = False

        if response.get("authMode") == "hmac" and self.config.wakePath().exists():
            details = self.load()
            detailsReady = response.get("callbackHost") == details.get("callback_host")

        return {
            "enabled": response.get("enabled", False),
            "callbackHost": response.get("callbackHost"),
            "authMode": response.get("authMode"),
            "pending": response.get("pending"),
            "localSigningKeyReady": detailsReady,
        }

    def remove(self) -> dict:
        result = self.client.removeWake()
        self.config.wakePath().unlink(missing_ok=True)
        return result
