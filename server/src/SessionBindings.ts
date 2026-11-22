import { AddressAPIClient, APIError, type BoundSession } from './APIClients';
import type { Env } from './Env';
import { Logger } from './Logger';
import { RuntimeTokenCipher } from './RuntimeTokenCipher';
import type { WorkContext } from './WorkContext';
import { WorkSessionRegistry, type WorkAgent, type WorkStart } from './WorkSessionRegistry';

type BindingRow = {
  sessionID: string;
  organizationID: string;
  canonicalAddress: string;
  encryptedRuntimeToken: string;
  encryptedResumeToken: string;
  expiresAt: string;
};

type PrepareMailbox = (session: BoundSession) => Promise<unknown>;

type AccountStatus = {
  organization: { id: string; slug: string } | null;
};

type GrantIdentity = { grantFingerprint: string };

type Session = {
  id: string;
  canonical: string;
  agentId?: string;
};

type ResumeResponse = {
  session: Session;
  runtimeToken: string;
  leaseExpiresAt: string;
  renewed?: true;
};

export type ClaimResponse = ResumeResponse & { resumeToken: string };
type Lease = {
  expiresAt: string;
  organization: { id: string; slug: string };
  session: Session;
};

export class SessionBindings {
  private static readonly logger = Logger.forModule('session.binding');
  private static readonly SESSION_ID =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  private static readonly GRANT = /^[a-f0-9]{64}$/;
  private static readonly LEASE_REFRESH_MARGIN_MS = 30_000;
  private static readonly RUNTIME_LABEL = 'nuwa-relay-remote-mcp';
  private readonly tokenCipher: RuntimeTokenCipher;

  constructor(
    private readonly env: Env,
    private readonly address: AddressAPIClient,
    private readonly work?: WorkContext,
  ) {
    this.tokenCipher = new RuntimeTokenCipher(env.SESSION_BINDING_KEY);
  }

  private get table(): string {
    return this.work ? 'remote_work_session_bindings' : 'remote_session_bindings';
  }

  private get keyColumn(): string {
    return this.work ? 'binding_key' : 'grant_fingerprint';
  }

