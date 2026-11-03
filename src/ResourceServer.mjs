import { HTTPClient } from './HTTPClient.mjs';

// Agent Address owns OAuth. This Worker is only an OAuth-protected resource.
export class ResourceServer {
  constructor(env, fetchImpl = globalThis.fetch) {
    this.addressURL = HTTPClient.requireOrigin(env.ADDRESS_API_URL);
    this.fetchImpl = fetchImpl;
  }

  metadata(origin) {
    return {
      resource: origin + '/mcp',
      authorization_servers: [this.addressURL],
      bearer_methods_supported: ['header'],
    };
  }

  challenge(origin, invalid = false) {
    const metadata = origin + '/.well-known/oauth-protected-resource/mcp';
    const fields = ['resource_metadata="' + metadata + '"'];
    if (invalid) {
      fields.push('error="invalid_token"');
    }

    return new Response(null, {
      status: 401,
      headers: {
        'www-authenticate': 'Bearer ' + fields.join(', '),
        'cache-control': 'no-store',
      },
    });
  }

  async authenticate(request) {
    const origin = new URL(request.url).origin;
    const authorization = request.headers.get('authorization');
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      return this.challenge(origin);
    }

    const response = await this.fetchImpl(this.addressURL + '/v1/account/status', {
      headers: { authorization, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 || response.status === 403) {
      return this.challenge(origin, true);
    }

    if (!response.ok) {
      throw new Error('Agent Address authentication is unavailable: HTTP ' + response.status);
    }

    const payload = await response.json();
    if (payload?.ok !== true) {
      throw new Error('Agent Address did not confirm the OAuth account.');
    }

    return authorization;
  }
}
