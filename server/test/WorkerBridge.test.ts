import assert from 'node:assert/strict';
import test from 'node:test';

import { RemoteMCPScenario } from './BindingScenario';
import { WorkerBridgeChannel } from '../src/WorkerBridgeChannel';

class WorkerDeviceScenario {
  readonly base = new RemoteMCPScenario();
  private readonly channels = new Map<unknown, WorkerBridgeChannel>();
  private readonly jobs = new Map<string, string[]>();
  private route = '';
  private readonly tools = ['fleet_status', 'work_list', 'work_start', 'work_status', 'work_continue'].map((name) => ({
    name, description: 'Local ' + name,
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' }, task: { type: 'string' },
      message: { type: 'string' }, requestId: { type: 'string' } } },
  }));

  constructor() {
    this.base.env.WORKER_BRIDGE = {
      idFromName: (name) => name,
      get: (id) => {
        let channel = this.channels.get(id);

        if (!channel) {
          const storage = new Map<string, unknown>();
          const transaction = {
            get: async <T>(key: string) => storage.get(key) as T | undefined,
            put: async <T>(key: string, value: T) => { storage.set(key, value); },
            delete: async (key: string) => storage.delete(key),
          };
          channel = new WorkerBridgeChannel({ storage: {
            ...transaction, transaction: (operation) => operation(transaction),
          } });
          this.channels.set(id, channel);
        }

        return channel;
      },
    };
    this.base.install();
  }

  private studio(operation: string, body: Record<string, unknown> = {}, token = 'oauth-b') {
    return this.base.application.handle(new Request('https://mcp.agent-relay.company-notes.com/worker-bridge/' + operation, {
      method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ route: this.route, ...body }),
    }));
  }

  async pair() {
    const response = await this.base.tool('worker_provider_pair', {});
    assert.equal(response.result.isError, undefined);
    const { pairingCode } = JSON.parse(response.result.content[0].text);
    const [route, secret] = pairingCode.split('.');
    this.route = route;

    assert.equal((await this.studio('pair', { secret: 'wrong' })).status, 403);
    assert.equal((await this.studio('pair', { secret })).status, 200);
    assert.equal((await this.studio('pair', { secret }, 'oauth-c')).status, 403);
  }

  private async waitForOnline() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const status = await this.base.tool('worker_provider_status', {});
      if (JSON.parse(status.result.content[0].text).online) {
        return;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    assert.fail('Studio did not become online.');
  }

  private async respond(poll: Promise<Response>) {
    const response = await poll;
    assert.equal(response.status, 200);
    const { request } = await response.json() as {
      request: { requestID: string; name: string; arguments: Record<string, string> };
    };
    const { name, arguments: args } = request;
    let data: unknown;

    switch (name) {
      case 'work_start':
        this.jobs.set('job-a', [args.task]);
        data = { job: { jobId: 'job-a' }, created: true };
        break;
      case 'work_continue':
        this.jobs.get(args.jobId)!.push(args.message);
        data = { job: { jobId: args.jobId }, replayed: false };
        break;
      case 'work_status':
        data = { jobId: args.jobId, messages: this.jobs.get(args.jobId) };
        break;
      case 'work_list':
        data = { jobs: [...this.jobs.keys()] };
        break;
      default:
        data = { reachable: true };
    }

    const result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    assert.equal((await this.studio('result', { requestID: request.requestID, result }, 'oauth-c')).status, 403);
    assert.equal((await this.studio('result', { requestID: request.requestID, result })).status, 200);
    assert.equal((await this.studio('result', { requestID: request.requestID, result })).status, 409);
  }

  async call(name: string, args: Record<string, unknown>, checkCatalog = false) {
    const poll = this.studio('poll', { tools: this.tools });
    await this.waitForOnline();

    if (checkCatalog) {
      const list = await this.base.toolSchemas();
      const names = list.result.tools.map((tool: { name: string }) => tool.name);
      assert.ok(names.includes('sendToAgent'));
      assert.ok(names.includes('work_start'));
      assert.ok(!names.includes('arbitrary_shell'));

      const start = list.result.tools.find((tool: { name: string }) => tool.name === 'work_start');
      assert.deepEqual(start.inputSchema, this.tools.find((tool) => tool.name === 'work_start')!.inputSchema);
      const other = await this.base.tool('work_start', args, 'oauth-c');
      assert.equal(other.result.isError, true);
    }

    const [call] = await Promise.all([this.base.tool(name, args), this.respond(poll)]);
    assert.equal(call.result.isError, undefined);

    return JSON.parse(call.result.content[0].text);
  }

  async verifyRevocation() {
    const poll = this.studio('poll', { tools: this.tools });
    await this.waitForOnline();
    assert.equal((await this.studio('revoke')).status, 200);
    assert.equal((await poll).status, 403);
    const denied = await this.base.tool('work_start', { task: 'Must not run.' });
    assert.equal(denied.result.isError, true);
    const list = await this.base.toolSchemas();
    assert.ok(!list.result.tools.some((tool: { name: string }) => tool.name === 'work_start'));
    assert.ok(list.result.tools.some((tool: { name: string }) => tool.name === 'sendToAgent'));
  }

  close() {
    this.base.restore();
  }
}

test('a paired remote assistant discovers, starts and continues a local job', async () => {
  const scenario = new WorkerDeviceScenario();

  try {
    await scenario.pair();
    assert.deepEqual(await scenario.call('work_list', {}, true), { jobs: [] });
    const started = await scenario.call('work_start', { requestId: 'marketing-start', task: 'Build a marketing tracker.' });
    const jobID = started.job.jobId;
    await scenario.call('work_continue', { requestId: 'marketing-continue', jobId: jobID, message: 'Add monthly ROAS.' });
    const status = await scenario.call('work_status', { jobId: jobID });
    assert.deepEqual(status.messages, ['Build a marketing tracker.', 'Add monthly ROAS.']);
    assert.deepEqual(await scenario.call('work_list', {}), { jobs: [jobID] });
    await scenario.verifyRevocation();
  } finally {
    scenario.close();
  }
});
