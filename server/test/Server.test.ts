import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { APIError, HTTPAPIClient } from '../src/APIClients';
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
  assert.match(expected, /Independent client/);
  assert.match(expected, /unique short names/);
  assert.match(expected, /ChatGPT or Codex/);
  assert.match(expected, /No Gateway, Bot enrollment or shared office connection/);
  assert.match(expected, /relayInbox/);
  assert.match(expected, /WakeParent once with the/);
  assert.match(expected, /references\/rakazo\.md/);
  assert.match(expected, /Keep the installed Routine instructions self-contained/);
  assert.match(expected, /relayVerifyWake/);
  assert.match(expected, /relayGatewayEnrollOfficeCoworkers/);
  assert.match(expected, /senderDisplayName/);
  assert.match(expected, /relayThreadID/);
  assert.match(expected, /message content/i);
  assert.match(expected, /nuwa\.wake\.verification/);
  assert.match(expected, /Zero MCP calls for ordinary office Wake dispatch/);
  assert.match(expected, /agentAddressSelectSession/);
  assert.match(expected, /relayReplyThread\(\{from:/);
  assert.match(expected, /Do not fetch it again/);
  assert.match(expected, /Call the tool directly when its schema is available/);
  assert.match(expected, /Forward a ready-to-use reply call/);
  assert.match(expected, /relayReplyThread\(\{from: "<actual recipientBotID>", threadID: "<actual relayThreadID>", body: "<reply>"\}\)/);
  assert.match(expected, /group\/channel ID is not an individual Bot/);
  assert.match(expected, /bot:<native ID>/);
  assert.match(expected, /platform-required\s+tool discovery/);
  assert.match(expected, /Omit `from`\s+on an independent connection/);
  assert.match(expected, /agentAddressStartWork/);
  assert.match(expected, /X-Nuwa-Work-Mode/);
  assert.match(expected, /X-Nuwa-Work-ID/);
  assert.match(expected, /Resumed work address/);

  const legacyVocabulary = expected.replace(/X-Nuwa-Work-(?:Mode|ID)/g, '');
  assert.doesNotMatch(legacyVocabulary, /github\.com|\bHost\b|\bWork\b|work_address_id/);
});

test('publishes the English platform references from their exact source files', async () => {
  const scenario = new RemoteMCPScenario();
  for (const name of ['grokbot.md', 'openmausbot.md', 'rakazo.md', 'work-clients.md']) {
    const source = readFileSync(new URL(
      '../../skills/nuwa-agent-relay/references/' + name, import.meta.url,
    ), 'utf8').replace(/\r\n/g, '\n');
    const response = await scenario.application.handle(new Request(
      'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/' + name,
    ));
    assert.equal(response.status, 200);
    assert.equal((await response.text()).replace(/\r\n/g, '\n'), source);
    assert.doesNotMatch(source, /[\u3400-\u9fff]/);
  }
  const missing = await scenario.application.handle(new Request(
    'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/absent.md',
  ));
  assert.equal(missing.status, 404);
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
    assert.equal(scenario.heartbeatCount, 0);
    assert.equal(scenario.relayLeaseChecks, 1);
    assert.doesNotMatch(JSON.stringify(sent), /runtime_private|resume_secret/);
  } finally {
    scenario.restore();
  }
});

