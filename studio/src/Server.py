from fastmcp import FastMCP

from .Client import RelayClient


class StudioMCP:
    """Local stdio transport; all identity, delivery and persistence stay in the APIs."""

    def __init__(self, client: RelayClient | None = None):
        self.client = client or RelayClient()

    def createServer(self) -> FastMCP:
        server = FastMCP('Nuwa Agent Relay Studio')
        tools = {
            'relay_identity': self.relayIdentity,
            'relay_inbox': self.relayInbox,
            'relay_host_inbox': self.relayHostInbox,
            'relay_get_message': self.relayGetMessage,
            'relay_thread_history': self.relayThreadHistory,
            'relay_send_message': self.relaySendMessage,
            'relay_send_handoff': self.relaySendHandoff,
            'relay_reply_thread': self.relayReplyThread,
            'relay_accept_handoff': self.relayAcceptHandoff,
            'relay_reply_handoff': self.relayReplyHandoff,
            'relay_receipt': self.relayReceipt,
            'relay_acknowledge_read': self.relayAcknowledgeRead,
            'relay_wake_events': self.relayWakeEvents,
            'relay_provision_host_mailbox': self.relayProvisionHostMailbox,
            'relay_list_aliases': self.relayListAliases,
            'relay_register_alias': self.relayRegisterAlias,
            'relay_revoke_alias': self.relayRevokeAlias,
            'relay_get_wake_subscription': self.relayGetWakeSubscription,
            'relay_set_wake_subscription': self.relaySetWakeSubscription,
            'relay_remove_wake_subscription': self.relayRemoveWakeSubscription,
            'agentAddressGetStatus': self.agentAddressGetStatus,
            'agentAddressResolve': self.agentAddressResolve,
        }
        for name, method in tools.items():
            server.tool(name=name)(method)
        return server

    def relayIdentity(self):
        """Confirm the selected Work belongs to the signed-in Agent Address account."""
        return self.client.address(
            '/v1/account/status', query={'work_address_id': self.client.requireWorkId()})

    def relayInbox(self):
        """Read the Work's D1 inbox without acknowledging any message."""
        return self.client.relay('/v1/inbox')

    def relayHostInbox(self):
        """List unaccepted Host handoffs without claiming one."""
        return self.client.relay('/v1/host-inbox')

    def relayGetMessage(self, messageId: str):
        """Read a message body without acknowledging it."""
        return self.client.relay('/v1/messages/' + self.encodeId(messageId))

    def relayThreadHistory(self, threadId: str):
        """Read a Thread this Work participates in."""
        return self.client.relay('/v1/threads/' + self.encodeId(threadId))

    def relaySendMessage(self, to: str, body: str, subject: str | None = None,
                         artifactLinks: list[str] | None = None):
        """Send a Work-to-Work message; real mail delivery is attempted."""
        payload = {'to': to, 'body': body, 'artifactLinks': artifactLinks or []}
        if subject is not None:
            payload['subject'] = subject
        return self.client.relay('/v1/messages', 'POST', payload)

    def relaySendHandoff(self, to: str, subject: str, body: str,
                         artifactLinks: list[str] | None = None):
        """Send a work handoff to a Host or Work; not an ordinary chat message."""
        return self.client.relay('/v1/handoffs', 'POST', {
            'to': to, 'subject': subject, 'body': body,
            'artifactLinks': artifactLinks or [],
        })

    def relayReplyThread(self, threadId: str, body: str, subject: str | None = None,
                         artifactLinks: list[str] | None = None):
        """Reply in an existing Thread (real send)."""
        payload = {'body': body, 'artifactLinks': artifactLinks or []}
        if subject is not None:
            payload['subject'] = subject
        return self.client.relay(
            '/v1/threads/' + self.encodeId(threadId) + '/messages', 'POST', payload)

    def relayAcceptHandoff(self, messageId: str):
        """Explicitly accept an unclaimed Host handoff for this Work."""
        return self.client.relay(
            '/v1/handoffs/' + self.encodeId(messageId) + '/accept', 'POST')

    def relayReplyHandoff(self, messageId: str, body: str,
                          artifactLinks: list[str] | None = None):
        """Reply to an accepted Host handoff (real send)."""
        return self.client.relay(
            '/v1/handoffs/' + self.encodeId(messageId) + '/reply', 'POST',
            {'body': body, 'artifactLinks': artifactLinks or []})

    def relayReceipt(self, messageId: str, refreshArchive: bool = False):
        """Read separate submission, external arrival and human/agent read evidence."""
        return self.client.relay(
            '/v1/messages/' + self.encodeId(messageId) + '/receipt',
            query={'refresh': 'archive'} if refreshArchive else {})

    def relayAcknowledgeRead(self, messageId: str):
        """Explicitly mark this Work's received message as read."""
        return self.client.relay(
            '/v1/messages/' + self.encodeId(messageId) + '/read', 'POST')

    def relayWakeEvents(self):
        """Inspect wake webhook deliveries; success does not mean the AI ran."""
        return self.client.relay('/v1/wake-events')

    def relayProvisionHostMailbox(self):
        """Provision the Host's managed MailTrigger mailbox (side effect)."""
        return self.client.relay('/v1/hosts/provision', 'POST')

    def relayListAliases(self):
        """List this Work's external aliases and their verification state."""
        return self.client.relay('/v1/aliases')

    def relayRegisterAlias(self, provider: str, externalId: str):
        """Register an unverified alias; operator verification is separate."""
        return self.client.relay('/v1/aliases', 'POST', {
            'provider': provider, 'externalId': externalId})

    def relayRevokeAlias(self, aliasId: str):
        """Revoke one of this Work's aliases."""
        return self.client.relay('/v1/aliases/' + self.encodeId(aliasId), 'DELETE')

    def relayGetWakeSubscription(self):
        """Show this Work's registered wake callback."""
        return self.client.relay('/v1/wake-subscription')

    def relaySetWakeSubscription(self, callbackUrl: str):
        """Register an allowlisted HTTPS wake callback; store the signing secret securely."""
        return self.client.relay(
            '/v1/wake-subscription', 'POST', {'callbackUrl': callbackUrl})

    def relayRemoveWakeSubscription(self):
        """Delete a wake callback subscription and pending retries."""
        return self.client.relay('/v1/wake-subscription', 'DELETE')

    def agentAddressGetStatus(self):
        """Show OAuth account, Organization, Hosts and selected Work."""
        return self.relayIdentity()

    def agentAddressResolve(self, address: str):
        """Resolve an address inside the signed-in account's Organization."""
        return self.client.address('/v1/account/resolve', query={'address': address})

    @classmethod
    def encodeId(cls, value: str) -> str:
        from urllib.parse import quote
        return quote(value, safe='')
