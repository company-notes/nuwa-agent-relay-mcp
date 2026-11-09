"""Local signed Wake receiver and durable asynchronous Echo Agent.

The receiver is a local test adapter, not an LLM runtime. It never executes
instructions from message bodies and never exposes Agent Address credentials.
"""

import hashlib
import hmac
import json
import logging
import re
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Event, Thread
from urllib.parse import urlparse

from .Config import LocalConfig


logger = logging.getLogger(__name__)


class WakeSubscription:
    """Own one Work's signing secret and the Relay subscription lifecycle."""

    def __init__(self, config: LocalConfig, client):
        self.config = config
        self.client = client

    @classmethod
    def validateCallbackURL(cls, callbackURL: str) -> str:
        parsed = urlparse(callbackURL)

        if (parsed.scheme != "https" or not parsed.hostname or parsed.path != "/wake"
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.port not in (None, 443)):
            raise ValueError("Wake callback must be a public HTTPS URL ending in /wake.")

        return callbackURL

    def register(self, callbackURL: str) -> dict:
        callbackURL = self.validateCallbackURL(callbackURL)
        selectedWorkID = self.config.requireWork()
        response = self.client.registerWake(callbackURL)

        if (response.get("workAddressId") != selectedWorkID or
                response.get("callbackUrl") != callbackURL):
            raise RuntimeError("Relay Wake subscription belongs to a different Work or callback.")

        signingSecret = response.get("signingSecret")

        if not isinstance(signingSecret, str) or len(signingSecret) < 32:
            raise RuntimeError("Relay did not return a valid Wake signing secret.")

        LocalConfig.writePrivate(self.config.wakePath(), {
            "api_url": self.config.apiURL,
            "work_address_id": selectedWorkID,
            "callback_url": callbackURL,
            "signing_secret": signingSecret,
        })

        return {"enabled": True, "workAddressID": selectedWorkID, "callbackURL": callbackURL}

    def load(self) -> dict:
        path = self.config.wakePath()

        if not path.exists():
            raise RuntimeError("Wake signing secret missing. Run wake register first.")

        details = json.loads(path.read_text(encoding="utf-8"))

        if (details["work_address_id"] != self.config.requireWork() or
                details["api_url"] != self.config.apiURL):
            raise RuntimeError("Wake credentials belong to a different Work or Relay origin.")

        return details

    def status(self) -> dict:
        response = self.client.wakeSubscription()
        available = self.config.wakePath().exists()

        if available:
            details = self.load()
            available = response.get("callbackUrl") == details["callback_url"]

        return {
            "enabled": response.get("enabled", False),
            "callbackURL": response.get("callbackUrl"),
            "localSigningKeyReady": available,
        }

    def remove(self) -> dict:
        result = self.client.removeWake()
        self.config.wakePath().unlink(missing_ok=True)
        return result


