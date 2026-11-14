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
  ).replace(/\r\n/g, '\n');
  const response = await scenario.application.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md',
  ));

  assert.equal(response.status, 200);
  assert.equal((await response.text()).replace(/\r\n/g, '\n'), expected);
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

test('a normal MCP send renews its Runtime with one grant lookup, not a second lookup', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const first = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'The first message should not repeat grant verification.',
    });

    assert.equal(first.result.isError, undefined);
    assert.equal(scenario.grantLookups, 1);
    assert.equal(scenario.claimCount, 1);

    const second = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'The next request must still authenticate separately.',
    });

    assert.equal(second.result.isError, undefined);
    assert.equal(scenario.grantLookups, 2,
      'Each tool call must authenticate its Grant exactly once.');
    assert.equal(scenario.heartbeatCount, 1,
      'The existing Runtime lease must still be verified.');
    assert.equal(scenario.calls.length, 2);
  } finally {
    scenario.restore();
  }
});

test('Skill-first OAuth alone privately creates one persistent Agent/Session and sends immediately', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const ensured = await scenario.tool('agentAddressEnsureIdentity', {
      agentDisplayName: '小晴',
    });
    const identity = JSON.parse(ensured.result.content[0].text) as {
      sessionID: string;
      canonical: string;
      created: boolean;
    };

    assert.equal(ensured.result.isError, undefined);
    assert.equal(identity.created, true);
    assert.equal(identity.sessionID, SESSION_A);
    assert.equal(identity.canonical, 'nuwa/xiaoqing/main');
    assert.equal(scenario.claimCount, 1);
    assert.equal(scenario.database.rows.size, 1);
    assert.doesNotMatch(JSON.stringify(ensured), /runtime_private|resume_secret/);
    assert.doesNotMatch(JSON.stringify([...scenario.database.rows.values()]),
      /runtime_private|resume_secret|oauth-a/);

    const repeated = await scenario.tool('agentAddressEnsureIdentity', {}, 'oauth-a-refresh');

    assert.equal(JSON.parse(repeated.result.content[0].text).sessionID, SESSION_A);
    assert.equal(JSON.parse(repeated.result.content[0].text).created, false);
    assert.equal(scenario.claimCount, 1);

    const sent = await scenario.tool('sendToAgent', {
      to: 'nuwa/author/main', message: 'Hello from my own address.',
    }, 'oauth-a-refresh');

    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_A);
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);
  } finally {
    scenario.restore();
  }
});

test('an existing coworker restores its own identity and updates its native display name only during setup', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const first = await scenario.tool('agentAddressEnsureIdentity', {});
    const original = JSON.parse(first.result.content[0].text) as {
      sessionID: string; canonical: string;
    };
    assert.equal(first.result.isError, undefined);
    assert.equal(scenario.displayNameUpdates.length, 0);

    const updated = await scenario.tool('agentAddressEnsureIdentity', {
      agentDisplayName: '大熊',
    });
    const same = JSON.parse(updated.result.content[0].text) as {
      sessionID: string; canonical: string; created: boolean;
    };
    assert.equal(updated.result.isError, undefined);
    assert.equal(same.sessionID, original.sessionID);
    assert.equal(same.canonical, original.canonical);
    assert.equal(same.created, false);
    assert.equal(scenario.claimCount, 1);
    assert.deepEqual(scenario.displayNameUpdates, [{
      agentID: 'agent-a', name: '大熊', principal: 'a',
    }]);

    const secondGrant = await scenario.tool('agentAddressEnsureIdentity', {}, 'oauth-b');
    assert.equal(secondGrant.result.isError, undefined);
    const renamedOther = await scenario.tool('agentAddressEnsureIdentity', {
      agentDisplayName: '小晴',
    }, 'oauth-b');
    assert.equal(renamedOther.result.isError, undefined);
    assert.deepEqual(scenario.displayNameUpdates.at(-1), {
      agentID: 'agent-b', name: '小晴', principal: 'b',
    });
    assert.equal(scenario.displayNameUpdates[0].agentID, 'agent-a');

    const sent = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'Normal call should not rename any Agent.',
    });
    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.displayNameUpdates.length, 2);
  } finally {
    scenario.restore();
  }
});

