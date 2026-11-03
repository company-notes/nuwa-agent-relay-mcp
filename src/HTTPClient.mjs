// REST is the source of truth; MCP performs no business rules or persistence.
export class APIError extends Error {
  constructor(status, code, message) {
    super('HTTP ' + status + ' (' + code + '): ' + message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

export class HTTPClient {
  constructor(env, authorization, fetchImpl = globalThis.fetch) {
    this.authorization = authorization;
    this.fetchImpl = fetchImpl;
    this.origins = {
      address: HTTPClient.requireOrigin(env.ADDRESS_API_URL),
      relay: HTTPClient.requireOrigin(env.RELAY_API_URL),
    };
  }

  static requireOrigin(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search ||
        url.hash || url.pathname !== '/') {
      throw new Error('API endpoints must be HTTPS origins without paths or credentials.');
    }

    return url.origin;
  }

  async request(service, path, { method = 'GET', workAddressId, body, query = {} } = {}) {
    const origin = this.origins[service];
    if (!origin || !path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Unsupported service or API path.');
    }

    const url = new URL(path, origin);
    if (url.origin !== origin) {
      throw new Error('API request cannot leave its configured origin.');
    }

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    if (service === 'relay') {
      if (!workAddressId) {
        throw new Error('A Work ID is required for every Relay operation.');
      }

      url.searchParams.set('work_address_id', workAddressId);
    } else if (workAddressId) {
      url.searchParams.set('work_address_id', workAddressId);
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        authorization: this.authorization,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new APIError(response.status, 'invalid_json', 'API returned an invalid JSON response.');
    }

    if (!response.ok || payload?.ok !== true) {
      const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'upstream_error';
      const message = typeof payload?.error?.message === 'string'
        ? payload.error.message.slice(0, 300)
        : 'API request failed.';
      throw new APIError(response.status, code, message);
    }

    return payload.data;
  }
}
