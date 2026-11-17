import { McpServer } from '@modelcontextprotocol/server';

import type { BackgroundTasks, Env } from './Env';
import { AddressAPIClient, RelayAPIClient } from './APIClients';
import { AddressTools } from './AddressTools';
import { GatewayTools } from './GatewayTools';
import { RelayTools } from './RelayTools';
import { SessionBindings } from './SessionBindings';

export class NuwaMCPServer {
  constructor(
    private readonly env: Env,
    private readonly authorization: string,
    private readonly address: AddressAPIClient,
    private readonly tasks: BackgroundTasks,
  ) {}

  createServer(): McpServer {
    const server = new McpServer({
      name: 'nuwa-agent-relay',
      version: '0.2.0',
    }, {
      instructions: 'Nuwa connects Organization/Agent/Session identities through asynchronous ' +
        'messages and work Handoffs. Agent Address owns Session identity and exclusive Runtime ' +
        'leases. For first installation call agentAddressEnsureIdentity; the server ' +
        'privately claims or restores this OAuth grant\'s own Agent and Default Session. ' +
        'Pass an optional established persona name as agentDisplayName, but never ask the ' +
        'user for Session IDs, Runtime tokens, Resume tokens, or manual binding during ' +
        'normal installation. Relay tools also auto-ensure the Session if needed. ' +
        'Never include OAuth, Runtime, Resume or Wake secrets in MCP tools or prompts. ' +
        'On user request, agentAddressSelectSession restores an idle existing address ' +
        'without re-enrolling. Never create a replacement office identity to fix a failure. ' +
        'Use one sendToAgent or relayReplyThread call with your own enrolled from on a shared ' +
        'office connection. Prefer known native Bot IDs (UUID or bot:<native ID>), with full ' +
        'registered names, Nuwa addresses and verified Email aliases also accepted. ' +
        'Use forwarded message content directly; only fetch history if needed. ' +
        'Call directly when the schema is available, following required platform tool discovery. ' +
        'Forward the original Thread ID and recipientBotID as the coworker\'s own from ' +
        'in a ready-to-use relayReplyThread call format (omit from for independent connections). ' +
        'For ordinary office Wake, dispatch once to recipientBotID using the native tool, ' +
        'with zero MCP lookups or extra routing decisions, then stop. ' +
        'Sending a message, confirmed mailbox arrival, successful Wake delivery and actual ' +
        'Agent startup are separate steps.',
    });

    const bindings = new SessionBindings(this.env, this.address);
    new AddressTools(server, this.address,
      (persona) => bindings.ensure(persona),
      (address) => bindings.selectSession(address)).install();
    const relay = new RelayAPIClient(this.env, this.authorization,
      () => bindings.authorize(), this.tasks);

    new RelayTools(server, relay).install();
    new GatewayTools(server, relay).install();

    return server;
  }
}
