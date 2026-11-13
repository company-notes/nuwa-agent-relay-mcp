import { AddressAPIClient, APIError } from './APIClients';

type AgentRecord = {
  handle: string;
  displayName: string | null;
  defaultSessionHandle: string | null;
};

type OrganizationStatus = {
  organization: { slug: string } | null;
};

type ResolvedSession = {
  canonical: string;
};

/**
 * Resolve a familiar coworker name using only the caller's authorized
 * Organization directory. A native platform Bot name is not an address;
 * only an unambiguous registered identity can become a Relay destination.
 */
export class ColleagueDirectory {
  constructor(private readonly client: AddressAPIClient) {}

  private static normalize(name: string): string {
    return name.trim().normalize('NFKC').toLowerCase();
  }

  private static candidate(row: AgentRecord, name: string): boolean {
    return ColleagueDirectory.normalize(row.displayName ?? '') === name ||
      ColleagueDirectory.normalize(row.handle) === name;
  }

  async find(name: string) {
    const directory = await this.client.listAgents();

    if (!Array.isArray(directory) || directory.some((entry) =>
      !entry || typeof entry !== 'object' || typeof entry.handle !== 'string')) {
      throw new APIError(502, 'invalid_agent_directory',
        'The authorized Agent directory returned invalid data.');
    }

    const requested = ColleagueDirectory.normalize(name);
    const matches = (directory as AgentRecord[]).filter((agent) =>
      ColleagueDirectory.candidate(agent, requested));

    if (matches.length === 0) {
      return {
        status: 'not_found',
        name,
        message: 'No registered coworker has this name in the authorized Organization. ' +
          'Check that the actual platform Bot has joined Nuwa; do not guess its address.',
      };
    }

    if (matches.length !== 1) {
      return {
        status: 'ambiguous',
        name,
        matches: matches.map((agent) => ({
          displayName: agent.displayName,
          handle: agent.handle,
        })),
        message: 'Several registered coworkers share this name. ' +
          'Ask which coworker the user means before sending.',
      };
    }

    const [agent] = matches;

    if (!agent.defaultSessionHandle) {
      return {
        status: 'not_ready',
        name,
        message: 'This coworker has no available default conversation. ' +
          'Finish its Nuwa setup before sending.',
      };
    }

    const account = await this.client.status() as OrganizationStatus;
    const organization = account.organization?.slug;

    if (!organization) {
      throw new APIError(409, 'organization_required',
        'Sign in to an authorized Organization before finding coworkers.');
    }

    const session = await this.client.resolve(
      organization + '/' + agent.handle,
    ) as ResolvedSession;

    return {
      status: 'found',
      name,
      canonicalAddress: session.canonical,
      displayName: agent.displayName ?? agent.handle,
      message: 'The recipient is registered. Use the resolved canonical address ' +
        'internally when sending; the user does not need to type it.',
    };
  }
}
