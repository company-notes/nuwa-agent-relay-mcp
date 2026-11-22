import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

class OnboardingScenario {
  constructor(source, platform) {
    this.elements = new Map();
    this.element('platform').value = platform;
    this.element('colleagueA').value = '小晴';
    this.element('colleagueB').value = '小美';
    const script = Function(source.replace('export const ONBOARDING_SCRIPT =', 'return'))();
    Function('document', 'navigator', 'setTimeout', 'clearTimeout', script)({
      getElementById: (id) => this.element(id),
      querySelectorAll: () => [],
    }, {}, () => 1, () => {});
  }

  element(id) {
    if (!this.elements.has(id)) {
      this.elements.set(id, {
        value: '', textContent: '', hidden: false,
        addEventListener() {},
      });
    }

    return this.elements.get(id);
  }

  prompt(id) {
    return this.element(id + 'Prompt').textContent;
  }
}

function scenarios(skill, onboarding, check) {
  return [
    ['OpenMausBot onboarding gives human the pairing link and checks each connector', () => {
      const office = new OnboardingScenario(onboarding, 'openmausbot');
      const setup = office.prompt('gateway');

      check(/配對連結.*使用者|使用者.*配對連結/.test(setup), 'The user must receive the protected pairing link.');
      check(/每位同事.*連接器/.test(setup) && /未開啟.*管理者/.test(setup),
        'OpenMausBot must check every coworker connector and name missing activation to the administrator.');
    }],
    ['Changing only the verified Wake URL uses Relay management, preserving its key', () => {
      for (const platform of ['grokbot', 'openmausbot']) {
        const office = new OnboardingScenario(onboarding, platform);
        const setup = office.prompt('gateway');

        check(setup.includes('更新連線網址') &&
          setup.includes('agent-relay.company-notes.com/manage'),
          'The selected office must be directed to its existing Session Wake URL editor.');
        check(setup.includes('只有首次設定或更新 Bearer key 才使用配對流程'),
          'Key changes and first pairing remain separate from URL-only relocation.');
      }

      check(skill.includes('更新連線網址') &&
        skill.includes('Quick Tunnel') && skill.includes('preserves'),
        'The canonical Skill must explain URL-only relocation and retained credentials.');
    }],
    ['Rakazo installer creates an event-only Wake Routine before sharing the pairing link', () => {
      const office = new OnboardingScenario(onboarding, 'rakazo');
      const setup = office.prompt('gateway');

      check(setup.includes('schedule_list') &&
        setup.includes('schedule_create') &&
        setup.includes('on: { webhook: true }'),
        'Rakazo must inspect existing routines then use its actual webhook event tool.');
      check(setup.includes('不設定 cron、every、runAt') &&
        setup.includes('先完成 Routine 建立，才產生 Wake 配對連結'),
        'A webhook-only Routine needs no timer, and must precede pairing.');
      check(setup.indexOf('schedule_create') < setup.indexOf('配對連結'),
        'Rakazo webhook creation must be described before the Wake pairing link.');
      check(setup.includes('Rakazo Routines') &&
        setup.includes('不要把 key 貼在聊天中'),
        'Only the human retrieves the protected webhook URL and key in Rakazo Routines.');
      check(setup.includes('工具 Schema 或實際錯誤') &&
        !setup.includes('必須使用者手動建立 Routine'),
        'An AI should inspect real tool errors, not guess that the platform lacks webhooks.');
    }],
    ['OpenMausBot bidirectional test ends after sender submission', () => {
      const office = new OnboardingScenario(onboarding, 'openmausbot');

      for (const id of ['send', 'return']) {
        check(/發送一次/.test(office.prompt(id)) && /送出後結束/.test(office.prompt(id)),
          'The sending coworker submits once and finishes; receipt is asynchronous.');
      }

      check(/實際收到/.test(office.prompt('reply')) && /自然回覆|自然到達/.test(office.prompt('reply')),
        'The optional receiver prompt is for an already delivered message, not an immediate probe.');
    }],
    ['OpenMausBot first dispatch confirms; bound dispatch reuses the exact native Thread', () => {
      const start = skill.indexOf('### OpenMausBot');
      check(start >= 0, 'Put the complete OpenMausBot dispatch algorithm in its own section.');
      const end = skill.indexOf('\n## ', start + 1);
      const workflow = skill.slice(start, end < 0 ? undefined : end);
      const first = workflow.indexOf('`thread: "new"`');
      const confirm = workflow.indexOf('relayGatewayConfirmFirstContact', first);
      const finish = workflow.indexOf('finish', confirm);
      check(first >= 0 && confirm > first && finish > confirm,
        'A reserved first contact must create once, confirm the actual receipt, then finish.');
      check(workflow.includes('`thread: recipientPlatformThreadID`') &&
        workflow.includes('`senderSessionID`') && workflow.includes('`recipientSessionID`'),
        'Established sender/recipient routes must use the supplied native ID directly.');
    }],
    ['GrokBot keeps the existing native dispatch, parent handoff and reply identity', () => {
      const office = new OnboardingScenario(onboarding, 'grokbot');
      const setup = office.prompt('gateway');

      check(setup.includes('GrokBot 使用 platform 模式') && setup.includes('WakeParent，僅交接完整原始事件 JSON'),
        'GrokBot must retain platform mode and the raw WakeParent handoff.');
      check(!setup.includes('relayGatewayConfirmFirstContact') && setup.includes('from 直接填 recipientBotID'),
        'GrokBot must not inherit explicit routing and must retain the coworker reply identity.');
    }],
  ];
}

const skill = readFileSync(new URL('../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../server/src/OnboardingInteractions.ts', import.meta.url), 'utf8');

for (const [name, run] of scenarios(skill, onboarding, assert.ok)) {
  test(name, run);
}
