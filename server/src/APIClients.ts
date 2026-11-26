import type { BackgroundTasks, Env } from './Env';
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

type HTTPRequestOptions = {
  sessionID?: string;
  runtimeToken?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  timeoutMs?: number;
  upgrade?: boolean;
  onResponse?: (response: Response) => Promise<void>;
};

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
    options: HTTPRequestOptions = {},
  ): Promise<unknown> {
    const response = await this.requestRaw(method, path, options);
    const result = await this.readResponse(response);

    if (options.onResponse) {
      await options.onResponse(response);
    }

    return result;
  }

  protected async requestRaw(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string, options: HTTPRequestOptions,
  ): Promise<Response> {
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
          ...(options.upgrade ? { upgrade: 'websocket' } : {}),
          ...(options.runtimeToken ? { 'x-nuwa-runtime-token': options.runtimeToken } : {}),
          ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        redirect: 'manual',
        ...(options.upgrade ? {} : { signal: AbortSignal.timeout(options.timeoutMs ?? 20_000) }),
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

    return response;
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
  onRenewed: (expiresAt: string, canonicalAddress?: string) => Promise<void>;
};

export class RelayAPIClient extends HTTPAPIClient {
  constructor(
    env: Env,
    authorization: string,
    private readonly boundSession: () => Promise<BoundSession>,
    private readonly tasks: BackgroundTasks,
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
    const options = await this.sessionOptions();

    return this.request(method, path, { ...options, body, query, timeoutMs });
  }

  private async sessionOptions(): Promise<HTTPRequestOptions> {
    const { sessionID, runtimeToken, onRenewed } = await this.boundSession();

    return {
      sessionID, runtimeToken,
      onResponse: async (response) => {
        const expiresAt = response.headers.get('x-nuwa-lease-expires-at');

        if (expiresAt) {
          this.tasks.waitUntil(onRenewed(expiresAt, response.headers.get('x-nuwa-canonical-address') ?? undefined));
        }
      },
    };
  }

  async openInboxStream(): Promise<Response> {
    const options = await this.sessionOptions();
    const response = await this.requestRaw('GET', '/v2/inbox/events/stream', { ...options, upgrade: true });

    if (response.status !== 101) {
      await this.readResponse(response);
      throw new APIError(502, 'inbox_stream_unavailable', 'Relay did not upgrade the Inbox stream.');
    }

    await options.onResponse?.(response);

    return response;
  }
}

export class AddressAPIClient extends HTTPAPIClient {
  private static runtimeLeasePath(sessionID: string): string {
    return '/v2/account/sessions/' + encodeURIComponent(sessionID) + '/runtime-lease';
  }

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

  async workerPrincipal(): Promise<{ organizationID: string; grant: string }> {
    if (!this.verifiedStatus) {
      throw new APIError(403, 'worker_oauth_required', 'Worker access requires verified OAuth.');
    }

    const status = await this.accountSnapshot(this.verifiedStatus);
    const organization = status.organization as { id?: string } | null;
    const grant = status.grantFingerprint;

    if (!organization?.id || typeof grant !== 'string' || !/^[a-f0-9]{64}$/.test(grant)) {
      throw new APIError(403, 'worker_identity_invalid', 'Worker access requires an authorized Organization and OAuth grant.');
    }

    return { organizationID: organization.id, grant };
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

  resumeRuntime(
    sessionID: string, resumeToken: string, runtimeLabel: string, runtimeToken?: string,
  ): Promise<unknown> {
    return this.request('PUT', AddressAPIClient.runtimeLeasePath(sessionID), {
      body: { resumeToken, runtimeLabel, ...(runtimeToken ? { runtimeToken } : {}) },
    });
  }

  heartbeat(sessionID: string, runtimeToken: string): Promise<unknown> {
    return this.request('PATCH', AddressAPIClient.runtimeLeasePath(sessionID),
      { body: { runtimeToken }, query: { include_identity: '1' } });
  }

  release(sessionID: string, runtimeToken: string): Promise<unknown> {
    return this.request('DELETE', AddressAPIClient.runtimeLeasePath(sessionID),
      { body: { runtimeToken } });
  }
}
