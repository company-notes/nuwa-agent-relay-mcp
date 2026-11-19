import assert from 'node:assert/strict';
import test from 'node:test';
import { BindingDatabaseGuard } from './GuardBindingD1.mjs';

test('production D1 guard accepts provider metadata and complete Session binding schema only', () => {
  assert.equal(BindingDatabaseGuard.classify(['d1_migrations', '_cf_KV', '_cf_METADATA']), 'empty');
  assert.equal(BindingDatabaseGuard.classify([
    'd1_migrations', '_cf_KV', 'remote_session_bindings',
  ]), 'v2');
  assert.equal(BindingDatabaseGuard.classify([
    'd1_migrations', '_cf_KV', 'remote_session_bindings', 'remote_work_agents',
    'remote_work_session_bindings',
  ], true), 'v2');
});

test('production D1 guard rejects Relay, unknown, partially migrated or empty deployed D1', () => {
  for (const names of [
    ['remote_session_bindings'],
    ['remote_session_bindings', 'remote_work_agents'],
    ['remote_session_bindings', 'remote_work_session_bindings'],
    ['remote_session_bindings', 'messages'],
    ['threads', 'messages'],
    ['agent_mailboxes'],
    ['_cf_KV', 'messages'],
    ['_cf_UNKNOWN'],
    [],
  ]) {
    assert.throws(() => BindingDatabaseGuard.classify(names, true));
  }
});

test('staging D1 guard fails closed when Wrangler output cannot be trusted', () => {
  assert.deepEqual(BindingDatabaseGuard.parse(JSON.stringify([{
    success: true, results: [{ name: 'remote_session_bindings' }],
  }])), ['remote_session_bindings']);

  assert.throws(() => BindingDatabaseGuard.parse('not JSON'));
  assert.throws(() => BindingDatabaseGuard.parse(JSON.stringify([{ success: false }])));
  assert.throws(() => BindingDatabaseGuard.parse(JSON.stringify([{
    success: true, results: [{}],
  }])));
});