test('successive messages reuse the request account status without skipping Runtime verification', async (context) => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    scenario.statusDelayMS = 50;
    const started = performance.now();
    const first = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'The first message should not repeat grant verification.',
    });

    assert.equal(first.result.isError, undefined);
    assert.equal(scenario.grantLookups, 0);
    assert.equal(scenario.claimCount, 1);
    assert.equal(scenario.statusLookups, 1, 'The first request must reuse its verified account status.');

    const second = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'The next request must still authenticate separately.',
    });

    assert.equal(second.result.isError, undefined);
    assert.equal(scenario.grantLookups, 0,
      'The verified account response already includes the Grant.');
    assert.equal(scenario.heartbeatCount, 0,
      'No duplicate heartbeat before Relay authorization.');
    assert.equal(scenario.relayLeaseChecks, 2);
    assert.equal(scenario.calls.length, 2);
    context.diagnostic('Two sends with simulated 50 ms status latency: ' +
      (performance.now() - started).toFixed(1) + ' ms; status calls: ' + scenario.statusLookups);
    assert.equal(scenario.statusLookups, 2,
      'One Account Status per HTTP request; never reuse it across requests.');

    for (const call of scenario.calls) {
      assert.equal(call.url.searchParams.get('session_id'), SESSION_A);
      assert.equal(call.headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);
    }
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

test('an existing unnamed ChatGPT client sets its own display name without replacing its Session', async () => {
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
      agentDisplayName: 'ChatGPT',
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
      agentID: 'agent-a', name: 'ChatGPT', principal: 'a',
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
      to: '小晴', message: 'Normal call should not rename any Agent.',
    });
    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.displayNameUpdates.length, 2);
  } finally {
    scenario.restore();
  }
});

test('a shared OAuth coworker cannot rename an already named Gateway Session', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const first = await scenario.tool('agentAddressEnsureIdentity', {
      agentDisplayName: 'rakazo',
    });
    const gateway = JSON.parse(first.result.content[0].text) as {
      sessionID: string; canonical: string;
    };

    assert.equal(first.result.isError, undefined);
    assert.equal(scenario.agentDisplayNames.get(gateway.sessionID), 'rakazo');

    // All Rakazo coworkers use one OAuth connector. A coworker's personal
    // setup must not rename the shared Gateway or block roster enrollment.
    const leon = await scenario.tool('agentAddressEnsureIdentity', {
      agentDisplayName: '方承宇 (Leon Fang) | 數位協作事業部主管',
    }, 'oauth-a-refresh');
    assert.equal(leon.result.isError, true);
    assert.match(JSON.stringify(leon), /This OAuth connector already owns a named Agent/);
    assert.equal(scenario.agentDisplayNames.get(gateway.sessionID), 'rakazo');
    assert.equal(scenario.displayNameUpdates.length, 0);
    assert.equal(scenario.database.rows.size, 1);

    const same = await scenario.tool('agentAddressEnsureIdentity', {
      agentDisplayName: 'rakazo',
    });
    assert.equal(same.result.isError, undefined);
    assert.equal(JSON.parse(same.result.content[0].text).sessionID, gateway.sessionID);
    assert.equal(scenario.displayNameUpdates.length, 0);

    const normalSend = await scenario.tool('sendToAgent', {
      to: 'nuwainfo/claire/main', message: 'Shared office connection remains available.',
    });
    assert.equal(normalSend.result.isError, undefined);
    assert.equal(scenario.database.rows.size, 1);
  } finally {
    scenario.restore();
  }
});

test('keeps the same independent Session after an Organization and Agent rename', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const original = await scenario.tool('agentAddressEnsureIdentity', {});
    const identity = JSON.parse(original.result.content[0].text);
    const row = [...scenario.database.rows.values()][0];

    scenario.renameAddress('nuwa-team', identity.sessionID, 'chatgpt');
    const sent = await scenario.tool('sendToAgent', { to: '小晴', message: 'Same identity after rename.' });
    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.heartbeatCount, 0);
    assert.equal(row.sessionID, identity.sessionID);
    assert.equal(row.canonicalAddress, 'nuwa-team/chatgpt/main');

    const updated = await scenario.tool('agentAddressEnsureIdentity', { agentDisplayName: 'ChatGPT' });
    const result = JSON.parse(updated.result.content[0].text);
    assert.equal(updated.result.isError, undefined);
    assert.equal(result.sessionID, identity.sessionID);
    assert.equal(result.canonical, 'nuwa-team/chatgpt/main');
    assert.equal(scenario.claimCount, 1);

    scenario.renameAddress('nuwa-ai', identity.sessionID, 'assistant');
    row.expiresAt = new Date(Date.now() - 60_000).toISOString();

    const restored = await scenario.tool('agentAddressEnsureIdentity', {});
    assert.equal(restored.result.isError, undefined);
    assert.equal(JSON.parse(restored.result.content[0].text).canonical, 'nuwa-ai/assistant/main');
    assert.equal(scenario.claimCount, 1);
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
    assert.equal(scenario.recoveryCount, 1);
    assert.equal(scenario.heartbeatAttempts, 0);
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
    assert.match(schemas, /agentAddressSelectSession/);
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

