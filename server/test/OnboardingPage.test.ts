import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(ONBOARDING_HTML, /已接入過的助理沿用原有地址和有效設定/);
  assert.match(ONBOARDING_HTML, /辦公室同事可由接線助理一次接入/);
  assert.match(ONBOARDING_HTML, /Codex 等開發工具可直接接入/);
  assert.match(ONBOARDING_HTML, /id="platform"/);
  assert.match(ONBOARDING_HTML, /接線助理會從平台名錄取得每位同事的名稱和原生識別碼（Bot ID）/);
  assert.match(ONBOARDING_HTML, /共用一個自動來訊通知入口（Wake）/);
  assert.match(ONBOARDING_HTML, /id="verifyPrompt"/);
  assert.match(ONBOARDING_HTML, /助理 A 的名稱/);
  assert.match(ONBOARDING_HTML, /助理 B 的名稱/);
  assert.match(ONBOARDING_HTML, /填入平台上看到的助理名稱即可/);
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
  assert.doesNotMatch(ONBOARDING_SCRIPT, /relayProvisionAgentMailbox/);
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
  const ids = Array.from(ONBOARDING_HTML.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  const elements = new Map(ids.map((id) => [id, fakeElement()]));

  elements.get('platform')!.value = 'grokbot';
  elements.get('installMethod')!.value = 'direct';
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
  // Regression: selecting a platform assigns its Gateway identity before setup.
  assert.match(gateway, /Gateway 身分名稱固定使用「grokbot」/);
  assert.match(gateway, /agentAddressEnsureIdentity\(\{agentDisplayName: "grokbot"\}\)/);
  assert.match(elements.get('platformIntro')!.textContent, /接線身分名稱為「grokbot」/);
  assert.match(gateway, /GrokBot 使用 platform 模式/);
  assert.match(gateway, /配對連結直接交給使用者/);
  assert.doesNotMatch(gateway, /relayGatewayConfirmFirstContact|explicit／automatic/);
  assert.match(gateway, /GrokBot 的 Routine 若無原生轉交能力但支援 WakeParent，僅交接完整原始事件 JSON/);
  assert.match(gateway, /Routine 使用自包含指令/);
  assert.match(gateway, /唯一的 Wake 接收例行任務並完成驗證/);
  assert.match(gateway, /沿用有效的接線/);
  assert.match(gateway, /只變更 Webhook 接收網址時/);
  assert.match(gateway, /agent-relay\.company-notes\.com\/manage/);
  assert.match(gateway, /更新連線網址/);
  assert.match(gateway, /只有首次設定或更新 Bearer key 才使用配對流程/);
  assert.match(gateway, /從平台可信 Bot 名錄取得真實同事的名稱與 Bot ID（排除自己及群組／頻道）/);
  assert.match(gateway, /批次接入同事，沿用既有地址與名錄/);
  assert.match(gateway, /同步新增與改名，保留獨立成員的接入模式/);
  assert.match(gateway, /recipientBotID 使用平台原生工具轉交一次/);
  assert.match(gateway, /完整轉交正文、寄件者及原 Relay Thread 回覆上下文/);
  assert.match(gateway, /讓本人依 Skill 回覆/);
  assert.match(gateway, /relayReplyThread\(\{from, threadID, body\}\)/);
  assert.match(gateway, /帶入實際 Thread ID，from 直接填 recipientBotID/);
  assert.match(gateway, /排除自己及群組／頻道/);
  assert.match(gateway, /零 MCP 查詢，提交後結束/);
  assert.match(gateway, /回報 Gateway 地址、Wake 狀態及已接入同事名單/);
  assert.doesNotMatch(gateway, /MailTrigger|Default Session|sendToAgent|agentAddressSelectSession|歷史查詢|小晴|大熊|Cosmo|nuwa\/xiaoqing/);

  const send = elements.get('sendPrompt')!.textContent;
  const reply = elements.get('replyPrompt')!.textContent;
  const returned = elements.get('returnPrompt')!.textContent;
  const verify = elements.get('verifyPrompt')!.textContent;

  assert.match(send, /聯絡「大熊」/);
  assert.match(send, /測試字詞是星河/);
  assert.match(send, /直接發送一次/);
  assert.match(send, /唯一簡稱/);
  assert.match(send, /自己的 from/);
  assert.match(reply, /查收「小晴」/);
  assert.match(reply, /收到星河/);
  assert.match(reply, /接續原本的對話/);
  assert.match(reply, /自己的 from/);
  assert.match(reply, /不需要額外查詢/);
  assert.match(reply, /實際收到完整訊息後直接回覆一次/);
  assert.match(reply, /若已回覆，回報結果即可/);
  assert.match(returned, /聯絡「小晴」/);
  assert.match(returned, /測試字詞是月光/);
  assert.match(returned, /直接發送一次/);
  assert.match(returned, /唯一簡稱/);
  assert.match(returned, /自己的 from/);
  assert.match(verify, /查收「大熊」/);
  assert.match(verify, /收到月光/);
  assert.match(verify, /接續原本的對話/);
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
  assert.match(updated, /聯絡「宇宙小幫手」/);
  assert.doesNotMatch(updated, /聯絡「大熊」/);

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

  elements.get('platform')!.value = 'openmausbot';
  elements.get('platform')!.callbacks.get('change')?.();
  elements.get('colleagueA')!.value = 'Cosmo';
  elements.get('colleagueB')!.value = '小美';
  elements.get('colleagueB')!.callbacks.get('input')?.();

  const explicitGateway = elements.get('gatewayPrompt')!.textContent;

  assert.match(explicitGateway, /Gateway 身分名稱固定使用「openmausbot」/);
  assert.match(explicitGateway, /agentAddressEnsureIdentity\(\{agentDisplayName: "openmausbot"\}\)/);
  assert.match(elements.get('platformIntro')!.textContent, /接線身分名稱為「openmausbot」/);
  assert.doesNotMatch(explicitGateway, /身分名稱固定使用「grokbot」/);
  assert.match(explicitGateway, /每位同事的 nuwa-agent-relay 連接器/);
  assert.match(explicitGateway, /未開啟時列出助理名稱，請管理者開啟/);
  assert.match(explicitGateway, /explicit／automatic/);
  assert.match(explicitGateway, /thread: "new"/);
  assert.match(explicitGateway, /relayGatewayConfirmFirstContact，確認成功才結束/);
  assert.match(explicitGateway, /為字串時直接使用該 ID/);
  assert.match(explicitGateway, /完整替換既有轉交指令/);
  assert.doesNotMatch(explicitGateway, /WakeParent/);
  assert.match(elements.get('sendPrompt')!.textContent, /聯絡「小美」/);
  assert.match(elements.get('sendPrompt')!.textContent, /送出後結束/);
  assert.match(elements.get('returnPrompt')!.textContent, /聯絡「Cosmo」/);
  assert.match(elements.get('replyPrompt')!.textContent, /訊息自然到達後/);

  elements.get('platform')!.value = 'rakazo';
  elements.get('platform')!.callbacks.get('change')?.();

  const rakazoGateway = elements.get('gatewayPrompt')!.textContent;
  const rakazoGuide = readFileSync(new URL(
    '../../skills/nuwa-agent-relay/references/rakazo.md', import.meta.url,
  ), 'utf8');

  assert.match(elements.get('platformIntro')!.textContent, /接線身分名稱為「Rakazo Gateway」/);
  assert.match(rakazoGateway, /references\/rakazo\.md/);
  assert.match(rakazoGateway, /1–7 階段逐項執行/);
  assert.match(rakazoGateway, /每個階段都必須取得真實的工具回傳/);
  assert.match(rakazoGuide, /agentAddressEnsureIdentity\(\{agentDisplayName: "Rakazo Gateway"\}\)/);
  assert.match(rakazoGuide, /schedule_list/);
  assert.match(rakazoGuide, /schedule_create/);
  assert.match(rakazoGuide, /on: \{ webhook: true \}/);
  assert.match(rakazoGuide, /relayBeginWakePairing/);
  assert.match(rakazoGuide, /relayWakeSubscription/);
  assert.match(rakazoGuide, /relayGatewayOfficeCoworkers/);
  assert.match(rakazoGuide, /recipientBotID/);
  assert.match(rakazoGuide, /firstContactMode/);
  assert.ok(rakazoGuide.indexOf('schedule_create') < rakazoGuide.indexOf('relayBeginWakePairing'));
  assert.doesNotMatch(rakazoGuide, /[\u3400-\u9fff]/);

  // Do not make GrokBot and OpenMausBot use Rakazo's native scheduling tools.
  assert.doesNotMatch(explicitGateway, /schedule_create|on: \{ webhook: true \}/);
  assert.doesNotMatch(gateway, /schedule_create|on: \{ webhook: true \}/);

  elements.get('platform')!.value = 'codex';
  elements.get('platform')!.callbacks.get('change')?.();

  const independent = elements.get('gatewayPrompt')!.textContent;

  assert.match(independent, /無須 Gateway/);
  assert.match(independent, /agentAddressStartWork/);
  assert.match(independent, /X-Nuwa-Work-Mode: codex/);
  assert.doesNotMatch(independent, /relayGatewayConfirmFirstContact|WakeParent/);
  assert.equal(elements.get('installMethodPicker')!.hidden, false);
  assert.equal(elements.get('directOptions')!.hidden, false);
  assert.equal(elements.get('studioOptions')!.hidden, true);

  elements.get('installMethod')!.value = 'studio';
  elements.get('installMethod')!.callbacks.get('change')?.();

  assert.equal(elements.get('directOptions')!.hidden, true);
  assert.equal(elements.get('studioOptions')!.hidden, false);
});


