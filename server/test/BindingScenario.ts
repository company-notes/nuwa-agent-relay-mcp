import assert from 'node:assert/strict';

import type { BackgroundTasks, BindingDatabase, BindingStatement, Env } from '../src/Env';
import { HTTPMCPApplication } from '../src/Index';

export const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const MESSAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const THREAD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const RESUME_SECRET = 'resume_secret_from_private_storage';
export const RUNTIME_SECRET = 'runtime_private_lease_capability';

type BindingRecord = {
  sessionID: string;
  organizationID: string;
  canonicalAddress: string;
  encryptedRuntimeToken: string;
  encryptedResumeToken: string;
  expiresAt: string;
};

class MemoryStatement implements BindingStatement {
  private parameters: string[] = [];

  constructor(
    private readonly store: Map<string, BindingRecord>,
    private readonly sql: string,
    private readonly expiryWriteGate?: Promise<void>,
  ) {}

  bind(...values: string[]): MemoryStatement {
    this.parameters = values;

    return this;
  }

  async first<T>(): Promise<T | null> {
    assert.match(this.sql, /^SELECT /);
    const value = this.store.get(this.parameters[0]);

    return value ? { ...value } as T : null;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    if (this.sql.startsWith('INSERT')) {
      const [key, organizationID, sessionID, canonicalAddress,
        encryptedRuntimeToken, encryptedResumeToken, expiresAt, createdAt] = this.parameters;
      const current = this.store.get(key);

      if (current && (this.sql.startsWith('INSERT OR IGNORE') ||
          current.expiresAt > createdAt)) {
        return { meta: { changes: 0 } };
      }

      this.store.set(key, {
        organizationID, sessionID, canonicalAddress, encryptedRuntimeToken,
        encryptedResumeToken, expiresAt,
      });

      return { meta: { changes: 1 } };
    }

    if (this.sql.startsWith('UPDATE remote_session_bindings SET expires_at')) {
      await this.expiryWriteGate;
      const [expiresAt, observedAt, canonical, key, sessionID, encryptedRuntimeToken] = this.parameters;
      const current = this.store.get(key);

      if (!current || current.sessionID !== sessionID ||
          current.encryptedRuntimeToken !== encryptedRuntimeToken) {
        return { meta: { changes: 0 } };
      }

      if (canonical && observedAt >= current.expiresAt) {
        current.canonicalAddress = canonical;
      }

      current.expiresAt = current.expiresAt > expiresAt ? current.expiresAt : expiresAt;

      return { meta: { changes: 1 } };
    }

    if (this.sql.startsWith('UPDATE remote_session_bindings')) {
      const [nextToken, expiresAt, canonicalAddress, key, sessionID, previousToken] = this.parameters;
      const current = this.store.get(key);

      if (!current || current.sessionID !== sessionID ||
          current.encryptedRuntimeToken !== previousToken) {
        return { meta: { changes: 0 } };
      }

      current.encryptedRuntimeToken = nextToken;
      current.expiresAt = expiresAt;
      current.canonicalAddress = canonicalAddress;

      return { meta: { changes: 1 } };
    }

    if (this.sql.startsWith('DELETE FROM remote_session_bindings')) {
      const [key, token] = this.parameters;
      const current = this.store.get(key);

      if (!current || current.encryptedRuntimeToken !== token) {
        return { meta: { changes: 0 } };
      }

      this.store.delete(key);

      return { meta: { changes: 1 } };
    }

    throw new Error('Unexpected D1 statement in scenario.');
  }
}

export class MemoryBindingDatabase implements BindingDatabase {
  readonly rows = new Map<string, BindingRecord>();
  expiryWriteGate?: Promise<void>;

  prepare(sql: string): BindingStatement {
    return new MemoryStatement(this.rows, sql, this.expiryWriteGate);
  }
}

class TestBackgroundTasks implements BackgroundTasks {
  private readonly pending: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.pending.push(promise);
  }

  async drain(): Promise<void> {
    await Promise.all(this.pending.splice(0));
  }
}

