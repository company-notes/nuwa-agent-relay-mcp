import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HTTPAPIClient } from '../src/APIClients';
import { OAuthResourceServer } from '../src/OAuthResourceServer';
import {
  MESSAGE_ID, RemoteMCPScenario, RESUME_SECRET, RUNTIME_SECRET, SESSION_A, SESSION_B,
  THREAD_ID,
} from './BindingScenario';

test('publishes the V2 Skill without exposing internal transport infrastructure', async () => {
  const scenario = new RemoteMCPScenario();
  const expected = readFileSync(
    new URL('../../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8',
  );
  const response = await scenario.application.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md',
  ));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), expected);
  assert.match(expected, /^---\nname: nuwa-agent-relay\n/);
  assert.match(expected, /sendToAgent/);
  assert.doesNotMatch(expected, /MailTrigger|github\.com|\bHost\b|\bWork\b|work_address_id/);
});

test('OAuth discovery and missing token remain protected without a Session binding', async () => {
  const scenario = new RemoteMCPScenario();
  const metadata = await scenario.application.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/.well-known/oauth-protected-resource/mcp',
  ));

  assert.equal(metadata.status, 200);
  assert.deepEqual(await metadata.json(), {
    resource: 'https://mcp.agent-relay.company-notes.com/mcp',
    authorization_servers: [scenario.env.ADDRESS_API_URL],
    bearer_methods_supported: ['header'],
  });

  const unauthorized = await scenario.application.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/mcp',
    { method: 'POST', body: '{}' },
  ));

  assert.equal(unauthorized.status, 401);

  const invalid = await new OAuthResourceServer(scenario.env, async () =>
    new Response(null, { status: 401 })).authenticate(new Request(
      'https://mcp.agent-relay.company-notes.com/mcp',
      { headers: { authorization: 'Bearer invalid' } },
    ));

  assert.ok(invalid instanceof Response);
  assert.equal(invalid.status, 401);
});

test('user binds a Session privately; Remote MCP sends with encrypted Runtime lease', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const before = await scenario.privateRequest('GET', 'oauth-a');

    assert.deepEqual(await before.json(), { ok: true, data: { bound: false } });

    const created = await scenario.bind();

    assert.equal(created.status, 201);
    const result = await created.json() as { data: { bound: boolean; sessionID: string } };
    assert.deepEqual({ bound: result.data.bound, sessionID: result.data.sessionID }, {
      bound: true, sessionID: SESSION_A,
    });
    assert.doesNotMatch(JSON.stringify(result), /runtime_private|resume_secret/);
    assert.equal(scenario.resumeCount, 1);
    assert.equal(scenario.database.rows.size, 1);

    const row = [...scenario.database.rows.values()][0];

    assert.equal(row.sessionID, SESSION_A);
    assert.doesNotMatch(JSON.stringify(row), /runtime_private|resume_secret|oauth-a/);

    const sent = await scenario.tool('sendToAgent', {
      to: 'nuwa/author/main',
      message: 'Please review the change.',
      subject: 'Review request',
    });

    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.pathname, '/v2/messages');
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_A);
    assert.equal(scenario.calls[0].headers.get('authorization'), 'Bearer oauth-a');
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);
    assert.deepEqual(scenario.calls[0].body, {
      to: 'nuwa/author/main', body: 'Please review the change.', subject: 'Review request',
    });
    assert.equal(scenario.heartbeatCount, 1);
    assert.doesNotMatch(JSON.stringify(sent), /runtime_private|resume_secret/);
  } finally {
    scenario.restore();
  }
});

test('tool schemas expose neither Runtime/Resume capabilities nor caller Session IDs', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const schemas = JSON.stringify(await scenario.toolSchemas());

    assert.match(schemas, /sendToAgent/);
    assert.match(schemas, /relayBeginWakePairing/);
    assert.doesNotMatch(schemas, /runtimeToken|resumeToken|runtime_token|sessionID/);
    assert.doesNotMatch(schemas, /bearerToken|signingSecret/);
  } finally {
    scenario.restore();
  }
});

test('OAuth principal isolation prevents another token from using the bound Runtime', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);

    const rejected = await scenario.tool('sendToAgent', {
      to: 'nuwa/author/main', message: 'Impersonation attempt',
    }, 'oauth-b');

    assert.equal(rejected.result.isError, true);
    assert.match(rejected.result.content[0].text, /binding/i);
    assert.equal(scenario.calls.length, 0);
    assert.equal((await scenario.privateRequest('GET', 'oauth-b')).status, 200);

    const target = await scenario.privateRequest('GET', 'oauth-b');
    assert.deepEqual(await target.json(), { ok: true, data: { bound: false } });
  } finally {
    scenario.restore();
  }
});

