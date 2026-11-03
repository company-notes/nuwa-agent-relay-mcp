import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/server.mjs', import.meta.url));

test('real MCP stdio initialize and tools/list expose 14 Relay tools without leaking logs', async () => {
  const child = spawn(process.execPath, [entry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NUWA_ACCESS_TOKEN: 'test-not-used' },
  });
  let output = '';
  let stderr = '';
  const received = new Map();
  let stopped = false;
  const pending = new Map();

  child.stderr.on('data', (bytes) => { stderr += bytes.toString('utf8'); });
  child.stdout.on('data', (bytes) => {
    output += bytes.toString('utf8');

    for (;;) {
      const end = output.indexOf('\n');
      if (end < 0) break;
      const line = output.slice(0, end);
      output = output.slice(end + 1);
      if (!line.trim()) continue;
      const frame = JSON.parse(line);
      if (frame.id === undefined) continue;
      received.set(frame.id, frame);
      pending.get(frame.id)?.(frame);
    }
  });

  let nextId = 1;
  async function ask(method, params) {
    const id = nextId++;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        'MCP stdio timeout; stderr: ' + stderr.slice(0, 500),
      )), 10_000);
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      if (received.has(id)) {
        clearTimeout(timer);
        resolve(received.get(id));
      }
    });
  }

  try {
    const initialized = await ask('initialize', {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
    assert.ok(initialized.result?.serverInfo, JSON.stringify(initialized));

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized',
    }) + '\n');

    const listed = await ask('tools/list', {});
    assert.ok(Array.isArray(listed.result?.tools), JSON.stringify(listed));
    assert.equal(listed.result.tools.length, 14);
    assert.ok(listed.result.tools.some((tool) => tool.name === 'relay_send_message'));
    assert.ok(listed.result.tools.some((tool) => tool.name === 'relay_receipt'));
    assert.ok(!stderr.includes('test-not-used'));
  } finally {
    if (!stopped) {
      stopped = true;
      child.kill();
    }
    child.stdin.destroy();
  }
});
