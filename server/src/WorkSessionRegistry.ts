import { APIError, type AddressAPIClient } from './APIClients';
import type { Env } from './Env';
import type { RuntimeTokenCipher } from './RuntimeTokenCipher';
import type { ClaimResponse } from './SessionBindings';

export type WorkStart = {
  sessionName?: string;
  sessionDisplayName?: string;
  agentDisplayName?: string;
};

type Organization = { id: string; slug: string };
type WorkAgent = { organizationID: string; agentID: string; mailboxReady: number };

// Only work initialization touches the Agent anchor. Every normal Relay tool
// reads the selected Session binding directly.
export class WorkSessionRegistry {
  constructor(
    private readonly env: Env,
    private readonly address: AddressAPIClient,
    private readonly cipher: RuntimeTokenCipher,
  ) {}

  private find(grant: string): Promise<WorkAgent | null> {
    return this.env.BINDINGS_DB.prepare(
      `SELECT organization_id AS organizationID, agent_id AS agentID, mailbox_ready AS mailboxReady
         FROM remote_work_agents WHERE grant_fingerprint = ?`,
    ).bind(grant).first<WorkAgent>();
  }

  private static validate(agent: WorkAgent, organization: Organization): WorkAgent {
    if (agent.organizationID !== organization.id || !agent.agentID) {
      throw new APIError(403, 'binding_organization_changed', 'The work Agent is no longer authorized.');
    }

    return agent;
  }

  async ensureAgent(grant: string, organization: Organization, displayName: string): Promise<WorkAgent> {
    const existing = await this.find(grant);

    if (existing) {
      return WorkSessionRegistry.validate(existing, organization);
    }

    const fixed = await this.env.BINDINGS_DB.prepare(
      `SELECT session_id AS sessionID, organization_id AS organizationID
         FROM remote_session_bindings WHERE grant_fingerprint = ?`,
    ).bind(grant).first<{ sessionID: string; organizationID: string }>();
    let agentID: string;

    if (fixed) {
      if (fixed.organizationID !== organization.id) {
        throw new APIError(403, 'binding_organization_changed', 'The existing Agent is no longer authorized.');
      }

      const session = await this.address.getSession(fixed.sessionID) as ClaimResponse['session'];

      if (session.id !== fixed.sessionID || !session.agentId ||
          session.canonical.split('/')[0] !== organization.slug) {
        throw new APIError(409, 'binding_identity_mismatch', 'The original Agent could not be verified.');
      }

      agentID = session.agentId;
    } else {
      const claim = await this.cipher.initialClaim('work-agent:' + grant, organization.id);
      const root = await this.address.claimAgent({
        agentDisplayName: displayName, sessionName: 'main', runtimeLabel: 'nuwa-relay-work-agent', claim,
      }) as ClaimResponse;

      if (root.session?.id !== claim.sessionID || !root.session.agentId ||
          root.resumeToken !== claim.resumeToken ||
          root.session.canonical.split('/')[0] !== organization.slug) {
        throw new APIError(502, 'invalid_claim_result', 'Agent Address returned an inconsistent work Agent.');
      }

      agentID = root.session.agentId;
    }

    await this.env.BINDINGS_DB.prepare(
      `INSERT OR IGNORE INTO remote_work_agents
         (grant_fingerprint, organization_id, agent_id, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(grant, organization.id, agentID, new Date().toISOString()).run();
    const saved = await this.find(grant);

    if (!saved || saved.agentID !== agentID) {
      throw new APIError(409, 'work_agent_conflict', 'A different Agent was selected concurrently.');
    }

    return WorkSessionRegistry.validate(saved, organization);
  }

  async markMailboxReady(grant: string, agent: WorkAgent): Promise<void> {
    const updated = await this.env.BINDINGS_DB.prepare(
      `UPDATE remote_work_agents SET mailbox_ready = 1
        WHERE grant_fingerprint = ? AND organization_id = ? AND agent_id = ?`,
    ).bind(grant, agent.organizationID, agent.agentID).run();

    if (updated.meta.changes !== 1) {
      throw new APIError(409, 'work_agent_conflict', 'The work Agent changed during mailbox setup.');
    }
  }
}
