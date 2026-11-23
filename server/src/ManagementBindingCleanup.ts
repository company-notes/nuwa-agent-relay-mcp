import type { Env } from './Env';
import { AddressAPIClient, APIError } from './APIClients';

type AccountIdentity = {
  organization?: { id: string; slug: string } | null;
};

type OwnedAgent = {
  id: string;
};

type OwnedSession = {
  id: string;
  agentId: string;
  canonical: string;
};

/** Clears only the binding ciphertext belonging to an authenticated Organization-owned Agent. */
export class ManagementBindingCleanup {
  static readonly origin = 'https://agent-relay.company-notes.com';

  constructor(
    private readonly env: Env,
    private readonly address: AddressAPIClient,
  ) {}

  private static requireSessions(value: unknown, agentID: string, orgSlug: string): OwnedSession[] {
    if (!Array.isArray(value) || value.length === 0 ||
        value.length > 200 || value.some((session) =>
          !session || typeof session !== 'object' ||
          typeof session.id !== 'string' || typeof session.agentId !== 'string' ||
          typeof session.canonical !== 'string' || session.agentId !== agentID ||
          session.canonical.split('/')[0] !== orgSlug)) {
      throw new APIError(409, 'reset_sessions_changed',
        'The selected Agent has invalid or changed Sessions; reload management.');
    }

    return value as OwnedSession[];
  }

  async handle(request: Request, agentID: string): Promise<Response> {
    if (request.method !== 'DELETE') {
      throw new APIError(405, 'method_not_allowed', 'DELETE is required.');
    }

    if (request.headers.get('origin') !== ManagementBindingCleanup.origin) {
      throw new APIError(403, 'management_origin_invalid', 'Agent binding cleanup requires Relay management.');
    }

    if (!request.headers.get('content-type')?.includes('application/json')) {
      throw new APIError(415, 'json_required', 'A JSON confirmation is required.');
    }

    const data: unknown = await request.json();
    const body = data as { confirmAgentID?: unknown; sessionIDs?: unknown } | null;

    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        body.confirmAgentID !== agentID || !Array.isArray(body.sessionIDs) ||
        body.sessionIDs.length === 0 || body.sessionIDs.length > 200 ||
        body.sessionIDs.some((id) => typeof id !== 'string')) {
      throw new APIError(400, 'invalid_reset_confirmation', 'Exact Agent and Session confirmation is required.');
    }

    const status = await this.address.status() as AccountIdentity;
    const organization = status.organization;

    if (!organization?.id || !organization.slug) {
      throw new APIError(403, 'organization_required', 'An authorized Organization is required.');
    }

    const agents = await this.address.listAgents() as OwnedAgent[];
    const agent = Array.isArray(agents) && agents.find((item) => item.id === agentID);

    if (!agent) {
      throw new APIError(404, 'agent_not_owned', 'The selected Agent is not owned by this account.');
    }

    const sessions = ManagementBindingCleanup.requireSessions(
      await this.address.listSessions(agentID), agentID, organization.slug,
    );
    const actual = sessions.map((session) => session.id).sort();
    const expected = [...body.sessionIDs].sort();

    if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
      throw new APIError(409, 'reset_sessions_changed', 'Agent Sessions changed since the preview.');
    }

    const slots = actual.map(() => '?').join(', ');
    const parameters = [organization.id, ...actual];

    const fixed = await this.env.BINDINGS_DB.prepare(
      'DELETE FROM remote_session_bindings WHERE organization_id = ? AND session_id IN (' + slots + ')',
    ).bind(...parameters).run();
    const native = await this.env.BINDINGS_DB.prepare(
      'DELETE FROM remote_work_session_bindings WHERE organization_id = ? AND session_id IN (' + slots + ')',
    ).bind(...parameters).run();
    const workAgent = await this.env.BINDINGS_DB.prepare(
      'DELETE FROM remote_work_agents WHERE organization_id = ? AND agent_id = ?',
    ).bind(organization.id, agentID).run();

    return Response.json({
      ok: true,
      data: {
        agentID,
        cleared: {
          fixedBindings: fixed.meta.changes,
          workSessions: native.meta.changes,
          workAgentRegistrations: workAgent.meta.changes,
        },
      },
    }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }
}
