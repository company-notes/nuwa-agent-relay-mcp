import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HTTPAPIClient } from '../src/APIClients';
import { HTTPMCPApplication } from '../src/Index';
import { OAuthResourceServer } from '../src/OAuthResourceServer';

const env = {
  RELAY_API_URL: 'https://agent-relay.company-notes.com',
  ADDRESS_API_URL: 'https://address.company-notes.com',
};

test('production Worker is bound only to the intended custom hostname', () => {
  const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')) as {
    workers_dev: boolean;
    routes: Array<{ pattern: string; custom_domain: boolean }>;
  };

  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.routes, [{
    pattern: 'mcp.agent-relay.company-notes.com',
    custom_domain: true,
  }]);
});

test('remote resource metadata points to Agent Address as OAuth authority', async () => {
  const app = new HTTPMCPApplication(env);
  const response = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/.well-known/oauth-protected-resource/mcp',
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    resource: 'https://mcp.agent-relay.company-notes.com/mcp',
    authorization_servers: ['https://address.company-notes.com'],
    bearer_methods_supported: ['header'],
  });
});

test('remote MCP requires OAuth before constructing an MCP session', async () => {
  const app = new HTTPMCPApplication(env);
  const response = await app.handle(new Request('https://mcp.example.com/mcp', {
    method: 'POST', body: '{}',
  }));

  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate') || '',
    /oauth-protected-resource\/mcp/);
});

test('invalid OAuth Bearer tokens are challenged with RFC 9728 metadata', async () => {
  const oauth = new OAuthResourceServer(env, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer invalid');
    return new Response(null, { status: 401 });
  });

  const response = await oauth.authenticate(new Request('https://mcp.example.com/mcp', {
    headers: { authorization: 'Bearer invalid' },
  }));

  assert.ok(response instanceof Response);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate') || '', /invalid_token/);
});

test('shared HTTP client isolates bearer identity, REST origin and Work ID', async () => {
  const seen: Array<{ url: URL; request: RequestInit }> = [];
  const client = new HTTPAPIClient(env.RELAY_API_URL, 'Bearer secret', async (url, init) => {
    seen.push({ url: new URL(String(url)), request: init || {} });
    return Response.json({ ok: true, data: { success: true } });
  });

  const result = await client.request('POST', '/v1/messages', {
    workAddressID: 'work-test',
    body: { to: 'org/host/work', body: 'Message' },
  });

  assert.deepEqual(result, { success: true });
  assert.equal(seen[0].url.searchParams.get('work_address_id'), 'work-test');

  assert.equal(new Headers(seen[0].request.headers).get('authorization'), 'Bearer secret');
  assert.equal(seen[0].request.redirect, 'error');
  assert.equal(seen[0].url.href.includes('secret'), false);

  await assert.rejects(client.request('GET', '//evil.example/steal'), /relative/);
  await assert.rejects(client.request('GET', '/\\evil.example/steal'), /escaped/);
});

test('a validated OAuth identity can initialize an independent MCP HTTP session', async () => {
  const originalFetch = globalThis.fetch;
  let validated = 0;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    assert.equal(url.origin, env.ADDRESS_API_URL);
    assert.equal(url.pathname, '/v1/account/status');
    validated += 1;
    return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
  };

  try {
    const app = new HTTPMCPApplication(env);
    const response = await app.handle(new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-account-oauth',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.text();
    assert.match(payload, /nuwa-agent-relay/);
    assert.equal(validated, 1);

    const list = await app.handle(new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-account-oauth',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    }));

    assert.equal(list.status, 200);
    const toolsResponse = await list.text();
    assert.match(toolsResponse, /relayInbox/);
    assert.match(toolsResponse, /agentAddressGetStatus/);
    assert.equal(validated, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
