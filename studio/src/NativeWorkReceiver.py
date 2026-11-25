"""Receive authorized work Inbox notifications over a long-lived WebSocket."""

import logging
from threading import Event, Thread
from uuid import UUID

from .NativeWorkIdentity import ClaudeHost, NativeWorkIdentity
from .PeerNotification import PeerNotification
from .RemoteWorkClient import RemoteWorkClient
from .SessionPeer import PeerSubmissionUncertain
from .WakeInbox import WakeInbox
from .WorkInboxStream import WorkInboxStream


logger = logging.getLogger(__name__)


class NativeWorkReceiver:
    """One private work binding and durable submission queue for one native thread."""

    def __init__(self, config, remote, peer, identity: NativeWorkIdentity, sessionID: str,
                 reconnectDelay: float = 5):
        self.remote = remote
        self.identity = identity
        self.sessionID = sessionID
        self.reconnectDelay = reconnectDelay
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

    def _verifyHost(self) -> None:
        if self.identity.mode == "claude-code":
            ClaudeHost.current(self.identity.nativeID)

    def _catchUp(self) -> None:
        while not self.stopEvent.is_set():
            self._verifyHost()
            cursor = self.inbox.eventCursor()
            page = self.remote.eventPage(self.identity, cursor)
            items = page["items"]
            nextCursor = page["cursor"]
            hasMore = page["hasMore"]

            if not isinstance(items, list) or type(nextCursor) is not int or type(hasMore) is not bool:
                raise ValueError("Invalid Inbox event page.")

            messageIDs = []
            sequence = cursor

            for item in items:
                messageID = item["messageID"]
                nextSequence = item["sequence"]

                if type(nextSequence) is not int or nextSequence <= sequence or str(UUID(messageID)) != messageID:
                    raise ValueError("Invalid ordered Inbox event.")

                sequence = nextSequence
                messageIDs.append(messageID)

            if nextCursor != sequence or (hasMore and not messageIDs):
                raise ValueError("Invalid Inbox continuation cursor.")

            self.inbox.ingestEvents(cursor, nextCursor, messageIDs)

            if not hasMore:
                return

    def _drain(self) -> None:
        for messageID, attempts in self.inbox.due():
            if self.stopEvent.is_set():
                return

            try:
                self._verifyHost()
                message = RemoteWorkClient.value(self.remote.call(
                    self.identity.nativeID, "relayMessage", {"messageID": messageID}, mode=self.identity.mode,
                ))

                if message.get("kind") not in ("message", "reply"):
                    raise ValueError("Invalid native Inbox message kind.")
            except Exception as error:
                logger.warning("Native Inbox message unavailable (errorType=%s)", type(error).__name__)
                self.inbox.retryLater(messageID, attempts)
                continue

            if not self.inbox.claim(messageID):
                continue

            try:
                self._verifyHost()
                self.notification.submit(messageID, message)
            except PeerSubmissionUncertain:
                logger.warning("Native work submission uncertain (messageID=%s)", messageID)
            except Exception as error:
                logger.warning("Native work submission rejected (errorType=%s)", type(error).__name__)
                self.inbox.retryLater(messageID, attempts)
            else:
                self.inbox.complete(messageID)

    def _connected(self) -> None:
        self._verifyHost()

        with self.remote.openInboxStream(self.identity) as stream:
            # Subscribe first: messages arriving during replay are signaled as well.
            self._catchUp()

            while not self.stopEvent.is_set():
                self._drain()

                try:
                    signal = stream.recv(timeout=0.5)
                except TimeoutError:
                    # This is a local wait for cancellation and due retries, not an HTTP poll.
                    continue

                WorkInboxStream.validateSignal(signal)
                self._catchUp()

    def _run(self) -> None:
        delay = self.reconnectDelay

        while not self.stopEvent.is_set():
            try:
                self._connected()
                delay = self.reconnectDelay
            except Exception as error:
                if not self.stopEvent.is_set():
                    logger.warning("Native work Inbox stream unavailable (errorType=%s)", type(error).__name__)

            self.stopEvent.wait(delay)
            delay = min(60, delay * 2)
