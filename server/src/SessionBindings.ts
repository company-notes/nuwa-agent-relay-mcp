import { AddressAPIClient, APIError } from './APIClients';
import type { Env } from './Env';
import { Logger } from './Logger';

type BindingRow = {
  sessionID: string;
  organizationID: string;
  encryptedRuntimeToken: string;
  expiresAt: string;
};

type AccountStatus = {
  organization: { id: string; slug: string } | null;
};

type Session = {
  id: string;
  canonical: string;
};

type ResumeResponse = {
  session: Session;
  runtimeToken: string;
  leaseExpiresAt: string;
};

type Lease = { expiresAt: string };

export type BoundSession = { sessionID: string; runtimeToken: string };

export class SessionBindings {
  private static readonly logger = Logger.forModule('session.binding');
  private static readonly SESSION_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;

  constructor(
    private readonly env: Env,
    private readonly requester: typeof fetch =
      (input, init) => env.ADDRESS_WORKER.fetch(input, init),
  ) {}

  private address(authorization: string): AddressAPIClient {
    return new AddressAPIClient(this.env, authorization, this.requester);
  }

  private static async key(authorization: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(authorization),
    );

    return Array.from(new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private async cipher(): Promise<CryptoKey> {
    const encoded = this.env.SESSION_BINDING_KEY;

    if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new APIError(503, 'binding_key_missing', 'Session encryption key is not configured.');
    }

    const raw = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));

    if (raw.length !== 32) {
      throw new APIError(503, 'binding_key_invalid', 'Session encryption key must be 256 bits.');
    }

    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  private static binaryEncode(value: Uint8Array): string {
    return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
  }

  private static binaryDecode(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  private async encrypt(token: string, identityKey: string, sessionID: string): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: nonce,
      additionalData: new TextEncoder().encode(identityKey + ':' + sessionID),
    }, await this.cipher(), new TextEncoder().encode(token));
    const combined = new Uint8Array(nonce.length + encrypted.byteLength);

    combined.set(nonce);
    combined.set(new Uint8Array(encrypted), nonce.length);

    return SessionBindings.binaryEncode(combined);
  }

  private async decrypt(value: string, identityKey: string, sessionID: string): Promise<string> {
    const combined = SessionBindings.binaryDecode(value);

    if (combined.length < 29) {
      throw new APIError(503, 'binding_corrupted', 'Encrypted Session binding is invalid.');
    }

    const plain = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: combined.slice(0, 12),
      additionalData: new TextEncoder().encode(identityKey + ':' + sessionID),
    }, await this.cipher(), combined.slice(12));

    return new TextDecoder().decode(plain);
  }

  private async row(key: string): Promise<BindingRow | null> {
    return this.env.BINDINGS_DB.prepare(
      `SELECT session_id AS sessionID, organization_id AS organizationID,
              encrypted_runtime_token AS encryptedRuntimeToken,
              expires_at AS expiresAt
         FROM remote_session_bindings WHERE oauth_token_hash = ?`,
    ).bind(key).first<BindingRow>();
  }

  async status(authorization: string): Promise<Record<string, unknown>> {
    const row = await this.row(await SessionBindings.key(authorization));

    return row && row.expiresAt > new Date().toISOString()
      ? { bound: true, sessionID: row.sessionID, expiresAt: row.expiresAt }
      : { bound: false };
  }

  async resume(
    authorization: string, sessionID: string, resumeToken: string,
  ): Promise<Record<string, unknown>> {
    if (!SessionBindings.SESSION_ID.test(sessionID) ||
        !resumeToken.startsWith('resume_') || resumeToken.length > 256) {
      throw new APIError(400, 'invalid_session_binding', 'Session ID and Resume capability are required.');
    }

    const key = await SessionBindings.key(authorization);
    const existing = await this.row(key);

    if (existing && existing.expiresAt > new Date().toISOString()) {
      throw new APIError(409, 'session_already_bound',
        'Release the bound Runtime before selecting another Session.');
    }

    // Fail before acquiring the exclusive Runtime if encrypted storage is unavailable.
    await this.cipher();

    const client = this.address(authorization);
    const status = await client.status() as AccountStatus;

    if (!status.organization?.id || !status.organization.slug) {
      throw new APIError(403, 'organization_required',
        'An authorized Organization is required to bind a Session.');
    }

    // Agent Address owns the lease: this rejects an active Runtime rather than
    // silently displacing it. The model never receives the returned capability.
    const resumed = await client.request('POST',
      '/v2/account/sessions/' + encodeURIComponent(sessionID) + '/resume',
      { body: { resumeToken, runtimeLabel: 'nuwa-relay-remote-mcp' } }) as ResumeResponse;

    if (resumed.session?.id !== sessionID ||
        resumed.session.canonical.split('/')[0] !== status.organization.slug ||
        !resumed.runtimeToken ||
        !Number.isFinite(Date.parse(resumed.leaseExpiresAt)) ||
        Date.parse(resumed.leaseExpiresAt) <= Date.now()) {
      throw new APIError(502, 'invalid_resume_result',
        'Agent Address returned an inconsistent Runtime lease.');
    }

    const encrypted = await this.encrypt(resumed.runtimeToken, key, sessionID);

    try {
      const stored = await this.env.BINDINGS_DB.prepare(
        `INSERT INTO remote_session_bindings
          (oauth_token_hash, organization_id, session_id,
           encrypted_runtime_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(oauth_token_hash) DO UPDATE SET
           organization_id = excluded.organization_id,
           session_id = excluded.session_id,
           encrypted_runtime_token = excluded.encrypted_runtime_token,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at
         WHERE remote_session_bindings.expires_at <= excluded.created_at`,
      ).bind(key, status.organization.id, sessionID, encrypted,
        resumed.leaseExpiresAt, new Date().toISOString()).run();

      if (stored.meta.changes !== 1) {
        throw new APIError(409, 'session_already_bound',
          'An active Session binding was created concurrently.');
      }
    } catch (error) {
      try {
        await client.release(sessionID, resumed.runtimeToken);
      } catch (releaseError) {
        SessionBindings.logger.exception('failed_binding_lease_release', releaseError);
      }

      throw error;
    }

    return { bound: true, sessionID, expiresAt: resumed.leaseExpiresAt };
  }

  async authorize(authorization: string): Promise<BoundSession> {
    const key = await SessionBindings.key(authorization);
    const row = await this.row(key);

    if (!row || row.expiresAt <= new Date().toISOString()) {
      throw new APIError(403, 'session_binding_required',
        'A trusted out-of-band Session binding is required before using Relay.');
    }

    const runtimeToken = await this.decrypt(
      row.encryptedRuntimeToken, key, row.sessionID,
    );
    const client = this.address(authorization);
    const status = await client.status() as AccountStatus;

    if (status.organization?.id !== row.organizationID) {
      throw new APIError(403, 'binding_organization_changed',
        'The bound Session Organization is no longer authorized.');
    }

    const renewed = await client.heartbeat(row.sessionID, runtimeToken) as Lease;

    if (!renewed?.expiresAt || !Number.isFinite(Date.parse(renewed.expiresAt)) ||
        Date.parse(renewed.expiresAt) <= Date.now()) {
      throw new APIError(502, 'invalid_lease_renewal',
        'Agent Address did not renew the Session Runtime lease.');
    }

    const updated = await this.env.BINDINGS_DB.prepare(
      `UPDATE remote_session_bindings SET expires_at = ?
        WHERE oauth_token_hash = ? AND session_id = ?
          AND encrypted_runtime_token = ?`,
    ).bind(renewed.expiresAt, key, row.sessionID, row.encryptedRuntimeToken).run();

    if (updated.meta.changes !== 1) {
      throw new APIError(409, 'session_binding_revoked',
        'The Session binding was revoked during authorization.');
    }

    return { sessionID: row.sessionID, runtimeToken };
  }

  async revoke(authorization: string): Promise<{ revoked: boolean }> {
    const key = await SessionBindings.key(authorization);
    const row = await this.row(key);

    if (!row) {
      return { revoked: false };
    }

    const runtimeToken = await this.decrypt(
      row.encryptedRuntimeToken, key, row.sessionID,
    );

    if (row.expiresAt > new Date().toISOString()) {
      await this.address(authorization).release(row.sessionID, runtimeToken);
    }

    const deleted = await this.env.BINDINGS_DB.prepare(
      'DELETE FROM remote_session_bindings WHERE oauth_token_hash = ?',
    ).bind(key).run();

    return { revoked: deleted.meta.changes === 1 };
  }
}
