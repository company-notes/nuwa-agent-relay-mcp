import { AddressAPIClient, APIError } from './APIClients';
import type { Env } from './Env';
import { Logger } from './Logger';
import { RuntimeTokenCipher } from './RuntimeTokenCipher';

type BindingRow = {
  sessionID: string;
  organizationID: string;
  canonicalAddress: string;
  encryptedRuntimeToken: string;
  encryptedResumeToken: string;
  expiresAt: string;
};

type AccountStatus = {
  organization: { id: string; slug: string } | null;
};

type GrantIdentity = { grantFingerprint: string };

type Session = {
  id: string;
  canonical: string;
};

type ResumeResponse = {
  session: Session;
  runtimeToken: string;
  leaseExpiresAt: string;
};

type ClaimResponse = ResumeResponse & { resumeToken: string };
type Lease = { expiresAt: string };

export type BoundSession = { sessionID: string; runtimeToken: string };

export class SessionBindings {
  private static readonly logger = Logger.forModule('session.binding');
  private static readonly SESSION_ID =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  private static readonly GRANT = /^[a-f0-9]{64}$/;
  private readonly tokenCipher: RuntimeTokenCipher;

  constructor(
    private readonly env: Env,
    private readonly requester: typeof fetch =
      (input, init) => env.ADDRESS_WORKER.fetch(input, init),
  ) {
    this.tokenCipher = new RuntimeTokenCipher(env.SESSION_BINDING_KEY);
  }

  private address(authorization: string): AddressAPIClient {
    return new AddressAPIClient(this.env, authorization, this.requester);
  }

  private async principal(client: AddressAPIClient): Promise<string> {
    // Agent Address validates the OAuth token, then derives this fingerprint
    // from its provider-authenticated, refresh-stable grant ID and Account ID.
    // Never use an account email, opaque access token or caller-supplied key.
    const grant = await client.grant() as GrantIdentity;

    if (!grant || !SessionBindings.GRANT.test(grant.grantFingerprint)) {
      throw new APIError(502, 'invalid_grant_identity',
        'Agent Address did not return an authoritative OAuth grant identity.');
    }

    return grant.grantFingerprint;
  }

  private async row(key: string): Promise<BindingRow | null> {
    return this.env.BINDINGS_DB.prepare(
      `SELECT session_id AS sessionID, organization_id AS organizationID,
              canonical_address AS canonicalAddress,
              encrypted_runtime_token AS encryptedRuntimeToken,
              encrypted_resume_token AS encryptedResumeToken,
              expires_at AS expiresAt
         FROM remote_session_bindings WHERE grant_fingerprint = ?`,
    ).bind(key).first<BindingRow>();
  }

  private static checkLease(
    lease: ResumeResponse, sessionID: string, organizationSlug: string,
  ): void {
    if (lease.session?.id !== sessionID ||
        lease.session.canonical.split('/')[0] !== organizationSlug ||
        !lease.runtimeToken ||
        !Number.isFinite(Date.parse(lease.leaseExpiresAt)) ||
        Date.parse(lease.leaseExpiresAt) <= Date.now()) {
      throw new APIError(502, 'invalid_resume_result',
        'Agent Address returned an inconsistent Runtime lease.');
    }
  }

  private static publicResult(row: BindingRow, created: boolean) {
    return {
      bound: true,
      created,
      sessionID: row.sessionID,
      canonical: row.canonicalAddress,
      expiresAt: row.expiresAt,
    };
  }

