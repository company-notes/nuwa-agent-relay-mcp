"""Receive authorized work Inbox messages without a public local webhook."""

import logging
from threading import Event, Thread
from uuid import UUID

from .NativeWorkIdentity import ClaudeHost, NativeWorkIdentity
from .PeerNotification import PeerNotification
from .RemoteWorkClient import RemoteWorkClient
from .SessionPeer import PeerSubmissionUncertain
from .WakeInbox import WakeInbox


logger = logging.getLogger(__name__)


class NativeWorkReceiver:
    """One private work binding and durable submission queue for one native thread."""

    def __init__(self, config, remote, peer, identity: NativeWorkIdentity, sessionID: str,
                 created: bool, interval: float = 5):
        self.remote = remote
        self.identity = identity
        self.sessionID = sessionID
        self.existingWork = not created
        self.interval = interval
        target = identity.target
        self.inbox = WakeInbox.forNative(config, sessionID, target)
        self.notification = PeerNotification(None, sessionID, target, peer)
        self.stopEvent = Event()
        self.worker = Thread(target=self._run, daemon=True, name="nuwa-native-work-receiver")

    def start(self) -> None:
        self.worker.start()

    def stop(self) -> None:
        self.stopEvent.set()
        self.worker.join(timeout=50)

    def _messages(self) -> dict:
        rows = RemoteWorkClient.value(self.remote.call(self.identity.nativeID, "relayInbox", mode=self.identity.mode))

        if not isinstance(rows, list):
            raise RuntimeError("Remote work Inbox was not a list.")

        messages = {}
        for row in reversed(rows):
            if not isinstance(row, dict):
                raise RuntimeError("Remote work Inbox contains an invalid row.")

            if row.get("kind") not in ("message", "reply"):
                continue

            if row.get("recipientSessionID") != self.sessionID:
                raise RuntimeError("Inbox belongs to a different work Session.")

            messageID = row.get("id")
            if not isinstance(messageID, str) or str(UUID(messageID)) != messageID:
                raise ValueError("Invalid Relay message ID.")

            messages[messageID] = row

        return messages

    def _poll(self) -> None:
        if self.identity.mode == "claude-code":
            ClaudeHost.current(self.identity.nativeID)

        messages = self._messages()

        if self.stopEvent.is_set():
            return

        self.inbox.initializePolling(list(messages), self.existingWork)
        for messageID in messages:
            self.inbox.enqueue(messageID)

        for messageID, attempts in self.inbox.due():
            if self.stopEvent.is_set():
                return

            if messageID not in messages or not self.inbox.claim(messageID):
                continue

            try:
                if self.identity.mode == "claude-code":
                    ClaudeHost.current(self.identity.nativeID)

                self.notification.submit(messageID, messages[messageID])
            except PeerSubmissionUncertain:
                logger.warning("Native work submission uncertain (messageID=%s)", messageID)
            except Exception as error:
                logger.warning("Native work submission rejected (errorType=%s)", type(error).__name__)
                self.inbox.retryLater(messageID, attempts)
            else:
                self.inbox.complete(messageID)

    def _run(self) -> None:
        while not self.stopEvent.is_set():
            try:
                self._poll()
            except Exception as error:
                logger.warning("Native work Inbox unavailable (errorType=%s)", type(error).__name__)

            self.stopEvent.wait(self.interval)
