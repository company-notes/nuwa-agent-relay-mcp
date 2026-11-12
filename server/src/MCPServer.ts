import { McpServer } from '@modelcontextprotocol/server';

import type { Env } from './Env';
import { AddressAPIClient, RelayAPIClient } from './APIClients';
import { AddressTools } from './AddressTools';
import { RelayTools } from './RelayTools';
import { SessionBindings } from './SessionBindings';

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
      instructions: 'Nuwa connects Organization/Agent/Session identities through asynchronous ' +
        'messages and work Handoffs. Agent Address owns Session identity and exclusive Runtime ' +
        'leases. To use Relay from this Remote MCP, first bind the desired Session through the ' +
        'user-approved private POST /session-bindings endpoint with that MCP OAuth grant and ' +
        'the Session Resume capability. Never include Runtime or Resume tokens in MCP tools, ' +
        'chat, prompts, or traces. Relay tools automatically use the bound Session. ' +
        'Sending a message, confirmed mailbox arrival, successful Wake delivery and actual ' +
        'Agent startup are separate steps.',
    });

    new AddressTools(server, new AddressAPIClient(this.env, this.authorization)).install();
    const bindings = new SessionBindings(this.env);
    const relay = new RelayAPIClient(this.env, this.authorization,
      () => bindings.authorize(this.authorization));

    new RelayTools(server, relay).install();

    return server;
  }
}
