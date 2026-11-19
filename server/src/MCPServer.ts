import { McpServer } from '@modelcontextprotocol/server';

import type { BackgroundTasks, Env } from './Env';
import { AddressAPIClient, RelayAPIClient, type BoundSession } from './APIClients';
import { AddressTools } from './AddressTools';
import { GatewayTools } from './GatewayTools';
import { RelayTools } from './RelayTools';
import { SessionBindings } from './SessionBindings';
import type { WorkContext } from './WorkContext';

export class NuwaMCPServer {
  constructor(
    private readonly env: Env,
    private readonly authorization: string,
    private readonly address: AddressAPIClient,
    private readonly tasks: BackgroundTasks,
    private readonly work?: WorkContext,
  ) {}

  createServer(): McpServer {
    const server = new McpServer({
      name: 'nuwa-agent-relay',
      version: '0.2.0',
    }, {
      instructions: this.work
        ? 'Nuwa gives each native work Session its own canonical address under the established Agent. ' +
          'Before beginning any new user work, even without messaging, call agentAddressStartWork with a meaningful kebab-case ' +
          'sessionName and sessionDisplayName, based on the user task. On native resume call it without names. ' +
          'Report the returned address immediately as Active or Resumed work address. On an address question ' +
          'use agentAddressGetStatus. On explicit reauthorization recovery use agentAddressSelectSession ' +
          'with the original full address. Use the full canonical address to reach a particular work Session. ' +
          'After initialization, sendToAgent and relayReplyThread directly without from. Use relayInbox ' +
          'for this work Session. A managed Agent mailbox is shared; native Wake requires a supported adapter. ' +
          'Runtime and Resume credentials remain private. '
        : 'Nuwa connects Organization/Agent/Session identities through asynchronous ' +
          'messages and work Handoffs. Agent Address owns Session identity and exclusive Runtime ' +
          'leases. For first installation call agentAddressEnsureIdentity; the server ' +
          'privately claims or restores this OAuth grant\'s own Agent and Default Session. ' +
          'Supply your own established persona or native Bot name as agentDisplayName at setup; ' +
          'for an unnamed independent client use its actual client name (e.g. ChatGPT or Codex). ' +
          'Repair an unnamed existing binding once; preserve established names unless the owner requests a rename. ' +
          'Never ask the user for Session IDs, Runtime tokens, Resume tokens, or manual binding during ' +
          'normal installation. Relay tools also auto-ensure the Session if needed. ' +
          'Never include OAuth, Runtime, Resume or Wake secrets in MCP tools or prompts. ' +
          'On user request, agentAddressSelectSession restores an idle existing address ' +
          'without re-enrolling. Never create a replacement office identity to fix a failure. ' +
          'Independent MCP clients use their own Session without a Gateway or from; on request ' +
          'check relayInbox if no direct receiving adapter exists. Configure Wake only when supported. ' +
          'Roster synchronization preserves independent connection choices and stable native IDs. ' +
          'An existing coworker switches connection on the same Session by explicit owner-authorized ' +
          'invitation approval or leave; see Skill for the management flow. ' +
          'Use one sendToAgent or relayReplyThread call with your own enrolled from on a shared ' +
          'office connection. Prefer known native Bot IDs (UUID or bot:<native ID>), with full ' +
          'registered names, Nuwa addresses and verified Email aliases also accepted. ' +
          'For message recipients, use the supplied short name directly; the server accepts unique short names, ' +
          'prefers an exact registered name and rejects ambiguity. Shared from uses the registered identity. ' +
          'Use forwarded message content directly; only fetch history if needed. ' +
          'Call directly when the schema is available, following required platform tool discovery. ' +
          'Forward the original Thread ID and recipientBotID as the coworker\'s own from ' +
          'in a ready-to-use relayReplyThread call format (omit from for independent connections). ' +
          'For office Wake, use recipientBotID and the installed platform procedure. ' +
          'GrokBot platform-managed routing (recipientPlatformThreadID absent) uses its native tool once, ' +
          'with zero MCP lookups, then stops. For a restricted Routine, choose a trusted WakeParent raw-event ' +
          'handoff at setup; the parent dispatches once. For an established explicit route (nonempty native Thread ID), ' +
          'dispatch once to that exact ID with zero MCP calls, then stop. For a reserved explicit first contact ' +
          '(recipientPlatformThreadID is null), create once using the native tool, then immediately call ' +
          'relayGatewayConfirmFirstContact with the actual native receipt and finish after successful confirmation. ' +
          'Give the Wake pairing link to the human to open and complete in their own browser. ' +
          'Keep routine instructions self-contained without per-event Skill reads. ' +
          'Sending a message, confirmed mailbox arrival, successful Wake delivery and actual ' +
          'Agent startup are separate steps.',
    });

    const bindings = new SessionBindings(this.env, this.address, this.work);
    const relay = new RelayAPIClient(this.env, this.authorization,
      () => bindings.authorize(), this.tasks);
    const prepareMailbox = (session: BoundSession) =>
      new RelayAPIClient(this.env, this.authorization, async () => session, this.tasks)
        .call('PUT', '/v2/agent-mailboxes');

    new AddressTools(server, this.address,
      (persona) => bindings.ensure(persona),
      (address) => bindings.selectSession(address, this.work ? prepareMailbox : undefined),
      () => bindings.getStatus(), this.work,
      this.work ? (input) => bindings.startWork(input, prepareMailbox) : undefined,
      this.work ? () => bindings.releaseWork() : undefined).install();

    new RelayTools(server, relay, this.work).install();

    if (!this.work) {
      new GatewayTools(server, relay).install();
    }

    return server;
  }
}
