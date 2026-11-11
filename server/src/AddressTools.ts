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
      'Show signed-in account, Organization and Hosts; optionally validate a known Work ID. ' +
      'This does not list Work recipients. Use agentAddressListWorks for discovery.',
      { workAddressID: workAddressID.optional() },
      (value) => this.client.status(value.workAddressID as string | undefined));

    this.register('agentAddressClaimWork',
      'Create a Work under the user-selected Host (which may also create a Host or Organization). ' +
      'A Work is a message recipient; a Host alone is not. Confirm identity and placement first.',
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

    this.register('agentAddressListWorks',
      'List active Work recipients visible within the authenticated Organization. ' +
      'Returns canonical Work addresses, display names and parent Host references, not Hosts. ' +
      'Use when the recipient is not known; supports bounded pagination and search.',
      {
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().min(1).max(255).optional(),
        search: z.string().min(1).max(64).optional(),
      },
      (value) => this.client.listWorks({
        limit: value.limit as number | undefined,
        cursor: value.cursor as string | undefined,
        search: value.search as string | undefined,
      }));

    this.register('agentAddressResolve',
      'Resolve an exact, already-known Agent Address. It is not a directory or search. ' +
      'Use kind=work results for ordinary messages; kind=host is not a Work recipient.',
      { address: z.string().min(1).max(255) },
      (value) => this.client.resolve(value.address as string));
  }
}
