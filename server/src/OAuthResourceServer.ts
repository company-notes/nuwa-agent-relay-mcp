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
    } catch {
      // Unreachable identity provider must not surface as an unexplained MCP 500.
      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    if (status.status === 401 || status.status === 403) {
      return this.challenge(origin, true);
    }

    if (!status.ok) {
      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    return authorization;
  }
}
