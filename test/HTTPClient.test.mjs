import test from 'node:test';
import assert from 'node:assert/strict';

import { HTTPClient, APIError } from '../src/HTTPClient.mjs';

const env = {
  ADDRESS_API_URL: 'https://address.company-notes.com',
  RELAY_API_URL: 'https://agent-relay.company-notes.com',
};

test('REST client enforces work scope, HTTPS and sends OAuth only in header', async () => {
  const calls = [];
  const client = new HTTPClient(env, 'Bearer private-secret', async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json({ ok: true, data: { id: 'message' } });
  });
  assert.deepEqual(await client.request('relay', '/v1/inbox', {
    workAddressId: 'work-123',
  }), { id: 'message' });
  assert.equal(calls[0].url.searchParams.get('work_address_id'), 'work-123');
  assert.equal(calls[0].options.headers.authorization, 'Bearer private-secret');
  assert.ok(!calls[0].url.href.includes('private-secret'));
  assert.equal(calls[0].options.redirect, 'error');

  await assert.rejects(client.request('relay', '/v1/inbox'), /Work ID/);
  await assert.rejects(client.request('address', '//evil.example'), /API path/);
  assert.throws(() => new HTTPClient({ ...env, RELAY_API_URL: 'http://example.com' },
    'Bearer x'), /HTTPS/);
});

test('API errors are normalized, not exposed as raw server bodies', async () => {
  const client = new HTTPClient(env, 'Bearer x', async () =>
    Response.json({ ok: false, error: { code: 'forbidden', message: 'Not allowed' } }, { status: 403 }));
  await assert.rejects(
    client.request('address', '/v1/account/status'),
    (error) => error instanceof APIError && error.code === 'forbidden' && error.status === 403,
  );
});
