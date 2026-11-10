import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HTTPAPIClient } from '../src/APIClients';
import { HTTPMCPApplication } from '../src/Index';
import { AGENT_SKILL_MD } from '../src/SkillDocument';
import { OAuthResourceServer } from '../src/OAuthResourceServer';

const env = {
  RELAY_API_URL: 'https://agent-relay.company-notes.com',
  ADDRESS_API_URL: 'https://address.company-notes.com',
};

test('public Agent Skill matches the checked-in SKILL.md without OAuth', async () => {
  const expected = readFileSync(new URL('../../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8');
  const app = new HTTPMCPApplication(env);
  const response = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md',
  ));

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/markdown/);
  assert.equal(await response.text(), expected);
  assert.equal(AGENT_SKILL_MD, expected);
  assert.match(expected, /^---\nname: nuwa-agent-relay\n/);
  assert.match(expected, /WAKE_ALLOWED_HOSTS/);
  assert.match(expected, /No supported inbound webhook/);

  const forbidden = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md',
    { method: 'POST' },
  ));
  assert.equal(forbidden.status, 404);
});

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
    assert.match(toolsResponse, /sendToAgent/);
    assert.match(toolsResponse, /relayRegisterWake/);
    assert.match(toolsResponse, /relayRemoveWake/);
    assert.match(toolsResponse, /agentAddressGetStatus/);
    assert.equal(validated, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendToAgent MCP tool sends one Work-scoped message via Relay without claiming Agent delivery', async () => {
  const app = new HTTPMCPApplication(env);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const expected = {
    id: 'msg-123',
    threadId: 'thread-456',
    messageId: 'msg-123',
  };

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';

    if (url.origin === env.ADDRESS_API_URL) {
      assert.equal(url.pathname, '/v1/account/status');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sender-oauth');

      return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
    }

    assert.equal(url.origin, env.RELAY_API_URL);
    requests.push({ url, method, body: JSON.parse(String(init?.body)) });
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sender-oauth');

    return Response.json({ ok: true, data: expected }, { status: 201 });
  };

  try {
    const response = await app.handle(new Request('https://mcp.agent-relay.company-notes.com/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sender-oauth',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sendToAgent',
          arguments: {
            workAddressID: 'work-a',
            to: '@beta/reviewer',
            message: 'Please review the latest deployment.',
            subject: 'Review request',
            artifactLinks: ['https://files.example.com/report'],
          },
        },
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };

    assert.equal(payload.result.isError, undefined);
    assert.deepEqual(JSON.parse(payload.result.content[0].text), expected);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url.pathname, '/v1/messages');
    assert.equal(requests[0].url.searchParams.get('work_address_id'), 'work-a');
    assert.deepEqual(requests[0].body, {
      to: '@beta/reviewer',
      body: 'Please review the latest deployment.',
      subject: 'Review request',
      artifactLinks: ['https://files.example.com/report'],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote MCP Wake registration is OAuth and Work-scoped and forwards callback URL exactly', async () => {
  const originalFetch = globalThis.fetch;
  const relayCalls: Array<{ url: URL; body: unknown; authorization: string | null }> = [];
  const callbackURL = 'https://agent-wake.example.com/wake';

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));

    if (url.origin === env.ADDRESS_API_URL) {
      return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
    }

    relayCalls.push({
      url,
      body: JSON.parse(String(init?.body)),
      authorization: new Headers(init?.headers).get('authorization'),
    });

    return Response.json({ ok: true, data: {
      workAddressId: 'work-b',
      callbackUrl: callbackURL,
      signingSecret: 'private-one-time-secret',
    } }, { status: 201 });
  };

  try {
    const app = new HTTPMCPApplication(env);
    const response = await app.handle(new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer oauth-b',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'relayRegisterWake',
          arguments: { workAddressID: 'work-b', callbackURL },
        },
      }),
    }));

    assert.equal(response.status, 200);
    const result = await response.json() as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };

    assert.equal(result.result.isError, undefined);
    assert.equal(JSON.parse(result.result.content[0].text).signingSecret,
      'private-one-time-secret');
    assert.equal(relayCalls.length, 1);
    assert.equal(relayCalls[0].url.origin, env.RELAY_API_URL);
    assert.equal(relayCalls[0].url.pathname, '/v1/wake-subscription');
    assert.equal(relayCalls[0].url.searchParams.get('work_address_id'), 'work-b');
    assert.equal(relayCalls[0].authorization, 'Bearer oauth-b');
    assert.deepEqual(relayCalls[0].body, { callbackUrl: callbackURL });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
