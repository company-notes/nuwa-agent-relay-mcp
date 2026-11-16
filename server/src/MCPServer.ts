import { McpServer } from '@modelcontextprotocol/server';

import type { Env } from './Env';
import { AddressAPIClient, RelayAPIClient } from './APIClients';
import { AddressTools } from './AddressTools';
import { GatewayTools } from './GatewayTools';
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
        'leases. After OAuth login immediately call agentAddressEnsureIdentity; the server ' +
        'privately claims or restores this OAuth grant\'s own Agent and Default Session. ' +
        'Pass an optional established persona name as agentDisplayName, but never ask the ' +
        'user for Session IDs, Runtime tokens, Resume tokens, or manual binding during ' +
        'normal installation. Relay tools also auto-ensure the Session if needed. ' +
        'Never include OAuth, Runtime, Resume or Wake secrets in MCP tools or prompts. ' +
        'Optional office coworker passphrases are model-visible in tool inputs and cannot ' +
        'serve as native platform Bot attestation. ' +
        'Sending a message, confirmed mailbox arrival, successful Wake delivery and actual ' +
        'Agent startup are separate steps.',
    });

    const bindings = new SessionBindings(this.env);
    new AddressTools(server, new AddressAPIClient(this.env, this.authorization),
      (persona) => bindings.ensure(this.authorization, persona)).install();
    const relay = new RelayAPIClient(this.env, this.authorization,
      () => bindings.authorize(this.authorization));

    new RelayTools(server, relay).install();
    new GatewayTools(server, relay).install();

    return server;
  }
}
