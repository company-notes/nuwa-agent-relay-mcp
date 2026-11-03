import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { AddressAPIClient, RelayAPIClient } from './APIClients';

type ToolArguments = Record<string, unknown>;
type ToolSchema = Record<string, z.ZodType>;

export abstract class MCPToolSet {
  protected constructor(protected readonly server: McpServer) {}

  protected register(
    name: string,
    description: string,
    inputSchema: ToolSchema,
    action: (argumentsValue: ToolArguments) => Promise<unknown>,
  ): void {
    this.server.registerTool(name, { description, inputSchema }, async (parameters) => {
      try {
        const value = await action(parameters);
        return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Unknown service failure.';

        return { isError: true, content: [{ type: 'text' as const, text }] };
      }
    });
  }
}

export class AddressTools extends MCPToolSet {
  constructor(server: McpServer, private readonly client: AddressAPIClient) {
    super(server);
  }

  install(): void {
    const workAddressID = z.string().min(1).max(128);
    const handle = z.string().min(1).max(128);
    const optionalText = z.string().max(128).optional();

    this.register('agentAddressGetStatus',
      'Show signed-in account, Organization, Hosts and optionally a Work identity.',
      { workAddressID: workAddressID.optional() },
      (value) => this.client.status(value.workAddressID as string | undefined));

    this.register('agentAddressClaimWork',
      'Claim a Work identity; creation of a new Host or Organization is a permanent side effect.',
      {
        organization: optionalText,
        organizationDisplayName: optionalText,
        host: optionalText,
        handle: optionalText,
        displayName: optionalText,
      },
      (value) => this.client.claimWork(value));

    this.register('agentAddressRenameWork',
      'Rename an owned Work identity.',
      { workAddressID, handle },
      (value) => this.client.renameWork(value.workAddressID as string, value.handle as string));

    this.register('agentAddressReleaseWork',
      'Revoke an owned Work identity. Destructive operation.',
      { workAddressID },
      (value) => this.client.releaseWork(value.workAddressID as string));

    this.register('agentAddressResolve',
      'Resolve an Agent Address under the signed-in Organization.',
      { address: z.string().min(1).max(255) },
      (value) => this.client.resolve(value.address as string));
  }
}

export class RelayTools extends MCPToolSet {
  constructor(server: McpServer, private readonly client: RelayAPIClient) {
    super(server);
  }

  install(): void {
    const workAddressID = z.string().min(1).max(128);
    const messageID = z.string().min(1).max(128);
    const threadID = z.string().min(1).max(128);
    const body = z.string().min(1).max(100000);
    const to = z.string().min(1).max(255);
    const subject = z.string().min(1).max(255);
    const artifactLinks = z.array(z.url()).max(20).optional();

    this.register('relayProvisionHostMailbox',
      'Create or reuse a managed MailTrigger Host mailbox.',
      { workAddressID },
      (value) => this.client.call('POST', '/v1/hosts/provision', value.workAddressID as string));

    this.register('relayInbox',
      'List D1 messages for the specified Work; not proof of MailTrigger arrival.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/inbox', value.workAddressID as string));

    this.register('relayHostInbox',
      'List unassigned Host handoffs without accepting them.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/host-inbox', value.workAddressID as string));

    this.register('relaySendMessage',
      'Send a message to a Work address. External MailTrigger send side effect.',
      { workAddressID, to, body, subject: subject.optional(), artifactLinks },
      ({ workAddressID, ...input }) => this.client.call(
        'POST', '/v1/messages', workAddressID as string, input,
      ));

    this.register('relaySendHandoff',
      'Send a Host-level handoff. External MailTrigger send side effect.',
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

    this.register('relayThreadHistory',
      'Read the conversation history for a participating Work.',
      { workAddressID, threadID },
      (value) => this.client.call(
        'GET', '/v1/threads/' + encodeURIComponent(value.threadID as string),
        value.workAddressID as string,
      ));

    this.register('relayReplyThread',
      'Reply to a Thread as the specified Work.',
      { workAddressID, threadID, body, artifactLinks },
      ({ workAddressID, threadID, ...input }) => this.client.call(
        'POST', '/v1/threads/' + encodeURIComponent(threadID as string) + '/messages',
        workAddressID as string, input,
      ));

    this.register('relayMessage',
      'Read an authorized individual message without marking it read.',
      { workAddressID, messageID },
      (value) => this.client.call(
        'GET', '/v1/messages/' + encodeURIComponent(value.messageID as string),
        value.workAddressID as string,
      ));

    this.register('relayReceipt',
      'Read submission, independently confirmed MailTrigger arrival and explicit Agent read receipts.',
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

    this.register('relayWakeEvents',
      'Read wake delivery and retry status for one authorized Work.',
      { workAddressID },
      (value) => this.client.call('GET', '/v1/wake-events', value.workAddressID as string));
  }
}