test('browser language and manual selection localize prompts while preserving inputs', () => {
  const ids = [...ONBOARDING_HTML.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const languages = [
    { tag: 'zh-TW', expected: 'zh-Hant', prompt: /請擔任 Rakazo/ },
    { tag: 'zh-CN', expected: 'zh-Hans', prompt: /请担任 Rakazo/ },
    { tag: 'en-US', expected: 'en', prompt: /Act as the Nuwa office Gateway/ },
  ];

  for (const { tag, expected, prompt } of languages) {
    const elements = new Map(ids.map((id) => [id, fakeElement()]));
    elements.get('platform')!.value = 'rakazo';
    elements.get('installMethod')!.value = 'direct';
    elements.get('colleagueA')!.value = 'Mira';
    elements.get('colleagueB')!.value = 'Leon';

    const textNode = { nodeValue: '開始使用' };
    const languageStorage = new Map<string, string>();
    const browser: { lang: string; title: string } = {
      lang: 'zh-Hant', title: 'Nuwa Relay｜讓不同平台的 AI 助理互相聯絡',
    };
    const documentStub = {
      body: {},
      documentElement: browser,
      get title() { return browser.title; },
      set title(value: string) { browser.title = value; },
      getElementById(id: string) {
        const element = elements.get(id);
        if (!element) throw Error('Unexpected DOM id: ' + id);
        return element;
      },
      createTreeWalker() {
        let used = false;
        return {
          nextNode() {
            if (used) return null;
            used = true;
            return textNode;
          },
        };
      },
      querySelectorAll() { return []; },
    };

    runInNewContext(ONBOARDING_SCRIPT, {
      document: documentStub,
      navigator: { languages: [tag], language: tag },
      window: { localStorage: {
        getItem(key: string) { return languageStorage.get(key) || null; },
        setItem(key: string, value: string) { languageStorage.set(key, value); },
      } },
      setTimeout() { return 1; },
      clearTimeout() {},
    });

    assert.equal(browser.lang, expected);
    assert.equal(elements.get('language')!.value, expected);
    assert.match(elements.get('gatewayPrompt')!.textContent, prompt);
    assert.match(elements.get('gatewayPrompt')!.textContent, /references\/rakazo\.md/);
    assert.equal(textNode.nodeValue, expected === 'en' ? 'Get started' :
      expected === 'zh-Hans' ? '开始使用' : '開始使用');

    const next = expected === 'en' ? 'zh-Hans' : 'en';
    elements.get('language')!.value = next;
    elements.get('language')!.callbacks.get('change')?.();

    assert.equal(browser.lang, next);
    assert.equal(languageStorage.get('nuwa.relay.language'), next);
    assert.equal(elements.get('colleagueA')!.value, 'Mira');
    assert.equal(elements.get('colleagueB')!.value, 'Leon');
    assert.match(elements.get('sendPrompt')!.textContent,
      next === 'en' ? /starlight/ : /测试词是星河/);

    elements.get('platform')!.value = 'codex';
    elements.get('platform')!.callbacks.get('change')?.();
    assert.match(elements.get('gatewayPrompt')!.textContent,
      /X-Nuwa-Work-Mode: codex/);
    assert.equal(elements.get('studioOptions')!.hidden, true);
    assert.equal(elements.get('directOptions')!.hidden, false);
  }

  assert.match(ONBOARDING_HTML, /id="language"/);
  assert.match(ONBOARDING_SCRIPT, /zh-Hans/);
  assert.match(ONBOARDING_SCRIPT, /Native work guide/);
});
