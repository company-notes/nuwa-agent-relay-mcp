import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

import type { BackgroundTasks, Env } from './Env';
import { NuwaMCPServer } from './MCPServer';
import { AGENT_SKILL_MD } from './SkillDocument';
import { AGENT_SKILL_REFERENCES } from './SkillReferences';
import { OAuthResourceServer, type AuthenticatedRequest } from './OAuthResourceServer';
import { AddressAPIClient, APIError } from './APIClients';
import { Logger } from './Logger';
import { SessionBindings } from './SessionBindings';
import { SessionBindingController } from './SessionBindingController';
import { OnboardingPage } from './OnboardingPage';
import { WorkContext } from './WorkContext';
import { ManagementBindingCleanup } from './ManagementBindingCleanup';

export class HTTPMCPApplication {
  private static readonly logger = Logger.forModule('mcp');
  constructor(
    private readonly env: Env,
    private readonly tasks: BackgroundTasks,
  ) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const onboarding = OnboardingPage.response(url.pathname, request.method);

    if (onboarding) {
      return onboarding;
    }

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

    const referencePrefix = '/skills/nuwa-agent-relay/references/';

    if (url.pathname.startsWith(referencePrefix) && request.method === 'GET') {
      const name = url.pathname.slice(referencePrefix.length);
      const content = Object.hasOwn(AGENT_SKILL_REFERENCES, name)
        ? AGENT_SKILL_REFERENCES[name]
        : undefined;

      if (content) {
        return new Response(content, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': 'public, max-age=300',
            'x-content-type-options': 'nosniff',
          },
        });
      }

      return new Response('Not found', { status: 404 });
    }

    const oauth = new OAuthResourceServer(this.env);

    if (url.pathname === '/.well-known/oauth-protected-resource/mcp' &&
      request.method === 'GET') {
      return Response.json(oauth.metadata(url.origin));
    }

    const resetMatch = url.pathname.match(
      /^\/v2\/management\/agents\/([0-9a-f-]{36})\/bindings$/,
    );

    if (url.pathname !== '/mcp' && url.pathname !== '/session-bindings' && !resetMatch) {
      return new Response('Not found', { status: 404 });
    }

    let result: AuthenticatedRequest | Response;

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

    const address = new AddressAPIClient(this.env, result.authorization, undefined, result.status);

    if (resetMatch) {
      try {
        return await new ManagementBindingCleanup(this.env, address).handle(request, resetMatch[1]);
      } catch (error) {
        HTTPMCPApplication.logger.exception('management_binding_cleanup_failed', error);

        return SessionBindingController.error(error);
      }
    }

    if (url.pathname === '/session-bindings') {
      try {
        return await new SessionBindingController(
          new SessionBindings(this.env, address),
        ).handle(request);
      } catch (error) {
        HTTPMCPApplication.logger.exception('session_binding_failed', error);

        return SessionBindingController.error(error);
      }
    }

    let work: WorkContext | undefined;

    try {
      work = WorkContext.fromHeaders(request.headers);
    } catch (error) {
      if (error instanceof APIError) {
        return Response.json({ error: error.code }, { status: error.status });
      }

      throw error;
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
      const server = new NuwaMCPServer(
        this.env, result.authorization, address, this.tasks, work,
      ).createServer();

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
  fetch(request: Request, env: Env, context: BackgroundTasks): Promise<Response> {
    return new HTTPMCPApplication(env, context).handle(request);
  },
};
