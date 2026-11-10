import type { Env } from './Env';

export class OAuthResourceServer {
  private static readonly RESOURCE_PATH = '/mcp';

  constructor(
    private readonly env: Env,
    private readonly requester: typeof fetch = fetch,
  ) {}

  metadata(origin: string): Record<string, unknown> {
    return {
      resource: origin + OAuthResourceServer.RESOURCE_PATH,
      authorization_servers: [this.env.ADDRESS_API_URL],
      bearer_methods_supported: ['header'],
    };
  }

  private challenge(origin: string, invalid = false): Response {
    const metadataURL = origin + '/.well-known/oauth-protected-resource/mcp';
    const reason = invalid ? ', error="invalid_token"' : '';

    return new Response(null, {
      status: 401,
      headers: {
        'www-authenticate': 'Bearer resource_metadata="' + metadataURL + '"' + reason,
        'cache-control': 'no-store',
      },
    });
  }

  async authenticate(request: Request): Promise<string | Response> {
    const origin = new URL(request.url).origin;
    const authorization = request.headers.get('authorization');

    if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
      return this.challenge(origin);
    }

    // The backend is the single source of truth for OAuth account validity.
    // No bearer token is cached across clients or MCP requests.
    const url = new URL('/v1/account/status', this.env.ADDRESS_API_URL);
    let status: Response;

    try {
      status = await this.requester(url, {
        method: 'GET',
        headers: { authorization },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      // No exception messages, authorization headers, token values, or target
      // URLs in logs. Distinguish fetch failures from an upstream HTTP error.
      console.error('mcp.oauth_upstream_failure', {
        phase: 'fetch_exception',
        errorType: error instanceof Error ? error.name : 'unknown',
      });

      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    if (status.status === 401 || status.status === 403) {
      return this.challenge(origin, true);
    }

    if (!status.ok) {
      // Auth rejection is handled above as 401. Record only the status class
      // returned by Agent Address, never its response body or any credential.
      console.error('mcp.oauth_upstream_failure', {
        phase: 'http_response',
        status: status.status,
      });

      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    return authorization;
  }
}