test('revoking a private binding releases the Lease and blocks future Relay requests', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);

    const revoked = await scenario.privateRequest('DELETE', 'oauth-a');

    assert.deepEqual(await revoked.json(), { ok: true, data: { revoked: true } });
    assert.equal(scenario.releaseCount, 1);
    assert.equal(scenario.database.rows.size, 0);

    const rejected = await scenario.tool('relayInbox', {});

    assert.equal(rejected.result.isError, true);
    assert.equal(scenario.calls.length, 0);
  } finally {
    scenario.restore();
  }
});

test('revoking a binding clears stale credentials even after Runtime lease was invalidated', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);
    scenario.activeLeases.delete(SESSION_A);

    const revoked = await scenario.privateRequest('DELETE', 'oauth-a');

    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), { ok: true, data: { revoked: true } });
    assert.equal(scenario.database.rows.size, 0);

    const rejected = await scenario.tool('sendToAgent', {
      to: 'nuwa/author/main', message: 'Cannot run after revocation.',
    });

    assert.equal(rejected.result.isError, true);
    assert.equal(scenario.calls.length, 0);
  } finally {
    scenario.restore();
  }
});

test('expired or replaced Runtime fails closed before touching the Relay service', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    await scenario.bind();
    scenario.activeLeases.delete(SESSION_A);

    const rejected = await scenario.tool('relayReplyThread', {
      threadID: THREAD_ID, body: 'Cannot run without current lease.',
    });

    assert.equal(rejected.result.isError, true);
    assert.equal(scenario.calls.length, 0);
  } finally {
    scenario.restore();
  }
});

test('one OAuth token cannot silently replace another active Session binding', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);
    const duplicate = await scenario.bind('oauth-a', SESSION_B);

    assert.equal(duplicate.status, 409);
    assert.equal(scenario.resumeCount, 1);
    assert.equal(scenario.database.rows.size, 1);
    assert.equal([...scenario.database.rows.values()][0].sessionID, SESSION_A);
  } finally {
    scenario.restore();
  }
});

test('private binding rejects cross-origin requests without acquiring any Runtime', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const response = await scenario.privateRequest(
      'POST', 'oauth-a',
      { sessionID: SESSION_A, resumeToken: RESUME_SECRET },
      'https://attacker.invalid',
    );

    assert.equal(response.status, 403);
    assert.equal(scenario.resumeCount, 0);
    assert.equal(scenario.database.rows.size, 0);
  } finally {
    scenario.restore();
  }
});

test('directory discovery works without ever claiming a Runtime', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const result = await scenario.tool('agentAddressListAgents', {});

    assert.equal(result.result.isError, undefined);
    assert.match(result.result.content[0].text, /reviewer/);
    assert.equal(scenario.resumeCount, 0);
  } finally {
    scenario.restore();
  }
});

test('bound Session retains message context and replies within one Relay Thread', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    await scenario.bind();

    const read = await scenario.tool('relayMessage', { messageID: MESSAGE_ID, contextLimit: 8 });

    assert.equal(read.result.isError, undefined);
    assert.equal(JSON.parse(read.result.content[0].text).recentThreadMessages[0].body,
      'Previous context');

    const reply = await scenario.tool('relayReplyThread', {
      threadID: THREAD_ID, body: 'Same Thread reply.',
    });

    assert.equal(reply.result.isError, undefined);
    assert.equal(scenario.calls.length, 2);
    assert.equal(scenario.calls[0].url.searchParams.get('context_limit'), '8');
    assert.deepEqual(scenario.calls[1].body, { body: 'Same Thread reply.' });
    assert.equal(scenario.calls[1].url.searchParams.get('session_id'), SESSION_A);
  } finally {
    scenario.restore();
  }
});

test('model-facing Wake pairing forwards no credential values', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    await scenario.bind();
    const result = await scenario.tool('relayBeginWakePairing', {});

    assert.equal(result.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.pathname, '/v2/wake-pairings');
    assert.equal(scenario.calls[0].body, undefined);
    assert.doesNotMatch(JSON.stringify(result), /runtime_private|resume_secret/);
  } finally {
    scenario.restore();
  }
});

test('HTTP transport rejects redirects and escaped cross-origin paths', async () => {
  const requests: Array<URL> = [];
  const client = new HTTPAPIClient('https://relay.example.com', 'Bearer oauth', async (url) => {
    requests.push(new URL(String(url)));

    return Response.json({ ok: true, data: { accepted: true } });
  });

  assert.deepEqual(await client.request('GET', '/v2/inbox'), { accepted: true });
  assert.equal(requests.length, 1);
  await assert.rejects(client.request('GET', '//attacker.invalid/private'), /relative/);
  await assert.rejects(client.request('GET', '/\\attacker.invalid/private'), /escaped/);
});
