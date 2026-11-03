import { accessToken } from './auth.mjs';
import { activeWorkId, addressOrigin, relayOrigin } from './settings.mjs';
import { readIdentity } from './storage.mjs';

export class APIError extends Error {
  constructor(status, code, message) {
    super('HTTP ' + status + ' (' + code + '): ' + message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

export class RelayClient {
  constructor({ fetchImpl = globalThis.fetch, tokenProvider = accessToken } = {}) {
    this.fetchImpl = fetchImpl;
    this.tokenProvider = tokenProvider;
  }

  async request(service, path, {
    method = 'GET',
    body,
    query = {},
    useWork = service === 'relay',
    expected = [200],
  } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Only relative API paths are allowed.');
    }

    const origin = service === 'relay' ? relayOrigin()
      : service === 'address' ? addressOrigin()
        : null;

    if (!origin) {
      throw new Error('Unknown Nuwa service.');
    }

    const url = new URL(path, origin);
    if (url.origin !== origin) {
      throw new Error('API request cannot escape the configured service origin.');
    }

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    if (useWork) {
      url.searchParams.set('work_address_id', activeWorkId(await readIdentity()));
    }

    const perform = async (forceRefresh) => {
      const token = await this.tokenProvider(forceRefresh);
      const headers = { authorization: 'Bearer ' + token, accept: 'application/json' };

      if (body !== undefined) {
        headers['content-type'] = 'application/json';
      }

      let response;

      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new Error('Cannot reach ' + origin + '. Check network connectivity and HTTPS settings.');
      }

      if (response.status === 401 && !forceRefresh && !process.env.NUWA_ACCESS_TOKEN) {
        return null; // Retry exactly once with a refreshed OAuth access token.
      }

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new APIError(response.status, 'invalid_json', 'Service returned a non-JSON response.');
      }

      if (!expected.includes(response.status) || !payload || payload.ok !== true) {
        const code = typeof payload?.error?.code === 'string'
          ? payload.error.code
          : 'unexpected_response';
        const message = typeof payload?.error?.message === 'string'
          ? payload.error.message.slice(0, 300)
          : 'No error description';

        throw new APIError(response.status, code, message);
      }

      return payload.data;
    };

    const first = await perform(false);
    return first === null ? perform(true) : first;
  }

  async identityStatus(workId) {
    const query = workId ? { work_address_id: workId } : {};
    return this.request('address', '/v1/account/status', { query, useWork: false });
  }

  async claimWork({ organization, host, handle }) {
    return this.request('address', '/v1/account/work', {
      method: 'POST',
      body: { ...(organization ? { organization } : {}), host, handle },
      useWork: false,
      expected: [201],
    });
  }

  async relay(path, opts) {
    return this.request('relay', path, opts);
  }
}
