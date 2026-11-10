"""FastMCP Studio adapter. Relay owns message and identity business rules."""

from fastmcp import FastMCP

from .Auth import OAuthCredentials
from .Client import RelayClient
from .Config import LocalConfig
from .WakeReceiver import WakeSubscription


class StudioMCP:
    def __init__(self, config: LocalConfig | None = None, client: RelayClient | None = None):
        self.config = config or LocalConfig.load()
        self.client = client or RelayClient(self.config, OAuthCredentials(self.config))

    def createServer(self) -> FastMCP:
        server = FastMCP("Nuwa Agent Relay Studio")
        client = self.client
        wakeSubscription = WakeSubscription(self.config, client)

        @server.tool()
        def checkInbox():
            """Read messages addressed to the selected Work without marking them read."""
            return client.inbox()

        @server.tool()
        def checkHostInbox():
            """List unclaimed Host handoffs."""
            return client.hostInbox()

        @server.tool()
        def getMessage(messageID: str):
            """Read one message without marking it read."""
            return client.getMessage(messageID)

        @server.tool()
        def getThreadHistory(threadID: str):
            """Read an authorized Thread."""
            return client.threadHistory(threadID)

        @server.tool()
        def sendToAgent(to: str, message: str, subject: str | None = None,
                        artifactLinks: list[str] | None = None):
            """Submit an asynchronous Work message; success is not receipt, Wake or execution.

            Use replyThread to answer an existing conversation.
            """
            return client.sendMessage(to, message, subject, artifactLinks)

        @server.tool()
        def sendMessage(to: str, body: str, subject: str | None = None,
                        artifactLinks: list[str] | None = None):
            """Send a Work message to the recipient. This is a real external action."""
            return client.sendMessage(to, body, subject, artifactLinks)

        @server.tool()
        def sendHandoff(to: str, subject: str, body: str,
                        artifactLinks: list[str] | None = None):
            """Send a Host handoff with optional artifact URLs."""
            return client.sendHandoff(to, subject, body, artifactLinks)

        @server.tool()
        def acceptHandoff(messageID: str):
            """Explicitly accept a Host handoff."""
            return client.acceptHandoff(messageID)

        @server.tool()
        def replyHandoff(messageID: str, body: str,
                         artifactLinks: list[str] | None = None):
            """Reply to an accepted Host handoff."""
            return client.replyHandoff(messageID, body, artifactLinks)

        @server.tool()
        def replyThread(threadID: str, body: str,
                        artifactLinks: list[str] | None = None):
            """Reply in an existing Thread."""
            return client.replyThread(threadID, body, artifactLinks)

        @server.tool()
        def getReceipt(messageID: str, refreshArchive: bool = False):
            """Inspect submission, confirmed delivery, and explicit read receipts."""
            return client.receipt(messageID, refreshArchive)

        @server.tool()
        def acknowledgeRead(messageID: str):
            """Explicitly record reading as the receiving Work."""
            return client.acknowledgeRead(messageID)

        @server.tool()
        def getWakeEvents():
            """Read Wake event delivery and retry status."""
            return client.wakeEvents()

        @server.tool()
        def registerWake(callbackURL: str, authMode: str = "hmac",
                         bearerToken: str | None = None):
            """Begin a verified Wake registration for this Work.

            Agent-managed Webhook callbacks may use HMAC, bearer or capability auth.
            Obtain provider credentials through approved tools rather than asking
            the user to copy them; avoid exposing MCP arguments in chat.
            """
            return wakeSubscription.register(callbackURL, authMode, bearerToken)

        @server.tool()
        def verifyWake(verificationID: str, challenge: str):
            """Activate a pending Wake after this Work's webhook received its challenge."""
            return wakeSubscription.verify(verificationID, challenge)

        @server.tool()
        def getWakeSubscription():
            """Read this Work's Wake subscription, without exposing its signing secret."""
            return wakeSubscription.status()

        @server.tool()
        def removeWakeSubscription():
            """Remove this Work's Wake callback and the local signing key."""
            return wakeSubscription.remove()

        @server.tool()
        def provisionHostMailbox():
            """Explicitly create or reuse a managed Host mailbox."""
            return client.provisionHostMailbox()

        return server

    def run(self) -> None:
        self.createServer().run()