test('first OAuth login automatically creates a personal Organization when none exists', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.organizationExists = false;
  scenario.install();

  try {
    const ensured = await scenario.tool('agentAddressEnsureIdentity', {});

    assert.equal(ensured.result.isError, undefined);
    assert.equal(scenario.registerOrganizationCount, 1);
    assert.equal(scenario.claimCount, 1);
    assert.equal(scenario.database.rows.size, 1);
  } finally {
    scenario.restore();
  }
});

test('expired Runtime safely resumes the same saved Session after OAuth token refresh', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const first = await scenario.tool('agentAddressEnsureIdentity', {});
    assert.equal(first.result.isError, undefined);

    const row = [...scenario.database.rows.values()][0];
    row.expiresAt = new Date(Date.now() - 60_000).toISOString();
    scenario.activeLeases.delete(SESSION_A);

    const resumed = await scenario.tool('agentAddressEnsureIdentity', {}, 'oauth-a-refresh');

    assert.equal(resumed.result.isError, undefined);
    assert.equal(JSON.parse(resumed.result.content[0].text).sessionID, SESSION_A);
    assert.equal(scenario.resumeCount, 1);
    assert.equal(scenario.claimCount, 1);
    assert.doesNotMatch(JSON.stringify(resumed), /resume_secret|runtime_private/);
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
    assert.match(schemas, /agentAddressEnsureIdentity/);
    assert.match(schemas, /relayBeginWakePairing/);
    assert.doesNotMatch(schemas, /runtimeToken|resumeToken|runtime_token|sessionID/);
    assert.doesNotMatch(schemas, /bearerToken|signingSecret/);
  } finally {
    scenario.restore();
  }
});

test('another OAuth grant receives a separate Agent and never borrows the first Runtime', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);

    const first = await scenario.privateRequest('GET', 'oauth-b');
    assert.deepEqual(await first.json(), { ok: true, data: { bound: false } });

    const separate = await scenario.tool('sendToAgent', {
      to: 'nuwa/author/main', message: 'A separate grant is a separate Agent.',
    }, 'oauth-b');

    assert.equal(separate.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_B);
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET + '_b');
    assert.equal(scenario.database.rows.size, 2);

    const firstAgent = await scenario.privateRequest('GET', 'oauth-a');
    const secondAgent = await scenario.privateRequest('GET', 'oauth-b');

    assert.notEqual((await firstAgent.json() as { data: { sessionID: string } }).data.sessionID,
      (await secondAgent.json() as { data: { sessionID: string } }).data.sessionID);
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

    // The revoked credential cannot be recovered from D1. Reusing this valid
    // OAuth grant later creates a separate, new Agent on first normal use.
    const fresh = await scenario.tool('agentAddressEnsureIdentity', {});

    assert.equal(fresh.result.isError, undefined);
    assert.equal(scenario.claimCount, 1);
    assert.equal(scenario.database.rows.size, 1);
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

    const fresh = await scenario.tool('agentAddressEnsureIdentity', {});

    assert.equal(fresh.result.isError, undefined);
    assert.equal(scenario.claimCount, 1);
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

test('one MCP send call passes the familiar Bot name unchanged to Relay for routing', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const sent = await scenario.tool('sendToAgent', {
      to: '大熊',
      message: '你好，大熊！密語是星河。',
    });

    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.calls.length, 1,
      'Sending by name must not require an additional model-facing MCP tool.');
    assert.equal(scenario.calls[0].url.pathname, '/v2/messages');
    assert.deepEqual(scenario.calls[0].body, {
      to: '大熊',
      body: '你好，大熊！密語是星河。',
    });

    const schemas = JSON.stringify(await scenario.toolSchemas());
    assert.doesNotMatch(schemas, /agentAddressFindByName/);
    assert.match(schemas, /Relay resolves names in/);
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

