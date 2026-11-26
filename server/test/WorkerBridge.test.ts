import assert from 'node:assert/strict';
import test from 'node:test';

import { MESSAGE_ID, RemoteMCPScenario, RUNTIME_SECRET, SESSION_A, THREAD_ID } from './BindingScenario';
import { WorkerChannelScenario } from './WorkerChannelScenario';

class WorkerDeviceScenario extends WorkerChannelScenario {
  private readonly jobs = new Map<string, string[]>();
  private route = '';
  private readonly routedStarts: string[] = [];
  private readonly notificationRouteID = 'c'.repeat(64);
  private readonly notificationSetupID = 's'.repeat(32);
  private readonly tools = ['fleet_status', 'work_list', 'work_start', 'work_status', 'work_continue',
    'worker_notification_status', 'worker_notification_setup', 'worker_notification_pairing_status',
    'worker_notification_decline'].map((name) => ({
    name, description: 'Local ' + name,
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' }, task: { type: 'string' },
      message: { type: 'string' }, requestId: { type: 'string' },
      notificationRouteId: { type: 'string' }, setupId: { type: 'string' } } },
  }));

  private studio(operation: string, body: Record<string, unknown> = {}, token = 'oauth-b') {
    return this.base.application.handle(new Request('https://mcp.agent-relay.company-notes.com/worker-bridge/' + operation, {
      method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ route: this.route, ...body }),
    }));
  }

  async pair() {
    const response = await this.base.tool('worker_provider_pair', {});

    assert.equal(response.result.isError, undefined);
    const { pairingCode, authorizationURL, expiresInSeconds } = JSON.parse(response.result.content[0].text);
    assert.equal(expiresInSeconds, 300);
    assert.equal(authorizationURL, 'https://mcp.agent-relay.company-notes.com/worker-pairing');

    const landing = await this.base.application.handle(new Request(authorizationURL));
    assert.equal(landing.status, 200);
    const html = await landing.text();
    assert.match(html, /href="nuwa-studio-worker:pair"/);
    assert.ok(!html.includes(pairingCode), 'The public entrypoint must never contain the pairing secret.');
    assert.doesNotMatch(html, /<script|http-equiv="refresh"|<form/i,
      'The owner must initiate Studio explicitly; the public page never submits credentials.');

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
      case 'worker_notification_status':
        data = { enabled: args.notificationRouteId === this.notificationRouteID };
        break;
      case 'worker_notification_setup':
        data = { setupId: this.notificationSetupID,
          url: 'http://127.0.0.1:3791/notifications/setup/' + this.notificationSetupID };
        break;
      case 'worker_notification_pairing_status':
        assert.equal(args.setupId, this.notificationSetupID);
        data = { paired: true, notificationRouteId: this.notificationRouteID };
        break;
      case 'worker_notification_decline':
        assert.equal(args.notificationRouteId, this.notificationRouteID);
        data = { enabled: false, notificationRouteId: this.notificationRouteID };
        break;
      case 'work_start':
        this.jobs.set('job-a', [args.task]);
        if (args.notificationRouteId) {
          this.routedStarts.push(args.notificationRouteId);
        }
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

  async callBetweenPolls(name: string, args: Record<string, unknown>) {
    const call = this.base.tool(name, args);
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    const poll = this.studio('poll', { tools: this.tools });
    const [response] = await Promise.all([call, this.respond(poll)]);
    assert.equal(response.result.isError, undefined);

    return JSON.parse(response.result.content[0].text);
  }

  async verifyNotificationFlow() {
    const status = await this.call('worker_notification_status', {});
    assert.equal(status.enabled, false);

    const setup = await this.call('worker_notification_setup', {});
    assert.match(setup.url, /^http:\/\/127\.0\.0\.1:3791\/notifications\/setup\//);

    const paired = await this.call('worker_notification_pairing_status', { setupId: setup.setupId });
    assert.equal(paired.paired, true);
    assert.equal(paired.notificationRouteId, this.notificationRouteID);

    const route = { notificationRouteId: paired.notificationRouteId };
    const enabled = await this.call('worker_notification_status', route);
    assert.equal(enabled.enabled, true);

    for (const [name, args] of [
      ['worker_notification_setup', { secret: 'not accepted through MCP' }],
      ['worker_notification_setup', { notificationSetupToken: 'invalid' }],
      ['worker_notification_setup', { jobId: 'job-a' }],
      ['work_continue', { jobId: 'job-a', notificationSetupToken: 'c'.repeat(64) }],
      ['worker_notification_pairing_status', { setupId: 'invalid' }],
      ['work_start', { task: 'Invalid route', notificationRouteId: 'private' }],
      ['work_continue', { jobId: 'job-a', ...route }],
    ] as const) {
      const denied = await this.base.tool(name, args);
      assert.equal(denied.result.isError, true, name);
    }

    const other = await this.base.tool('worker_notification_status', route, 'oauth-c');
    assert.equal(other.result.isError, true, 'Another OAuth grant must not access the paired Worker.');

    const started = await this.call('work_start', {
      requestId: 'travel-start', task: 'Build a travel planner.', ...route,
    });
    assert.deepEqual(this.routedStarts, [paired.notificationRouteId]);

    const jobID = started.job.jobId;
    await this.call('work_continue', { requestId: 'travel-continue', jobId: jobID, message: 'Add expense splitting.' });
    assert.deepEqual((await this.call('work_status', { jobId: jobID })).messages,
      ['Build a travel planner.', 'Add expense splitting.']);

    const declined = await this.call('worker_notification_decline', route);
    assert.equal(declined.enabled, false);
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
}

test('a paired remote assistant discovers, starts and continues a local job', async () => {
  const scenario = new WorkerDeviceScenario();

  try {
    await scenario.pair();

    assert.deepEqual(await scenario.call('work_list', {}, true), { jobs: [] });
    const started = await scenario.callBetweenPolls('work_start', { requestId: 'marketing-start', task: 'Build a marketing tracker.' });
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

test('a paired assistant configures notification routing and starts and continues work', async () => {
  const scenario = new WorkerDeviceScenario();

  try {
    await scenario.pair();
    await scenario.verifyNotificationFlow();
  } finally {
    scenario.close();
  }
});

test('existing messaging and tool discovery remain available during a Worker channel outage', async () => {
  const scenario = new RemoteMCPScenario();
  let channelLookups = 0;
  scenario.env.WORKER_BRIDGE = {
    idFromName: (name) => name,
    get: () => {
      channelLookups += 1;
      throw new Error('Simulated Worker channel outage.');
    },
  };
  scenario.install();

  try {
    const bound = await scenario.bind();
    assert.equal(bound.status, 201);

    const catalog = await scenario.toolSchemas();
    const names = catalog.result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(names.includes('sendToAgent'));
    assert.ok(names.includes('relayReplyThread'));
    assert.ok(!names.includes('work_start'));
    assert.equal(channelLookups, 1);

    const sent = await scenario.tool('sendToAgent', {
      to: 'nuwa/author/main', message: 'Please review the change.',
    });
    const reply = await scenario.tool('relayReplyThread', {
      threadID: THREAD_ID, messageID: MESSAGE_ID, body: 'Same Thread reply.',
    });

    assert.equal(sent.result.isError, undefined);
    assert.equal(reply.result.isError, undefined);
    assert.equal(channelLookups, 1, 'Messaging must not depend on the Worker channel.');

    assert.equal(scenario.calls.length, 2);
    for (const call of scenario.calls) {
      assert.equal(call.url.searchParams.get('session_id'), SESSION_A);
      assert.equal(call.headers.get('x-nuwa-runtime-token'), RUNTIME_SECRET);
    }

    const { submissionID, ...body } = scenario.calls[1].body as Record<string, unknown>;
    assert.match(String(submissionID), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(body, { body: 'Same Thread reply.', messageID: MESSAGE_ID });
    assert.equal(scenario.database.rows.size, 1);
    assert.equal(scenario.resumeCount, 1);
  } finally {
    scenario.restore();
  }
});
