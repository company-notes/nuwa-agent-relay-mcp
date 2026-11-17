import type { Env } from './Env';
import { Logger } from './Logger';

export type AuthenticatedRequest = {
  authorization: string;
  status: Response;
};

export class OAuthResourceServer {
  private static readonly logger = Logger.forModule('mcp');
  private static readonly RESOURCE_PATH = '/mcp';

  constructor(
    private readonly env: Env,
    private readonly requester: typeof fetch = (input, init) => env.ADDRESS_WORKER.fetch(input, init),
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

  async authenticate(request: Request): Promise<AuthenticatedRequest | Response> {
    const origin = new URL(request.url).origin;
    const authorization = request.headers.get('authorization');

    if (!authorization || !/^Bearer\s+\S+$/.test(authorization)) {
      return this.challenge(origin);
    }

    // The backend is the single source of truth for OAuth account validity.
    // No bearer token is cached across clients or MCP requests.
    const url = new URL('/v2/account/status', this.env.ADDRESS_API_URL);
    let status: Response;

    try {
      status = await this.requester(url, {
        method: 'GET',
        headers: { authorization },
        // Workers does not implement redirect: 'error'; manual rejects 3xx below.
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      // No exception messages, authorization headers, token values, or target
      // URLs in logs. Distinguish fetch failures from an upstream HTTP error.
      OAuthResourceServer.logger.exception('oauth_upstream_failure', error, {
        phase: 'fetch_exception',
      });

      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    if (status.status === 401 || status.status === 403) {
      return this.challenge(origin, true);
    }

    if (!status.ok) {
      // Auth rejection is handled above as 401. Record only the status class
      // returned by Agent Address, never its response body or any credential.
      OAuthResourceServer.logger.error('oauth_upstream_failure', {
        phase: 'http_response',
        status: status.status,
      });

      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    return { authorization, status };
  }
}