export class RemoteMCPScenario {
  private readonly originalFetch = globalThis.fetch;
  readonly database = new MemoryBindingDatabase();
  readonly background = new TestBackgroundTasks();
  readonly calls: Array<{ url: URL; method: string | undefined; headers: Headers; body: unknown }> = [];
  readonly activeLeases = new Map<string, string>();
  organizationSlug = 'nuwa';
  private readonly agentHandles = new Map<string, string>();

  renameAddress(slug: string, sessionID: string, handle: string) {
    this.organizationSlug = slug;
    this.agentHandles.set(sessionID, handle);
  }

  readonly workSessions = new Map<string, { id: string; canonical: string; agentId: string; resumeToken: string }>();

  private canonical(sessionID: string): string {
    const work = this.workSessions.get(sessionID);

    if (work) {
      return work.canonical;
    }

    const handle = this.agentHandles.get(sessionID) ?? 'reviewer-' + (sessionID === SESSION_B ? 'b' : 'a');

    return this.organizationSlug + '/' + handle + '/main';
  }
  readonly env: Env;
  readonly application: HTTPMCPApplication;
  organizationID = 'org-a';
  organizationExists = true;
  resumeCount = 0;
  recoveryCount = 0;
  heartbeatAttempts = 0;
  claimCount = 0;
  readonly displayNameUpdates: Array<{ agentID: string; name: string; principal: string }> = [];
  registerOrganizationCount = 0;
  heartbeatCount = 0;
  relayLeaseChecks = 0;
  grantLookups = 0;
  statusLookups = 0;
  statusDelayMS = 0;
  releaseCount = 0;

  constructor() {
    this.env = {
      ADDRESS_API_URL: 'https://address.company-notes.com',
      RELAY_API_URL: 'https://agent-relay.company-notes.com',
      SESSION_BINDING_KEY: Buffer.alloc(32, 7).toString('base64'),
      BINDINGS_DB: this.database,
      ADDRESS_WORKER: { fetch: (input, init) => globalThis.fetch(input, init) },
      RELAY_WORKER: { fetch: (input, init) => globalThis.fetch(input, init) },
    };
    this.application = new HTTPMCPApplication(this.env, this.background);
  }

  private static principal(authorization: string | null): string | null {
    if (!authorization?.startsWith('Bearer oauth-')) {
      return null;
    }

    const token = authorization.slice('Bearer '.length);
    // A refreshed token of the same OAuth grant maps to the same provider
    // principal. Another grant on the same Account is deliberately isolated.
    const id = token === 'oauth-a-refresh' ? 'a' :
      token === 'oauth-b' ? 'b' : token === 'oauth-c' ? 'c' : 'a';

    return id.repeat(64);
  }

  install(): void {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (url.origin === this.env.ADDRESS_API_URL) {
        const principal = RemoteMCPScenario.principal(headers.get('authorization'));

        if (!principal) {
          return Response.json({ ok: false, error: { code: 'invalid_token' } }, {
            status: 401,
          });
        }

        if (url.pathname === '/v2/account/grant') {
          this.grantLookups += 1;

          return Response.json({ ok: true, data: { grantFingerprint: principal } });
        }

        if (url.pathname === '/v2/account/status') {
          this.statusLookups += 1;

          if (this.statusDelayMS > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, this.statusDelayMS));
          }

          return Response.json({
            ok: true,
            data: {
              account: { email: 'user@example.com' },
              organization: this.organizationExists
                ? { id: this.organizationID, slug: this.organizationSlug } : null,
              ...(url.searchParams.get('include_grant') === '1'
                ? { grantFingerprint: principal } : {}),
            },
          });
        }

        if (url.pathname === '/v2/account/organization' && init?.method === 'POST') {
          this.registerOrganizationCount += 1;
          this.organizationExists = true;

          return Response.json({
            ok: true, data: { id: this.organizationID, slug: this.organizationSlug },
          }, { status: 201 });
        }

