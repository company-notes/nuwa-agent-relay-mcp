import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { AddressAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';

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
