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
  // Unit tests delegate through a controllable fetch; the runtime always uses
  // the same-account Service Bindings declared in wrangler.jsonc.
  ADDRESS_WORKER: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  },
  RELAY_WORKER: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  },
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
  assert.match(expected, /relayVerifyWake/);
  assert.match(expected, /relayBeginWakePairing/);
  assert.match(expected, /into the browser form, never into Agent chat/);
  assert.match(expected, /sendToAgent/);
  assert.match(expected, /Capabilities and prerequisites/);
  assert.match(expected, /Status, safety, and removal/);
  assert.match(expected, /into the browser form, never into Agent chat/);
  assert.match(expected, /Manual use/);
  // External Skill: a capability contract, not internal architecture or history.
  const internalOnly = [
    /github(?:\.com)?/i,
    /mail[\s_-]?trigger/i,
    /relayProvisionHostMailbox/,
    /nuwa-(?:mis|wekan|mail)/i,
    /\b(?:ngrok|tunnel|wrangler|d1|worker bindings)\b/i,
    /(?:changelog|revision history|change log|修訂紀錄)/i,
    /(?:company internal|company-approved|officially approved)/i,
  ];

  for (const pattern of internalOnly) {
    assert.doesNotMatch(expected, pattern);
  }

  assert.match(expected, /does not imply affiliation/);
  assert.match(expected, /selected Work/);
  assert.match(expected, /EXPECTED_WORK_ID/);
  const forbidden = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md',
    { method: 'POST' },
  ));
  assert.equal(forbidden.status, 404);
});

test('Wake Skill separates one-time verification from minimal trusted message dispatch', () => {
  const skill = readFileSync(new URL('../../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8');
  const verification = skill.split('### One-time verification handshake')[1]
    ?.split('### Fast path for verified message events')[0];
  const fastPath = skill.split('### Fast path for verified message events')[1]
    ?.split('## Normal messaging')[0];

  assert.ok(verification, 'Skill must explain the one-time verification handshake');
  assert.match(verification, /nuwa\.wake\.verification/);
  assert.match(verification, /relayVerifyWake/);
  assert.match(verification, /verificationId/);
  assert.match(verification, /challenge/);

  assert.ok(fastPath, 'Skill must provide a dedicated post-verification fast path');
  assert.match(fastPath, /nuwa\.message\.available/);
  assert.match(fastPath, /workAddressId/);
  assert.match(fastPath, /messageId/);
  assert.match(fastPath, /relayMessage/);
  assert.match(fastPath, /agentAddressGetStatus/);
  assert.match(fastPath, /tools\/list/);
  assert.match(fastPath, /relayAcknowledgeRead/);
  assert.match(fastPath, /automatically|automated|Automation/);
  assert.match(skill, /masked|redacted|masked-out/i);
  assert.match(skill, /relayRegisterWake/);
  assert.match(skill, /trusted.*webhook|authenticated.*webhook/i);
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
  assert.equal(seen[0].request.redirect, 'manual');
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
    assert.doesNotMatch(toolsResponse, /MailTrigger|GrokBot|OpenMausBot/);
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

test('relayBeginWakePairing passes only the Work ID, never a masked webhook key', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ path: string; method: string; body: BodyInit | null | undefined }> = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === env.ADDRESS_API_URL) {
      return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
    }

    requests.push({ path: url.pathname + url.search, method: init?.method ?? 'GET', body: init?.body });

    return Response.json({
      ok: true,
      data: {
        status: 'awaiting_user',
        workAddressId: 'work-b',
        pairingUrl: 'https://agent-relay.company-notes.com/wake-pair/' + 'a'.repeat(64),
      },
    }, { status: 201 });
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
        jsonrpc: '2.0', id: 33, method: 'tools/call',
        params: {
          name: 'relayBeginWakePairing',
          arguments: { workAddressID: 'work-b' },
        },
      }),
    }));

    assert.equal(response.status, 200);
    const result = await response.json() as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    assert.equal(result.result.isError, undefined);
    assert.match(result.result.content[0].text, /awaiting_user/);
    assert.deepEqual(requests, [{
      path: '/v1/wake-pairings?work_address_id=work-b',
      method: 'POST',
      body: undefined,
    }]);
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

