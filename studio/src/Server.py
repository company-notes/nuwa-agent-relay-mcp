"""FastMCP Studio adapter. Relay owns message and identity business rules."""

from fastmcp import FastMCP

from .Auth import OAuthCredentials
from .Client import RelayClient
from .Config import LocalConfig
from .NativeWorkRouter import NativeWorkRouter
from .RemoteWorkClient import RemoteWorkClient
from .WakeSubscription import WakeSubscription


class StudioMCP:
    def __init__(self, config: LocalConfig | None = None, client: RelayClient | None = None,
                 workClient=None, peer=None, reconnectDelay: float = 5):
        self.config = config or LocalConfig.load()
        credentials = OAuthCredentials(self.config)
        self.client = client or RelayClient(self.config, credentials)
        self.work = NativeWorkRouter(
            self.config, workClient or RemoteWorkClient(credentials), peer, reconnectDelay,
        )

    def createServer(self) -> FastMCP:
        server = FastMCP(
            "Nuwa Agent Relay Studio",
            instructions=(
                "For Codex, Claude Code, Grok Build and OpenCode, before any new task call agentAddressStartWork with a meaningful "
                "kebab-case sessionName and sessionDisplayName. On resume call it without names. "
                "When asked for your work address, call agentAddressGetStatus. If there is no bound "
                "Session, initialize the current work with agentAddressStartWork, using its meaningful task or project name. "
                "Immediately report the returned canonical address to the user. First use may "
                "open a browser for OAuth login. Use sendToAgent and relayReplyThread, never from. "
                "Codex, Claude Code and OpenCode use their local receiving adapter; Grok Build uses relayInbox. "
                "If native work context is unavailable, do not invent a thread or use another identity."
            ),
            middleware=[self.work], lifespan=self.work.lifespan,
        )
        client = self.client
        wakeSubscription = WakeSubscription(self.config, client)

        @server.tool(name="relayInbox")
        @server.tool()
        def checkInbox():
            """Read messages addressed to the selected Session without marking them read."""
            return client.inbox()

        @server.tool(name="relayAgentInbox")
        @server.tool()
        def checkAgentInbox():
            """List unclaimed Agent handoffs."""
            return client.agentInbox()

        @server.tool(name="relayMessage")
        @server.tool()
        def getMessage(messageID: str):
            """Read one message without marking it read."""
            return client.getMessage(messageID)

        @server.tool(name="relayThreadHistory")
        @server.tool()
        def getThreadHistory(threadID: str):
            """Read an authorized Thread."""
            return client.threadHistory(threadID)

        @server.tool()
        def sendToAgent(to: str, message: str, subject: str | None = None,
                        artifactLinks: list[str] | None = None):
            """Submit an asynchronous Session message; success is not receipt, Wake or execution.

            Use relayReplyThread to answer an existing conversation.
            """
            return client.sendMessage(to, message, subject, artifactLinks)

        @server.tool(name="relaySendHandoff")
        @server.tool()
        def sendHandoff(to: str, subject: str, body: str,
                        artifactLinks: list[str] | None = None):
            """Send a Agent handoff with optional artifact URLs."""
            return client.sendHandoff(to, subject, body, artifactLinks)

        @server.tool(name="relayAcceptHandoff")
        @server.tool()
        def acceptHandoff(messageID: str):
            """Explicitly accept a Agent handoff."""
            return client.acceptHandoff(messageID)

        @server.tool(name="relayReplyHandoff")
        @server.tool()
        def replyHandoff(messageID: str, body: str,
                         artifactLinks: list[str] | None = None):
            """Reply to an accepted Agent handoff."""
            return client.replyHandoff(messageID, body, artifactLinks)

        @server.tool(name="relayReplyThread")
        @server.tool()
        def replyThread(threadID: str, body: str,
                        artifactLinks: list[str] | None = None):
            """Reply in an existing Thread."""
            return client.replyThread(threadID, body, artifactLinks)

        @server.tool(name="relayReceipt")
        @server.tool()
        def getReceipt(messageID: str, refreshArchive: bool = False):
            """Inspect submission, confirmed delivery, and explicit read receipts."""
            return client.receipt(messageID, refreshArchive)

        @server.tool(name="relayAcknowledgeRead")
        @server.tool()
        def acknowledgeRead(messageID: str):
            """Explicitly record reading as the receiving Session."""
            return client.acknowledgeRead(messageID)

        @server.tool(name="relayWakeEvents")
        @server.tool()
        def getWakeEvents():
            """Read Wake event delivery and retry status."""
            return client.wakeEvents()

        @server.tool()
        def registerWake(callbackURL: str, authMode: str = "hmac",
                         bearerToken: str | None = None):
            """Begin a verified Wake registration for this Session.

            Agent-managed Webhook callbacks may use HMAC, bearer or capability auth.
            Obtain provider credentials through approved tools rather than asking
            the user to copy them; avoid exposing MCP arguments in chat.
            """
            return wakeSubscription.register(callbackURL, authMode, bearerToken)

        @server.tool()
        def verifyWake(verificationID: str, challenge: str):
            """Activate a pending Wake after this Session's webhook received its challenge."""
            return wakeSubscription.verify(verificationID, challenge)

        @server.tool(name="relayWakeSubscription")
        @server.tool()
        def getWakeSubscription():
            """Read this Session's Wake subscription, without exposing its signing secret."""
            return wakeSubscription.status()

        @server.tool(name="relayRemoveWake")
        @server.tool()
        def removeWakeSubscription():
            """Remove this Session's Wake callback and the local signing key."""
            return wakeSubscription.remove()

        @server.tool(name="relayProvisionAgentMailbox")
        @server.tool()
        def provisionAgentMailbox():
            """Explicitly create or reuse a managed Agent mailbox."""
            return client.provisionAgentMailbox()

        @server.tool()
        def agentAddressStartWork(sessionName: str | None = None,
                                  sessionDisplayName: str | None = None):
            """Initialize or resume the host's native work, then report its canonical address."""
            raise ValueError("A supported native work host identity is required.")

        @server.tool()
        def agentAddressGetStatus():
            """Read the host's work address without changing its identity."""
            raise ValueError("A supported native work host identity is required.")

        @server.tool()
        def agentAddressSelectSession(address: str):
            """Restore a known work address only at its owner's explicit request."""
            raise ValueError("A supported native work host identity is required.")

        @server.tool()
        def agentAddressReleaseWork():
            """Explicitly release this native work's Runtime, retaining history."""
            raise ValueError("A supported native work host identity is required.")

        return server

    def run(self) -> None:
        self.createServer().run()
