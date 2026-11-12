import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { RelayAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

export class RelayTools extends MCPToolSet {
  private readonly schemas = {
    messageID: z.string().uuid(),
    threadID: z.string().uuid(),
    body: z.string().min(1).max(100_000),
    to: z.string().min(1).max(255),
    subject: z.string().min(1).max(255),
    artifactLinks: z.array(z.url()).max(20).optional(),
  };

  constructor(server: McpServer, private readonly client: RelayAPIClient) {
    super(server);
  }

  install(): void {
    this.registerMailboxTools();
    this.registerInboxTools();
    this.registerMessageTools();
    this.registerHandoffTools();
    this.registerReceiptTools();
    this.registerWakeTools();
  }

  private registerMailboxTools(): void {
    this.register('relayProvisionAgentMailbox',
      'Provision the managed mailbox of the bound Agent. Requires user approval.',
      {},
      () => this.client.call('POST', '/v2/agents/mailbox'));
  }

  private registerInboxTools(): void {
    const { threadID, messageID } = this.schemas;

    this.register('relayInbox',
      'List messages addressed to the bound Session without marking them read.',
      {},
      () => this.client.call('GET', '/v2/inbox'));

    this.register('relayAgentInbox',
      'List unclaimed Handoffs addressed to the bound Session\'s Agent.',
      {},
      () => this.client.call('GET', '/v2/agent-inbox'));

    this.register('relayThreadHistory',
      'Read messages in an authorized Relay Thread, not the platform UI conversation.',
      { threadID },
      ({ threadID }) => this.client.call('GET',
        '/v2/threads/' + encodeURIComponent(threadID as string)));

    this.register('relayMessage',
      'Read one authorized message, optionally with up to 12 preceding Thread messages.',
      { messageID, contextLimit: z.number().int().min(1).max(12).optional() },
      ({ messageID, contextLimit }) => this.client.call('GET',
        '/v2/messages/' + encodeURIComponent(messageID as string),
        undefined,
        contextLimit === undefined
          ? undefined : { context_limit: String(contextLimit) }));
  }

  private registerMessageTools(): void {
    const { to, body, subject, artifactLinks, threadID } = this.schemas;

    this.register('sendToAgent',
      'Send to an Agent or exact Session address, creating a new Relay Thread. ' +
      'Use relayReplyThread to continue a Thread; submission is not delivery.',
      { to, message: body, subject: subject.optional(), artifactLinks },
      ({ to, message, subject, artifactLinks }) =>
        this.client.call('POST', '/v2/messages', {
          to, body: message,
          ...(subject ? { subject } : {}),
          ...(artifactLinks ? { artifactLinks } : {}),
        }));

    this.register('relayReplyThread',
      'Reply inside an existing Relay Thread as the authorized bound Session.',
      { threadID, body, artifactLinks },
      ({ threadID, body: text, artifactLinks }) =>
        this.client.call('POST',
          '/v2/threads/' + encodeURIComponent(threadID as string) + '/messages',
          { body: text, ...(artifactLinks ? { artifactLinks } : {}) }));
  }

  private registerHandoffTools(): void {
    const { to, subject, body, artifactLinks, messageID } = this.schemas;

    this.register('relaySendHandoff',
      'Delegate work to an Agent or exact Session.',
      { to, subject, body, artifactLinks },
      ({ to, subject, body: text, artifactLinks }) =>
        this.client.call('POST', '/v2/handoffs',
          { to, subject, body: text, ...(artifactLinks ? { artifactLinks } : {}) }));

    this.register('relayAcceptHandoff',
      'Atomically accept an Agent-level Handoff for the bound Session.',
      { messageID },
      ({ messageID }) => this.client.call('POST',
        '/v2/handoffs/' + encodeURIComponent(messageID as string) + '/accept'));

    this.register('relayReplyHandoff',
      'Reply to an accepted Handoff in its existing Relay Thread.',
      { messageID, body, artifactLinks },
      ({ messageID, body: text, artifactLinks }) =>
        this.client.call('POST',
          '/v2/handoffs/' + encodeURIComponent(messageID as string) + '/reply',
          { body: text, ...(artifactLinks ? { artifactLinks } : {}) }));
  }

  private registerReceiptTools(): void {
    const { messageID } = this.schemas;

    this.register('relayReceipt',
      'Inspect independently confirmed mail arrival and explicit Session read receipts.',
      { messageID, refreshArchive: z.boolean().optional() },
      ({ messageID, refreshArchive }) => this.client.call('GET',
        '/v2/messages/' + encodeURIComponent(messageID as string) + '/receipt',
        undefined, refreshArchive ? { refresh: 'archive' } : undefined));

    this.register('relayAcknowledgeRead',
      'Explicitly acknowledge a received message as the bound Session.',
      { messageID },
      ({ messageID }) => this.client.call('POST',
        '/v2/messages/' + encodeURIComponent(messageID as string) + '/read'));
  }

  private registerWakeTools(): void {
    this.register('relayBeginWakePairing',
      'Create an OAuth-protected private browser link for Session Wake pairing.',
      {},
      () => this.client.call('POST', '/v2/wake-pairings'));

    this.register('relayRegisterWake',
      'Start a signed callback verification. Do not put private webhook secrets in tool arguments.',
      { callbackURL: z.url(), authMode: z.enum(['hmac', 'bearer', 'capability']).optional() },
      ({ callbackURL, authMode }) =>
        this.client.call('POST', '/v2/wake-subscription', {
          callbackUrl: callbackURL,
          ...(authMode ? { authMode } : {}),
        }));

    this.register('relayVerifyWake',
      'Complete an authenticated callback challenge for the bound Session.',
      { verificationID: z.string().uuid(), challenge: z.string().min(1).max(128) },
      ({ verificationID, challenge }) =>
        this.client.call('POST', '/v2/wake-subscription/verification',
          { verificationId: verificationID, challenge }));

    this.register('relayWakeSubscription',
      'Inspect the bound Session Wake without disclosing secrets.',
      {},
      () => this.client.call('GET', '/v2/wake-subscription'));

    this.register('relayRemoveWake',
      'Remove the bound Session Wake subscription and queued notifications.',
      {},
      () => this.client.call('DELETE', '/v2/wake-subscription'));

    this.register('relayWakeEvents',
      'Inspect Wake delivery and retry status for the bound Session.',
      {},
      () => this.client.call('GET', '/v2/wake-events'));
  }
}
