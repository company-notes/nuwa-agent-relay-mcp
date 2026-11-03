import test from 'node:test';
import assert from 'node:assert/strict';

import { RelayTools } from '../src/Tools.mjs';

test('all MCP tools delegate to existing Address/Relay endpoints and surface errors', async () => {
  const registrations = new Map();
  const calls = [];
  const server = {
    registerTool(name, config, handler) {
      assert.ok(config.inputSchema);
      registrations.set(name, handler);
    },
  };
  const client = {
    async request(service, path, options = {}) {
      calls.push({ service, path, options });
      return { service, path };
    },
  };

  new RelayTools(server, client).install();
  assert.equal(registrations.size, 25);
  const run = async (name, args = {}) => {
    assert.ok(registrations.has(name));
    return registrations.get(name)(args);
  };
  await run('agentAddressGetStatus');
  await run('agentAddressClaimWork', { host: 'pc', handle: 'coder' });
  await run('relay_inbox', { workAddressId: 'w1' });
  await run('relay_send_message', {
    workAddressId: 'w1', to: '@host/coder', body: 'Hello',
  });
  await run('relay_receipt', { workAddressId: 'w1', messageId: 'id/a', refreshArchive: true });
  await run('relay_set_wake_subscription', {
    workAddressId: 'w1', callbackUrl: 'https://wake.example.com/callback',
  });
  await run('relay_register_alias', {
    workAddressId: 'w1', provider: 'email', externalId: 'alias@example.com',
  });

  assert.equal(calls[2].service, 'relay');
  assert.equal(calls[2].options.workAddressId, 'w1');
  assert.equal(calls[3].path, '/v1/messages');
  assert.equal(calls[3].options.body.to, '@host/coder');
  assert.equal(calls[4].path, '/v1/messages/id%2Fa/receipt');
  assert.equal(calls[4].options.query.refresh, 'archive');
  assert.equal(calls[5].path, '/v1/wake-subscription');

  client.request = async () => { throw new Error('HTTP 503: upstream unavailable.'); };
  const response = await run('relay_inbox', { workAddressId: 'w1' });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /upstream unavailable/);
});
