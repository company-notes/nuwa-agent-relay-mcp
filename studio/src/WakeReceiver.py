"""Signed local Wake callback HTTP receiver and delivery worker."""

import hashlib
import hmac
import json
import logging
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Event, Thread

from .Config import LocalConfig
from .PeerNotification import PeerNotification
from .SessionPeer import PeerSubmissionUncertain, SessionPeer
from .WakeEcho import EchoAgentHandler
from .WakeInbox import WakeInbox
from .WakeSubscription import WakeSubscription


logger = logging.getLogger(__name__)


class WakeReceiver:
    """Verify signed HTTP callbacks and run queued messages off the HTTP path."""

    MAX_BYTES = 8192
    MESSAGE_ID_PATTERN = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        re.IGNORECASE,
    )
    EVENT_FIELDS = {"event", "eventVersion", "messageID", "recipientSessionID"}
    DISPATCH_FIELDS = {
        "relayThreadID", "senderSessionID", "senderCanonicalAddress",
        "recipientAgentID", "recipientCanonicalAddress", "recipientBotID", "body",
    }
    OPTIONAL_DISPATCH_FIELDS = {
        "recipientPlatformThreadID", "senderDisplayName", "senderAuthMode",
    }

    def __init__(self, config: LocalConfig, client, peerTarget: str | None = None, peer=None):
        self.config = config
        self.settings = WakeSubscription(config, client).load()
        sessionID = config.requireSession()
        inboxPath = config.wakeInboxPath()

        if peerTarget is not None:
            target = SessionPeer.validateTarget(peerTarget)
            digest = hashlib.sha256(sessionID.encode("utf-8")).hexdigest()
            self.inbox = WakeInbox(inboxPath.with_name(f"wake-native-{digest}.sqlite3"), (sessionID, target))
            self.handler = PeerNotification(client, sessionID, target, peer)
        else:
            self.inbox = WakeInbox(inboxPath)
            self.handler = EchoAgentHandler(client, sessionID)

        self._stopEvent = Event()

    def accept(self, body: bytes, signature: str | None) -> dict:
        if len(body) > self.MAX_BYTES:
            raise WakeRequestError(413, "Wake payload is too large.")

        expected = "sha256=" + hmac.new(
            self.settings["signing_secret"].encode("utf-8"), body, hashlib.sha256,
        ).hexdigest()

        if not signature or not hmac.compare_digest(signature, expected):
            raise WakeRequestError(401, "Invalid Wake signature.")

        try:
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise WakeRequestError(400, "Wake payload must be JSON.") from error

        if not isinstance(payload, dict):
            raise WakeRequestError(400, "Unexpected Wake payload structure.")

        fields = set(payload)
        additionalFields = fields - self.EVENT_FIELDS

        if not self.EVENT_FIELDS.issubset(fields) or (
            additionalFields and
            (not self.DISPATCH_FIELDS.issubset(additionalFields) or
             not additionalFields.issubset(
                 self.DISPATCH_FIELDS | self.OPTIONAL_DISPATCH_FIELDS))
        ):
            raise WakeRequestError(400, "Unexpected Wake payload structure.")

        messageID = payload["messageID"]

        if (payload["event"] != "nuwa.message.available" or
                payload["eventVersion"] != 2 or
                not isinstance(messageID, str) or
                not self.MESSAGE_ID_PATTERN.fullmatch(messageID)):
            raise WakeRequestError(400, "Invalid Wake event or message ID.")

        if payload["recipientSessionID"] != self.config.requireSession():
            raise WakeRequestError(403, "Wake targeted another Session.")

        isNew = self.inbox.enqueue(messageID)

        return {"accepted": True, "messageID": messageID, "duplicate": not isNew}

    def processDue(self) -> None:
        for messageID, attempts in self.inbox.due():
            if not self.inbox.claim(messageID):
                continue

            try:
                self.handler.process(messageID)
            except PeerSubmissionUncertain:
                logger.warning("Native submission unconfirmed (messageID=%s); held for inspection",
                               messageID)
            except Exception as error:
                # A remote client error may embed credentials in its message.
                logger.warning(
                    "Local Wake execution failed (errorType=%s, messageID=%s); retrying",
                    type(error).__name__, messageID,
                )
                self.inbox.retryLater(messageID, attempts)
            else:
                self.inbox.complete(messageID)

    def _processLoop(self) -> None:
        while not self._stopEvent.wait(0.25):
            self.processDue()

    def serve(self, port: int = 8765) -> None:
        if not 1 <= port <= 65535:
            raise ValueError("Wake listener port must be between 1 and 65535.")

        with WakeHTTPServer(("127.0.0.1", port), self) as server:
            worker = Thread(target=self._processLoop, daemon=True, name="nuwa-wake-receiver")
            worker.start()
            mode = "native session" if isinstance(self.handler, PeerNotification) else "Echo"
            print("Nuwa Wake %s listening on http://127.0.0.1:%d/wake" % (mode, port))
            print("Session: %s; Relay: %s" % (self.config.requireSession(), self.config.apiURL))

            try:
                server.serve_forever(poll_interval=0.2)
            except KeyboardInterrupt:
                logger.info("Stopping local Wake listener")
            finally:
                self._stopEvent.set()
                server.shutdown()
                worker.join(timeout=3)


class WakeRequestError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class WakeHTTPServer(HTTPServer):
    def __init__(self, address, receiver: WakeReceiver):
        super().__init__(address, WakeRequestHandler)
        self.receiver = receiver


class WakeRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404)
            return

        self.sendJSON(200, {"ok": True, "service": "nuwa-wake-echo"})

    def do_POST(self) -> None:
        if self.path != "/wake":
            self.send_error(404)
            return

        rawLength = self.headers.get("content-length")
        if rawLength is None or re.fullmatch(r"[0-9]+", rawLength) is None:
            logger.debug("Wake request missing valid Content-Length")
            self.sendJSON(411, {"error": "Content-Length required."})
            return

        length = int(rawLength)

        if length > WakeReceiver.MAX_BYTES:
            self.sendJSON(413, {"error": "Wake payload is too large."})
            return

        raw = self.rfile.read(length)

        try:
            result = self.server.receiver.accept(
                raw, self.headers.get("x-nuwa-wake-signature"),
            )
        except WakeRequestError as error:
            logger.debug("Wake request rejected (HTTP %s)", error.status)
            self.sendJSON(error.status, {"error": str(error)})
            return

        self.sendJSON(202, result)

    def sendJSON(self, status: int, data: dict) -> None:
        payload = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, formatString: str, *args) -> None:
        # Avoid leaking callback data, query strings or private parameters.
        logger.debug("Wake HTTP request: %s", formatString % args)
