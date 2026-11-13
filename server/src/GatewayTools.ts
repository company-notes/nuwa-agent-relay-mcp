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
      'On user-authorized office-wide setup, propose each real, verified local coworker without ' +
      'asking the user to type a manual roster; this tool invites ONE coworker per call. ' +
      'Match the recipient canonical address to an authoritative platform-native Bot ID. ' +
      'A verified Gateway Wake is required. The invitation remains pending until the coworker ' +
      'approves from its OWN Session. Never assume directory membership grants consent, invent IDs, ' +
      'or claim automatic delivery before the actual recipient Bot runs.',
      {
        recipientAddress: z.string().min(3).max(255),
        recipientBotID: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/),
        threadMode: z.enum(['platform', 'explicit']),
        firstContactMode: z.enum(['manual', 'automatic']).optional(),
      },
      ({ recipientAddress, recipientBotID, threadMode, firstContactMode }) =>
        this.client.call('POST', '/v2/gateway-teammates', {
          recipientAddress, recipientBotID, threadMode,
          firstContactMode: firstContactMode ?? 'manual',
        }));

    this.register('relayGatewayRemoveTeammate',
      'On explicit user request, revoke an approved or pending office Gateway coworker by ' +
      'their real public canonical address. This cancels pending notifications and native Thread bindings.',
      { recipientAddress: z.string().min(3).max(255) },
      ({ recipientAddress }) => this.client.call('DELETE', '/v2/gateway-teammates',
        undefined, { recipient_address: recipientAddress as string }));

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