        if (url.pathname === '/v2/account/addresses' && init?.method === 'GET') {
          const address = url.searchParams.get('address');

          const work = Array.from(this.workSessions.values()).find((session) => session.canonical === address);

          if (work) {
            return Response.json({ ok: true, data: {
              id: work.id, agentId: work.agentId, canonical: work.canonical,
              runtime: this.activeLeases.has(work.id)
                ? { expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() } : null,
            } });
          }

          if (address !== 'nuwa/reviewer-a/main') {
            return Response.json({ ok: false, error: { code: 'session_not_found' } }, {
              status: 404,
            });
          }

          return Response.json({ ok: true, data: {
            id: SESSION_A,
            canonical: this.canonical(SESSION_A),
            runtime: this.activeLeases.has(SESSION_A)
              ? { expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }
              : null,
          } });
        }

        const ownerLease = url.pathname.match(/^\/v2\/account\/sessions\/([0-9a-f-]+)\/owner-runtime-lease$/);
        const selectedWork = ownerLease ? this.workSessions.get(ownerLease[1]) : undefined;

        if (selectedWork && init?.method === 'PUT') {
          if (this.activeLeases.has(selectedWork.id)) {
            return Response.json({ ok: false, error: { code: 'session_in_use' } }, { status: 409 });
          }

          const runtimeToken = 'runtime_' + crypto.randomUUID();
          selectedWork.resumeToken = 'resume_' + crypto.randomUUID();
          this.activeLeases.set(selectedWork.id, runtimeToken);

          return Response.json({ ok: true, data: {
            session: { id: selectedWork.id, canonical: selectedWork.canonical, agentId: selectedWork.agentId },
            runtimeToken, resumeToken: selectedWork.resumeToken,
            leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          } });
        }

        if (url.pathname === '/v2/account/sessions/' + SESSION_A + '/owner-runtime-lease' &&
            init?.method === 'PUT') {
          if (this.activeLeases.has(SESSION_A)) {
            return Response.json({ ok: false, error: { code: 'session_in_use' } }, {
              status: 409,
            });
          }

          const runtime = RUNTIME_SECRET + '_recovered';
          this.activeLeases.set(SESSION_A, runtime);

          return Response.json({ ok: true, data: {
            session: { id: SESSION_A, canonical: this.canonical(SESSION_A) },
            runtimeToken: runtime,
            resumeToken: RESUME_SECRET + '_owner',
            leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          } });
        }

        const workClaim = url.pathname.match(/^\/v2\/account\/agents\/([^/]+)\/session-runtime-leases$/);

        if (body?.claim && init?.method === 'POST' &&
            (url.pathname === '/v2/account/agent-runtime-leases' || workClaim)) {
          const claim = body.claim;
          let session = this.workSessions.get(claim.sessionID);

          if (!session) {
            this.claimCount += 1;
            const agentId = workClaim?.[1] ?? 'work-agent-' + principal[0];
            const root = Array.from(this.workSessions.values()).find((item) =>
              item.agentId === agentId && item.canonical.endsWith('/main'));
            const prefix = root ? root.canonical.slice(0, -5) : 'nuwa/' + agentId;
            const requested = prefix + '/' + body.sessionName;
            const occupied = Array.from(this.workSessions.values()).some((item) => item.canonical === requested);
            session = {
              id: claim.sessionID, agentId, resumeToken: claim.resumeToken,
              canonical: occupied ? requested + '-' + claim.sessionID.slice(0, 8) : requested,
            };
            this.workSessions.set(session.id, session);
            this.activeLeases.set(session.id, claim.runtimeToken);
          }

          if (session.resumeToken !== claim.resumeToken) {
            return Response.json({ ok: false, error: { code: 'claim_identity_mismatch' } }, { status: 409 });
          }

          return Response.json({ ok: true, data: {
            session: { id: session.id, agentId: session.agentId, canonical: session.canonical },
            runtimeToken: this.activeLeases.get(session.id), resumeToken: session.resumeToken,
            leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          } }, { status: 201 });
        }

