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
    ['OpenMausBot onboarding links its seven-stage verified English guide', () => {
      const office = new OnboardingScenario(onboarding, 'openmausbot');
      const setup = office.prompt('gateway');
      const detail = readFileSync(new URL('../skills/nuwa-agent-relay/references/openmausbot.md', import.meta.url), 'utf8');
      check(setup.includes('/references/openmausbot.md') && setup.includes('七個階段'),
        'The prompt must select the platform reference.');
      check(detail.includes('relayBeginWakePairing') && detail.includes('coordinate_bots') &&
        detail.includes('relayGatewayConfirmFirstContact'), 'The reference must cover Wake and first contact.');
      check(detail.includes('connector') && detail.includes('Completion evidence:'),
        'The reference must verify coworker connector readiness.');
    }],
    ['GrokBot onboarding links its full English, fast native dispatch guide', () => {
      const office = new OnboardingScenario(onboarding, 'grokbot');
      const setup = office.prompt('gateway');
      const detail = readFileSync(new URL('../skills/nuwa-agent-relay/references/grokbot.md', import.meta.url), 'utf8');
      check(setup.includes('/references/grokbot.md') && setup.includes('七個階段'),
        'GrokBot follows the same short installation contract as Rakazo.');
      check(detail.includes('WakeParent') && detail.includes('zero additional Nuwa MCP') &&
        detail.includes('Completion evidence:'), 'GrokBot must preserve its fast native dispatch.');
    }],
    ['Rakazo installer links the complete, English-only platform workflow', () => {
      const office = new OnboardingScenario(onboarding, 'rakazo');
      const setup = office.prompt('gateway');
      const detail = readFileSync(new URL('../skills/nuwa-agent-relay/references/rakazo.md', import.meta.url), 'utf8');

      check(setup.includes('/references/rakazo.md') && setup.includes('七個階段'),
        'The prompt must select and order the Rakazo-specific instructions.');
      check(detail.includes('schedule_list') && detail.includes('schedule_create') &&
        detail.includes('on: { webhook: true }'), 'Use the real event-only routine schema.');
      check(detail.includes('relayBeginWakePairing') && detail.includes('relayWakeSubscription') &&
        detail.includes('relayGatewayOfficeCoworkers'), 'Check each setup stage before proceeding.');
      check(detail.includes('recipientBotID') && detail.includes('threadMode') &&
        detail.includes('firstContactMode'), 'Bind real coworker identity and routing.');
      check(!/[\u3400-\u9fff]/.test(detail), 'Platform references must be in English.');
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
      const reference = readFileSync(new URL('../skills/nuwa-agent-relay/references/openmausbot.md', import.meta.url), 'utf8');
      const start = reference.indexOf('### 6. Install native delivery');
      check(start >= 0, 'Put the complete OpenMausBot dispatch algorithm in its own section.');
      const end = reference.indexOf('\n### 7.', start + 1);
      const workflow = reference.slice(start, end < 0 ? undefined : end);
      const first = workflow.indexOf('`thread: "new"`');
      const confirm = workflow.indexOf('relayGatewayConfirmFirstContact', first);
      const finish = workflow.indexOf('finish', confirm);
      check(first >= 0 && confirm > first && finish > confirm,
        'A reserved first contact must create once, confirm the actual receipt, then finish.');
      check(workflow.includes('`thread: recipientPlatformThreadID`') &&
        workflow.includes('`senderSessionID`') && workflow.includes('`recipientSessionID`'),
        'Established sender/recipient routes must use the supplied native ID directly.');
    }],
  ];
}

const skill = readFileSync(new URL('../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../server/src/OnboardingInteractions.ts', import.meta.url), 'utf8');

for (const [name, run] of scenarios(skill, onboarding, assert.ok)) {
  test(name, run);
}