test('new OAuth grant reselects its idle original Gateway Session without re-enrolling coworkers', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const original = await scenario.tool('agentAddressEnsureIdentity', {});
    const replacement = await scenario.tool('agentAddressEnsureIdentity', {}, 'oauth-b');
    assert.equal(original.result.isError, undefined);
    assert.equal(replacement.result.isError, undefined);

    const address = 'nuwa/reviewer-a/main';
    const blocked = await scenario.tool('agentAddressSelectSession', { address }, 'oauth-b');
    assert.equal(blocked.result.isError, true);
    assert.equal(scenario.database.rows.get('b'.repeat(64))?.sessionID, SESSION_B);

    scenario.activeLeases.delete(SESSION_A);

    const recovered = await scenario.tool('agentAddressSelectSession', { address }, 'oauth-b');
    assert.equal(recovered.result.isError, undefined);
    const selected = JSON.parse(recovered.result.content[0].text);
    assert.equal(selected.sessionID, SESSION_A);
    assert.equal(selected.canonical, address);
    assert.equal(scenario.database.rows.get('b'.repeat(64))?.sessionID, SESSION_A);
    assert.doesNotMatch(JSON.stringify(recovered), /resumeToken|runtimeToken|resume_secret/);

    const sent = await scenario.tool('sendToAgent', {
      from: '小晴', to: '小安', message: 'Gateway restored original Session.',
    }, 'oauth-b');
    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_A);
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'),
      RUNTIME_SECRET + '_recovered');
    assert.deepEqual(scenario.calls[0].body, {
      from: '小晴', to: '小安', body: 'Gateway restored original Session.',
    });

    const replied = await scenario.tool('relayReplyThread', {
      from: '小安', threadID: THREAD_ID, body: '小晴，收到。',
    }, 'oauth-b');
    assert.equal(replied.result.isError, undefined);
    assert.equal(scenario.calls[1].url.pathname, '/v2/threads/' + THREAD_ID + '/messages');
    assert.equal(scenario.calls[1].url.searchParams.get('session_id'), SESSION_A);
    assert.deepEqual(scenario.calls[1].body, { from: '小安', body: '小晴，收到。' });
    const message = await scenario.tool('relayMessage', {
      from: '小晴', messageID: MESSAGE_ID, contextLimit: 8,
    }, 'oauth-b');
    assert.equal(message.result.isError, undefined);
    assert.equal(scenario.calls[2].url.pathname, '/v2/messages/' + MESSAGE_ID);
    assert.equal(scenario.calls[2].url.searchParams.get('session_id'), SESSION_A);
    assert.equal(scenario.calls[2].url.searchParams.get('from'), '小晴');
    assert.equal(scenario.calls[2].url.searchParams.get('context_limit'), '8');
    assert.equal(scenario.calls.length, 3,
      'Address recovery, send, reply and read need no new office configuration.');
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

test('expired or replaced Runtime cannot create a Relay message', async () => {
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
    assert.equal(scenario.relayLeaseChecks, 1);
  } finally {
    scenario.restore();
  }
});

