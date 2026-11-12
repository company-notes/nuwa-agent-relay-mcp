import assert from 'node:assert/strict';

import type { BindingDatabase, BindingStatement, Env } from '../src/Env';
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
  encryptedRuntimeToken: string;
  expiresAt: string;
};

class MemoryStatement implements BindingStatement {
  private parameters: string[] = [];

  constructor(
    private readonly store: Map<string, BindingRecord>,
    private readonly sql: string,
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
    const [key] = this.parameters;

    if (this.sql.startsWith('INSERT INTO remote_session_bindings')) {
      const [, organizationID, sessionID, encryptedRuntimeToken,
        expiresAt, createdAt] = this.parameters;
      const current = this.store.get(key);

      if (current && current.expiresAt > createdAt) {
        return { meta: { changes: 0 } };
      }

      this.store.set(key, { sessionID, organizationID, encryptedRuntimeToken, expiresAt });

      return { meta: { changes: 1 } };
    }

    if (this.sql.startsWith('UPDATE remote_session_bindings')) {
      const [expiresAt, hash, sessionID, encryptedRuntimeToken] = this.parameters;
      const current = this.store.get(hash);

      if (!current || current.sessionID !== sessionID ||
          current.encryptedRuntimeToken !== encryptedRuntimeToken) {
        return { meta: { changes: 0 } };
      }

      current.expiresAt = expiresAt;

      return { meta: { changes: 1 } };
    }

    if (this.sql.startsWith('DELETE FROM remote_session_bindings')) {
      return { meta: { changes: Number(this.store.delete(key)) } };
    }

    throw new Error('Unexpected D1 statement in scenario.');
  }
}

export class MemoryBindingDatabase implements BindingDatabase {
  readonly rows = new Map<string, BindingRecord>();

  prepare(sql: string): BindingStatement {
    return new MemoryStatement(this.rows, sql);
  }
}

export class RemoteMCPScenario {
  private readonly originalFetch = globalThis.fetch;
  readonly database = new MemoryBindingDatabase();
  readonly calls: Array<{ url: URL; headers: Headers; body: unknown }> = [];
  readonly activeLeases = new Map<string, string>();
  readonly env: Env;
  readonly application: HTTPMCPApplication;
  organizationID = 'org-a';
  resumeCount = 0;
  heartbeatCount = 0;
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
    this.application = new HTTPMCPApplication(this.env);
  }

  install(): void {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (url.origin === this.env.ADDRESS_API_URL) {
        if (!headers.get('authorization')?.startsWith('Bearer oauth-')) {
          return Response.json({ ok: false, error: { code: 'invalid_token' } }, {
            status: 401,
          });
        }

        if (url.pathname === '/v2/account/status') {
          return Response.json({
            ok: true,
            data: {
              account: { email: 'user@example.com' },
              organization: { id: this.organizationID, slug: 'nuwa' },
            },
          });
        }

        const action = url.pathname.match(
          /^\/v2\/account\/sessions\/([0-9a-f-]+)\/(resume|heartbeat|release)$/,
        );

        if (action) {
          const [, sessionID, operation] = action;

          if (operation === 'resume') {
            this.resumeCount += 1;

            if (body?.resumeToken !== RESUME_SECRET || this.activeLeases.has(sessionID)) {
              return Response.json({ ok: false, error: { code: 'session_in_use' } }, {
                status: 409,
              });
            }

            this.activeLeases.set(sessionID, RUNTIME_SECRET);

            return Response.json({
              ok: true,
              data: {
                session: { id: sessionID, canonical: 'nuwa/reviewer/main' },
                runtimeToken: RUNTIME_SECRET,
                leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
              },
            });
          }

          if (body?.runtimeToken !== this.activeLeases.get(sessionID)) {
            return Response.json({ ok: false, error: { code: 'runtime_not_owner' } }, {
              status: 409,
            });
          }

          if (operation === 'heartbeat') {
            this.heartbeatCount += 1;

            return Response.json({
              ok: true,
              data: { expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
            });
          }

          this.releaseCount += 1;
          this.activeLeases.delete(sessionID);

          return Response.json({ ok: true, data: { id: sessionID } });
        }

        if (url.pathname === '/v2/account/agents') {
          return Response.json({ ok: true, data: [{ id: 'agent-a', handle: 'reviewer' }] });
        }

        if (url.pathname === '/v2/account/sessions/' + SESSION_A) {
          return Response.json({
            ok: true,
            data: { id: SESSION_A, agentId: 'agent-a', canonical: 'nuwa/reviewer/main' },
          });
        }

        throw new Error('Unexpected Agent Address path in test: ' + url.pathname);
      }

      assert.equal(url.origin, this.env.RELAY_API_URL);
      this.calls.push({ url, headers, body });

      return Response.json({ ok: true, data: {
        id: MESSAGE_ID, threadId: THREAD_ID,
        recentThreadMessages: [{ body: 'Previous context' }],
      } }, { status: init?.method === 'POST' ? 201 : 200 });
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
  ): Promise<{ result: { content: Array<{ text: string }>; isError?: boolean } }> {
    const response = await this.application.handle(new Request(
      'https://mcp.agent-relay.company-notes.com/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 7, method: 'tools/call',
          params: { name, arguments: argumentsValue },
        }),
      },
    ));

    assert.equal(response.status, 200);

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
