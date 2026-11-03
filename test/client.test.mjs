import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RelayClient, APIError } from '../src/relay-client.mjs';
import { activeWorkId, originFor } from '../src/settings.mjs';
import { saveIdentity, identityPath, readIdentity } from '../src/storage.mjs';

test('Relay API always scopes requests to a local selected Work and never uses tokens in URLs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'nuwa-mcp-client-'));
  const beforeHome = process.env.NUWA_MCP_HOME;
  const beforeId = process.env.NUWA_WORK_ID;
  process.env.NUWA_MCP_HOME = home;
  delete process.env.NUWA_WORK_ID;

  try {
    await saveIdentity({ version: 1, workId: 'owned-work', canonical: 'org/host/work' });
    assert.ok(identityPath().startsWith(home));
    assert.equal((await readIdentity()).workId, 'owned-work');

    const hits = [];
    const client = new RelayClient({
      tokenProvider: async () => 'test-secret-token',
      fetchImpl: async (url, options) => {
        hits.push({ url: String(url), options });
        return Response.json({ ok: true, data: [{ id: 'message' }] });
      },
    });

    assert.deepEqual(await client.relay('/v1/inbox'), [{ id: 'message' }]);
    const actual = new URL(hits[0].url);
    assert.equal(actual.origin, 'https://agent-relay.company-notes.com');
    assert.equal(actual.pathname, '/v1/inbox');
    assert.equal(actual.searchParams.get('work_address_id'), 'owned-work');
    assert.equal(hits[0].options.headers.authorization, 'Bearer test-secret-token');
    assert.equal(actual.href.includes('test-secret-token'), false);
    assert.equal(hits[0].options.redirect, 'error');

    process.env.NUWA_WORK_ID = 'alternate-owned-work';
    await client.relay('/v1/inbox');
    assert.equal(new URL(hits[1].url).searchParams.get('work_address_id'), 'alternate-owned-work');
  } finally {
    if (beforeHome === undefined) delete process.env.NUWA_MCP_HOME;
    else process.env.NUWA_MCP_HOME = beforeHome;
    if (beforeId === undefined) delete process.env.NUWA_WORK_ID;
    else process.env.NUWA_WORK_ID = beforeId;
    await rm(home, { recursive: true, force: true });
  }
});

test('Retries one unauthorized request with refreshed OAuth token and preserves REST errors', async () => {
  const original = process.env.NUWA_ACCESS_TOKEN;
  delete process.env.NUWA_ACCESS_TOKEN;
  let attempts = 0;
  const client = new RelayClient({
    tokenProvider: async (force) => force ? 'new-token' : 'old-token',
    fetchImpl: async (_, options) => {
      attempts += 1;
      return options.headers.authorization === 'Bearer old-token'
        ? Response.json({ ok: false, error: { code: 'invalid_token', message: 'Expired' } }, { status: 401 })
        : Response.json({ ok: true, data: { ok: 1 } });
    },
  });

  try {
    assert.deepEqual(await client.identityStatus(), { ok: 1 });
    assert.equal(attempts, 2);
    await assert.rejects(async () => new RelayClient({
      tokenProvider: async () => 'token',
      fetchImpl: async () => Response.json(
        { ok: false, error: { code: 'wrong_organization', message: 'Denied' } }, { status: 403 },
      ),
    }).identityStatus(), (error) => error instanceof APIError &&
      error.status === 403 && error.code === 'wrong_organization');
  } finally {
    if (original === undefined) delete process.env.NUWA_ACCESS_TOKEN;
    else process.env.NUWA_ACCESS_TOKEN = original;
  }
});

test('Rejects invalid origins, missing Work selection and absolute URL paths', async () => {
  assert.throws(() => originFor('MISSING_ORIGIN_TEST', 'http://not-https.example'));
  assert.throws(() => activeWorkId(null));

  const client = new RelayClient({
    tokenProvider: async () => 'token',
    fetchImpl: async () => Response.json({ ok: true, data: true }),
  });

  await assert.rejects(client.request('address', '//evil.example/collect', { useWork: false }),
    /relative API paths/);
});
