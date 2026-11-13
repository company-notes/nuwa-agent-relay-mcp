import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { RelayAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

/** Gateways may invite; only the recipient's separate Runtime may approve. */
export class GatewayTools extends MCPToolSet {
  constructor(server: McpServer, private readonly client: RelayAPIClient) {
    super(server);
  }

  install(): void {
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
      ({ recipientName, recipientAddress }) => this.client.call(
        'DELETE', '/v2/gateway-teammates', undefined, {
          ...(recipientName ? { recipient_name: recipientName } : {}),
          ...(recipientAddress ? { recipient_address: recipientAddress } : {}),
        }));

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