        if (url.pathname === '/v2/account/agent-runtime-leases' && init?.method === 'POST') {
          if (!this.organizationExists) {
            return Response.json({ ok: false, error: { code: 'organization_required' } }, {
              status: 403,
            });
          }

          this.claimCount += 1;
          const sessionID = principal[0] === 'b' ? SESSION_B : SESSION_A;
          const runtime = principal[0] === 'b' ? RUNTIME_SECRET + '_b' : RUNTIME_SECRET;
          this.activeLeases.set(sessionID, runtime);

          this.agentHandles.set(sessionID, body?.agentDisplayName === '小晴'
            ? 'xiaoqing' : 'reviewer-' + principal[0]);

          return Response.json({ ok: true, data: {
            session: {
              id: sessionID, agentId: 'agent-' + principal[0],
              canonical: this.canonical(sessionID),
            },
            runtimeToken: runtime,
            resumeToken: RESUME_SECRET,
            leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          } }, { status: 201 });
        }

        const leaseMatch = url.pathname.match(
          /^\/v2\/account\/sessions\/([0-9a-f-]+)\/runtime-lease$/,
        );

        if (leaseMatch) {
          const [, sessionID] = leaseMatch;
          const work = this.workSessions.get(sessionID);
          const runtime = work ? 'runtime_' + crypto.randomUUID() :
            sessionID === SESSION_B ? RUNTIME_SECRET + '_b' : RUNTIME_SECRET;

          if (init?.method === 'PUT') {
            if (body?.runtimeToken) {
              this.recoveryCount += 1;
              const owner = this.activeLeases.get(sessionID);

              if (owner && owner === body.runtimeToken) {
                return Response.json({ ok: true, data: {
                  session: { id: sessionID, canonical: this.canonical(sessionID) },
                  runtimeToken: owner,
                  leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
                  renewed: true,
                } });
              }
            }

            this.resumeCount += 1;

            if (body?.resumeToken !== (work?.resumeToken ?? RESUME_SECRET) || this.activeLeases.has(sessionID)) {
              return Response.json({ ok: false, error: { code: 'session_in_use' } }, {
                status: 409,
              });
            }

            this.activeLeases.set(sessionID, runtime);

            return Response.json({
              ok: true,
              data: {
                session: { id: sessionID, canonical: this.canonical(sessionID) },
                runtimeToken: runtime,
                leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
              },
            });
          }

          if (init?.method === 'PATCH') {
            this.heartbeatAttempts += 1;
          }

          if (body?.runtimeToken !== this.activeLeases.get(sessionID)) {
            return Response.json({ ok: false, error: { code: 'runtime_not_owner' } }, {
              status: 409,
            });
          }

          if (init?.method === 'PATCH') {
            this.heartbeatCount += 1;

            return Response.json({
              ok: true,
              data: {
                expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
                ...(url.searchParams.get('include_identity') === '1' ? {
                  organization: { id: this.organizationID, slug: this.organizationSlug },
                  session: { id: sessionID, canonical: this.canonical(sessionID) },
                } : {}),
              },
            });
          }

          if (init?.method !== 'DELETE') {
            throw new Error('Unsupported Session lease method.');
          }

          this.releaseCount += 1;
          this.activeLeases.delete(sessionID);

          return Response.json({ ok: true, data: { id: sessionID } });
        }

        const agentNameMatch = url.pathname.match(/^\/v2\/account\/agents\/(agent-[ab])$/);

        if (agentNameMatch && init?.method === 'PATCH') {
          const ownAgentID = 'agent-' + principal[0];

          if (agentNameMatch[1] !== ownAgentID) {
            return Response.json({ ok: false, error: { code: 'forbidden' } }, {
              status: 403,
            });
          }

          assert.equal(typeof body?.agentDisplayName, 'string');
          const name = String(body?.agentDisplayName);
          this.displayNameUpdates.push({
            agentID: ownAgentID, name, principal: principal[0],
          });

          return Response.json({ ok: true, data: {
            id: ownAgentID, displayName: name,
          } });
        }