  private async renew(
    client: AddressAPIClient, key: string, row: BindingRow,
    organizationSlug: string,
  ): Promise<BindingRow> {
    const token = await this.tokenCipher.decrypt(
      row.encryptedRuntimeToken, key, row.sessionID,
    );

    if (row.expiresAt > new Date().toISOString()) {
      // A failed heartbeat is not permission to take over another Runtime.
      const lease = await client.heartbeat(row.sessionID, token) as Lease;

      if (!lease?.expiresAt || !Number.isFinite(Date.parse(lease.expiresAt)) ||
          Date.parse(lease.expiresAt) <= Date.now()) {
        throw new APIError(502, 'invalid_lease_renewal',
          'Agent Address did not renew the Session Runtime lease.');
      }

      const result = await this.env.BINDINGS_DB.prepare(
        `UPDATE remote_session_bindings SET expires_at = ?
          WHERE grant_fingerprint = ? AND session_id = ?
            AND encrypted_runtime_token = ?`,
      ).bind(lease.expiresAt, key, row.sessionID, row.encryptedRuntimeToken).run();

      if (result.meta.changes !== 1) {
        throw new APIError(409, 'session_binding_revoked',
          'The Session binding changed during Runtime renewal.');
      }

      return { ...row, expiresAt: lease.expiresAt };
    }

    // An expired lease may be safely resumed only with this grant's
    // previously encrypted, privately retained Resume capability.
    const resumeToken = await this.tokenCipher.decrypt(
      row.encryptedResumeToken, 'resume:' + key, row.sessionID,
    );
    const resumed = await client.request('POST',
      '/v2/account/sessions/' + encodeURIComponent(row.sessionID) + '/resume',
      { body: { resumeToken, runtimeLabel: 'nuwa-relay-remote-mcp' } },
    ) as ResumeResponse;

    try {
      SessionBindings.checkLease(resumed, row.sessionID, organizationSlug);

      const encrypted = await this.tokenCipher.encrypt(
        resumed.runtimeToken, key, row.sessionID,
      );
      const updated = await this.env.BINDINGS_DB.prepare(
        `UPDATE remote_session_bindings
            SET encrypted_runtime_token = ?, expires_at = ?
          WHERE grant_fingerprint = ? AND session_id = ?
            AND encrypted_runtime_token = ?`,
      ).bind(encrypted, resumed.leaseExpiresAt, key, row.sessionID,
        row.encryptedRuntimeToken).run();

      if (updated.meta.changes !== 1) {
        throw new APIError(409, 'session_binding_changed',
          'The Session binding changed while acquiring a new Runtime.');
      }

      return { ...row, encryptedRuntimeToken: encrypted, expiresAt: resumed.leaseExpiresAt };
    } catch (error) {
      if (resumed.runtimeToken) {
        try {
          await client.release(row.sessionID, resumed.runtimeToken);
        } catch (releaseError) {
          SessionBindings.logger.exception('resume_compensation_failed', releaseError);
        }
      }

      throw error;
    }
  }

  async status(authorization: string): Promise<Record<string, unknown>> {
    const client = this.address(authorization);
    const key = await this.principal(client);
    const row = await this.row(key);

    return row
      ? { ...SessionBindings.publicResult(row, false), leaseExpired:
        row.expiresAt <= new Date().toISOString() }
      : { bound: false };
  }

