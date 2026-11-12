import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { AddressAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

export class AddressTools extends MCPToolSet {
  constructor(server: McpServer, private readonly client: AddressAPIClient) {
    super(server);
  }

  install(): void {
    const agentID = z.string().uuid();

    this.register('agentAddressGetStatus',
      'Read the signed-in Account and Organization. This does not authorize any Session Runtime.',
      {},
      () => this.client.status());

    this.register('agentAddressListAgents',
      'Discover Agents in the authenticated Organization. Each Agent can contain many Sessions.',
      {},
      () => this.client.listAgents());

    this.register('agentAddressListSessions',
      'List available Sessions for one known Agent. A Session address identifies a conversation.',
      { agentID },
      (value) => this.client.listSessions(value.agentID as string));

    this.register('agentAddressResolve',
      'Resolve an Organization/Agent/Session address or an Agent shorthand to its Default Session.',
      { address: z.string().min(1).max(255) },
      (value) => this.client.resolve(value.address as string));
  }
}
