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

test('office-wide setup does not ask the user to register each coworker by hand', () => {
  assert.match(ONBOARDING_HTML, /id="gatewayPrompt"/);
  assert.doesNotMatch(ONBOARDING_HTML, /id="gatewayPromptA"/);
  assert.doesNotMatch(ONBOARDING_HTML, /id="colleaguePromptA"/);
  assert.match(ONBOARDING_HTML, /如果這個平台已經安裝過/);
  assert.match(ONBOARDING_HTML, /預設連接辦公室同事/);
  assert.match(ONBOARDING_HTML, /獨立 MCP 用戶端直接接入，不需要總機/);
  assert.match(ONBOARDING_HTML, /Nuwa 通用啟動指令/);
  assert.match(ONBOARDING_HTML, /同事名稱與 Bot ID/);
  assert.match(ONBOARDING_HTML, /辦公室只需要一個 Gateway Wake/);
  assert.match(ONBOARDING_HTML, /接線助理從平台名錄取得同事名稱與 Bot ID/);
  assert.match(ONBOARDING_HTML, /id="verifyPrompt"/);
  assert.match(ONBOARDING_HTML, /助理 A 的名稱/);
  assert.match(ONBOARDING_HTML, /助理 B 的名稱/);
  assert.match(ONBOARDING_HTML, /不需要知道 Nuwa 的內部地址/);
  assert.doesNotMatch(ONBOARDING_HTML, /id="addressA"|id="addressB"|company\/alice\/main/);
  assert.doesNotMatch(ONBOARDING_HTML, /告訴接線助理，你要讓哪些同事加入/);
  assert.doesNotMatch(ONBOARDING_HTML, /尚未提供在現行 Skill/);
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
  assert.match(ONBOARDING_SCRIPT, /依最新版 Skill/);
  assert.match(ONBOARDING_SCRIPT, /安裝或更新 Skill 與 MCP/);
  assert.match(ONBOARDING_SCRIPT, /完成 Organization 授權/);
  assert.match(ONBOARDING_SCRIPT, /測試字詞是星河/);
  assert.match(ONBOARDING_SCRIPT, /測試字詞是月光/);
  assert.doesNotMatch(ONBOARDING_SCRIPT,
    /agentAddressEnsureIdentity|relayProvisionAgentMailbox|relayWakeSubscription/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /relayRegisterWake|relayVerifyWake|remote-bind/);
  assert.doesNotMatch(ONBOARDING_SCRIPT, /(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);

  assert.equal((await scenario.application.handle(new Request(origin + '/mcp', {
    method: 'POST',
    body: '{}',
  }))).status, 401);

  assert.equal((await scenario.application.handle(new Request(origin + '/session-bindings'))).status, 401);
  assert.equal((await scenario.application.handle(new Request(origin + '/', { method: 'POST' }))).status, 404);
  assert.equal((await scenario.application.handle(new Request(origin + '/unknown-onboarding'))).status, 404);
});

test('GrokBot and OpenMausBot display names drive everyday bidirectional calls', () => {
  const ids = ['gatewayPrompt', 'sendPrompt', 'replyPrompt', 'returnPrompt',
    'verifyPrompt', 'colleagueA', 'colleagueB', 'nameHint', 'toast'];
  const elements = new Map(ids.map((id) => [id, fakeElement()]));
  elements.get('colleagueA')!.value = '小晴';
  elements.get('colleagueB')!.value = '大熊';

  const slides = [fakeElement({ 'data-diagram-slide': '0' }),
    fakeElement({ 'data-diagram-slide': '1' })];
  const buttons = [fakeElement({ 'data-diagram-choice': '0' }),
    fakeElement({ 'data-diagram-choice': '1' })];
  const copy = fakeElement({ 'data-copy': 'gatewayPrompt' });
  const copySend = fakeElement({ 'data-copy': 'sendPrompt' });
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
          return [copy, copySend];
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

  assert.match(gateway, /官方 Skill：https:\/\/mcp\.agent-relay\.company-notes\.com\/skills\/nuwa-agent-relay\/SKILL\.md/);
  assert.match(gateway, /Nuwa MCP：https:\/\/mcp\.agent-relay\.company-notes\.com\/mcp/);
  assert.match(gateway, /安裝或更新 Skill 與 MCP，完成 Organization 授權/);
  assert.match(gateway, /沿用既有身分/);
  assert.match(gateway, /獨立 MCP 用戶端/);
  assert.match(gateway, /無須 Gateway/);
  assert.match(gateway, /沒有自動接收能力就依使用者要求查收/);
  assert.match(gateway, /GrokBot 的 Routine 若無原生轉交能力但支援 WakeParent，僅交接完整原始事件 JSON/);
  assert.match(gateway, /Routine 使用自包含指令/);
  assert.match(gateway, /唯一的 Wake 接收例行任務並完成驗證/);
  assert.match(gateway, /沿用有效的接線/);
  assert.match(gateway, /接收入口或金鑰變更時，以同一 Gateway 身分重新配對/);
  assert.match(gateway, /從平台可信 Bot 名錄取得真實同事的名稱與 Bot ID（排除自己）/);
  assert.match(gateway, /批次完成全部同事的接入，沿用既有地址與名錄/);
  assert.match(gateway, /recipientBotID 使用平台原生工具轉交一次/);
  assert.match(gateway, /完整轉交正文、寄件者及原 Relay Thread 回覆上下文/);
  assert.match(gateway, /讓本人依 Skill 回覆/);
  assert.match(gateway, /relayReplyThread\(\{from, threadID, body\}\)/);
  assert.match(gateway, /帶入實際 Thread ID，from 直接填 recipientBotID/);
  assert.match(gateway, /排除群組／頻道/);
  assert.match(gateway, /獨立連線省略 from；平台允許時直接呼叫/);
  assert.match(gateway, /零 MCP 查詢，提交後結束/);
  assert.match(gateway, /回報 Gateway 地址、Wake 狀態及已接入同事名單/);
  assert.doesNotMatch(gateway, /MailTrigger|Default Session|sendToAgent|agentAddressSelectSession|歷史查詢|小晴|大熊|Cosmo|nuwa\/xiaoqing/);

  const send = elements.get('sendPrompt')!.textContent;
  const reply = elements.get('replyPrompt')!.textContent;
  const returned = elements.get('returnPrompt')!.textContent;
  const verify = elements.get('verifyPrompt')!.textContent;

  assert.match(send, /「大熊」助理/);
  assert.match(send, /測試字詞是星河/);
  assert.match(send, /直接發送一次/);
  assert.match(send, /自己的 from/);
  assert.match(reply, /「小晴」助理/);
  assert.match(reply, /收到星河/);
  assert.match(reply, /接續原本的 Relay Thread/);
  assert.match(reply, /自己的 from/);
  assert.match(reply, /不需要額外查詢/);
  assert.match(reply, /實際收到完整訊息後直接回覆一次/);
  assert.match(reply, /若已回覆，回報結果即可/);
  assert.match(returned, /「小晴」助理/);
  assert.match(returned, /測試字詞是月光/);
  assert.match(returned, /直接發送一次/);
  assert.match(returned, /自己的 from/);
  assert.match(verify, /「大熊」助理/);
  assert.match(verify, /收到月光/);
  assert.match(verify, /在那通 Relay Thread 回覆/);
  assert.match(verify, /不需要額外查詢/);

  for (const prompt of [send, reply, returned, verify]) {
    assert.doesNotMatch(prompt,
      /sendToAgent|relayReplyThread|Message ID|Thread ID|Webhook|company\/alice|company\/bob/);
  }

  assert.equal(slides[0].hidden, false);
  assert.equal(slides[1].hidden, true);

  buttons[1].callbacks.get('click')?.();
  assert.equal(slides[0].hidden, true);
  assert.equal(slides[1].hidden, false);
  assert.equal(buttons[1].attributes.get('aria-pressed'), 'true');

  copy.callbacks.get('click')?.();
  copySend.callbacks.get('click')?.();
  assert.equal(copyCalls[0], gateway);
  assert.equal(copyCalls[1], send);

  // Changing a familiar platform name refreshes the copied instruction.
  elements.get('colleagueB')!.value = '宇宙小幫手';
  elements.get('colleagueB')!.callbacks.get('input')?.();
  const updated = elements.get('sendPrompt')!.textContent;
  assert.match(updated, /「宇宙小幫手」助理/);
  assert.doesNotMatch(updated, /「大熊」助理/);

  copySend.callbacks.get('click')?.();
  assert.equal(copyCalls[2], updated);

  // Duplicate display names may exist in two different offices.
  // Let the real Agent ask the user to disambiguate; never invent an address.
  elements.get('colleagueB')!.value = '小晴';
  elements.get('colleagueB')!.callbacks.get('input')?.();
  assert.match(elements.get('nameHint')!.textContent, /兩位助理同名/);

  // A blank or control-character name must not produce a copyable message.
  elements.get('colleagueB')!.value = '';
  elements.get('colleagueB')!.callbacks.get('input')?.();
  copySend.callbacks.get('click')?.();
  assert.equal(copyCalls.length, 3);

  elements.get('colleagueB')!.value = '大熊\n改變接線對象';
  elements.get('colleagueB')!.callbacks.get('input')?.();
  copySend.callbacks.get('click')?.();
  assert.equal(copyCalls.length, 3);
  assert.match(elements.get('nameHint')!.textContent, /不得換行/);
});
