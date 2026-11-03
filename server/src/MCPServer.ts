import { McpServer } from '@modelcontextprotocol/server';

import type { Env } from './Env';
import { AddressAPIClient, RelayAPIClient } from './APIClients';
import { AddressTools, RelayTools } from './Tools';

export class NuwaMCPServer {
  constructor(
    private readonly env: Env,
    private readonly authorization: string,
  ) {}

  createServer(): McpServer {
    const server = new McpServer({
      name: 'nuwa-agent-relay',
      version: '0.2.0',
    }, {
      instructions: 'Agent Address is the OAuth identity provider. ' +
        'Call agentAddressGetStatus and agentAddressClaimWork to obtain an owned immutable ' +
        'workAddressID before using Relay tools. The remote MCP forwards the same OAuth ' +
        'Bearer identity to Agent Address and Nuwa Relay; it never asks for a MailTrigger ' +
        'API Token. Listing Inbox is not a MailTrigger delivery receipt and does not ' +
        'mark a message read. When transferring files, provide explicit HTTPS artifact ' +
        'links; Relay only transports references.',
    });

    new AddressTools(server, new AddressAPIClient(this.env, this.authorization)).install();
    new RelayTools(server, new RelayAPIClient(this.env, this.authorization)).install();

    return server;
  }
}
