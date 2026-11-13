import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import test from 'node:test';

import { ONBOARDING_HTML } from '../src/OnboardingContent';
import { ONBOARDING_SCRIPT } from '../src/OnboardingInteractions';
import { HTTPMCPApplication } from '../src/Index';
import { RemoteMCPScenario } from './BindingScenario';

const origin = 'https://mcp.agent-relay.company-notes.com';

test('first-time user opens a public site and learns to create two real agents', async () => {
  const scenario = new RemoteMCPScenario();
  const response = await scenario.application.handle(new Request(origin + '/'));

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.doesNotMatch(response.headers.get('content-security-policy') || '', /unsafe-inline/);

  const page = await response.text();
  assert.equal(page, ONBOARDING_HTML);
  assert.match(page, /建立一位新助理/);
  assert.match(page, /GrokBot/);
  assert.match(page, /OpenMausBot/);
  assert.match(page, /OAuth/);
  assert.match(page, /same|同一 Organization/);
  assert.match(page, /id="addressA"/);
  assert.match(page, /id="addressB"/);
  assert.match(page, /id="sendPrompt"/);
  assert.match(page, /id="replyPrompt"/);
  assert.match(page, /id="verifyPrompt"/);
  assert.match(page, /id="wakePrompt"/);
  assert.match(page, /skills\/nuwa-agent-relay\/SKILL\.md/);
  assert.match(page, /真正的 Relay/);
});

test('start guide styles and prompts are served as self-hosted static assets', async () => {
  const scenario = new RemoteMCPScenario();

  for (const [path, type, marker] of [
    ['/start', 'text/html', 'Nuwa Relay'],
    ['/start.css', 'text/css', '.step-body'],
    ['/start.js', 'text/javascript', 'relayProvisionAgentMailbox'],
  ]) {
    const response = await scenario.application.handle(new Request(origin + path));

    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', new RegExp(type));
    assert.match(await response.text(), new RegExp(marker));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }

  assert.doesNotThrow(() => new Script(ONBOARDING_SCRIPT));
  assert.match(ONBOARDING_SCRIPT, /relayBeginWakePairing/);
  assert.match(ONBOARDING_SCRIPT, /relayReceipt/);
  assert.match(ONBOARDING_SCRIPT, /relayReplyThread/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /relayRegisterWake|relayVerifyWake|remote-bind/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);
});

test('public onboarding never bypasses OAuth or changes private MCP routes', async () => {
  const scenario = new RemoteMCPScenario();

  const oauth = await scenario.application.handle(new Request(origin + '/mcp', {
    method: 'POST',
    body: '{}',
  }));
  assert.equal(oauth.status, 401);

  const privateBinding = await scenario.application.handle(new Request(
    origin + '/session-bindings',
  ));
  assert.equal(privateBinding.status, 401);

  const postToLanding = await scenario.application.handle(new Request(origin + '/', {
    method: 'POST',
  }));
  assert.equal(postToLanding.status, 404);

  const unknown = await scenario.application.handle(new Request(origin + '/start/unknown'));
  assert.equal(unknown.status, 404);
});

test('E2E instructions separate human verified delivery from automatic bot execution', () => {
  assert.match(ONBOARDING_HTML, /relayReceipt/);
  assert.match(ONBOARDING_HTML, /HTTP 200/);
  assert.match(ONBOARDING_HTML, /原生 UI/);
  assert.match(ONBOARDING_HTML, /已提交/);
  assert.match(ONBOARDING_SCRIPT, /MailTrigger/);
  assert.match(ONBOARDING_SCRIPT, /不要盲目重寄/);
  assert.match(ONBOARDING_SCRIPT, /原生 UI/);
  assert.match(ONBOARDING_SCRIPT, /真正的 canonical address/);
  assert.doesNotMatch(ONBOARDING_HTML, /<input[^>]+type="password"/);
});
