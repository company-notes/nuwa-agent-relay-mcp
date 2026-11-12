import { McpServer } from '@modelcontextprotocol/server';

import type { Env } from './Env';
import { AddressAPIClient, RelayAPIClient } from './APIClients';
import { AddressTools } from './AddressTools';
import { RelayTools } from './RelayTools';

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
      instructions: 'Nuwa connects Organization/Agent/Session identities with asynchronous ' +
        'messages and work handoffs. Discover identity with agentAddressListAgents, ' +
        'agentAddressListSessions and agentAddressResolve. A Session Runtime must be claimed ' +
        'or resumed with the separate Agent Address V2 identity service. Every Relay operation ' +
        'requires that Session ID and its valid Runtime capability. Do not paste the runtimeToken ' +
        'into chat, persistent prompts, logs, or untrusted tools; MCP tool arguments may be ' +
        'visible in client traces. A provider that cannot protect the capability must not ' +
        'perform privileged Relay actions until secure delegated runtime authentication is available. ' +
        'An HTTP submission is not proof of MailTrigger arrival or Agent execution.',
    });

    new AddressTools(server, new AddressAPIClient(this.env, this.authorization)).install();
    new RelayTools(server, new RelayAPIClient(this.env, this.authorization)).install();

    return server;
  }
}