test('a submitted office message returns before the confirmed Lease is synchronized', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    assert.equal((await scenario.bind()).status, 201);
    const row = [...scenario.database.rows.values()][0];
    row.expiresAt = new Date(Date.now() + 60_000).toISOString();
    const previousExpiry = row.expiresAt;
    scenario.database.expiryWriteGate = gate;

    const sent = scenario.tool('sendToAgent', {
      from: '小晴', to: '大熊', message: 'Please confirm the release.',
    }, 'oauth-a', false);
    const result = await Promise.race([sent, new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Message response waited for Lease bookkeeping.')), 5_000);
    })]);

    assert.equal(result.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.relayLeaseChecks, 1);
    assert.equal(scenario.heartbeatCount, 0);
    assert.equal(row.expiresAt, previousExpiry);

    release();
    await scenario.background.drain();
    assert.ok(row.expiresAt > previousExpiry, 'The tracked task must persist the confirmed expiry');
  } finally {
    clearTimeout(timeout);
    release();
    await scenario.background.drain();
    scenario.restore();
  }
});

test('an outdated local lease record retains the same active Runtime after Relay renewal', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);
    const row = [...scenario.database.rows.values()][0];
    row.expiresAt = new Date(Date.now() - 1000).toISOString();

    const sent = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'Continue using the existing Session.',
    });

    assert.equal(sent.result.isError, undefined);
    assert.equal(scenario.resumeCount, 1);
    assert.equal(scenario.recoveryCount, 1);
    assert.equal(scenario.heartbeatCount, 0);
    assert.equal(scenario.heartbeatAttempts, 0);
    assert.equal(scenario.claimCount, 0);
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_A);
    assert.ok(Date.parse(row.expiresAt) > Date.now());

    row.expiresAt = new Date(Date.now() + 5000).toISOString();
    const next = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'Keep the Session when its lease is about to expire.',
    });
    assert.equal(next.result.isError, undefined);
    assert.equal(scenario.heartbeatCount, 1);
    assert.equal(scenario.recoveryCount, 1);
    assert.equal(scenario.resumeCount, 1);
    assert.equal(scenario.calls[1].url.searchParams.get('session_id'), SESSION_A);
  } finally {
    scenario.restore();
  }
});

