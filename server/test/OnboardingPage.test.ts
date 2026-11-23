import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import test from 'node:test';

import { ONBOARDING_HTML } from '../src/OnboardingContent';
import { ONBOARDING_SCRIPT } from '../src/OnboardingInteractions';
import { ONBOARDING_CSS } from '../src/OnboardingStyle';
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
  assert.match(ONBOARDING_HTML, /首次安裝或重新接入時，建議先選擇擅長工具操作的模型/);
  assert.match(ONBOARDING_CSS, /#setupModelAdvice[^}]*font-weight:\s*(?:7\d\d|8\d\d|bold)/);
  assert.match(ONBOARDING_HTML, /Terra、Claude Haiku、Grok 4\.7/);
  assert.match(ONBOARDING_HTML, /OpenCode 可選 GLM-5\.3-Flash 或 Kimi K2\.6/);
  assert.match(ONBOARDING_HTML, /推理程度，建議設為中或以上/);
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

  const grokGuide = readFileSync(new URL(
    '../../skills/nuwa-agent-relay/references/grokbot.md', import.meta.url,
  ), 'utf8');

  assert.match(gateway, /references\/grokbot\.md/);
  assert.match(gateway, /七個階段/);
  assert.match(gateway, /實際回覆後才表示接通/);
  assert.match(grokGuide, /agentAddressEnsureIdentity\(\{agentDisplayName: "grokbot"\}\)/);
  assert.match(grokGuide, /WakeParent/);
  assert.match(grokGuide, /native Send to Agent once/);
  assert.match(grokGuide, /Zero|zero additional Nuwa MCP/);
  assert.match(elements.get('platformIntro')!.textContent, /接線身分名稱為「grokbot」/);
  assert.doesNotMatch(gateway, /MailTrigger|Default Session|nuwa\/xiaoqing/);

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

  const openmausGuide = readFileSync(new URL(
    '../../skills/nuwa-agent-relay/references/openmausbot.md', import.meta.url,
  ), 'utf8');

  assert.match(explicitGateway, /references\/openmausbot\.md/);
  assert.match(explicitGateway, /七個階段/);
  assert.match(openmausGuide, /agentAddressEnsureIdentity\(\{agentDisplayName: "openmausbot"\}\)/);
  assert.match(openmausGuide, /coordinate_bots/);
  assert.match(openmausGuide, /relayGatewayConfirmFirstContact/);
  assert.match(openmausGuide, /thread: "new"/);
  assert.match(openmausGuide, /thread: recipientPlatformThreadID/);
  assert.match(openmausGuide, /firstContactMode: "automatic"/);
  // A fresh office must have a real enabled webhook receiver before the
  // human is asked to submit its protected URL and key for Wake pairing.
  const omausStageOne = openmausGuide.split('### 1. Choose a Gateway')[1]
    .split('### 2. Authorize the Gateway identity')[0];
  const omausStageThree = openmausGuide.split('### 3. Configure the receiving Routine')[1]
    .split('### 4. Pair and verify one Wake')[0];
  const omausStageFour = openmausGuide.split('### 4. Pair and verify one Wake')[1]
    .split('### 5. Enroll coworkers')[0];
  const omausStageSeven = openmausGuide.split('### 7. Verify first contact')[1]
    .split('## Recovery and safety')[0];
  assert.match(omausStageOne, /native forwarding schema/);
  assert.doesNotMatch(omausStageOne, /real native tool receipt exposes/);
  assert.match(omausStageThree, /Create and enable the \*\*actual Webhook Routine before requesting Wake pairing/);
  assert.match(omausStageThree, /externally reachable HTTPS/);
  assert.match(omausStageThree, /complete webhook URL and Bearer key/);
  assert.match(omausStageFour, /After stage 3 proves the receiver exists/);
  assert.match(omausStageSeven, /second message from the same sender/);
  assert.match(omausStageSeven, /confirmed first-contact binding/);
  assert.ok(openmausGuide.indexOf('### 3. Configure the receiving Routine') <
    openmausGuide.indexOf('### 4. Pair and verify one Wake'));

  assert.match(elements.get('platformIntro')!.textContent, /接線身分名稱為「openmausbot」/);
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
  assert.match(rakazoGateway, /七個階段/);
  assert.match(rakazoGateway, /每一步都檢查真實的工具回傳/);
  assert.match(rakazoGateway, /完成角色設定後，請接續執行安裝步驟/);
  // The receiver cannot provide a successful native-forward receipt before
  // its webhook Routine exists. The first actual forward is a stage 7 proof.
  const stageOne = rakazoGuide.split('### 1. Choose one Gateway bot')[1]
    .split('### 2. Connect Nuwa as the Gateway')[0];
  const stageTwo = rakazoGuide.split('### 2. Connect Nuwa as the Gateway')[1]
    .split('### 3. Configure the webhook-only Routine')[0];
  const stageThree = rakazoGuide.split('### 3. Configure the webhook-only Routine')[1]
    .split('### 4. Pair and verify Wake')[0];
  const stageFour = rakazoGuide.split('### 4. Pair and verify Wake')[1]
    .split('### 5. Enroll coworkers one at a time')[0];
  const stageFive = rakazoGuide.split('### 5. Enroll coworkers one at a time')[1]
    .split('### 6. Install the complete receiver procedure')[0];
  const stageSeven = rakazoGuide.split('### 7. Verify a complete conversation')[1]
    .split('## Boundaries and recovery')[0];
  assert.match(stageOne, /message_bot|native Bot-to-Bot forwarding tool/);
  assert.match(stageTwo, /Manage MCP servers/);
  assert.match(stageTwo, /All bots/);
  assert.match(stageTwo, /each intended coworker/);
  assert.match(stageTwo, /human.*confirm|human.*MCP|human.*open/);
  assert.match(stageFour, /continue with stage 5/);
  assert.match(stageFive, /relayGatewayOfficeCoworkers/);
  assert.match(stageFive, /If.*empty.*enroll|empty.*enroll/);
  assert.doesNotMatch(stageOne, /success receipt|stop the installation at this stage/);
  assert.match(stageThree, /Routine name\/ID/);
  assert.match(stageSeven, /actual native forwarding result|native forwarding result/);
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
  const modelAdvice = ONBOARDING_HTML.match(/id="setupModelAdvice">([^<]+)<\/p>/)?.[1];
  assert.ok(modelAdvice, 'Setup advice must appear before the installation prompt');

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
    const modelAdviceNode = { nodeValue: modelAdvice };
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
        if (!element) {
          throw Error('Unexpected DOM id: ' + id);
        }
        return element;
      },
      createTreeWalker() {
        const nodes = [textNode, modelAdviceNode];
        let index = 0;
        return {
          nextNode() {
            return nodes[index++] ?? null;
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
    assert.match(modelAdviceNode.nodeValue,
      expected === 'en' ? /For first-time setup or reconnection/ :
        expected === 'zh-Hans' ? /首次安装或重新接入/ : /首次安裝或重新接入/);
    assert.match(elements.get('gatewayPrompt')!.textContent,
      expected === 'en' ? /After establishing your role, continue the installation steps/ :
        expected === 'zh-Hans' ? /完成角色设置后继续执行安装步骤/ :
          /完成角色設定後，請接續執行安裝步驟/);

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