test('receive-only webhook challenge can be verified by the owning OAuth Session', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const schemas = await scenario.toolSchemas();
    assert.match(JSON.stringify(schemas), /relayVerifyWake/);
    assert.doesNotMatch(JSON.stringify(schemas), /bearerToken|signingSecret|runtimeToken|resumeToken/);

    const verificationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const challenge = 'a'.repeat(64);

    const result = await scenario.tool('relayVerifyWake', {
      verificationId, challenge,
    });

    assert.equal(result.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.pathname, '/v2/wake-subscription/verification');
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_A);
    assert.equal(scenario.calls[0].url.searchParams.has('challenge'), false);
    assert.deepEqual(scenario.calls[0].body, { verificationId, challenge });
    assert.equal(scenario.calls[0].headers.get('authorization'), 'Bearer oauth-a');
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);

    const second = await scenario.tool('relayVerifyWake', {
      verificationId, challenge,
    }, 'oauth-b');
    assert.equal(second.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('session_id'), SESSION_B);
    assert.equal(scenario.calls.at(-1)?.headers.get('authorization'), 'Bearer oauth-b');
    assert.notEqual(
      scenario.calls.at(-1)?.headers.get('x-nuwa-runtime-token'),
      scenario.calls[0].headers.get('x-nuwa-runtime-token'),
    );
  } finally {
    scenario.restore();
  }
});

test('Wake verification refuses invalid challenges before any relay request', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const verificationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const malformed = await scenario.tool('relayVerifyWake', {
      verificationId, challenge: 'not-a-valid-proof',
    });
    assert.equal(malformed.result.isError, true);
    assert.equal(scenario.calls.length, 0);

    const malformedID = await scenario.tool('relayVerifyWake', {
      verificationId: 'wrong', challenge: 'a'.repeat(64),
    });
    assert.equal(malformedID.result.isError, true);
    assert.equal(scenario.calls.length, 0);
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

test('Gateway can propose a real coworker and that coworker alone approves the office route', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const schemas = JSON.stringify(await scenario.toolSchemas());
    assert.match(schemas, /relayGatewayInviteTeammate/);
    assert.match(schemas, /relayGatewayApproveInvitation/);
    assert.doesNotMatch(schemas, /runtimeToken|resumeToken|signingSecret|bearerToken/);

    const proposal = await scenario.tool('relayGatewayInviteTeammate', {
      recipientAddress: 'nuwa/colleague/main',
      recipientBotID: 'platform-recipient-id',
      threadMode: 'platform',
    });
    assert.equal(proposal.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/gateway-teammates');
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('session_id'), SESSION_A);
    assert.deepEqual(scenario.calls.at(-1)?.body, {
      recipientAddress: 'nuwa/colleague/main',
      recipientBotID: 'platform-recipient-id',
      threadMode: 'platform',
      firstContactMode: 'manual',
    });

    // One Gateway invitation with a trusted native Bot name; the Relay
    // resolves the internal address without another model-facing tool.
    const named = await scenario.tool('relayGatewayInviteTeammate', {
      recipientName: '大熊',
      recipientBotID: 'trusted-native-bear-id',
      threadMode: 'platform',
    });
    assert.equal(named.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/gateway-teammates');
    assert.deepEqual(scenario.calls.at(-1)?.body, {
      recipientName: '大熊',
      recipientBotID: 'trusted-native-bear-id',
      threadMode: 'platform',
      firstContactMode: 'manual',
    });

    const approval = await scenario.tool('relayGatewayApproveInvitation', {}, 'oauth-b');
    assert.equal(approval.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/gateway-invitation');
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('session_id'), SESSION_B);
    assert.equal(scenario.calls.at(-1)?.headers.get('authorization'), 'Bearer oauth-b');

    const roster = await scenario.tool('relayGatewayTeammates', {});
    assert.equal(roster.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/gateway-teammates');

    const removal = await scenario.tool('relayGatewayRemoveTeammate', {
      recipientAddress: 'nuwa/colleague/main',
    });
    assert.equal(removal.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('recipient_address'),
      'nuwa/colleague/main');

    const namedRemoval = await scenario.tool('relayGatewayRemoveTeammate', {
      recipientName: '大熊',
    });
    assert.equal(namedRemoval.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('recipient_name'), '大熊');
    assert.equal(scenario.calls.at(-1)?.url.searchParams.has('recipient_address'), false);
  } finally {
    scenario.restore();
  }
});
