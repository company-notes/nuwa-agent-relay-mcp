import test from 'node:test';
import assert from 'node:assert/strict';

import { registerRelayTools } from '../src/tools.mjs';

test('MCP tools map to supported Relay API routes and isolate tool errors', async () => {
  const registrations = new Map();
  const calls = [];
  const server = {
    registerTool(name, config, handler) {
      assert.ok(config.inputSchema);
      registrations.set(name, handler);
    },
  };
  const client = {
    async relay(path, options = {}) {
      calls.push({ path, options });
      return { called: path };
    },
  };

  registerRelayTools(server, client);
  assert.equal(registrations.size, 14);

  const run = async (name, args = {}) => {
    assert.ok(registrations.has(name), 'Missing tool ' + name);
    return registrations.get(name)(args);
  };

  await run('relay_inbox');
  await run('relay_host_inbox');
  await run('relay_get_message', { messageId: 'id / 1' });
  await run('relay_thread_history', { threadId: 'abc' });
  await run('relay_send_message', { to: 'org/host/work', subject: 'Hi', body: 'Hello' });
  await run('relay_send_handoff', { to: 'org/host', subject: 'Review', body: 'Please review' });
  await run('relay_reply_thread', { threadId: 'thread', body: 'Reply' });
  await run('relay_accept_handoff', { messageId: 'handoff' });
  await run('relay_reply_handoff', { messageId: 'handoff', body: 'Done' });
  await run('relay_receipt', { messageId: 'm', refreshArchive: true });
  await run('relay_acknowledge_read', { messageId: 'm' });
  await run('relay_wake_events');
  await run('relay_provision_host_mailbox');

  assert.equal(calls[0].path, '/v1/inbox');
  assert.equal(calls[2].path, '/v1/messages/id%20%2F%201');
  assert.equal(calls[4].options.method, 'POST');
  assert.equal(calls[4].options.body.to, 'org/host/work');
  assert.equal(calls[7].path, '/v1/handoffs/handoff/accept');
  assert.deepEqual(calls[9].options.query, { refresh: 'archive' });
  assert.equal(calls[10].path, '/v1/messages/m/read');
  assert.equal(calls[12].options.expected[0], 201);

  client.relay = async () => {
    throw new Error('HTTP 503 (managed_domain_not_found): test service unavailable');
  };
  const result = await run('relay_provision_host_mailbox');

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /managed_domain_not_found/);
});
