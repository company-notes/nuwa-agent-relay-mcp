import assert from 'node:assert/strict';
import { runInNewContext, Script } from 'node:vm';
import test from 'node:test';

import { ONBOARDING_HTML } from '../src/OnboardingContent';
import { ONBOARDING_SCRIPT } from '../src/OnboardingInteractions';
import { RemoteMCPScenario } from './BindingScenario';

const origin = 'https://mcp.agent-relay.company-notes.com';

type FakeElement = {
  value: string;
  textContent: string;
  hidden: boolean;
  attributes: Map<string, string>;
  callbacks: Map<string, () => void>;
  classList: { add(name: string): void; remove(name: string): void };
  addEventListener(event: string, handler: () => void): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
};

function fakeElement(attributes: Record<string, string> = {}): FakeElement {
  const stored = new Map(Object.entries(attributes));
  const callbacks = new Map<string, () => void>();

  return {
    value: '',
    textContent: '',
    hidden: false,
    attributes: stored,
    callbacks,
    classList: { add() {}, remove() {} },
    addEventListener(event, handler) {
      callbacks.set(event, handler);
    },
    getAttribute(name) {
      return stored.get(name) || null;
    },
    setAttribute(name, value) {
      stored.set(name, value);
    },
  };
}

test('homepage first shows two AI coworkers and Nuwa, with optional Gateway details', async () => {
  const scenario = new RemoteMCPScenario();
  const response = await scenario.application.handle(new Request(origin + '/'));

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.doesNotMatch(response.headers.get('content-security-policy') || '', /unsafe-inline/);

  const html = await response.text();
  const intro = html.slice(0, html.indexOf('data-diagram-slide="1"'));

  assert.equal(html, ONBOARDING_HTML);
  assert.match(intro, /GrokBot/);
  assert.match(intro, /OpenMausBot/);
  assert.match(intro, /小晴/);
  assert.match(intro, /大熊/);
  assert.match(intro, /通訊總機/);
  assert.doesNotMatch(intro, /Gateway|交換機|MailTrigger|Runtime Token|Resume Token/);
  assert.match(html, /id="diagram-simple"/);
  assert.match(html, /id="diagram-details" data-diagram-slide="1" hidden/);
  assert.match(html, /data-diagram-choice="0"/);
  assert.match(html, /data-diagram-choice="1"/);
  assert.match(html, /小晴、大熊只是示例/);
});

test('user-facing setup has one name-independent Gateway prompt and no fictional roster', () => {
  assert.match(ONBOARDING_HTML, /id="gatewayPrompt"/);
  assert.doesNotMatch(ONBOARDING_HTML, /id="gatewayPromptA"/);
  assert.doesNotMatch(ONBOARDING_HTML, /id="colleaguePromptA"/);
  assert.match(ONBOARDING_HTML, /如果這個平台已經安裝過/);
  assert.match(ONBOARDING_HTML, /尚未提供在現行 Skill/);
  assert.match(ONBOARDING_HTML, /同事.*加入/);
  assert.doesNotMatch(ONBOARDING_HTML, /MailTrigger/);
});

test('real HTTP routes keep Skill and OAuth protected', async () => {
  const scenario = new RemoteMCPScenario();

  for (const [path, type, marker] of [
    ['/start', 'text/html', 'Nuwa Relay'],
    ['/start.css', 'text/css', '.diagram-pagination'],
    ['/start.js', 'text/javascript', 'gatewaySetup'],
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
  assert.match(ONBOARDING_SCRIPT, /relayWakeSubscription/);
  assert.match(ONBOARDING_SCRIPT, /relayBeginWakePairing/);
  assert.match(ONBOARDING_SCRIPT, /relayReplyThread/);
  assert.match(ONBOARDING_SCRIPT, /先不要猜測任何同事名稱/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /MailTrigger|relayRegisterWake|relayVerifyWake|remote-bind/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);

  assert.equal((await scenario.application.handle(new Request(origin + '/mcp', {
    method: 'POST',
    body: '{}',
  }))).status, 401);

  assert.equal((await scenario.application.handle(new Request(origin + '/session-bindings'))).status, 401);
  assert.equal((await scenario.application.handle(new Request(origin + '/', { method: 'POST' }))).status, 404);
  assert.equal((await scenario.application.handle(new Request(origin + '/unknown-onboarding'))).status, 404);
});

test('generic setup message is reusable and actual addresses drive the bidirectional test', () => {
  const ids = ['gatewayPrompt', 'sendPrompt', 'replyPrompt', 'returnPrompt',
    'addressA', 'addressB', 'addressHint', 'toast'];
  const elements = new Map(ids.map((id) => [id, fakeElement()]));
  elements.get('addressA')!.value = 'company/alice/main';
  elements.get('addressB')!.value = 'company/bob/main';

  const slides = [fakeElement({ 'data-diagram-slide': '0' }),
    fakeElement({ 'data-diagram-slide': '1' })];
  const buttons = [fakeElement({ 'data-diagram-choice': '0' }),
    fakeElement({ 'data-diagram-choice': '1' })];
  const copy = fakeElement({ 'data-copy': 'gatewayPrompt' });
  const copyCalls: string[] = [];

  runInNewContext(ONBOARDING_SCRIPT, {
    document: {
      getElementById(id: string) {
        const result = elements.get(id);

        if (!result) {
          throw Error('Unexpected DOM id: ' + id);
        }

        return result;
      },
      querySelectorAll(selector: string) {
        if (selector === '[data-diagram-slide]') {
          return slides;
        }

        if (selector === '[data-diagram-choice]') {
          return buttons;
        }

        if (selector === '[data-copy]') {
          return [copy];
        }

        return [];
      },
    },
    navigator: {
      clipboard: {
        writeText: async (value: string) => {
          copyCalls.push(value);
        },
      },
    },
    clearTimeout() {},
    setTimeout() { return 1; },
  });

  const gateway = elements.get('gatewayPrompt')!.textContent;

  assert.match(gateway, /先不要猜測任何同事名稱/);
  assert.match(gateway, /已經裝好 Nuwa Skill 和 MCP/);
  assert.match(gateway, /管理多位同事的受權工具/);
  assert.match(gateway, /你自己的 Session/);
  assert.doesNotMatch(gateway, /小晴|大熊|Cosmo|nuwa\/xiaoqing|MailTrigger/);

  assert.match(elements.get('sendPrompt')!.textContent, /company\/bob\/main/);
  assert.match(elements.get('replyPrompt')!.textContent, /company\/alice\/main/);
  assert.match(elements.get('replyPrompt')!.textContent, /relayReplyThread/);
  assert.match(elements.get('returnPrompt')!.textContent, /新的通話/);
  assert.equal(slides[0].hidden, false);
  assert.equal(slides[1].hidden, true);

  buttons[1].callbacks.get('click')?.();
  assert.equal(slides[0].hidden, true);
  assert.equal(slides[1].hidden, false);
  assert.equal(buttons[1].attributes.get('aria-pressed'), 'true');

  copy.callbacks.get('click')?.();
  assert.equal(copyCalls[0], gateway);
});
