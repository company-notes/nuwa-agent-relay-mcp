import type { Env } from './Env';
import { Logger } from './Logger';

export class APIError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class HTTPAPIClient {
  private static readonly logger = Logger.forModule('mcp.http');

  constructor(
    private readonly apiURL: string,
    private readonly authorization: string,
    private readonly requester: typeof fetch = fetch,
  ) {
    const origin = new URL(apiURL);

    if (origin.protocol !== 'https:' || origin.pathname !== '/' ||
        origin.search || origin.hash || origin.username || origin.password) {
      throw new Error('API URL must be a clean HTTPS origin.');
    }
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      sessionID?: string;
      runtimeToken?: string;
      body?: Record<string, unknown>;
      query?: Record<string, string>;
      timeoutMs?: number;
      onResponse?: (response: Response) => Promise<void>;
    } = {},
  ): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Service path must remain relative to its origin.');
    }

    const url = new URL(path, this.apiURL);

    if (url.origin !== this.apiURL) {
      throw new Error('Service path escaped its API origin.');
    }

    if (options.sessionID) {
      url.searchParams.set('session_id', options.sessionID);
    }

    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    let response: Response;

    try {
      response = await this.requester(url, {
        method,
        headers: {
          authorization: this.authorization,
          accept: 'application/json',
          ...(options.runtimeToken ? { 'x-nuwa-runtime-token': options.runtimeToken } : {}),
          ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
    } catch (error) {
      HTTPAPIClient.logger.exception('backend_request_failed', error);

      if (error instanceof APIError) {
        throw error;
      }

      if (error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new APIError(504, 'backend_timeout',
          'Backend operation timed out. Check its progress before retrying.');
      }

      throw new APIError(502, 'backend_transport_failed',
        'Backend connection failed. Check its progress before retrying.');
    }

    const result = await this.readResponse(response);

    if (options.onResponse) {
      await options.onResponse(response);
    }

    return result;
  }

  protected async readResponse(response: Response): Promise<unknown> {
    if (response.status >= 300 && response.status < 400) {
      throw new APIError(502, 'unexpected_redirect', 'Backend API unexpectedly redirected.');
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new APIError(502, 'invalid_response', 'Backend returned invalid JSON.');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !('ok' in payload) || !('data' in payload) && !('error' in payload)) {
      throw new APIError(502, 'invalid_response', 'Backend returned invalid API envelope.');
    }

    const result = payload as {
      ok: boolean;
      data?: unknown;
      error?: { code?: string; message?: string };
    };

    if (!response.ok || !result.ok) {
      throw new APIError(
        response.status,
        result.error?.code ?? 'request_failed',
        result.error?.message ?? 'Backend API rejected the request.',
      );
    }

    return result.data;
  }
}

export type BoundSession = {
  sessionID: string;
  runtimeToken: string;
  onRenewed: (expiresAt: string) => Promise<void>;
};

export class RelayAPIClient extends HTTPAPIClient {
  constructor(
    env: Env,
    authorization: string,
    private readonly boundSession: () => Promise<BoundSession>,
    requester: typeof fetch = (input, init) => env.RELAY_WORKER.fetch(input, init),
  ) {
    super(env.RELAY_API_URL, authorization, requester);
  }

  async call(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
    timeoutMs?: number,
  ): Promise<unknown> {
    const { sessionID, runtimeToken, onRenewed } = await this.boundSession();

    return this.request(method, path, {
      sessionID, runtimeToken, body, query, timeoutMs,
      onResponse: async (response) => {
        const expiresAt = response.headers.get('x-nuwa-lease-expires-at');

        if (expiresAt) {
          await onRenewed(expiresAt);
        }
      },
    });
  }
}

export class AddressAPIClient extends HTTPAPIClient {
  private verifiedAccount?: Promise<Record<string, unknown>>;
  private statusConsumed = false;

  constructor(
    env: Env,
    authorization: string,
    requester: typeof fetch = (input, init) => env.ADDRESS_WORKER.fetch(input, init),
    private readonly verifiedStatus?: Response,
  ) {
    super(env.ADDRESS_API_URL, authorization, requester);
  }

  private accountSnapshot(response: Response): Promise<Record<string, unknown>> {
    this.verifiedAccount ??= this.readResponse(response) as
      Promise<Record<string, unknown>>;

    return this.verifiedAccount;
  }

  async status(): Promise<unknown> {
    if (!this.verifiedStatus || this.statusConsumed) {
      return this.request('GET', '/v2/account/status');
    }

    this.statusConsumed = true;
    const { grantFingerprint, ...status } = await this.accountSnapshot(this.verifiedStatus);

    return status;
  }

  async grant(): Promise<unknown> {
    if (!this.verifiedStatus) {
      return this.request('GET', '/v2/account/grant');
    }

    const { grantFingerprint } = await this.accountSnapshot(this.verifiedStatus);

    return { grantFingerprint };
  }

  registerOrganization(input: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', '/v2/account/organization', { body: input });
  }

  claimAgent(input: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', '/v2/account/agent-runtime-leases', { body: input });
  }

  claimSession(agentID: string, input: Record<string, unknown>): Promise<unknown> {
    return this.request('POST',
      '/v2/account/agents/' + encodeURIComponent(agentID) + '/session-runtime-leases', { body: input });
  }

  listAgents(): Promise<unknown> {
    return this.request('GET', '/v2/account/agents');
  }

  listSessions(agentID: string): Promise<unknown> {
    return this.request('GET',
      '/v2/account/agents/' + encodeURIComponent(agentID) + '/sessions');
  }

  resolve(address: string): Promise<unknown> {
    return this.request('GET', '/v2/account/addresses', { query: { address } });
  }

  getSession(sessionID: string): Promise<unknown> {
    return this.request('GET',
      '/v2/account/sessions/' + encodeURIComponent(sessionID));
  }

  setAgentDisplayName(agentID: string, displayName: string): Promise<unknown> {
    return this.request('PATCH',
      '/v2/account/agents/' + encodeURIComponent(agentID),
      { body: { agentDisplayName: displayName } });
  }

  heartbeat(sessionID: string, runtimeToken: string): Promise<unknown> {
    return this.request('PATCH',
      '/v2/account/sessions/' + encodeURIComponent(sessionID) + '/runtime-lease',
      { body: { runtimeToken } });
  }

  release(sessionID: string, runtimeToken: string): Promise<unknown> {
    return this.request('DELETE',
      '/v2/account/sessions/' + encodeURIComponent(sessionID) + '/runtime-lease',
      { body: { runtimeToken } });
  }
}