class WakeInbox:
    """Persist notifications before HTTP ACK, and deduplicate across restarts."""

    def __init__(self, path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

        if __import__("os").name != "nt":
            self.path.parent.chmod(0o700)

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    CREATE TABLE IF NOT EXISTS incoming_wake (
                        message_id TEXT PRIMARY KEY,
                        received_at REAL NOT NULL,
                        next_attempt_at REAL NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        completed_at REAL
                    )
                """)

        if __import__("os").name != "nt":
            self.path.chmod(0o600)

    def enqueue(self, messageID: str) -> bool:
        now = time.time()

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                result = db.execute("""
                    INSERT OR IGNORE INTO incoming_wake
                        (message_id, received_at, next_attempt_at)
                    VALUES (?, ?, ?)
                """, (messageID, now, now))
                return result.rowcount == 1

    def due(self) -> list[tuple[str, int]]:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            return db.execute("""
                SELECT message_id, attempts
                FROM incoming_wake
                WHERE completed_at IS NULL AND next_attempt_at <= ?
                ORDER BY received_at LIMIT 25
            """, (time.time(),)).fetchall()

    def complete(self, messageID: str) -> None:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    UPDATE incoming_wake SET completed_at = ?
                    WHERE message_id = ? AND completed_at IS NULL
                """, (time.time(), messageID))

    def retryLater(self, messageID: str, attempts: int) -> None:
        delay = min(60, 2 ** min(attempts + 1, 6))

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    UPDATE incoming_wake
                    SET attempts = ?, next_attempt_at = ?
                    WHERE message_id = ? AND completed_at IS NULL
                """, (attempts + 1, time.time() + delay, messageID))


class EchoAgentHandler:
    """Local smoke handler: send a fixed acknowledgment, never run prompt text."""

    prefix = "Nuwa local echo receipt for "

    def __init__(self, client, workAddressID: str):
        self.client = client
        self.workAddressID = workAddressID

    def process(self, messageID: str) -> None:
        message = self.client.getMessage(messageID)

        if message["recipientWorkId"] != self.workAddressID:
            raise ValueError("Wake message does not belong to the configured Work.")

        # Handoffs have their own acceptance protocol. Do not auto-accept them.
        if message["kind"] != "message":
            logger.info("Skipping non-message Wake %s", messageID)
            return

        if message["body"].startswith(self.prefix):
            logger.info("Skipping echo of an Echo message %s", messageID)
            return

        reply = self.prefix + messageID
        threadID = message["threadId"]

        # Also prevent duplicate replies after a crash between successful
        # replyThread and writing the local completion record.
        history = self.client.threadHistory(threadID)

        if any(item["senderWorkId"] == self.workAddressID and
                item["body"] == reply for item in history):
            logger.info("Echo response already exists for %s", messageID)
            return

        self.client.replyThread(threadID, reply)
        logger.info("Echo replied to message %s in thread %s", messageID, threadID)


class WakeReceiver:
    """Verify signed HTTP callbacks and run queued messages off the HTTP path."""

    MAX_BYTES = 8192
    MESSAGE_ID_PATTERN = re.compile(r"^[0-9a-f-]{36}$", re.IGNORECASE)

    def __init__(self, config: LocalConfig, client):
        self.config = config
        self.settings = WakeSubscription(config, client).load()
        self.inbox = WakeInbox(config.wakeInboxPath())
        self.handler = EchoAgentHandler(client, config.requireWork())
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

        if not isinstance(payload, dict) or set(payload) != {
            "event", "messageId", "workAddressId",
        }:
            raise WakeRequestError(400, "Unexpected Wake payload structure.")

        messageID = payload["messageId"]

        if (payload["event"] != "nuwa.message.available" or
                not isinstance(messageID, str) or
                not self.MESSAGE_ID_PATTERN.fullmatch(messageID)):
            raise WakeRequestError(400, "Invalid Wake event or message ID.")

        if payload["workAddressId"] != self.config.requireWork():
            raise WakeRequestError(403, "Wake targeted another Work.")

        isNew = self.inbox.enqueue(messageID)
        return {"accepted": True, "messageId": messageID, "duplicate": not isNew}

    def processDue(self) -> None:
        for messageID, attempts in self.inbox.due():
            try:
                self.handler.process(messageID)
                self.inbox.complete(messageID)
            except Exception:
                logger.exception("Failed local Wake execution for %s; retrying", messageID)
                self.inbox.retryLater(messageID, attempts)

    def _processLoop(self) -> None:
        while not self._stopEvent.wait(0.25):
            self.processDue()

    def serve(self, port: int = 8765) -> None:
        if not 1 <= port <= 65535:
            raise ValueError("Wake listener port must be between 1 and 65535.")

        with WakeHTTPServer(("127.0.0.1", port), self) as server:
            worker = Thread(target=self._processLoop, daemon=True, name="nuwa-wake-echo")
            worker.start()
            print("Nuwa Wake Echo listening on http://127.0.0.1:%d/wake" % port)
            print("Work: %s; Relay: %s" % (self.config.requireWork(), self.config.apiURL))

            try:
                server.serve_forever(poll_interval=0.2)
            except KeyboardInterrupt:
                logger.info("Stopping local Wake Echo listener")
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

        try:
            length = int(self.headers.get("content-length", "-1"))
        except ValueError:
            length = -1

        if length < 0:
            self.sendJSON(411, {"error": "Content-Length required."})
            return

        if length > WakeReceiver.MAX_BYTES:
            self.sendJSON(413, {"error": "Wake payload is too large."})
            return

        raw = self.rfile.read(length)

        try:
            result = self.server.receiver.accept(
                raw, self.headers.get("x-nuwa-wake-signature"),
            )
        except WakeRequestError as error:
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
