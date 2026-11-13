import assert from 'node:assert/strict';
import { runInNewContext, Script } from 'node:vm';
import test from 'node:test';

import { ONBOARDING_HTML } from '../src/OnboardingContent';
import { ONBOARDING_SCRIPT } from '../src/OnboardingInteractions';
import { RemoteMCPScenario } from './BindingScenario';

const origin = 'https://mcp.agent-relay.company-notes.com';

test('new visitor first understands the product and distinguishes two Gateways from coworkers', async () => {
  const scenario = new RemoteMCPScenario();
  const response = await scenario.application.handle(new Request(origin + '/'));

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.doesNotMatch(response.headers.get('content-security-policy') || '', /unsafe-inline/);

  const page = await response.text();

  assert.equal(page, ONBOARDING_HTML);
  assert.match(page, /不同辦公室的 AI 同事/);
  assert.match(page, /辦公室 A · GrokBot/);
  assert.match(page, /辦公室 B · OpenMausBot/);
  assert.match(page, /交換機助理 A/);
  assert.match(page, /交換機助理 B/);
  assert.match(page, /真正工作的同事/);
  assert.match(page, /不能直接拿交換機充當/);
  assert.match(page, /小晴主動找大熊|小晴找大熊/);
  assert.match(page, /大熊主動找小晴/);
  assert.match(page, /id="gatewayPromptA"/);
  assert.match(page, /id="gatewayPromptB"/);
  assert.match(page, /id="colleaguePromptA"/);
  assert.match(page, /id="colleaguePromptB"/);
  assert.match(page, /id="connectPromptA"/);
  assert.match(page, /id="connectPromptB"/);
  assert.match(page, /id="returnPromptB"/);
  assert.match(page, /skills\/nuwa-agent-relay\/SKILL\.md/);
});

test('homepage stays focused on the user; internal jargon is only in expanded FAQ', () => {
  const introductoryText = ONBOARDING_HTML.slice(0, ONBOARDING_HTML.indexOf('id="questions"'));

  assert.doesNotMatch(introductoryText, /MailTrigger|Runtime Token|Resume Token|Relay Server/);
  assert.doesNotMatch(ONBOARDING_HTML, /MailTrigger/);
  assert.match(ONBOARDING_HTML, /<details>/);
  assert.match(ONBOARDING_HTML, /MCP、Webhook、Thread 是什麼/);
  assert.match(ONBOARDING_HTML, /沒有.*宣稱|不能.*宣稱|不可以假裝/);
  assert.doesNotMatch(ONBOARDING_HTML, /<input[^>]+type="password"/);
});

test('public page assets are self-hosted and the protected MCP endpoints remain unchanged', async () => {
  const scenario = new RemoteMCPScenario();

  for (const [path, type, marker] of [
    ['/start', 'text/html', 'Nuwa Relay'],
    ['/start.css', 'text/css', '.office-row'],
    ['/start.js', 'text/javascript', 'gatewayPrompt'],
  ]) {
    const response = await scenario.application.handle(new Request(origin + path));

    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', new RegExp(type));
    assert.match(await response.text(), new RegExp(marker));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }

  assert.doesNotThrow(() => new Script(ONBOARDING_SCRIPT));
  assert.match(ONBOARDING_SCRIPT, /agentAddressEnsureIdentity/);
  assert.match(ONBOARDING_SCRIPT, /relayProvisionAgentMailbox/);
  assert.match(ONBOARDING_SCRIPT, /relayBeginWakePairing/);
  assert.match(ONBOARDING_SCRIPT, /relayReplyThread/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /MailTrigger/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /relayRegisterWake|relayVerifyWake|remote-bind/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);

  const unauthenticatedMCP = await scenario.application.handle(new Request(origin + '/mcp', {
    method: 'POST', body: '{}',
  }));
  assert.equal(unauthenticatedMCP.status, 401);

  const privateBinding = await scenario.application.handle(new Request(
    origin + '/session-bindings',
  ));
  assert.equal(privateBinding.status, 401);

  const postToSite = await scenario.application.handle(new Request(origin + '/', {
    method: 'POST',
  }));
  assert.equal(postToSite.status, 404);

  const unknown = await scenario.application.handle(new Request(origin + '/start/unknown'));
  assert.equal(unknown.status, 404);
});

test('copied instructions initialize separate Gateways and coworkers and preserve call direction', () => {
  const ids = [
    'gatewayPromptA', 'gatewayPromptB', 'colleaguePromptA', 'colleaguePromptB',
    'connectPromptA', 'connectPromptB', 'callPromptA', 'replyPromptB',
    'returnPromptB', 'verifyPromptA', 'addressHint', 'progressCount', 'progressFill',
    'platformA', 'platformB', 'addressA', 'addressB',
  ];

  const fields = new Map(ids.map((id) => [id, {
    value: '',
    textContent: '',
    style: { width: '' },
    classList: { add() {}, remove() {} },
    addEventListener() {},
  }]));
  fields.get('platformA')!.value = 'grok';
  fields.get('platformB')!.value = 'maus';
  fields.get('addressA')!.value = 'nuwa/xiaoqing/main';
  fields.get('addressB')!.value = 'nuwa/bear/main';

  const document = {
    getElementById(id: string) {
      const field = fields.get(id);

      if (!field) {
        throw Error('Unexpected onboarding selector ' + id);
      }

      return field;
    },
    querySelectorAll() {
      return [];
    },
  };

  runInNewContext(ONBOARDING_SCRIPT, {
    document,
    setTimeout() { return 1; },
    clearTimeout() {},
    navigator: {},
  });

  const text = (id: string) => fields.get(id)!.textContent;

  assert.match(text('gatewayPromptA'), /你是辦公室 A 的「Nuwa 交換機助理」/);
  assert.match(text('gatewayPromptB'), /你不是大熊/);
  assert.match(text('gatewayPromptA'), /不是小晴/);
  assert.match(text('colleaguePromptA'), /真正工作的 AI 同事「小晴」/);
  assert.match(text('colleaguePromptB'), /真正工作的 AI 同事「大熊」/);
  assert.match(text('connectPromptA'), /不能只以 Gateway 自己的 OAuth Session/);
  assert.match(text('connectPromptB'), /有權的收件 Session/);
  assert.match(text('callPromptA'), /nuwa\/bear\/main/);
  assert.match(text('replyPromptB'), /relayReplyThread/);
  assert.match(text('returnPromptB'), /新的 Relay Thread/);
  assert.match(text('returnPromptB'), /nuwa\/xiaoqing\/main/);
  assert.match(text('verifyPromptA'), /自動喚醒/);
  assert.match(text('gatewayPromptA'), /不能宣稱已接通/);
});