test('expired local binding cannot replace a different active Runtime', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    await scenario.bind();
    const row = [...scenario.database.rows.values()][0];
    row.expiresAt = new Date(Date.now() - 1000).toISOString();
    scenario.activeLeases.set(SESSION_A, 'runtime_other_owner');

    const rejected = await scenario.tool('sendToAgent', {
      to: '大熊', message: 'Do not deliver this message.',
    });

    assert.equal(rejected.result.isError, true);
    assert.equal(scenario.recoveryCount, 1);
    assert.equal(scenario.heartbeatAttempts, 0);
    assert.equal(scenario.calls.length, 0);
    assert.equal(scenario.activeLeases.get(SESSION_A), 'runtime_other_owner');
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
    assert.match(schemas, /unique short name/);
    assert.deepEqual(await scenario.toolSchemas(), JSON.parse(schemas),
      'Static tool definitions remain identical across independent MCP requests.');
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


test('backend timeout surfaces a safe typed error rather than a generic MCP failure', async () => {
  const client = new HTTPAPIClient('https://relay.example.com', 'Bearer oauth',
    async () => {
      throw new DOMException('A private upstream request timed out.', 'TimeoutError');
    });

  await assert.rejects(client.request('GET', '/v2/inbox'), (error: unknown) =>
    error instanceof APIError && error.code === 'backend_timeout',
    'A timed-out service call should yield a useful error code without disclosing secrets');
});

test('Gateway enrolls the entire native Bot roster in one authorized MCP operation', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const schemas = JSON.stringify(await scenario.toolSchemas());
    assert.match(schemas, /relayGatewayEnrollOfficeCoworkers/);
    assert.match(schemas, /relayGatewayOfficeCoworkers/);
    assert.doesNotMatch(schemas, /runtimeToken|resumeToken|signingSecret|bearerToken/);

    const coworkers = [
      { displayName: '雲朵', recipientBotID: 'native-cloud-001', threadMode: 'platform' },
      { displayName: '小河', recipientBotID: 'native-river-002', threadMode: 'platform' },
    ];
    const enrolled = await scenario.tool('relayGatewayEnrollOfficeCoworkers', { coworkers });

    assert.equal(enrolled.result.isError, undefined);
    assert.equal(scenario.calls.length, 1);
    assert.equal(scenario.calls[0].url.pathname, '/v2/gateway-office-coworkers');
    assert.equal(scenario.calls[0].url.searchParams.get('session_id'), SESSION_A);
    assert.equal(scenario.calls[0].headers.get('authorization'), 'Bearer oauth-a');
    assert.equal(scenario.calls[0].headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);
    assert.deepEqual(scenario.calls[0].body, {
      coworkers: coworkers.map((bot) => ({ ...bot, firstContactMode: 'manual' })),
    });

    const listed = await scenario.tool('relayGatewayOfficeCoworkers', {});

    assert.equal(listed.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/gateway-office-coworkers');
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('session_id'), SESSION_A);

    const invalid = await scenario.tool('relayGatewayEnrollOfficeCoworkers', {
      coworkers: [{ displayName: 'invalid', recipientBotID: 'bad bot id',
        threadMode: 'platform' }],
    });

    assert.equal(invalid.result.isError, true);
    assert.equal(scenario.calls.length, 2,
      'Invalid native IDs must be rejected before contacting Relay.');
  } finally {
    scenario.restore();
  }
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

    const approval = await scenario.tool('relayGatewayApproveInvitation', { shareConnection: true }, 'oauth-b');
    assert.equal(approval.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/gateway-invitation');
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('session_id'), SESSION_B);
    assert.equal(scenario.calls.at(-1)?.headers.get('authorization'), 'Bearer oauth-b');
    assert.deepEqual(scenario.calls.at(-1)?.body, { shareConnection: true });

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

    const nativeRemoval = await scenario.tool('relayGatewayRemoveTeammate', {
      recipientBotID: 'trusted-native-bear-id',
    });
    assert.equal(nativeRemoval.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.searchParams.get('recipient_bot_id'), 'trusted-native-bear-id');
  } finally {
    scenario.restore();
  }
});


test('enrolled GrokBot coworkers send and reply by native IDs with no extra office configuration', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const schemas = JSON.stringify(await scenario.toolSchemas());
    assert.doesNotMatch(schemas, /relayGatewayOfficeDelegation|relayGatewayCoworkerPassphrase/);
    assert.doesNotMatch(schemas, /passphrase/);

    const enrolled = await scenario.tool('relayGatewayEnrollOfficeCoworkers', {
      coworkers: [
        { displayName: '小晴', recipientBotID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', threadMode: 'platform' },
        { displayName: '小安', recipientBotID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', threadMode: 'platform' },
      ],
    });
    assert.equal(enrolled.result.isError, undefined);

    const called = await scenario.tool('sendToAgent', {
      from: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', to: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', message: '請幫我確認 NUWA-GROK-01。',
    });
    assert.equal(called.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname, '/v2/messages');
    assert.deepEqual(scenario.calls.at(-1)?.body, {
      from: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', to: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', body: '請幫我確認 NUWA-GROK-01。',
    });

    const replied = await scenario.tool('relayReplyThread', {
      from: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', threadID: THREAD_ID, body: '小晴，已收到。',
    });
    assert.equal(replied.result.isError, undefined);
    assert.equal(scenario.calls.at(-1)?.url.pathname,
      '/v2/threads/' + THREAD_ID + '/messages');
    assert.deepEqual(scenario.calls.at(-1)?.body, {
      from: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', body: '小晴，已收到。',
    });
    assert.equal(scenario.calls.length, 3,
      'Enrollment, send and reply need no extra administrative MCP call.');
  } finally {
    scenario.restore();
  }
});

