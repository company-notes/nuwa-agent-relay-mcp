import test from 'node:test';
import assert from 'node:assert/strict';

import MCPWorker from '../src/Index.mjs';

const env = {
  ADDRESS_API_URL: 'https://address.company-notes.com',
  RELAY_API_URL: 'https://agent-relay.company-notes.com',
};
const endpoint = 'https://mcp.company-notes.com/mcp';

function mcpRequest(method, params = {}) {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-credential',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
}

async function readFrame(response) {
  const content = await response.text();
  const event = content.split('\n').find((line) => line.startsWith('data:'));
  return JSON.parse(event ? event.slice(5).trim() : content);
}

test('remote OAuth challenge and metadata identify Agent Address (not the Relay API)', async () => {
  const metadata = await MCPWorker.fetch(new Request(
    'https://mcp.company-notes.com/.well-known/oauth-protected-resource/mcp'), env);
  assert.equal(metadata.status, 200);
  const details = await metadata.json();
  assert.equal(details.resource, endpoint);
  assert.deepEqual(details.authorization_servers, [env.ADDRESS_API_URL]);

  const missing = await MCPWorker.fetch(new Request(endpoint, { method: 'POST' }), env);
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get('www-authenticate'), /resource_metadata/);
});

test('remote MCP protocol lists tools and sends a message scoped to one authorized Work', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    requests.push({ parsed, options });

    if (parsed.hostname === 'address.company-notes.com') {
      return Response.json({ ok: true, data: { organization: { id: 'org' } } });
    }

    if (parsed.pathname === '/v1/messages') {
      return Response.json({ ok: true, data: { id: 'sent-1' } }, { status: 201 });
    }

    return Response.json({ ok: true, data: [] });
  };

  try {
    const initialized = await MCPWorker.fetch(mcpRequest('initialize', {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    }), env);
    assert.equal(initialized.status, 200);
    assert.ok((await readFrame(initialized)).result?.serverInfo);

    const listed = await MCPWorker.fetch(mcpRequest('tools/list'), env);
    assert.equal(listed.status, 200);
    const list = await readFrame(listed);
    assert.ok(list.result.tools.some((tool) => tool.name === 'relay_send_message'));
    assert.ok(list.result.tools.some((tool) => tool.name === 'agentAddressClaimWork'));

    const sent = await MCPWorker.fetch(mcpRequest('tools/call', {
      name: 'relay_send_message',
      arguments: { workAddressId: 'owned-work', to: '@host/agent', body: 'Hello' },
    }), env);
    assert.equal(sent.status, 200);
    const result = await readFrame(sent);
    assert.equal(JSON.parse(result.result.content[0].text).id, 'sent-1');
    const delivery = requests.find((entry) => entry.parsed.pathname === '/v1/messages');
    assert.equal(delivery.parsed.searchParams.get('work_address_id'), 'owned-work');
    assert.equal(delivery.options.headers.authorization, 'Bearer test-credential');
    assert.ok(!delivery.parsed.href.includes('test-credential'));
  } finally {
    globalThis.fetch = original;
  }
});

test('invalid OAuth bearer is rejected before an MCP session exists', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { ok: false, error: { code: 'invalid_token' } }, { status: 401 });
  try {
    const response = await MCPWorker.fetch(mcpRequest('tools/list'), env);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate'), /invalid_token/);
  } finally {
    globalThis.fetch = original;
  }
});
