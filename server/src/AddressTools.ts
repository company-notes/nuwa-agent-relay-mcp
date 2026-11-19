import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { AddressAPIClient } from './APIClients';
import { MCPToolSet } from './ToolSet';
import type { WorkContext } from './WorkContext';
import type { WorkStart } from './WorkSessionRegistry';

export class AddressTools extends MCPToolSet {
  private static readonly schemas = {
    agentID: z.string().uuid(),
    agentDisplayName: z.string().trim().min(1).max(120).optional().describe(
      'Your own established persona or native Bot name; for an unnamed independent client use its actual client name (e.g. ChatGPT or Codex).',
    ),
    selectedAddress: z.string().trim().min(1).max(255),
    address: z.string().min(1).max(255),
  };

  constructor(
    server: McpServer,
    private readonly client: AddressAPIClient,
    private readonly ensureIdentity: (persona?: string) => Promise<Record<string, unknown>>,
    private readonly selectSession: (address: string) => Promise<Record<string, unknown>>,
    private readonly getStatus: () => Promise<Record<string, unknown>>,
    work?: WorkContext,
    private readonly startWork?: (input: WorkStart) => Promise<Record<string, unknown>>,
  ) {
    super(server, work);
  }

  install(): void {
    const { agentID, agentDisplayName, address } = AddressTools.schemas;

    if (this.startWork) {
      const startWork = this.startWork;

      this.register('agentAddressStartWork',
        'At the beginning of a native work Session, choose a meaningful kebab-case sessionName ' +
        'and human-readable sessionDisplayName. On native resume call with no arguments. ' +
        'Report the returned canonical address to the user immediately. Reuse the same work identity.',
        {
          sessionName: z.string().trim().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
          sessionDisplayName: z.string().trim().min(1).max(120).optional(),
          agentDisplayName,
        },
        (input) => startWork(input as WorkStart));
    } else {
      this.registerFixedIdentity();
    }

    this.register('agentAddressGetStatus',
      'Read the signed-in Account, Organization and current Session canonical address without changing its identity.',
      {},
      () => this.getStatus());

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
      { address },
      (value) => this.client.resolve(value.address as string));
  }

  private registerFixedIdentity(): void {
    const { agentDisplayName, selectedAddress } = AddressTools.schemas;

    this.register('agentAddressEnsureIdentity',
      'Immediately use after OAuth login. Privately claim or recover this OAuth grant\'s ' +
      'OWN Agent/Session. At setup provide your own established persona or native Bot name; ' +
      'for an unnamed independent client use its actual client name (e.g. ChatGPT or Codex). ' +
      'Use agentDisplayName once to repair your own unnamed existing binding without replacing it. ' +
      'Preserve an existing persona unless its owner explicitly requests a rename. ' +
      'Never pass another coworker\'s name from a Gateway or ask for Runtime/Resume credentials.',
      { agentDisplayName },
      (value) => this.ensureIdentity(value.agentDisplayName as string | undefined));

    this.register('agentAddressSelectSession',
      'When the authorized user explicitly asks to restore a known Agent/Session address, ' +
      'select it in the same Organization if no Runtime currently occupies it. ' +
      'Preserves the old Agent, Session, mailbox, Gateway roster and Wake. ' +
      'Never request private Resume or Runtime credentials in chat.',
      { address: selectedAddress },
      (value) => this.selectSession(value.address as string));
  }
}
