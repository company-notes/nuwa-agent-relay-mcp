import type { Env } from './Env';

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
  constructor(
    private readonly apiURL: string,
    private readonly authorization: string,
    private readonly requester: typeof fetch = fetch,
  ) {
    const parsed = new URL(apiURL);

    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' ||
      parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('API URL must be a clean HTTPS origin.');
    }
  }

  async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      workAddressID?: string;
      body?: Record<string, unknown>;
      query?: Record<string, string>;
    } = {},
  ): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Service path must be relative to the configured API origin.');
    }

    const url = new URL(path, this.apiURL);

    if (url.origin !== this.apiURL) {
      throw new Error('Service path escaped the configured API origin.');
    }

    if (options.workAddressID) {
      url.searchParams.set('work_address_id', options.workAddressID);
    }

    for (const [key, value] of Object.entries(options.query || {})) {
      url.searchParams.set(key, value);
    }

    const response = await this.requester(url, {
      method,
      headers: {
        authorization: this.authorization,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });

    // Workers does not implement redirect: 'error'. Manual mode keeps OAuth
    // credentials from being forwarded to a redirect destination; fail closed
    // before parsing a potentially empty or non-JSON redirect body.
    if (response.status >= 300 && response.status < 400) {
      throw new APIError(response.status, 'unexpected_redirect', 'Backend API redirected unexpectedly.');
    }

    const payload = await response.json() as {
      ok: boolean;
      data?: unknown;
      error?: { code?: string; message?: string };
    };

    if (!response.ok || !payload.ok) {
      throw new APIError(
        response.status,
        payload.error?.code || 'request_failed',
        payload.error?.message || 'Backend API rejected the request.',
      );
    }

    return payload.data;
  }
}

export class RelayAPIClient extends HTTPAPIClient {
  constructor(
    env: Env,
    authorization: string,
    requester: typeof fetch = (input, init) => env.RELAY_WORKER.fetch(input, init),
  ) {
    super(env.RELAY_API_URL, authorization, requester);
  }

  call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    workAddressID: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<unknown> {
    return this.request(method, path, { workAddressID, body, query });
  }
}

export class AddressAPIClient extends HTTPAPIClient {
  constructor(
    env: Env,
    authorization: string,
    requester: typeof fetch = (input, init) => env.ADDRESS_WORKER.fetch(input, init),
  ) {
    super(env.ADDRESS_API_URL, authorization, requester);
  }

  status(workAddressID?: string): Promise<unknown> {
    return this.request('GET', '/v1/account/status', { workAddressID });
  }

  claimWork(input: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', '/v1/account/work', { body: input });
  }

  renameWork(workAddressID: string, handle: string): Promise<unknown> {
    return this.request('PATCH', '/v1/account/work/' + encodeURIComponent(workAddressID), {
      body: { handle },
    });
  }

  releaseWork(workAddressID: string): Promise<unknown> {
    return this.request('DELETE', '/v1/account/work/' + encodeURIComponent(workAddressID));
  }

  resolve(address: string): Promise<unknown> {
    return this.request('GET', '/v1/account/resolve', { query: { address } });
  }

  listWorks(options: {
    limit?: number;
    cursor?: string;
    search?: string;
  }): Promise<unknown> {
    const query: Record<string, string> = {};

    if (options.limit !== undefined) {
      query.limit = String(options.limit);
    }
    if (options.cursor !== undefined) {
      query.cursor = options.cursor;
    }
    if (options.search !== undefined) {
      query.search = options.search;
    }

    return this.request('GET', '/v1/account/works', { query });
  }
}
