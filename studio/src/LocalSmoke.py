"""Focused real Relay A-to-B-to-A smoke check with explicit Webhook receipt."""

import time
from uuid import uuid4

from .WakeEcho import EchoAgentHandler


class LocalEchoRoundTrip:
    """Own the send → receipt → Echo reply acceptance checks for local testing."""

    def __init__(self, client, sessionID: str):
        self.client = client
        self.sessionID = sessionID

    def run(self, to: str, timeout: float = 45.0) -> dict:
        if not to or timeout <= 0 or timeout > 300:
            raise ValueError("Specify a recipient and a timeout between 0 and 300 seconds.")

        probe = "Nuwa signed Wake Echo probe " + uuid4().hex
        sent = self.client.sendMessage(to, probe, "Nuwa local A-B-A test")
        messageID = sent["id"]
        threadID = sent["threadId"]
        due = time.monotonic() + timeout
        receipt = {}
        echo = None

        while True:
            receipt = self.client.receipt(messageID)
            history = self.client.threadHistory(threadID)
            expectedEcho = EchoAgentHandler.prefix + messageID

            echo = next((item for item in history
                         if item["senderSessionID"] != self.sessionID and
                         item["body"] == expectedEcho), None)
            arrived = (receipt.get("submissionStatus") == "sent" and
                       receipt.get("arrivedInMailTrigger") is True and
                       receipt.get("receiptSource") == "webhook")

            if arrived and echo:
                return {
                    "ok": True,
                    "messageID": messageID,
                    "threadID": threadID,
                    "receivedAt": receipt["receivedAt"],
                    "receiptSource": receipt["receiptSource"],
                    "echoReplyID": echo["id"],
                }

            if time.monotonic() >= due:
                raise TimeoutError(
                    "Local A-B-A Echo incomplete: messageID=%s threadID=%s "
                    "receiptSource=%s arrived=%s echoReceived=%s. "
                    "Check local B receipt route, signed Wake subscription, "
                    "tunnel and Echo listener." % (
                        messageID, threadID, receipt.get("receiptSource"),
                        receipt.get("arrivedInMailTrigger"), bool(echo),
                    ),
                )

            time.sleep(0.5)