        if (url.pathname === '/v2/account/agents') {
          return Response.json({ ok: true, data: [{ id: 'agent-a', handle: 'reviewer' }] });
        }

        const work = this.workSessions.get(url.pathname.split('/').at(-1) ?? '');

        if (work && init?.method === 'GET') {
          return Response.json({ ok: true, data: {
            id: work.id, agentId: work.agentId, canonical: work.canonical,
          } });
        }

        if (url.pathname === '/v2/account/sessions/' + SESSION_A ||
            url.pathname === '/v2/account/sessions/' + SESSION_B) {
          const other = url.pathname.endsWith(SESSION_B);
          return Response.json({
            ok: true,
            data: {
              id: other ? SESSION_B : SESSION_A,
              agentId: other ? 'agent-b' : 'agent-a',
              canonical: this.canonical(other ? SESSION_B : SESSION_A),
            },
          });
        }

        throw new Error('Unexpected Agent Address path in test: ' + url.pathname);
      }

      assert.equal(url.origin, this.env.RELAY_API_URL);
      this.relayLeaseChecks += 1;
      const sessionID = url.searchParams.get('session_id') ?? '';
      const runtime = this.activeLeases.get(sessionID);

      if (!runtime || headers.get('x-nuwa-runtime-token') !== runtime) {
        return Response.json({ ok: false, error: { code: 'runtime_not_owner' } }, {
          status: 409,
        });
      }

      this.calls.push({ url, method: init?.method, headers, body });

      return Response.json({ ok: true, data: {
        id: MESSAGE_ID, threadId: THREAD_ID,
        recentThreadMessages: [{ body: 'Previous context' }],
      } }, {
        status: init?.method === 'POST' ? 201 : 200,
        headers: {
          'x-nuwa-lease-expires-at': new Date(Date.now() + 15 * 60_000).toISOString(),
          'x-nuwa-canonical-address': this.canonical(sessionID),
        },
      });
    };
  }

  async privateRequest(
    method: 'GET' | 'POST' | 'DELETE',
    token: string,
    body?: Record<string, string>,
    origin?: string,
  ): Promise<Response> {
    return this.application.handle(new Request(
      'https://mcp.agent-relay.company-notes.com/session-bindings',
      {
        method,
        headers: {
          authorization: 'Bearer ' + token,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(origin ? { origin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    ));
  }

  async bind(token = 'oauth-a', sessionID = SESSION_A): Promise<Response> {
    return this.privateRequest('POST', token, { sessionID, resumeToken: RESUME_SECRET });
  }

  async tool(
    name: string, argumentsValue: Record<string, unknown>, token = 'oauth-a',
    waitForBackground = true,
    work?: { mode: 'codex' | 'grok-build'; id?: string },
  ): Promise<{ result: { content: Array<{ text: string }>; isError?: boolean } }> {
    const response = await this.application.handle(new Request(
      'https://mcp.agent-relay.company-notes.com/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          ...(work ? { 'x-nuwa-work-mode': work.mode } : {}),
          ...(work?.mode === 'grok-build' && work.id ? { 'x-nuwa-work-id': work.id } : {}),
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 7, method: 'tools/call',
          params: {
            name, arguments: argumentsValue,
            ...(work?.mode === 'codex' && work.id ? { _meta: { threadId: work.id } } : {}),
          },
        }),
      },
    ));

    assert.equal(response.status, 200);

    if (waitForBackground) {
      await this.background.drain();
    }

    return response.json() as Promise<{
      result: { content: Array<{ text: string }>; isError?: boolean };
    }>;
  }

  async toolSchemas() {
    const response = await this.application.handle(new Request(
      'https://mcp.agent-relay.company-notes.com/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer oauth-a',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 8, method: 'tools/list', params: {},
        }),
      },
    ));

    assert.equal(response.status, 200);

    return response.json();
  }

  restore(): void {
    globalThis.fetch = this.originalFetch;
  }
}