test('remote MCP forwards Bearer Wake registration and OAuth verification without leaking secrets', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; body: Record<string, string>; authorization: string | null }> = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));

    if (url.origin === env.ADDRESS_API_URL) {
      return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
    }

    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    calls.push({
      path: url.pathname, body,
      authorization: new Headers(init?.headers).get('authorization'),
    });

    return Response.json({ ok: true, data: {
      status: calls.length === 1 ? 'pending_verification' : 'active',
      workAddressId: 'work-b',
      callbackHost: 'api2.cursor.sh',
      verificationId: '5e1f1504-c00e-4434-b783-37b1ba2a0670',
    } }, { status: 201 });
  };

  async function toolCall(name: string, args: Record<string, unknown>) {
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
        jsonrpc: '2.0', id: 13, method: 'tools/call',
        params: { name, arguments: { workAddressID: 'work-b', ...args } },
      }),
    }));
    const payload = await response.json() as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    assert.equal(response.status, 200);
    assert.equal(payload.result.isError, undefined);
    return JSON.parse(payload.result.content[0].text);
  }

  try {
    const callbackURL = 'https://api2.cursor.sh/automations/webhook/private-id';
    const bearerToken = 'GrokBot-super-secret-bearer';
    const pending = await toolCall('relayRegisterWake', {
      callbackURL, authMode: 'bearer', bearerToken,
    });
    assert.equal(pending.status, 'pending_verification');
    assert.equal(JSON.stringify(pending).includes(bearerToken), false);

    const confirmed = await toolCall('relayVerifyWake', {
      verificationID: '5e1f1504-c00e-4434-b783-37b1ba2a0670',
      challenge: 'received-secret-not-for-chat',
    });
    assert.equal(confirmed.status, 'active');
    assert.deepEqual(calls, [
      {
        path: '/v1/wake-subscription',
        body: { callbackUrl: callbackURL, authMode: 'bearer', bearerToken },
        authorization: 'Bearer oauth-b',
      },
      {
        path: '/v1/wake-subscription/verification',
        body: {
          verificationId: '5e1f1504-c00e-4434-b783-37b1ba2a0670',
          challenge: 'received-secret-not-for-chat',
        },
        authorization: 'Bearer oauth-b',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OAuth upstream network errors become a controlled 502 rather than a 500', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('failed to fetch'); };
  try {
    const app = new HTTPMCPApplication(env);
    const result = await app.handle(new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer sample', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'tools/list' }),
    }));
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error:'oauth_upstream_unavailable' });
  } finally { globalThis.fetch = originalFetch; }
});

test('MCP tools/list works with a valid OAuth token and returns registered tools', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok:true, data:{ organization:{id:'org-test'} } });
  try {
    const app = new HTTPMCPApplication(env);
    const result = await app.handle(new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization:'Bearer oauth-test',
        accept:'application/json, text/event-stream',
        'content-type':'application/json',
        'mcp-protocol-version':'2025-06-18',
      },
      body: JSON.stringify({ jsonrpc:'2.0', id:7, method:'tools/list', params:{} }),
    }));
    assert.equal(result.status, 200);
    const data = await result.json() as {result:{tools:Array<{name:string}>}};
    assert.ok(data.result.tools.some(t => t.name === 'sendToAgent'));
    assert.ok(data.result.tools.some(t => t.name === 'relayRegisterWake'));
  } finally { globalThis.fetch = originalFetch; }
});

test('regression: authenticated GrokBot 502 must identify upstream HTTP failure without leaking secrets', async () => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };

  try {
    const auth = new OAuthResourceServer(env, async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer private-oauth-token');
      return Response.json({ error: 'upstream-private-body' }, { status: 500 });
    });

    const result = await auth.authenticate(new Request('https://mcp.example.com/mcp', {
      headers: { authorization: 'Bearer private-oauth-token' },
    }));

    assert.ok(result instanceof Response);
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error: 'oauth_upstream_unavailable' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0][0], 'mcp.oauth_upstream_failure');
    assert.deepEqual(entries[0][1], { phase: 'http_response', status: 500 });
    assert.equal(JSON.stringify(entries).includes('private-oauth-token'), false);
    assert.equal(JSON.stringify(entries).includes('upstream-private-body'), false);
  } finally {
    console.error = original;
  }
});

test('regression: authenticated GrokBot upstream fetch exception must log only its safe type', async () => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };

  try {
    const auth = new OAuthResourceServer(env, async () => {
      throw new TypeError('private-oauth-token must not enter Cloudflare logs');
    });

    const result = await auth.authenticate(new Request('https://mcp.example.com/mcp', {
      headers: { authorization: 'Bearer private-oauth-token' },
    }));

    assert.ok(result instanceof Response);
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error: 'oauth_upstream_unavailable' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0][0], 'mcp.oauth_upstream_failure');
    assert.deepEqual(entries[0][1], { phase: 'fetch_exception', errorType: 'TypeError' });
    assert.equal(JSON.stringify(entries).includes('private-oauth-token'), false);
  } finally {
    console.error = original;
  }
});

test('tool execution failures are reported centrally without exposing exception messages', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const logs: unknown[][] = [];

  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    if (url.hostname === 'address.company-notes.com') {
      return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
    }

    throw new TypeError('private-bearer-marker and secret callback path');
  };

  try {
    const app = new HTTPMCPApplication(env);
    const result = await app.handle(new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer private-bearer-marker',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 47,
        method: 'tools/call',
        params: {
          name: 'relayWakeEvents',
          arguments: { workAddressID: 'work-b' },
        },
      }),
    }));

    assert.equal(result.status, 200);
    const payload = await result.json() as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.content[0].text, 'Unexpected backend service failure.');
    assert.deepEqual(logs, [[
      'mcp.tools.tool_execution_failed',
      { tool: 'relayWakeEvents', errorType: 'TypeError' },
    ]]);
    assert.doesNotMatch(JSON.stringify(logs), /private-bearer-marker|secret callback path/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalLog;
  }
});

