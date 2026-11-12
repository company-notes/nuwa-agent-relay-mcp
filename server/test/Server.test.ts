import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HTTPAPIClient } from '../src/APIClients';
import { HTTPMCPApplication } from '../src/Index';
import { OAuthResourceServer } from '../src/OAuthResourceServer';

const env = {
  RELAY_API_URL: 'https://agent-relay.company-notes.com',
  ADDRESS_API_URL: 'https://address.company-notes.com',
  ADDRESS_WORKER: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  },
  RELAY_WORKER: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  },
};

const sessionID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const runtimeToken = 'runtime-capability-do-not-log';
const messageID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const threadID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

class MCPScenario {
  private readonly originalFetch = globalThis.fetch;
  readonly calls: Array<{ url: URL; method: string; body?: unknown; headers: Headers }> = [];
  readonly application = new HTTPMCPApplication(env);

  install(handleRelay: (url: URL, init?: RequestInit) => Response): void {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));

      if (url.origin === env.ADDRESS_API_URL) {
        assert.equal(url.pathname, '/v2/account/status');

        return Response.json({
          ok: true,
          data: { account: { email: 'test@example.com' }, organization: { id: 'org-a' } },
        });
      }

      assert.equal(url.origin, env.RELAY_API_URL);
      this.calls.push({
        url, method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
      });

      return handleRelay(url, init);
    };
  }

  async tool(name: string, args: Record<string, unknown>) {
    const response = await this.application.handle(new Request(
      'https://mcp.agent-relay.company-notes.com/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer oauth-test',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-06-18',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      },
    ));

    assert.equal(response.status, 200);
    return response.json() as Promise<{
      result: { content: Array<{ text: string }>; isError?: boolean };
    }>;
  }

  restore(): void {
    globalThis.fetch = this.originalFetch;
  }
}

test('publishes a V2-only public Skill without exposing internal mail infrastructure', async () => {
  const expected = readFileSync(
    new URL('../../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8',
  );
  const app = new HTTPMCPApplication(env);
  const response = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md',
  ));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), expected);
  assert.match(expected, /^---\nname: nuwa-agent-relay\n/);
  assert.match(expected, /sendToAgent/);
  assert.match(expected, /relayReplyThread/);
  assert.match(expected, /relayBeginWakePairing/);
  assert.doesNotMatch(expected, /MailTrigger|github\.com|\bHost\b|\bWork\b|work_address_id/);
});

test('OAuth metadata and challenge remain independent of Session Runtime capabilities', async () => {
  const app = new HTTPMCPApplication(env);
  const metadata = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/.well-known/oauth-protected-resource/mcp',
  ));
  assert.equal(metadata.status, 200);
  assert.deepEqual(await metadata.json(), {
    resource: 'https://mcp.agent-relay.company-notes.com/mcp',
    authorization_servers: [env.ADDRESS_API_URL],
    bearer_methods_supported: ['header'],
  });

  const missing = await app.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/mcp',
    { method: 'POST', body: '{}' },
  ));

  assert.equal(missing.status, 401);
  assert.match(missing.headers.get('www-authenticate') ?? '', /oauth-protected-resource\/mcp/);

  const invalid = await new OAuthResourceServer(env, async () =>
    new Response(null, { status: 401 })).authenticate(new Request(
      'https://mcp.agent-relay.company-notes.com/mcp',
      { headers: { authorization: 'Bearer invalid' } },
    ));

  assert.ok(invalid instanceof Response);
  assert.equal(invalid.status, 401);
});

test('HTTP API client only forwards OAuth and Runtime capabilities to the authorized origin', async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const client = new HTTPAPIClient(env.RELAY_API_URL, 'Bearer oauth', async (url, init) => {
    calls.push({ url: new URL(String(url)), headers: new Headers(init?.headers) });

    return Response.json({ ok: true, data: { accepted: true } });
  });
  const result = await client.request('POST', '/v2/messages', {
    sessionID, runtimeToken, body: { to: 'org/agent/main', body: 'hello' },
  });

  assert.deepEqual(result, { accepted: true });
  assert.equal(calls[0].url.searchParams.get('session_id'), sessionID);
  assert.equal(calls[0].headers.get('x-nuwa-runtime-token'), runtimeToken);
  assert.equal(calls[0].headers.get('authorization'), 'Bearer oauth');
  assert.doesNotMatch(calls[0].url.toString(), /runtime-capability/);

  await assert.rejects(client.request('GET', '//attacker.invalid/private'), /relative/);
  await assert.rejects(client.request('GET', '/\\attacker.invalid/private'), /escaped/);
});

