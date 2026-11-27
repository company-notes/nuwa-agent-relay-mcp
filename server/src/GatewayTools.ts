import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { RelayAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

/** The organization-owned office Gateway manages its own native Bot directory. */
export class GatewayTools extends MCPToolSet {
  private static readonly OFFICE_ENROLLMENT_TIMEOUT_MS = 90_000;
  private static readonly recipient = {
    recipientName: z.string().trim().min(1).max(120).optional(),
    recipientAddress: z.string().trim().min(3).max(255).optional(),
  };
  private static readonly route = {
    recipientBotID: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/),
    threadMode: z.enum(['platform', 'explicit']),
    firstContactMode: z.enum(['manual', 'automatic']).optional(),
  };
  private static readonly coworkers = z.array(z.object({
    displayName: z.string().trim().min(1).max(120),
    ...GatewayTools.route,
    rejoinRemoved: z.boolean().optional(),
  })).min(1).max(25);
  private static readonly firstContact = {
    recipientSessionID: z.string().uuid(),
    senderSessionID: z.string().uuid(),
    messageID: z.string().uuid(),
    nativeThreadID: z.string().trim().min(1).max(512),
  };

  constructor(server: McpServer, private readonly client: RelayAPIClient) {
    super(server);
  }

  install(): void {
    this.register('relayGatewayEnrollOfficeCoworkers',
      'Incrementally synchronize this office\'s native Bots in ONE user-authorized operation. ' +
      'Use real platform display names and verified native Bot IDs from the platform directory. ' +
      'The Relay creates or restores each real Organization Agent/Default Session, provisions ' +
      'its transport mailbox, and attaches new shared members to this Gateway\'s ONE verified Wake. ' +
      'The same Bot ID preserves identity when renamed; independently connected members keep their mode. ' +
      'Enroll all eligible individual Bots from the authorized office, excluding the Gateway, groups and channels. ' +
      'Omitted members are unchanged; removed members stay excluded during normal synchronization. ' +
      'Set rejoinRemoved:true for one exact Bot only when the owner explicitly requests restoration. ' +
      'The returned addresses and routes are public metadata, never Runtime or Resume credentials. ' +
      'Already-enrolled coworkers use from when sending through the shared office connection.',
      { coworkers: GatewayTools.coworkers },
      ({ coworkers }) => this.client.call('POST', '/v2/gateway-office-coworkers', {
        coworkers: (coworkers as Array<{
          displayName: string; recipientBotID: string; threadMode: string;
          firstContactMode?: string; rejoinRemoved?: boolean;
        }>).map((coworker) => ({
          ...coworker, firstContactMode: coworker.firstContactMode ?? 'manual',
        })),
      }, undefined, GatewayTools.OFFICE_ENROLLMENT_TIMEOUT_MS));

    this.register('relayGatewayOfficeCoworkers',
      'Read the real display names, trusted native Bot IDs, Agent Addresses ' +
      'and receiving-route state (gateway, direct, inbox or inactive) for this Gateway\'s office. ' +
      'removed:true means the owner removed that membership; normal synchronization leaves it excluded.',
      {},
      () => this.client.call('GET', '/v2/gateway-office-coworkers'));

    this.register('relayGatewayConfirmFirstContact',
      'Complete a reserved explicit first contact (recipientPlatformThreadID is null) immediately after ' +
      'one successful native dispatch, before ending the Routine. Use the original event sender, ' +
      'recipient and message IDs and the provider-returned native Thread ID; ' +
      'never substitute a Relay Thread ID or fabricate a receipt. The authorized Gateway remains subject ' +
      'to Relay\'s one-time message, roster and Session checks.',
      GatewayTools.firstContact,
      ({ recipientSessionID, senderSessionID, messageID, nativeThreadID }) =>
        this.client.call('PUT',
          '/v2/gateway-teammates/' + encodeURIComponent(recipientSessionID as string) +
          '/first-contacts/' + encodeURIComponent(senderSessionID as string), {
            messageID: messageID as string,
            nativeThreadID: nativeThreadID as string,
          }));

    this.register('relayGatewayTeammates',
      'List this Gateway Session\'s proposed and approved coworkers, including pending approvals. ' +
      'Use after office-wide discovery to report who is actually active; do not equate discovery ' +
      'or an invitation with a working receiving route. Does not reveal credentials.',
      {},
      () => this.client.call('GET', '/v2/gateway-teammates'));

    this.register('relayGatewayInviteTeammate',
      'On user-authorized office-wide setup, propose ONE real platform coworker per call. ' +
      'Prefer recipientName (the local native Bot display name) plus verified recipientBotID. ' +
      'Relay resolves that name to a registered Agent/Session; never call an extra MCP directory ' +
      'tool or ask Gateway to invent a canonical address. Alternatively provide recipientAddress. ' +
      'Supply exactly ONE of recipientName or recipientAddress. Approval is pending until the ' +
      'recipient authorizes with its OWN Session; do not assume name discovery grants consent.',
      { ...GatewayTools.recipient, ...GatewayTools.route },
      ({ recipientName, recipientAddress, recipientBotID, threadMode, firstContactMode }) =>
        this.client.call('POST', '/v2/gateway-teammates', {
          ...(recipientName ? { recipientName } : {}),
          ...(recipientAddress ? { recipientAddress } : {}),
          recipientBotID, threadMode,
          firstContactMode: firstContactMode ?? 'manual',
        }));

    this.register('relayGatewayRemoveTeammate',
      'On explicit user request, remove ONE approved or pending coworker. ' +
      'Prefer its trusted recipientBotID; alternatively supply its verified recipientAddress ' +
      'or unique recipientName. Supply exactly one selector. ' +
      'Only that shared membership, pending notifications and its native route are revoked; ' +
      'the Agent identity, mailbox, messages and Relay Threads remain. ' +
      'Removal persists across later office synchronization until the owner explicitly restores the coworker.',
      { ...GatewayTools.recipient, recipientBotID: GatewayTools.route.recipientBotID.optional() },
      ({ recipientName, recipientAddress, recipientBotID }) => {
        const query: Record<string, string> = {};

        if (typeof recipientBotID === 'string') {
          query.recipient_bot_id = recipientBotID;
        }

        if (typeof recipientName === 'string') {
          query.recipient_name = recipientName;
        }

        if (typeof recipientAddress === 'string') {
          query.recipient_address = recipientAddress;
        }

        return this.client.call('DELETE', '/v2/gateway-teammates', undefined, query);
      });

    this.register('relayGatewayInvitation',
      'Check whether this coworker Session has a pending or active office Gateway invitation. ' +
      'This is never approval on behalf of another Agent.',
      {},
      () => this.client.call('GET', '/v2/gateway-invitation'));

    this.register('relayGatewayApproveInvitation',
      'Approve this coworker\'s pending Gateway invitation with the actual recipient Session. ' +
      'For an explicit switch to the shared office connection, set shareConnection:true. ' +
      'This authorizes shared office speaking and replaces the independent Wake with the verified Gateway. ' +
      'The original address, Session, mailbox and Relay Threads are preserved. ' +
      'An approval without shareConnection authorizes only the receiving route.',
      { shareConnection: z.boolean().optional() },
      ({ shareConnection }) => this.client.call('PUT', '/v2/gateway-invitation',
        shareConnection === true ? { shareConnection: true } : undefined));

    this.register('relayGatewayDeclineInvitation',
      'On explicit user request, decline a pending invitation or leave this coworker\'s shared Gateway. ' +
      'Leaving preserves the original native identity, mailbox and Relay Threads, removes shared speaking ' +
      'permission and switches receiving to the independent Inbox. Configure a direct Wake if needed. ' +
      'The chosen independent mode survives later office synchronization.',
      {},
      () => this.client.call('DELETE', '/v2/gateway-invitation'));
  }
}
