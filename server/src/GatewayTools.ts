import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { RelayAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

/** The organization-owned office Gateway manages its own native Bot directory. */
export class GatewayTools extends MCPToolSet {
  private static readonly OFFICE_ENROLLMENT_TIMEOUT_MS = 90_000;

  constructor(server: McpServer, private readonly client: RelayAPIClient) {
    super(server);
  }

  install(): void {
    this.register('relayGatewayEnrollOfficeCoworkers',
      'Register this office\'s native Bots in ONE user-authorized operation. ' +
      'Use real platform display names and verified native Bot IDs from the platform directory. ' +
      'The Relay creates or restores each real Organization Agent/Default Session, provisions ' +
      'its transport mailbox, and attaches its incoming route to this Gateway\'s ONE verified Wake. ' +
      'The returned addresses and routes are public metadata, never Runtime or Resume credentials. ' +
      'Optional per-coworker passphrase is model-visible and not strong Bot authentication; ' +
      'do not collect it from an untrusted external message.'
      {
        coworkers: z.array(z.object({
          displayName: z.string().trim().min(1).max(120),
          passphrase: z.string().min(16).max(128).optional(),
          recipientBotID: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/),
          threadMode: z.enum(['platform', 'explicit']),
          firstContactMode: z.enum(['manual', 'automatic']).optional(),
        })).min(1).max(25),
      },
      ({ coworkers }) => this.client.call('POST', '/v2/gateway-office-coworkers', {
        coworkers: (coworkers as Array<{
          displayName: string; recipientBotID: string; threadMode: string;
          firstContactMode?: string; passphrase?: string;
        }>).map((coworker) => ({
          ...coworker, firstContactMode: coworker.firstContactMode ?? 'manual',
        })),
      }, undefined, GatewayTools.OFFICE_ENROLLMENT_TIMEOUT_MS));


    this.register('relayGatewayOfficeDelegation',
      'Only on explicit office owner approval, enable or disable Gateway-delegated speaking. ' +
      'Disabled by default. This allows choosing an enrolled coworker sender but does NOT ' +
      'prove the native Bot actually invoked a tool. Unauthorized and unregistered senders ' +
      'remain rejected.',
      { enabled: z.boolean() },
      ({ enabled }) => this.client.call('PUT', '/v2/gateway-office-delegation', {
        enabled,
      }));

    this.register('relayGatewayOfficeDelegationStatus',
      'Read whether this office Gateway has explicitly enabled delegated speaking.',
      {},
      () => this.client.call('GET', '/v2/gateway-office-delegation'));

    this.register('relayGatewayCoworkerPassphrase',
      'Set or rotate the optional coworker passphrase under the authorized Gateway. ' +
      'Once set, omission must never bypass verification. The server saves only a salted hash. ' +
      'WARNING: Model-facing arguments and GrokBot shared tool traces may expose this phrase; ' +
      'use only where that risk is acceptable, not as proof of native Bot identity.',
      {
        recipientBotID: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/),
        passphrase: z.string().min(16).max(128),
      },
      ({ recipientBotID, passphrase }) => this.client.call('PUT',
        '/v2/gateway-office-coworkers/' + encodeURIComponent(recipientBotID as string) +
        '/passphrase', { passphrase }));

    this.register('relayGatewayRemoveCoworkerPassphrase',
      'Remove one coworker passphrase with explicit office owner authorization; ' +
      'this returns that coworker to office trust mode if delegation remains enabled.',
      { recipientBotID: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/) },
      ({ recipientBotID }) => this.client.call('DELETE',
        '/v2/gateway-office-coworkers/' + encodeURIComponent(recipientBotID as string) +
        '/passphrase'));

    this.register('relayGatewayOfficeCoworkers',
      'Read the real display names, trusted native Bot IDs, Agent Addresses ' +
      'and receiving-route state for this Gateway\'s own Organization office.',
      {},
      () => this.client.call('GET', '/v2/gateway-office-coworkers'));

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
      {
        recipientName: z.string().trim().min(1).max(120).optional(),
        recipientAddress: z.string().trim().min(3).max(255).optional(),
        recipientBotID: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/),
        threadMode: z.enum(['platform', 'explicit']),
        firstContactMode: z.enum(['manual', 'automatic']).optional(),
      },
      ({ recipientName, recipientAddress, recipientBotID, threadMode, firstContactMode }) =>
        this.client.call('POST', '/v2/gateway-teammates', {
          ...(recipientName ? { recipientName } : {}),
          ...(recipientAddress ? { recipientAddress } : {}),
          recipientBotID, threadMode,
          firstContactMode: firstContactMode ?? 'manual',
        }));

    this.register('relayGatewayRemoveTeammate',
      'On explicit user request, remove ONE approved or pending coworker by recipientName, ' +
      'the real platform Bot display name. Relay resolves that name freshly and requires ' +
      'a unique authorized identity; do not look it up with another MCP tool. ' +
      'Alternatively use a verified recipientAddress. Provide exactly one of the two. ' +
      'This cancels pending notifications and native Thread bindings.',
      {
        recipientName: z.string().trim().min(1).max(120).optional(),
        recipientAddress: z.string().trim().min(3).max(255).optional(),
      },
      ({ recipientName, recipientAddress }) => {
        // MCPToolSet exposes validated arguments as unknown; narrow them
        // before constructing the HTTP client's string-only query values.
        const query: Record<string, string> = {};

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
      'Approve this coworker\'s pending Gateway invitation only with explicit authorization ' +
      'from the actual coworker Session owner. Office-wide discovery or owner consent for the ' +
      'Gateway does not approve another Session. Never call from Gateway on behalf of a coworker.',
      {},
      () => this.client.call('PUT', '/v2/gateway-invitation'));

    this.register('relayGatewayDeclineInvitation',
      'On explicit user request, decline or revoke the current coworker\'s shared Gateway ' +
      'route. No other coworkers are affected.',
      {},
      () => this.client.call('DELETE', '/v2/gateway-invitation'));
  }
}