test('sendToAgent submits once using the active Session and its Runtime capability', async () => {
  const scenario = new MCPScenario();
  scenario.install(() => Response.json({
    ok: true,
    data: { id: messageID, threadId: threadID },
  }, { status: 201 }));

  try {
    const response = await scenario.tool('sendToAgent', {
      sessionID, runtimeToken,
      to: 'nuwa/reviewer/main',
      message: 'Please review the deployment.',
      subject: 'Review request',
    });

    assert.equal(response.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.pathname, '/v2/messages');
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), sessionID);
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'), runtimeToken);
    assert.deepEqual(scenario.calls[0].body, {
      to: 'nuwa/reviewer/main',
      body: 'Please review the deployment.',
      subject: 'Review request',
    });
    assert.doesNotMatch(JSON.stringify(response), /runtime-capability/);
  } finally {
    scenario.restore();
  }
});

test('message context and replies retain the Relay Thread across MCP executions', async () => {
  const scenario = new MCPScenario();
  scenario.install((url) => {
    if (url.pathname === '/v2/messages/' + messageID) {
      return Response.json({
        ok: true, data: {
          id: messageID, threadId: threadID, body: 'New request',
          recentThreadMessages: [{ body: 'Earlier context', bodyTruncated: false }],
        },
      });
    }

    assert.equal(url.pathname, '/v2/threads/' + threadID + '/messages');
    return Response.json({ ok: true, data: { id: messageID, threadId: threadID } }, {
      status: 201,
    });
  });

  try {
    const read = await scenario.tool('relayMessage', {
      sessionID, runtimeToken, messageID, contextLimit: 8,
    });
    assert.equal(read.result.isError, undefined);
    const data = JSON.parse(read.result.content[0].text);
    assert.equal(data.recentThreadMessages[0].body, 'Earlier context');

    const reply = await scenario.tool('relayReplyThread', {
      sessionID, runtimeToken, threadID, body: 'Same Thread reply.',
    });
    assert.equal(reply.result.isError, undefined);
    assert.equal(scenario.calls.length, 2);
    assert.equal(scenario.calls[0].url.searchParams.get('context_limit'), '8');
    assert.deepEqual(scenario.calls[1].body, { body: 'Same Thread reply.' });
  } finally {
    scenario.restore();
  }
});

test('denies Relay operations without a Runtime capability before forwarding HTTP', async () => {
  const scenario = new MCPScenario();
  scenario.install(() => {
    assert.fail('A missing Runtime capability must not reach Relay.');
  });

  try {
    const response = await scenario.tool('sendToAgent', {
      sessionID, to: 'nuwa/reviewer/main', message: 'Not authorized',
    });
    assert.equal(response.result.isError, true);
    assert.equal(scenario.calls.length, 0);
  } finally {
    scenario.restore();
  }
});

test('Agent directory is independent of Session execution authority', async () => {
  const scenario = new MCPScenario();
  const originalFetch = globalThis.fetch;
  let directoryCalls = 0;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, env.ADDRESS_API_URL);

    if (url.pathname === '/v2/account/status') {
      return Response.json({ ok: true, data: { organization: { id: 'org-a' } } });
    }

    assert.equal(url.pathname, '/v2/account/agents');
    directoryCalls += 1;
    return Response.json({ ok: true, data: [{ id: 'agent-a', handle: 'reviewer' }] });
  };

  try {
    const response = await scenario.tool('agentAddressListAgents', {});
    assert.equal(response.result.isError, undefined);
    assert.equal(directoryCalls, 1);
    assert.match(response.result.content[0].text, /reviewer/);
  } finally {
    globalThis.fetch = originalFetch;
    scenario.restore();
  }
});

test('Wake pairing forwards no provider credentials', async () => {
  const scenario = new MCPScenario();
  scenario.install(() => Response.json({
    ok: true,
    data: { status: 'awaiting_user', pairingUrl: 'https://example.com/one-time' },
  }, { status: 201 }));

  try {
    const response = await scenario.tool('relayBeginWakePairing', { sessionID, runtimeToken });

    assert.equal(response.result.isError, undefined);
    assert.equal(scenario.calls[0].url.pathname, '/v2/wake-pairings');
    assert.equal(scenario.calls[0].body, undefined);
    assert.doesNotMatch(JSON.stringify(response), /runtime-capability/);
  } finally {
    scenario.restore();
  }
});
