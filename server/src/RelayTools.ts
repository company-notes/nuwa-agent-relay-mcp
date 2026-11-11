import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { RelayAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

export class RelayTools extends MCPToolSet {
  private readonly schemas = {
    workAddressID: z.string().min(1).max(128),
    messageID: z.string().min(1).max(128),
    threadID: z.string().min(1).max(128),
    body: z.string().min(1).max(100000),
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
    const { workAddressID } = this.schemas;

    this.register('relayProvisionHostMailbox',
      'Create or reuse a managed Host mailbox.',
      { workAddressID },
      (value) => this.client.call('POST', '/v1/hosts/provision', value.workAddressID as string));
  }

  private registerInboxTools(): void {
    const { workAddressID, threadID, messageID } = this.schemas;

    this.register('relayInbox',
      'List messages for the specified Work without marking them as read.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/inbox', value.workAddressID as string));

    this.register('relayHostInbox',
      'List unassigned Host handoffs without accepting them.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/host-inbox', value.workAddressID as string));

    this.register('relayThreadHistory',
      'Read the conversation history for a participating Work.',
      { workAddressID, threadID },
      (value) => this.client.call(
        'GET', '/v1/threads/' + encodeURIComponent(value.threadID as string),
        value.workAddressID as string,
      ));

    this.register('relayMessage',
      'Read an authorized individual message without marking it read. On a verified Wake ' +
      'message event, use its messageID and the Work ID stored in the Automation; one ' +
      'relayMessage call is sufficient. No routine Work status lookup or read ACK.',
      { workAddressID, messageID },
      (value) => this.client.call(
        'GET', '/v1/messages/' + encodeURIComponent(value.messageID as string),
        value.workAddressID as string,
      ));
  }

  private sendWorkMessage(
    workAddressID: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    return this.client.call('POST', '/v1/messages', workAddressID, input);
  }

  private registerMessageTools(): void {
    const { workAddressID, to, body, subject, artifactLinks, threadID } = this.schemas;

    this.register('sendToAgent',
      'Normal Agent-to-Agent sending tool. With the recipient already enrolled, MailTrigger ' +
      'delivery and its verified Wake webhook happen automatically; no manual CLI or separate ' +
      'smoke-test tool is required. Success confirms submission, not recipient execution. ' +
      'Use relayReplyThread to respond in an existing conversation.',
      { workAddressID, to, message: body, subject: subject.optional(), artifactLinks },
      ({ workAddressID, message, ...input }) => this.sendWorkMessage(
        workAddressID as string, { ...input, body: message },
      ));

    this.register('relaySendMessage',
      'Send a message to a Work address. This operation sends a real message.',
      { workAddressID, to, body, subject: subject.optional(), artifactLinks },
      ({ workAddressID, ...input }) => this.sendWorkMessage(
        workAddressID as string, input,
      ));

    this.register('relayReplyThread',
      'Reply to a Thread as the specified Work.',
      { workAddressID, threadID, body, artifactLinks },
      ({ workAddressID, threadID, ...input }) => this.client.call(
        'POST', '/v1/threads/' + encodeURIComponent(threadID as string) + '/messages',
        workAddressID as string, input,
      ));
  }

  private registerHandoffTools(): void {
    const { workAddressID, to, subject, body, artifactLinks, messageID } = this.schemas;

    this.register('relaySendHandoff',
      'Send a Host-level handoff. This operation sends a real request.',
      { workAddressID, to, subject, body, artifactLinks },
      ({ workAddressID, ...input }) => this.client.call(
        'POST', '/v1/handoffs', workAddressID as string, input,
      ));

    this.register('relayAcceptHandoff',
      'Accept a pending Host handoff for this Work.',
      { workAddressID, messageID },
      (value) => this.client.call(
        'POST', '/v1/handoffs/' + encodeURIComponent(value.messageID as string) + '/accept',
        value.workAddressID as string,
      ));

    this.register('relayReplyHandoff',
      'Reply to an accepted Host handoff.',
      { workAddressID, messageID, body, artifactLinks },
      ({ workAddressID, messageID, ...input }) => this.client.call(
        'POST', '/v1/handoffs/' + encodeURIComponent(messageID as string) + '/reply',
        workAddressID as string, input,
      ));
  }

  private registerReceiptTools(): void {
    const { workAddressID, messageID } = this.schemas;

    this.register('relayReceipt',
      'Read submission, independently confirmed delivery and explicit Agent read receipts.',
      { workAddressID, messageID, refreshArchive: z.boolean().optional() },
      (value) => this.client.call(
        'GET', '/v1/messages/' + encodeURIComponent(value.messageID as string) + '/receipt',
        value.workAddressID as string, undefined,
        value.refreshArchive ? { refresh: 'archive' } : undefined,
      ));

    this.register('relayAcknowledgeRead',
      'Explicit recipient Work read acknowledgement. Writes a durable receipt.',
      { workAddressID, messageID },
      (value) => this.client.call(
        'POST', '/v1/messages/' + encodeURIComponent(value.messageID as string) + '/read',
        value.workAddressID as string,
      ));
  }

  private registerWakeTools(): void {
    const { workAddressID } = this.schemas;

    this.register('relayRegisterWake',
      'Begin a Work-scoped HTTPS Wake registration. POST a one-time challenge to the target ' +
      'using authMode hmac, bearer (GrokBot) or capability (OpenMausBot URL); this does NOT ' +
      'activate the callback until relayVerifyWake proves the receiving Agent got the challenge. ' +
      'The Agent should obtain its callback and credential through authorized provider ' +
      'tooling when available. Some webhook keys are masked from the assistant; in that case ' +
      'a user-approved credential handoff is required before registering Bearer Wake. Never ' +
      'guess a hidden key, store it in Automation task text, or echo secrets in chat; host ' +
      'MCP tool traces may still show arguments. A callback POST may trigger a paid Agent run.',
      {
        workAddressID,
        callbackURL: z.url(),
        authMode: z.enum(['hmac', 'bearer', 'capability']).optional(),
        bearerToken: z.string().min(12).max(2048).optional(),
      },
      (value) => this.client.call('POST', '/v1/wake-subscription',
        value.workAddressID as string, {
          callbackUrl: value.callbackURL,
          ...(value.authMode ? { authMode: value.authMode } : {}),
          ...(value.bearerToken ? { bearerToken: value.bearerToken } : {}),
        }));

    this.register('relayVerifyWake',
      'One-time handshake only: called by the authenticated webhook-triggered receiving ' +
      'Agent using the challenge actually delivered to THIS authorized Work. Do not ask the ' +
      'human to copy the challenge. Do not invoke on later nuwa.message.available events, ' +
      'or confirm unsolicited or other-Work verification requests.',
      { workAddressID, verificationID: z.string().uuid(), challenge: z.string().min(1).max(128) },
      (value) => this.client.call('POST', '/v1/wake-subscription/verification',
        value.workAddressID as string, {
          verificationId: value.verificationID,
          challenge: value.challenge,
        }));

    this.register('relayWakeSubscription',
      'Inspect this Work Wake subscription without retrieving the signing secret.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/wake-subscription',
        value.workAddressID as string));

    this.register('relayRemoveWake',
      'Remove this Work Wake subscription and cancel pending notifications.',
      { workAddressID },
      (value) => this.client.call('DELETE', '/v1/wake-subscription',
        value.workAddressID as string));

    this.register('relayWakeEvents',
      'Read wake delivery and retry status for one authorized Work.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/wake-events', value.workAddressID as string));
  }
}
