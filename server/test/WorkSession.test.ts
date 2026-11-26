import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import type { BindingDatabase, BindingStatement } from '../src/Env';
import { RemoteMCPScenario } from './BindingScenario';

class SQLiteBindings implements BindingDatabase {
  readonly database = new DatabaseSync(':memory:');

  constructor() {
    for (const migration of ['0001_session_bindings.sql', '0002_remote_work_sessions.sql']) {
      this.database.exec(readFileSync(new URL('../../migrations/' + migration, import.meta.url), 'utf8'));
    }
  }

  prepare(sql: string): BindingStatement {
    const statement = this.database.prepare(sql);
    let parameters: string[] = [];
    const binding: BindingStatement = {
      bind(...values) {
        parameters = values;

        return binding;
      },
      async first<T>() {
        return (statement.get(...parameters) ?? null) as T | null;
      },
      async run() {
        return { meta: { changes: Number(statement.run(...parameters).changes) } };
      },
    };

    return binding;
  }
}

test('native work Sessions preserve addresses, isolate traffic and share Agent mailbox readiness', async () => {
  const scenario = new RemoteMCPScenario();
  const sqlite = new SQLiteBindings();
  scenario.env.BINDINGS_DB = sqlite;
  scenario.install();

  const call = (id: string | undefined, name: string, input = {}, token = 'oauth-a', mode: 'codex' | 'grok-build' | 'claude-code' | 'opencode' = 'codex') =>
    scenario.tool(name, input, token, true, { mode, id });
  const payload = (response: Awaited<ReturnType<typeof scenario.tool>>) => {
    assert.notEqual(response.result.isError, true, response.result.content[0].text);

    return JSON.parse(response.result.content[0].text);
  };
  const name = { sessionName: 'fix-share-parser', sessionDisplayName: 'Fix share parser' };

  try {
    assert.equal((await call(undefined, 'agentAddressStartWork', name)).result.isError, true);
    assert.equal((await call('work-a', 'relayInbox')).result.isError, true);
    assert.equal(scenario.claimCount, 0);

    const first = payload(await call('work-a', 'agentAddressStartWork', name));
    const second = payload(await call('work-b', 'agentAddressStartWork', name));
    assert.equal(first.collaborationPolicy.mode, 'unconfigured');
    assert.equal(first.collaborationPolicy.id, second.collaborationPolicy.id);
    scenario.approveCollaboration(first.collaborationPolicy.id);
    assert.equal(first.created, true);
    assert.equal(typeof first.runtimeLeaseExpiresAt, 'string');
    assert.equal(first.expiresAt, undefined);
    assert.equal(second.created, true);
    assert.notEqual(first.sessionID, second.sessionID);
    assert.equal(first.canonical.split('/')[1], second.canonical.split('/')[1]);
    assert.notEqual(first.canonical, second.canonical);
    assert.equal(scenario.claimCount, 3);
    assert.equal(scenario.calls.filter(({ url }) => url.pathname === '/v2/agent-mailboxes').length, 1);

    const status = payload(await call('work-a', 'agentAddressGetStatus'));
    assert.equal(status.session.canonical, first.canonical);
    assert.equal(status.collaborationPolicy.mode, 'autonomous');
    assert.equal(payload(await call('work-a', 'agentAddressStartWork')).canonical, first.canonical);
    const calls = scenario.calls.length;
    const heartbeats = scenario.heartbeatAttempts;
    const statuses = scenario.statusLookups;
    payload(await call('work-a', 'sendToAgent', { to: '大熊', message: 'first work' }));
    payload(await call('work-b', 'relayInbox'));
    assert.deepEqual(scenario.calls.slice(calls).map(({ url }) =>
      url.searchParams.get('session_id')), [first.sessionID, second.sessionID]);
    assert.equal(scenario.heartbeatAttempts, heartbeats);
    assert.equal(scenario.statusLookups - statuses, 2);
    assert.equal(scenario.grantLookups, 0);
    payload(await call('work-a', 'relayReplyThread', {
      threadID: '11111111-1111-4111-8111-111111111111', messageID: '22222222-2222-4222-8222-222222222222',
      body: 'Routine reply', autonomous: true,
    }));
    assert.equal((scenario.calls.at(-1)?.body as { autonomous?: boolean }).autonomous, true);

    sqlite.database.prepare('UPDATE remote_work_session_bindings SET expires_at = ? WHERE session_id = ?')
      .run(new Date(0).toISOString(), first.sessionID);
    scenario.activeLeases.delete(first.sessionID);
    const resumed = payload(await call('work-a', 'agentAddressStartWork', {}, 'oauth-a-refresh'));
    assert.equal(resumed.canonical, first.canonical);
    assert.equal(resumed.created, false);
    assert.equal(resumed.sessionID, first.sessionID);
    assert.ok(Date.parse(resumed.runtimeLeaseExpiresAt) > Date.now());
    assert.equal(resumed.collaborationPolicy.mode, 'autonomous');

    const oldAddress = first.canonical;
    const renamedAddress = oldAddress + '-renamed';
    scenario.workSessions.get(first.sessionID)!.canonical = renamedAddress;
    const beforeStatus = scenario.heartbeatAttempts;
    assert.equal(payload(await call('work-a', 'agentAddressGetStatus')).session.canonical, renamedAddress);
    assert.equal(scenario.heartbeatAttempts, beforeStatus);

    assert.equal((await call('work-b', 'agentAddressSelectSession', {
      address: renamedAddress,
    })).result.isError, true);
    const other = payload(await call('work-a', 'agentAddressGetStatus', {}, 'oauth-b'));
    assert.equal(other.session, null);
    assert.equal((await call('work-a', 'agentAddressSelectSession', {
      address: renamedAddress,
    }, 'oauth-b')).result.isError, true);

    const released = payload(await call('work-a', 'agentAddressReleaseWork'));
    assert.equal(released.sessionID, first.sessionID);
    assert.equal(scenario.activeLeases.has(first.sessionID), false);
    assert.equal(scenario.activeLeases.has(second.sessionID), true);

    const reopened = payload(await call('work-a', 'agentAddressStartWork'));
    assert.equal(reopened.sessionID, first.sessionID);
    assert.equal(reopened.canonical, renamedAddress);
    payload(await call('work-a', 'agentAddressReleaseWork'));

    const selected = payload(await call('work-a', 'agentAddressSelectSession', {
      address: renamedAddress,
    }, 'oauth-b'));
    assert.equal(selected.sessionID, first.sessionID);
    assert.notEqual(selected.collaborationPolicy.id, first.collaborationPolicy.id);
    assert.equal(selected.collaborationPolicy.mode, 'unconfigured');
    assert.equal(selected.canonical, renamedAddress);
    assert.equal(payload(await call('work-a', 'agentAddressGetStatus')).session, null);
    assert.equal((await call('work-a', 'agentAddressStartWork', name)).result.isError, true);
    assert.equal(payload(await call('work-b', 'agentAddressGetStatus')).session.canonical, second.canonical);
    const grok = payload(await call('grok-work', 'agentAddressStartWork', {
      sessionName: 'review-api', sessionDisplayName: 'Review API',
    }, 'oauth-c', 'grok-build'));
    assert.notEqual(grok.sessionID, first.sessionID);
    assert.equal(payload(await call('grok-work', 'agentAddressGetStatus', {}, 'oauth-c', 'grok-build')).session.canonical, grok.canonical);

    const claudeID = '8c85c675-0118-4287-83d9-6ad31d9c2bca';
    const claude = payload(await call(claudeID, 'agentAddressStartWork', name, 'oauth-c', 'claude-code'));
    assert.notEqual(claude.sessionID, grok.sessionID);
    assert.equal(payload(await call(claudeID, 'agentAddressStartWork', {}, 'oauth-c', 'claude-code')).canonical, claude.canonical);
    assert.equal((await call(undefined, 'agentAddressGetStatus', {}, 'oauth-c', 'claude-code')).result.isError, true);

    const openID = 'ses_4d1c4a9e02cb';
    const open = payload(await call(openID, 'agentAddressStartWork', name, 'oauth-c', 'opencode'));
    assert.notEqual(open.sessionID, claude.sessionID);
    assert.equal(payload(await call(openID, 'agentAddressStartWork', {}, 'oauth-c', 'opencode')).canonical, open.canonical);
    assert.equal((await call(undefined, 'agentAddressGetStatus', {}, 'oauth-c', 'opencode')).result.isError, true);
  } finally {
    scenario.restore();
    sqlite.database.close();
  }
});
