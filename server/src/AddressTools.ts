import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { AddressAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

export class AddressTools extends MCPToolSet {
  constructor(
    server: McpServer,
    private readonly client: AddressAPIClient,
    private readonly ensureIdentity: (persona?: string) => Promise<Record<string, unknown>>,
  ) {
    super(server);
  }

  install(): void {
    const agentID = z.string().uuid();

    this.register('agentAddressEnsureIdentity',
      'Immediately use after OAuth login. Privately claim or recover this OAuth grant\'s ' +
      'OWN Agent/Session. If agentDisplayName is provided on an existing binding, update only ' +
      'this Grant\'s own registered display name to the real native Bot name for Relay routing. ' +
      'Never pass another coworker\'s name from a Gateway or ask for Runtime/Resume credentials.',
      { agentDisplayName: z.string().trim().min(1).max(120).optional() },
      (value) => this.ensureIdentity(value.agentDisplayName as string | undefined));

    this.register('agentAddressGetStatus',
      'Read the signed-in Account and Organization. This does not authorize any Session Runtime.',
      {},
      () => this.client.status());

    this.register('agentAddressListAgents',
      'List registered Agents in the authorized Organization. During office-wide Gateway ' +
      'setup, this helps discover candidates, but does not identify their provider, local Bot ID, ' +
      'Wake subscription or permission to route. Do not enroll every Organization Agent blindly.',
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