  private async grant(client: AddressAPIClient): Promise<string> {
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

  private async principal(client: AddressAPIClient): Promise<string> {
    const grant = await this.grant(client);

    return this.work ? this.work.key(grant) : grant;
  }

  private async row(key: string): Promise<BindingRow | null> {
    return this.env.BINDINGS_DB.prepare(
      `SELECT session_id AS sessionID, organization_id AS organizationID,
              canonical_address AS canonicalAddress,
              encrypted_runtime_token AS encryptedRuntimeToken,
              encrypted_resume_token AS encryptedResumeToken,
              expires_at AS expiresAt
         FROM ${this.table} WHERE ${this.keyColumn} = ?`,
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

  private async persist(
    key: string, organization: { id: string; slug: string }, claim: ClaimResponse,
    transferWork = false,
  ): Promise<BindingRow> {
    if (!claim.session?.id || !SessionBindings.SESSION_ID.test(claim.session.id) ||
        !claim.resumeToken?.startsWith('resume_')) {
      throw new APIError(502, 'invalid_claim_result',
        'Agent Address returned incomplete private Session credentials.');
    }

    SessionBindings.checkLease(claim, claim.session.id, organization.slug);

    const encryptedRuntime = await this.tokenCipher.encrypt(
      claim.runtimeToken, key, claim.session.id,
    );
    const encryptedResume = await this.tokenCipher.encrypt(
      claim.resumeToken, 'resume:' + key, claim.session.id,
    );
    const transfer = transferWork
      ? ` ON CONFLICT(session_id) DO UPDATE SET
          binding_key = excluded.binding_key, organization_id = excluded.organization_id,
          canonical_address = excluded.canonical_address,
          encrypted_runtime_token = excluded.encrypted_runtime_token,
          encrypted_resume_token = excluded.encrypted_resume_token,
          expires_at = excluded.expires_at, created_at = excluded.created_at`
      : '';
    const inserted = await this.env.BINDINGS_DB.prepare(
      `INSERT ${transferWork ? '' : 'OR IGNORE '}INTO ${this.table}
        (${this.keyColumn}, organization_id, session_id, canonical_address,
         encrypted_runtime_token, encrypted_resume_token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)${transfer}`,
    ).bind(key, organization.id, claim.session.id,
      claim.session.canonical, encryptedRuntime, encryptedResume,
      claim.leaseExpiresAt, new Date().toISOString()).run();

    if (inserted.meta.changes !== 1) {
      if (this.work) {
        const winner = await this.row(key);

        if (winner?.sessionID === claim.session.id && winner.organizationID === organization.id &&
            await this.tokenCipher.decrypt(winner.encryptedRuntimeToken, key, winner.sessionID) === claim.runtimeToken &&
            await this.tokenCipher.decrypt(winner.encryptedResumeToken, 'resume:' + key, winner.sessionID) === claim.resumeToken) {
          return winner;
        }
      }

      throw new APIError(409, 'session_provisioning_race',
        'A Session was bound by another request. Retry without changing identity.');
    }

    return {
      sessionID: claim.session.id,
      organizationID: organization.id,
      canonicalAddress: claim.session.canonical,
      encryptedRuntimeToken: encryptedRuntime,
      encryptedResumeToken: encryptedResume,
      expiresAt: claim.leaseExpiresAt,
    };
  }

  private async releaseBinding(
    client: AddressAPIClient, key: string, row: BindingRow,
  ): Promise<boolean> {
    const runtimeToken = await this.tokenCipher.decrypt(
      row.encryptedRuntimeToken, key, row.sessionID,
    );

    try {
      await client.release(row.sessionID, runtimeToken);
    } catch (error) {
      if (!SessionBindings.isLostLease(error) && !(error instanceof APIError &&
          error.status === 404 && error.code === 'session_not_found')) {
        throw error;
      }

      SessionBindings.logger.exception('stale_lease_binding_revoked', error);
    }

    const deleted = await this.env.BINDINGS_DB.prepare(
      `DELETE FROM ${this.table}
        WHERE ${this.keyColumn} = ? AND encrypted_runtime_token = ?`,
    ).bind(key, row.encryptedRuntimeToken).run();

    return deleted.meta.changes === 1;
  }

  private static isLostLease(error: unknown): boolean {
    return error instanceof APIError && error.status === 409 &&
      error.code === 'runtime_not_owner';
  }

  private async heartbeatIfOwned(
    client: AddressAPIClient, key: string, row: BindingRow,
  ): Promise<Lease | null> {
    const token = await this.tokenCipher.decrypt(
      row.encryptedRuntimeToken, key, row.sessionID,
    );

    try {
      return await client.heartbeat(row.sessionID, token) as Lease;
    } catch (error) {
      if (!SessionBindings.isLostLease(error)) {
        throw error;
      }

      return null;
    }
  }

  private async saveExpiry(
    key: string, row: BindingRow, expiresAt: string, canonicalAddress?: string,
  ): Promise<void> {
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) ||
        Date.parse(expiresAt) <= Date.now()) {
      throw new APIError(502, 'invalid_lease_renewal',
        'Agent Address did not renew the Session Runtime lease.');
    }

    const result = await this.env.BINDINGS_DB.prepare(
      `UPDATE ${this.table} SET expires_at = MAX(expires_at, ?),
          canonical_address = CASE WHEN ? >= expires_at THEN COALESCE(NULLIF(?, ''), canonical_address)
                              ELSE canonical_address END
        WHERE ${this.keyColumn} = ? AND session_id = ?
          AND encrypted_runtime_token = ?`,
    ).bind(expiresAt, expiresAt, canonicalAddress ?? '', key, row.sessionID,
      row.encryptedRuntimeToken).run();

    if (result.meta.changes !== 1) {
      throw new APIError(409, 'session_binding_revoked',
        'The Session binding changed during Runtime renewal.');
    }
  }

  private async recordRelayRenewal(
    key: string, row: BindingRow, expiresAt: string, canonicalAddress?: string,
  ): Promise<void> {
    try {
      await this.saveExpiry(key, row, expiresAt, canonicalAddress);
    } catch (error) {
      // Relay has already completed the operation. Do not turn an accepted
      // message into a retryable failure merely because expiry bookkeeping failed.
      SessionBindings.logger.exception('relay_lease_sync_failed', error);
    }
  }

  private async persistRecoveredRuntime(
    client: AddressAPIClient, key: string, row: BindingRow,
    organizationSlug: string, resumed: ResumeResponse,
  ): Promise<BindingRow> {
    try {
      SessionBindings.checkLease(resumed, row.sessionID, organizationSlug);

      const encrypted = await this.tokenCipher.encrypt(
        resumed.runtimeToken, key, row.sessionID,
      );
      const updated = await this.env.BINDINGS_DB.prepare(
        `UPDATE ${this.table}
            SET encrypted_runtime_token = ?, expires_at = ?, canonical_address = ?
          WHERE ${this.keyColumn} = ? AND session_id = ?
            AND encrypted_runtime_token = ?`,
      ).bind(encrypted, resumed.leaseExpiresAt, resumed.session.canonical, key, row.sessionID,
        row.encryptedRuntimeToken).run();

      if (updated.meta.changes !== 1) {
        throw new APIError(409, 'session_binding_changed',
          'The Session binding changed while acquiring a new Runtime.');
      }

      return {
        ...row, encryptedRuntimeToken: encrypted, expiresAt: resumed.leaseExpiresAt,
        canonicalAddress: resumed.session.canonical,
      };
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

  private async recoverExpired(
    client: AddressAPIClient, key: string, row: BindingRow,
    organizationSlug: string,
  ): Promise<BindingRow> {
    // Local expiry is only a hint. Address atomically renews the same owner
    // or resumes an idle Session using the retained private capability.
    const [runtimeToken, resumeToken] = await Promise.all([
      this.tokenCipher.decrypt(row.encryptedRuntimeToken, key, row.sessionID),
      this.tokenCipher.decrypt(row.encryptedResumeToken, 'resume:' + key, row.sessionID),
    ]);
    const resumed = await client.resumeRuntime(
      row.sessionID, resumeToken, SessionBindings.RUNTIME_LABEL, runtimeToken,
    ) as ResumeResponse;

    if (resumed.renewed) {
      SessionBindings.checkLease(resumed, row.sessionID, organizationSlug);

      if (resumed.runtimeToken !== runtimeToken) {
        throw new APIError(502, 'invalid_resume_result', 'Agent Address changed a renewed Runtime.');
      }

      await this.saveExpiry(key, row, resumed.leaseExpiresAt, resumed.session.canonical);

      return { ...row, expiresAt: resumed.leaseExpiresAt, canonicalAddress: resumed.session.canonical };
    }

    return this.persistRecoveredRuntime(client, key, row, organizationSlug, resumed);
  }

  private async renew(
    client: AddressAPIClient, key: string, row: BindingRow,
    organizationSlug: string,
  ): Promise<BindingRow> {
    if (Date.parse(row.expiresAt) > Date.now()) {
      const lease = await this.heartbeatIfOwned(client, key, row);

      if (!lease) {
        throw new APIError(409, 'runtime_not_owner', 'This Runtime no longer owns the Session.');
      }

      if (lease.organization?.id !== row.organizationID || lease.session?.id !== row.sessionID ||
          lease.session.canonical.split('/')[0] !== lease.organization.slug) {
        throw new APIError(409, 'binding_identity_mismatch',
          'The renewed Runtime no longer matches the authorized identity.');
      }

      await this.saveExpiry(key, row, lease.expiresAt, lease.session.canonical);

      return { ...row, expiresAt: lease.expiresAt, canonicalAddress: lease.session.canonical };
    }

    return this.recoverExpired(client, key, row, organizationSlug);
  }

  async status(accountStatus?: AccountStatus): Promise<Record<string, unknown>> {
    const client = this.address;
    const key = await this.principal(client);
    const row = await this.row(key);

    if (!row) {
      return { bound: false };
    }

    const status = accountStatus ?? (await client.status() as AccountStatus);

    if (status.organization?.id !== row.organizationID) {
      throw new APIError(403, 'binding_organization_changed', 'The bound Organization is no longer authorized.');
    }

    const current = await client.getSession(row.sessionID) as Session;

    if (current.id !== row.sessionID || current.canonical.split('/')[0] !== status.organization.slug) {
      throw new APIError(409, 'binding_identity_mismatch', 'The Session no longer matches this binding.');
    }

    return {
      ...SessionBindings.publicResult({ ...row, canonicalAddress: current.canonical }, false),
      leaseExpired: row.expiresAt <= new Date().toISOString(),
    };
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const account = await this.address.status() as AccountStatus;
    const session = await this.status(account);

    return { ...account, session: session.bound ? session : null };
  }

  private async updateOwnDisplayName(
    client: AddressAPIClient, row: BindingRow, displayName: string,
  ): Promise<void> {
    const own = await client.getSession(row.sessionID) as {
      id?: string; agentId?: string; canonical?: string;
      agentDisplayName?: string | null;
    };

    if (!own || own.id !== row.sessionID || !own.agentId) {
      throw new APIError(409, 'binding_identity_mismatch',
        'The authorized Agent/Session no longer matches this private binding.');
    }

    // The same OAuth grant can be used by several native coworkers. Only an
    // unnamed bound Agent may be named here; a named Gateway is not a coworker.
    if (own.agentDisplayName?.trim()) {
      if (own.agentDisplayName !== displayName) {
        throw new APIError(409, 'identity_name_preserved',
          'This OAuth connector already owns a named Agent. Do not rename it as a coworker. ' +
          'Use the coworker native Bot ID as from; explicit owner renames belong in Agent Address management.');
      }

      return;
    }

    const updated = await client.setAgentDisplayName(own.agentId, displayName) as {
      id?: string; displayName?: string;
    };

    if (!updated || updated.id !== own.agentId || updated.displayName !== displayName) {
      throw new APIError(502, 'agent_display_name_update_invalid',
        'Agent Address did not confirm the requested display name.');
    }
  }

  private async ensureBound(
    agentDisplayName?: string, renewRuntime = true,
    start?: WorkStart & { prepareMailbox: PrepareMailbox },
  ): Promise<{ key: string; row: BindingRow; created: boolean }> {
    const client = this.address;
    const key = await this.principal(client);
    await this.tokenCipher.requireKey();

    let status = await client.status() as AccountStatus;

    const existing = await this.row(key);

    if (existing) {
      if (!status.organization || existing.organizationID !== status.organization.id) {
        throw new APIError(403, 'binding_organization_changed',
          'The bound Session Organization is no longer authorized.');
      }

      const needsRenewal = renewRuntime || Date.parse(existing.expiresAt) <=
        Date.now() + SessionBindings.LEASE_REFRESH_MARGIN_MS;
      const renewed = needsRenewal
        ? await this.renew(client, key, existing, status.organization.slug)
        : existing;

      if (agentDisplayName) {
        // This is the current OAuth grant's own Session, never a Gateway
        // acting on a different colleague's identity.
        await this.updateOwnDisplayName(client, renewed, agentDisplayName);
      }

      return { key, row: renewed, created: false };
    }

    if (this.work && (!start?.sessionName || !start.sessionDisplayName)) {
      throw new APIError(409, 'work_initialization_required',
        'Call agentAddressStartWork with a meaningful Session name and display name for this new native work Session.');
    }

    if (!status.organization) {
      // Each independently authorized OAuth grant claims its own Agent.
      // Organization auto-registration is a first-use detail, not a user prompt.
      try {
        await client.registerOrganization({
          slug: 'personal-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
          displayName: 'Personal Workspace',
        });
      } catch (error) {
        if (!this.work || !(error instanceof APIError) || error.code !== 'account_has_organization') {
          throw error;
        }
      }
      status = await client.status() as AccountStatus;
    }

    if (!status.organization?.id || !status.organization.slug) {
      throw new APIError(403, 'organization_required',
        'Agent Address did not authorize an Organization.');
    }

    if (this.work && start) {
      const row = await this.claimWork(key, status.organization, start, this.work);

      return { key, row, created: true };
    }

    const created = await client.claimAgent(
      agentDisplayName ? { agentDisplayName } : {},
    ) as ClaimResponse;

    try {
      const row = await this.persist(key, status.organization, created);

      return { key, row, created: true };
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

  private async claimWork(
    key: string, organization: { id: string; slug: string },
    start: WorkStart & { prepareMailbox: PrepareMailbox },
    work: WorkContext,
  ): Promise<BindingRow> {
    const grant = await this.grant(this.address);
    const registry = new WorkSessionRegistry(this.env, this.address, this.tokenCipher);
    const agent = await registry.ensureAgent(grant, organization, start.agentDisplayName ?? work.agentDisplayName);
    const claim = await this.tokenCipher.initialClaim(key, organization.id);
    const created = await this.address.claimSession(agent.agentID, {
      sessionName: start.sessionName, sessionDisplayName: start.sessionDisplayName,
      runtimeLabel: SessionBindings.RUNTIME_LABEL, claim,
    }) as ClaimResponse;

    SessionBindings.checkLease(created, claim.sessionID, organization.slug);

    if (created.session.agentId !== agent.agentID || created.resumeToken !== claim.resumeToken) {
      throw new APIError(502, 'invalid_claim_result', 'Agent Address returned an inconsistent work Session.');
    }

    await this.prepareWorkMailbox(registry, grant, agent, created, start.prepareMailbox);

    // Retry retains the same claim; releasing it on an uncertain write could
    // revoke the winning concurrent request's Runtime.
    return this.persist(key, organization, created);
  }

  private async prepareWorkMailbox(
    registry: WorkSessionRegistry, grant: string, agent: WorkAgent,
    claim: ClaimResponse, prepareMailbox: PrepareMailbox,
  ): Promise<void> {
    if (agent.mailboxReady) {
      return;
    }

    await prepareMailbox({
      sessionID: claim.session.id, runtimeToken: claim.runtimeToken,
      onRenewed: async () => {
        // The claim is persisted after provisioning completes.
      },
    });
    await registry.markMailboxReady(grant, agent);
  }

  async startWork(
    input: WorkStart, prepareMailbox: PrepareMailbox,
  ): Promise<Record<string, unknown>> {
    const bound = await this.ensureBound(undefined, true, { ...input, prepareMailbox });

    return SessionBindings.publicResult(bound.row, bound.created);
  }

  async ensure(
    agentDisplayName?: string,
  ): Promise<Record<string, unknown>> {
    const bound = await this.ensureBound(agentDisplayName);

    return SessionBindings.publicResult(bound.row, bound.created);
  }

  async selectSession(
    address: string, prepareMailbox?: PrepareMailbox,
  ): Promise<Record<string, unknown>> {
    if (this.work) {
      if (!prepareMailbox) {
        throw new APIError(409, 'work_initialization_required', 'Work Session mailbox preparation is unavailable.');
      }

      return this.selectWork(address, prepareMailbox, this.work);
    }

    const client = this.address;
    const key = await this.principal(client);
    const status = await client.status() as AccountStatus;

    if (!status.organization) {
      throw new APIError(403, 'organization_required',
        'An authorized Organization is required to select a Session.');
    }

    const target = await client.resolve(address) as Session & {
      runtime?: { expiresAt: string } | null;
    };
    const existing = await this.row(key);

    if (existing && existing.organizationID !== status.organization.id) {
      throw new APIError(403, 'binding_organization_changed',
        'The bound Session Organization is no longer authorized.');
    }

    if (target.runtime && Date.parse(target.runtime.expiresAt) > Date.now()) {
      if (existing?.sessionID === target.id) {
        return this.ensure();
      }

      throw new APIError(409, 'session_in_use',
        'The requested Session is still in use.');
    }

    await this.tokenCipher.requireKey();
    const recovered = await client.request('PUT',
      '/v2/account/sessions/' + encodeURIComponent(target.id) + '/owner-runtime-lease',
      { body: { runtimeLabel: SessionBindings.RUNTIME_LABEL } },
    ) as ClaimResponse;

    try {
      SessionBindings.checkLease(recovered, target.id, status.organization.slug);

      if (existing && !(await this.releaseBinding(client, key, existing))) {
        throw new APIError(409, 'session_binding_changed',
          'The current OAuth grant binding changed during selection.');
      }

      const row = await this.persist(key, status.organization, recovered);

      return SessionBindings.publicResult(row, false);
    } catch (error) {
      if (recovered.runtimeToken && recovered.session?.id) {
        try {
          await client.release(target.id, recovered.runtimeToken);
        } catch (releaseError) {
          SessionBindings.logger.exception('selection_compensation_failed', releaseError);
        }
      }

      throw error;
    }
  }

  private async selectWork(
    address: string, prepareMailbox: PrepareMailbox, work: WorkContext,
  ): Promise<Record<string, unknown>> {
    const client = this.address;
    const grant = await this.grant(client);
    const key = await work.key(grant);
    const status = await client.status() as AccountStatus;
    const organization = status.organization;

    if (!organization) {
      throw new APIError(403, 'organization_required', 'An authorized Organization is required.');
    }

    // Resolve the explicit owner-selected full address; a short Agent name
    // must never choose a different default Session for a resumed work.
    if (address.split('/').length !== 3) {
      throw new APIError(400, 'work_address_required', 'Provide the original full work Session address.');
    }

    const target = await client.resolve(address) as Session & {
      runtime?: { expiresAt: string } | null;
    };

    if (!target.agentId || target.canonical.split('/')[0] !== organization.slug) {
      throw new APIError(403, 'binding_identity_mismatch', 'The selected Session is not authorized.');
    }

    const existing = await this.row(key);

    if (existing) {
      if (existing.organizationID !== organization.id || existing.sessionID !== target.id) {
        throw new APIError(409, 'work_binding_exists', 'This native work already has its own Session.');
      }

      const row = await this.renew(client, key, existing, organization.slug);

      return SessionBindings.publicResult(row, false);
    }

    if (target.runtime && Date.parse(target.runtime.expiresAt) > Date.now()) {
      throw new APIError(409, 'session_in_use', 'The requested Session is still in use.');
    }

    await this.tokenCipher.requireKey();
    const registry = new WorkSessionRegistry(this.env, client, this.tokenCipher);
    const agent = await registry.ensureAgent(grant, organization, work.agentDisplayName, target.agentId);
    const recovered = await client.request('PUT',
      '/v2/account/sessions/' + encodeURIComponent(target.id) + '/owner-runtime-lease',
      { body: { runtimeLabel: SessionBindings.RUNTIME_LABEL } },
    ) as ClaimResponse;

    try {
      SessionBindings.checkLease(recovered, target.id, organization.slug);

      if (recovered.session.agentId !== agent.agentID) {
        throw new APIError(409, 'binding_identity_mismatch', 'The recovered work Agent changed.');
      }

      await this.prepareWorkMailbox(registry, grant, agent, recovered, prepareMailbox);
      const row = await this.persist(key, organization, recovered, true);

      return SessionBindings.publicResult(row, false);
    } catch (error) {
      if (recovered.runtimeToken) {
        try {
          await client.release(target.id, recovered.runtimeToken);
        } catch (releaseError) {
          SessionBindings.logger.exception('work_selection_compensation_failed', releaseError);
        }
      }

      throw error;
    }
  }

  async releaseWork(): Promise<Record<string, unknown>> {
    const client = this.address;
    const key = await this.principal(client);
    const row = await this.row(key);

    if (!this.work || !row) {
      throw new APIError(409, 'work_initialization_required', 'No work Session is bound.');
    }

    const status = await client.status() as AccountStatus;

    if (status.organization?.id !== row.organizationID) {
      throw new APIError(403, 'binding_organization_changed', 'The work Session is no longer authorized.');
    }

    const runtime = await this.tokenCipher.decrypt(row.encryptedRuntimeToken, key, row.sessionID);

    try {
      await client.release(row.sessionID, runtime);
    } catch (error) {
      if (!SessionBindings.isLostLease(error)) {
        throw error;
      }
    }

    // Changing the ciphertext also rejects any delayed Relay lease write-back
    // from requests submitted before this explicit release.
    const releasedRuntime = await this.tokenCipher.encrypt(runtime, key, row.sessionID);
    const updated = await this.env.BINDINGS_DB.prepare(
      `UPDATE ${this.table} SET expires_at = ?, encrypted_runtime_token = ?
        WHERE ${this.keyColumn} = ? AND session_id = ? AND encrypted_runtime_token = ?`,
    ).bind(new Date(0).toISOString(), releasedRuntime, key, row.sessionID, row.encryptedRuntimeToken).run();

    if (updated.meta.changes !== 1) {
      throw new APIError(409, 'session_binding_changed', 'The work Session changed during release.');
    }

    return { released: true, sessionID: row.sessionID, canonical: row.canonicalAddress };
  }

  async resume(
    sessionID: string, resumeToken: string,
  ): Promise<Record<string, unknown>> {
    // An explicit user-requested identity change uses a trusted private channel.
    // Normal Skill-first onboarding never needs a Session ID or Resume token.
    if (!SessionBindings.SESSION_ID.test(sessionID) ||
        !resumeToken.startsWith('resume_') || resumeToken.length > 256) {
      throw new APIError(400, 'invalid_session_binding',
        'Session ID and Resume capability are required.');
    }

    const client = this.address;
    const key = await this.principal(client);
    const existing = await this.row(key);

    if (existing && (existing.expiresAt > new Date().toISOString() ||
        await this.heartbeatIfOwned(client, key, existing))) {
      throw new APIError(409, 'session_already_bound',
        'Release the bound Runtime before selecting another Session.');
    }

    await this.tokenCipher.requireKey();
    const status = await client.status() as AccountStatus;

    if (!status.organization?.id || !status.organization.slug) {
      throw new APIError(403, 'organization_required',
        'An authorized Organization is required to bind a Session.');
    }

    const resumed = await client.resumeRuntime(
      sessionID, resumeToken, SessionBindings.RUNTIME_LABEL,
    ) as ResumeResponse;

    try {
      SessionBindings.checkLease(resumed, sessionID, status.organization.slug);

      const runtime = await this.tokenCipher.encrypt(resumed.runtimeToken, key, sessionID);
      const resume = await this.tokenCipher.encrypt(resumeToken, 'resume:' + key, sessionID);
      const written = await this.env.BINDINGS_DB.prepare(
        `INSERT INTO ${this.table}
          (${this.keyColumn}, organization_id, session_id, canonical_address,
           encrypted_runtime_token, encrypted_resume_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(${this.keyColumn}) DO UPDATE SET
           organization_id = excluded.organization_id,
           session_id = excluded.session_id,
           canonical_address = excluded.canonical_address,
           encrypted_runtime_token = excluded.encrypted_runtime_token,
           encrypted_resume_token = excluded.encrypted_resume_token,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at
         WHERE ${this.table}.expires_at <= excluded.created_at`,
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

  async authorize(): Promise<BoundSession> {
    // Relay validates the current Runtime and returns its renewed expiry.
    // Refresh only when the local lease may expire during the outgoing call.
    const { key, row } = await this.ensureBound(undefined, false);

    if (row.expiresAt <= new Date().toISOString()) {
      throw new APIError(403, 'session_binding_required',
        'This OAuth grant has no authorized Session Runtime.');
    }

    return {
      sessionID: row.sessionID,
      runtimeToken: await this.tokenCipher.decrypt(
        row.encryptedRuntimeToken, key, row.sessionID,
      ),
      onRenewed: (expiresAt, canonicalAddress) => this.recordRelayRenewal(key, row, expiresAt, canonicalAddress),
    };
  }

  async revoke(): Promise<{ revoked: boolean }> {
    const client = this.address;
    const key = await this.principal(client);
    const row = await this.row(key);

    if (!row) {
      return { revoked: false };
    }

    return { revoked: await this.releaseBinding(client, key, row) };
  }
}
