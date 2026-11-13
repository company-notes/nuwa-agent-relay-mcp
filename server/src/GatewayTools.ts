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
      'List this Gateway Session\'s proposed and approved coworkers. ' +
      'Only call from the dedicated Gateway Agent; this does not reveal private credentials.',
      {},
      () => this.client.call('GET', '/v2/gateway-teammates'));

    this.register('relayGatewayInviteTeammate',
      'On explicit user request, propose adding an existing coworker to this office Gateway. ' +
      'The Gateway must already have a verified Wake subscription and know the real platform Bot ID. ' +
      'This only creates a pending invitation; the coworker must approve using its own Session. ' +
      'Never invent a recipient address or Bot ID, or claim that an invitation means automatic delivery.',
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
      'Only after the human owner explicitly authorizes it, approve this coworker\'s ' +
      'pending shared office Gateway invitation. The current Session owns this approval. ' +
      'Do not call from the Gateway Session to approve a different coworker.',
      {},
      () => this.client.call('PUT', '/v2/gateway-invitation'));

    this.register('relayGatewayDeclineInvitation',
      'On explicit user request, decline or revoke the current coworker\'s shared Gateway ' +
      'route. No other coworkers are affected.',
      {},
      () => this.client.call('DELETE', '/v2/gateway-invitation'));
  }
}