  async ensure(
    authorization: string, agentDisplayName?: string,
  ): Promise<Record<string, unknown>> {
    const client = this.address(authorization);
    const key = await this.principal(client);
    await this.tokenCipher.requireKey();

    let status = await client.status() as AccountStatus;

    const existing = await this.row(key);

    if (existing) {
      if (!status.organization || existing.organizationID !== status.organization.id) {
        throw new APIError(403, 'binding_organization_changed',
          'The bound Session Organization is no longer authorized.');
      }

      return SessionBindings.publicResult(
        await this.renew(client, key, existing, status.organization.slug), false,
      );
    }

    if (!status.organization) {
      // Each independently authorized OAuth grant claims its own Agent.
      // Organization auto-registration is a first-use detail, not a user prompt.
      await client.registerOrganization({
        slug: 'personal-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
        displayName: 'Personal Workspace',
      });
      status = await client.status() as AccountStatus;
    }

    if (!status.organization?.id || !status.organization.slug) {
      throw new APIError(403, 'organization_required',
        'Agent Address did not authorize an Organization.');
    }

    const created = await client.claimAgent(
      agentDisplayName ? { agentDisplayName } : {},
    ) as ClaimResponse;

    try {
      if (!created.session?.id || !SessionBindings.SESSION_ID.test(created.session.id) ||
          !created.resumeToken?.startsWith('resume_')) {
        throw new APIError(502, 'invalid_claim_result',
          'Agent Address returned incomplete private Session credentials.');
      }

      SessionBindings.checkLease(created, created.session.id, status.organization.slug);

      if (!created.resumeToken) {
        throw new APIError(502, 'invalid_claim_result',
          'Agent Address returned incomplete private Session credentials.');
      }

      const encryptedRuntime = await this.tokenCipher.encrypt(
        created.runtimeToken, key, created.session.id,
      );
      const encryptedResume = await this.tokenCipher.encrypt(
        created.resumeToken, 'resume:' + key, created.session.id,
      );
      const inserted = await this.env.BINDINGS_DB.prepare(
        `INSERT OR IGNORE INTO remote_session_bindings
          (grant_fingerprint, organization_id, session_id, canonical_address,
           encrypted_runtime_token, encrypted_resume_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(key, status.organization.id, created.session.id,
        created.session.canonical, encryptedRuntime, encryptedResume,
        created.leaseExpiresAt, new Date().toISOString()).run();

      if (inserted.meta.changes !== 1) {
        throw new APIError(409, 'session_provisioning_race',
          'A Session was created by another request. Retry without changing identity.');
      }

      return {
        bound: true, created: true, sessionID: created.session.id,
        canonical: created.session.canonical, expiresAt: created.leaseExpiresAt,
      };
    } catch (error) {
      if (created.runtimeToken && created.session?.id) {
        try {
          await client.release(created.session.id, created.runtimeToken);
        } catch (releaseError) {
          SessionBindings.logger.exception('failed_claim_lease_release', releaseError);
        }
      }

      throw error;
    }
  }

  async resume(
    authorization: string, sessionID: string, resumeToken: string,
  ): Promise<Record<string, unknown>> {
    // An explicit user-requested identity change uses a trusted private channel.
    // Normal Skill-first onboarding never needs a Session ID or Resume token.
    if (!SessionBindings.SESSION_ID.test(sessionID) ||
        !resumeToken.startsWith('resume_') || resumeToken.length > 256) {
      throw new APIError(400, 'invalid_session_binding',
        'Session ID and Resume capability are required.');
    }

    const client = this.address(authorization);
    const key = await this.principal(client);
    const existing = await this.row(key);

    if (existing && existing.expiresAt > new Date().toISOString()) {
      throw new APIError(409, 'session_already_bound',
        'Release the bound Runtime before selecting another Session.');
    }

    await this.tokenCipher.requireKey();
    const status = await client.status() as AccountStatus;

    if (!status.organization?.id || !status.organization.slug) {
      throw new APIError(403, 'organization_required',
        'An authorized Organization is required to bind a Session.');
    }

    const resumed = await client.request('POST',
      '/v2/account/sessions/' + encodeURIComponent(sessionID) + '/resume',
      { body: { resumeToken, runtimeLabel: 'nuwa-relay-remote-mcp' } },
    ) as ResumeResponse;

    try {
      SessionBindings.checkLease(resumed, sessionID, status.organization.slug);

      const runtime = await this.tokenCipher.encrypt(resumed.runtimeToken, key, sessionID);
      const resume = await this.tokenCipher.encrypt(resumeToken, 'resume:' + key, sessionID);
      const written = await this.env.BINDINGS_DB.prepare(
        `INSERT INTO remote_session_bindings
          (grant_fingerprint, organization_id, session_id, canonical_address,
           encrypted_runtime_token, encrypted_resume_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(grant_fingerprint) DO UPDATE SET
           organization_id = excluded.organization_id,
           session_id = excluded.session_id,
           canonical_address = excluded.canonical_address,
           encrypted_runtime_token = excluded.encrypted_runtime_token,
           encrypted_resume_token = excluded.encrypted_resume_token,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at
         WHERE remote_session_bindings.expires_at <= excluded.created_at`,
      ).bind(key, status.organization.id, sessionID, resumed.session.canonical,
        runtime, resume, resumed.leaseExpiresAt, new Date().toISOString()).run();

      if (written.meta.changes !== 1) {
        throw new APIError(409, 'session_already_bound',
          'An active Session binding was created concurrently.');
      }
    } catch (error) {
      if (resumed.runtimeToken) {
        try {
          await client.release(sessionID, resumed.runtimeToken);
        } catch (releaseError) {
          SessionBindings.logger.exception('failed_binding_lease_release', releaseError);
        }
      }

      throw error;
    }

    return {
      bound: true, created: false, sessionID,
      canonical: resumed.session.canonical, expiresAt: resumed.leaseExpiresAt,
    };
  }

  async authorize(authorization: string): Promise<BoundSession> {
    await this.ensure(authorization);
    const client = this.address(authorization);
    const key = await this.principal(client);
    const row = await this.row(key);

    if (!row || row.expiresAt <= new Date().toISOString()) {
      throw new APIError(403, 'session_binding_required',
        'This OAuth grant has no authorized Session Runtime.');
    }

    return {
      sessionID: row.sessionID,
      runtimeToken: await this.tokenCipher.decrypt(
        row.encryptedRuntimeToken, key, row.sessionID,
      ),
    };
  }

  async revoke(authorization: string): Promise<{ revoked: boolean }> {
    const client = this.address(authorization);
    const key = await this.principal(client);
    const row = await this.row(key);

    if (!row) {
      return { revoked: false };
    }

    const runtimeToken = await this.tokenCipher.decrypt(
      row.encryptedRuntimeToken, key, row.sessionID,
    );

    if (row.expiresAt > new Date().toISOString()) {
      try {
        await client.release(row.sessionID, runtimeToken);
      } catch (error) {
        if (!(error instanceof APIError) || error.status !== 409 ||
            error.code !== 'runtime_not_owner') {
          throw error;
        }

        SessionBindings.logger.error('stale_lease_binding_revoked', { status: error.status });
      }
    }

    const deleted = await this.env.BINDINGS_DB.prepare(
      `DELETE FROM remote_session_bindings
        WHERE grant_fingerprint = ? AND encrypted_runtime_token = ?`,
    ).bind(key, row.encryptedRuntimeToken).run();

    return { revoked: deleted.meta.changes === 1 };
  }
}
