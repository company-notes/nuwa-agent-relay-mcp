import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

import type { Env } from './Env';
import { NuwaMCPServer } from './MCPServer';
import { AGENT_SKILL_MD } from './SkillDocument';
import { OAuthResourceServer } from './OAuthResourceServer';
import { Logger } from './Logger';

export class HTTPMCPApplication {
  private static readonly logger = Logger.forModule('mcp');
  constructor(private readonly env: Env) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ ok: true, data: { service: 'nuwa-agent-relay-mcp' } });
    }

    if (url.pathname === '/skills/nuwa-agent-relay/SKILL.md' &&
      request.method === 'GET') {
      return new Response(AGENT_SKILL_MD, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    const oauth = new OAuthResourceServer(this.env);

    if (url.pathname === '/.well-known/oauth-protected-resource/mcp' &&
      request.method === 'GET') {
      return Response.json(oauth.metadata(url.origin));
    }

    if (url.pathname !== '/mcp') {
      return new Response('Not found', { status: 404 });
    }

    let result: string | Response;

    try {
      result = await oauth.authenticate(request);
    } catch (error) {
      // Never log Bearer tokens, request bodies or upstream response payloads.
      HTTPMCPApplication.logger.exception('oauth_validation_failed', error);
      return Response.json({ error: 'oauth_upstream_unavailable' }, { status: 502 });
    }

    if (result instanceof Response) {
      return result;
    }

    // One isolated stateless MCP transport per request: no credentials or
    // session state may be reused between distinct OAuth principals.
    let stage = 'create_transport';

    try {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      stage = 'register_tools';
      const server = new NuwaMCPServer(this.env, result).createServer();

      stage = 'connect_transport';
      await server.connect(transport);

      stage = 'handle_mcp_request';
      return await transport.handleRequest(request);
    } catch (error) {
      // Report only the lifecycle stage and error type: never log OAuth headers,
      // tool arguments, callback URLs, request bodies or credential-bearing exceptions.
      const requestID = crypto.randomUUID();
      HTTPMCPApplication.logger.exception('request_failed', error, { stage, requestID });

      return Response.json(
        { error: 'mcp_internal_error', requestID },
        { status: 500 },
      );
    }
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return new HTTPMCPApplication(env).handle(request);
  },
};