test('regression: cross-Worker OAuth and Tool calls must use service bindings instead of public fetch', async () => {
  const originalFetch = globalThis.fetch;
  let oauthCalls = 0;
  let addressCalls = 0;
  let relayCalls = 0;

  const boundEnv = {
    ...env,
    ADDRESS_WORKER: {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const url = new URL(String(input));
        assert.equal(url.origin, env.ADDRESS_API_URL);
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer GrokBot-oauth');

        if (url.pathname === '/v1/account/status') {
          oauthCalls += 1;
          return Response.json({ ok: true, data: { organization: { id: 'org-1' } } });
        }

        addressCalls += 1;
        return Response.json({ ok: true, data: { work: { id: 'work-b' } } });
      },
    },
    RELAY_WORKER: {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const url = new URL(String(input));
        assert.equal(url.origin, env.RELAY_API_URL);
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer GrokBot-oauth');
        relayCalls += 1;
        return Response.json({ ok: true, data: { id: 'message-1', threadId: 'thread-1' } });
      },
    },
  };

  globalThis.fetch = async () => {
    throw new TypeError('Public worker-to-worker fetch must never be used');
  };

  try {
    const app = new HTTPMCPApplication(boundEnv);

    async function callMCP(method: string, params: Record<string, unknown>) {
      return app.handle(new Request('https://mcp.agent-relay.company-notes.com/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer GrokBot-oauth',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 10, method, params }),
      }));
    }

    const listing = await callMCP('tools/list', {});
    assert.equal(listing.status, 200);
    assert.match(await listing.text(), /sendToAgent/);

    const address = await callMCP('tools/call', {
      name: 'agentAddressGetStatus', arguments: {},
    });
    assert.equal(address.status, 200);
    assert.match(await address.text(), /org-1/);

    const message = await callMCP('tools/call', {
      name: 'sendToAgent',
      arguments: { workAddressID: 'work-a', to: '@beta/reviewer', message: 'Hello B' },
    });
    assert.equal(message.status, 200);
    assert.match(await message.text(), /message-1/);

    // Three OAuth guards plus the explicit agentAddressGetStatus Tool call.
    assert.equal(oauthCalls, 4);
    assert.equal(relayCalls, 1);
    assert.equal(addressCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production MCP declares same-account Agent Address and Relay service bindings', () => {
  const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')) as {
    services?: Array<{ binding: string; service: string }>;
  };
  assert.deepEqual(config.services, [
    { binding: 'ADDRESS_WORKER', service: 'agent-address' },
    { binding: 'RELAY_WORKER', service: 'nuwa-agent-relay-api' },
  ]);
});

test('regression: Cloudflare Workers OAuth fetch must not use unsupported redirect:error', async () => {
  let calls = 0;
  const auth = new OAuthResourceServer(env, async (_input, init) => {
    calls += 1;
    // Workers throws TypeError on redirect:error even with a valid token.
    if (init?.redirect !== 'manual') {
      throw new TypeError('Cloudflare Workers does not implement redirect:error');
    }
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer opaque-test');
    return Response.json({ ok: true, data: { organization: { id: 'org-test' } } });
  });

  const response = await auth.authenticate(new Request('https://mcp.example.com/mcp', {
    headers: { authorization: 'Bearer opaque-test' },
  }));

  assert.equal(response, 'Bearer opaque-test');
  assert.equal(calls, 1);
});

test('regression: API client uses Workers-compatible manual redirects', async () => {
  const client = new HTTPAPIClient('https://address.company-notes.com', 'Bearer opaque-test',
    async (_input, init) => {
      if (init?.redirect !== 'manual') {
        throw new TypeError('Cloudflare Workers does not implement redirect:error');
      }
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer opaque-test');
      return Response.json({ ok: true, data: { work: { id: 'work-test' } } });
    });

  assert.deepEqual(await client.request('GET', '/v1/account/status'), {
    work: { id: 'work-test' },
  });
});

test('regression: backend redirects are rejected without following or leaking OAuth', async () => {
  let calls = 0;
  const client = new HTTPAPIClient('https://address.company-notes.com', 'Bearer opaque-test',
    async (_input, init) => {
      calls += 1;
      assert.equal(init?.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { location: 'https://unexpected.example/steal-token' },
      });
    });

  await assert.rejects(client.request('GET', '/v1/account/status'), /redirect/i);
  assert.equal(calls, 1);
});

test('regression: OAuth validation rejects redirect responses instead of accepting them', async () => {
  const auth = new OAuthResourceServer(env, async (_input, init) => {
    assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/' } });
  });
  const result = await auth.authenticate(new Request('https://mcp.example.com/mcp', {
    headers: { authorization: 'Bearer opaque-test' },
  }));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 502);
});