test('explicit office Gateway confirms the actual native Thread after first delivery', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    const recipientSessionID = SESSION_B;
    const senderSessionID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const nativeThreadID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const coworkers = [{
      displayName: 'Cosmo', recipientBotID: 'cosmo-native-id',
      threadMode: 'explicit', firstContactMode: 'automatic',
    }];
    const enrolled = await scenario.tool('relayGatewayEnrollOfficeCoworkers', { coworkers });

    assert.equal(enrolled.result.isError, undefined);
    assert.deepEqual(scenario.calls[0].body, { coworkers });

    const schemas = JSON.stringify(await scenario.toolSchemas());
    assert.match(schemas, /relayGatewayConfirmFirstContact/,
      'The receiving Gateway needs a tool to save the native receipt after its first dispatch.');

    const confirmed = await scenario.tool('relayGatewayConfirmFirstContact', {
      recipientSessionID, senderSessionID, messageID: MESSAGE_ID, nativeThreadID,
    });

    assert.equal(confirmed.result.isError, undefined);
    assert.equal(scenario.calls.length, 2, 'First contact needs exactly one confirmation request.');
    const call = scenario.calls[1];
    assert.equal(call.method, 'PUT');
    assert.equal(call.url.pathname,
      '/v2/gateway-teammates/' + recipientSessionID + '/first-contacts/' + senderSessionID);
    assert.equal(call.url.searchParams.get('session_id'), SESSION_A);
    assert.equal(call.headers.get('authorization'), 'Bearer oauth-a');
    assert.equal(call.headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);
    assert.deepEqual(call.body, { messageID: MESSAGE_ID, nativeThreadID });

    const invalid = await scenario.tool('relayGatewayConfirmFirstContact', {
      recipientSessionID, senderSessionID, messageID: MESSAGE_ID, nativeThreadID: '',
    });

    assert.equal(invalid.result.isError, true);
    assert.equal(scenario.calls.length, 2, 'Missing native receipt must not reach Relay.');
  } finally {
    scenario.restore();
  }
});


test('owner resets one Agent binding after preview without affecting another OAuth Session', async () => {
  const scenario = new RemoteMCPScenario();
  scenario.install();

  try {
    assert.equal((await scenario.bind()).status, 201);
    const another = await scenario.tool('agentAddressEnsureIdentity', {}, 'oauth-b');
    assert.equal(another.result.isError, undefined);
    assert.equal(scenario.database.rows.size, 2);

    const path = 'https://mcp.agent-relay.company-notes.com/v2/management/agents/agent-a/bindings';
    const operation = async (agentID: string, sessionIDs: string[], origin: string) =>
      scenario.application.handle(new Request(path.replace('/agent-a/', '/' + agentID + '/'), {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer oauth-a',
          origin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirmAgentID: agentID, sessionIDs }),
      }));

    const invalidOrigin = await operation('agent-a', [SESSION_A], 'https://untrusted.example');
    assert.equal(invalidOrigin.status, 403);
    assert.equal(scenario.database.rows.size, 2);

    const invalidSession = await operation('agent-a', [SESSION_B], 'https://agent-relay.company-notes.com');
    assert.equal(invalidSession.status, 409);
    assert.equal(scenario.database.rows.size, 2);

    const cleaned = await operation('agent-a', [SESSION_A], 'https://agent-relay.company-notes.com');
    assert.equal(cleaned.status, 200);
    assert.deepEqual(await cleaned.json(), { ok: true, data: {
      agentID: 'agent-a',
      cleared: { fixedBindings: 1, workSessions: 0, workAgentRegistrations: 0 },
    } });
    assert.equal(scenario.database.rows.size, 1);
    assert.equal([...scenario.database.rows.values()][0].sessionID, SESSION_B);
  } finally {
    scenario.restore();
  }
});
