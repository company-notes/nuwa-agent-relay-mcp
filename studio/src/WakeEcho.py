"""Fixed-response local test agent; never executes message instructions."""

import logging


logger = logging.getLogger(__name__)


class EchoAgentHandler:
    """Local smoke handler: send a fixed acknowledgment, never run prompt text."""

    prefix = "Nuwa local echo receipt for "

    def __init__(self, client, sessionID: str):
        self.client = client
        self.sessionID = sessionID

    def process(self, messageID: str) -> None:
        message = self.client.getMessage(messageID)

        if message["recipientSessionId"] != self.sessionID:
            raise ValueError("Wake message does not belong to the configured Session.")

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

        if any(item["senderSessionID"] == self.sessionID and
                item["body"] == reply for item in history):
            logger.info("Echo response already exists for %s", messageID)
            return

        self.client.replyThread(threadID, reply)
        logger.info("Echo replied to message %s in thread %s", messageID, threadID)
