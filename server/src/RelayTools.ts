import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { RelayAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

type ToolValues = Record<string, unknown>;

export class RelayTools extends MCPToolSet {
  private readonly schemas = {
    sessionID: z.string().uuid(),
    runtimeToken: z.string().min(1).max(256),
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

  private call(
    values: ToolValues,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<unknown> {
    return this.client.call(method, path, values.sessionID as string,
      values.runtimeToken as string, body, query);
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
    const { sessionID, runtimeToken } = this.schemas;

    this.register('relayProvisionAgentMailbox',
      'Provision the managed mailbox of the caller Agent, shared across its Sessions. Requires approval.',
      { sessionID, runtimeToken },
      (value) => this.call(value, 'POST', '/v2/agents/mailbox'));
  }

  private registerInboxTools(): void {
    const { sessionID, runtimeToken, threadID, messageID } = this.schemas;
    const scope = { sessionID, runtimeToken };

    this.register('relayInbox',
      'List messages addressed to the executing Session without marking them read.',
      scope,
      (value) => this.call(value, 'GET', '/v2/inbox'));

    this.register('relayAgentInbox',
      'List unclaimed Handoffs addressed to the executing Session\'s Agent.',
      scope,
      (value) => this.call(value, 'GET', '/v2/agent-inbox'));

    this.register('relayThreadHistory',
      'Read all authorized messages in a Relay Thread, not a platform UI conversation.',
      { ...scope, threadID },
      (value) => this.call(value, 'GET',
        '/v2/threads/' + encodeURIComponent(value.threadID as string)));

    this.register('relayMessage',
      'Read one authorized message, optionally with up to 12 preceding Thread messages.',
      { ...scope, messageID, contextLimit: z.number().int().min(1).max(12).optional() },
      (value) => this.call(value, 'GET',
        '/v2/messages/' + encodeURIComponent(value.messageID as string),
        undefined,
        value.contextLimit === undefined
          ? undefined : { context_limit: String(value.contextLimit) }));
  }

  private registerMessageTools(): void {
    const { sessionID, runtimeToken, to, body, subject, artifactLinks, threadID } = this.schemas;
    const scope = { sessionID, runtimeToken };

    this.register('sendToAgent',
      'Send to an Agent or exact Session address, creating a new Relay Thread. ' +
      'Use relayReplyThread to continue an existing Thread. Submission does not prove delivery.',
      { ...scope, to, message: body, subject: subject.optional(), artifactLinks },
      ({ to, message, subject, artifactLinks, ...scopeValue }) =>
        this.call(scopeValue, 'POST', '/v2/messages', {
          to, body: message,
          ...(subject ? { subject } : {}),
          ...(artifactLinks ? { artifactLinks } : {}),
        }));

    this.register('relayReplyThread',
      'Reply inside an existing Relay Thread as an authorized participating Session.',
      { ...scope, threadID, body, artifactLinks },
      ({ threadID, body: text, artifactLinks, ...scopeValue }) =>
        this.call(scopeValue, 'POST',
          '/v2/threads/' + encodeURIComponent(threadID as string) + '/messages',
          { body: text, ...(artifactLinks ? { artifactLinks } : {}) }));
  }

  private registerHandoffTools(): void {
    const { sessionID, runtimeToken, to, subject, body, artifactLinks, messageID } = this.schemas;
    const scope = { sessionID, runtimeToken };

    this.register('relaySendHandoff',
      'Delegate work to an Agent (to be accepted by one Session), or an exact Session.',
      { ...scope, to, subject, body, artifactLinks },
      ({ to, subject, body: text, artifactLinks, ...scopeValue }) =>
        this.call(scopeValue, 'POST', '/v2/handoffs',
          { to, subject, body: text, ...(artifactLinks ? { artifactLinks } : {}) }));

    this.register('relayAcceptHandoff',
      'Atomically accept an Agent-level Handoff for this Session. This assigns responsibility.',
      { ...scope, messageID },
      (value) => this.call(value, 'POST',
        '/v2/handoffs/' + encodeURIComponent(value.messageID as string) + '/accept'));

    this.register('relayReplyHandoff',
      'Reply to an accepted Handoff in its existing Relay Thread.',
      { ...scope, messageID, body, artifactLinks },
      ({ messageID, body: text, artifactLinks, ...scopeValue }) =>
        this.call(scopeValue, 'POST',
          '/v2/handoffs/' + encodeURIComponent(messageID as string) + '/reply',
          { body: text, ...(artifactLinks ? { artifactLinks } : {}) }));
  }

  private registerReceiptTools(): void {
    const { sessionID, runtimeToken, messageID } = this.schemas;
    const scope = { sessionID, runtimeToken };

    this.register('relayReceipt',
      'Inspect independent MailTrigger arrival evidence and explicit Session read receipts.',
      { ...scope, messageID, refreshArchive: z.boolean().optional() },
      (value) => this.call(value, 'GET',
        '/v2/messages/' + encodeURIComponent(value.messageID as string) + '/receipt',
        undefined, value.refreshArchive ? { refresh: 'archive' } : undefined));

    this.register('relayAcknowledgeRead',
      'Explicitly acknowledge receipt as the addressed Session; listing an inbox does not.',
      { ...scope, messageID },
      (value) => this.call(value, 'POST',
        '/v2/messages/' + encodeURIComponent(value.messageID as string) + '/read'));
  }

  private registerWakeTools(): void {
    const { sessionID, runtimeToken } = this.schemas;
    const scope = { sessionID, runtimeToken };

    this.register('relayBeginWakePairing',
      'Create an OAuth-protected pairing link for a Session webhook. ' +
      'The human securely enters its provider key in Relay\'s browser form.',
      scope,
      (value) => this.call(value, 'POST', '/v2/wake-pairings'));

    this.register('relayRegisterWake',
      'Start a one-time signed callback verification for this Session. ' +
      'Do not expose callback secrets in chat or MCP traces; use pairing for hidden keys.',
      {
        ...scope,
        callbackURL: z.url(),
        authMode: z.enum(['hmac', 'bearer', 'capability']).optional(),
        bearerToken: z.string().min(12).max(2048).optional(),
      },
      ({ callbackURL, authMode, bearerToken, ...scopeValue }) =>
        this.call(scopeValue, 'POST', '/v2/wake-subscription', {
          callbackUrl: callbackURL,
          ...(authMode ? { authMode } : {}),
          ...(bearerToken ? { bearerToken } : {}),
        }));

    this.register('relayVerifyWake',
      'Complete the one-time callback challenge for the selected Session only.',
      { ...scope, verificationID: z.string().uuid(), challenge: z.string().min(1).max(128) },
      ({ verificationID, challenge, ...scopeValue }) =>
        this.call(scopeValue, 'POST', '/v2/wake-subscription/verification',
          { verificationId: verificationID, challenge }));

    this.register('relayWakeSubscription',
      'Inspect this Session\'s verified Wake without disclosing secrets.',
      scope,
      (value) => this.call(value, 'GET', '/v2/wake-subscription'));

    this.register('relayRemoveWake',
      'Remove the Session Wake subscription and cancel queued notifications.',
      scope,
      (value) => this.call(value, 'DELETE', '/v2/wake-subscription'));

    this.register('relayWakeEvents',
      'Inspect delivery and retry status of this Session\'s Wake notifications.',
      scope,
      (value) => this.call(value, 'GET', '/v2/wake-events'));
  }
}
