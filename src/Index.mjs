import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

import { HTTPClient } from './HTTPClient.mjs';
import { ResourceServer } from './ResourceServer.mjs';
import { RelayTools } from './Tools.mjs';

export class MCPWorker {
  static createServer(client) {
    const server = new McpServer({
      name: 'nuwa-agent-relay',
      version: '0.2.0',
    }, {
      instructions: 'First call agentAddressGetStatus, then claim or choose a Work ID. ' +
        'Pass that immutable workAddressId to every relay_* call. ' +
        'relay_send_message is ordinary conversation; relay_send_handoff transfers work. ' +
        'Do not treat MailTrigger submission as delivery or read acknowledgement. ' +
        'For local artifacts, prefer an existing FastFileLink URL rather than uploading files.',
    });

    new RelayTools(server, client).install();
    return server;
  }

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ ok: true, data: { service: 'nuwa-agent-relay-mcp', status: 'ok' } });
    }

    const resource = new ResourceServer(env);
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp' && request.method === 'GET') {
      return Response.json(resource.metadata(url.origin), {
        headers: { 'cache-control': 'public, max-age=300' },
      });
    }

    if (url.pathname !== '/mcp') {
      return new Response('Not found.', { status: 404 });
    }

    const authorization = await resource.authenticate(request);
    if (authorization instanceof Response) {
      return authorization;
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = MCPWorker.createServer(new HTTPClient(env, authorization));
    await server.connect(transport);
    return transport.handleRequest(request);
  }
}

export default new MCPWorker();
