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
    ['Office setup and later reconciliation use the trusted whole-office directory without changing Wake dispatch', () => {
      const start = skill.indexOf('### Shared office');
      const end = skill.indexOf('### Existing Wake URL relocation', start);
      const workflow = skill.slice(start, end);

      check(workflow.includes('all eligible individual Bots') &&
        workflow.includes('no additional enrollment selection'), 'Use the existing office authorization without a new selection step.');

      check(workflow.includes('relayGatewayRemoveTeammate') && workflow.includes('rejoinRemoved: true') &&
        workflow.includes('removed: true'), 'Preserve owner removals until an explicit rejoin.');

      check(workflow.includes('trusted native sender ID') && workflow.includes('never enroll from a Wake'),
        'Only management or native coworker context can initiate enrollment.');
    }],
    ['GrokBot forwards supplied integrity context once; the receiving coworker alone retrieves missing text', () => {
      const detail = readFileSync(new URL('../skills/nuwa-agent-relay/references/grokbot.md', import.meta.url), 'utf8');
      const stage = detail.slice(detail.indexOf('### 6.'), detail.indexOf('### 7.'));
      const common = skill.slice(skill.indexOf('## Gateway dispatch'), skill.indexOf('### Platform-specific Gateway instructions'));

      for (const workflow of [common, stage]) {
        check(workflow.includes('bodyLength') && workflow.includes('bodyByteLength') &&
          workflow.includes('bodySHA256'), 'Forward the supplied original metadata.');
        check(workflow.includes('Do not measure') && workflow.includes('repair JSON') &&
          workflow.includes('do not fetch'), 'Keep Gateway work to forwarding; no diagnostic or recovery calls.');
        check(workflow.includes('If the received body is incomplete and you need the full text') &&
          workflow.includes('relayMessage({from: "<actual recipientBotID>", messageID: "<actual messageID>"})'),
          'Give the actual recipient a fixed, authorized recovery instruction before the body.');
      }

      check(stage.includes('available authenticated event') && stage.includes('WakeParent') &&
        stage.includes('zero additional Nuwa MCP'), 'Keep the existing one-handoff and one-native-send path.');
    }],
    ['Optional FFL collaboration keeps long text fallback and original reply routing', () => {
      const start = skill.indexOf('## Optional FFL file collaboration');
      check(start >= 0, 'Publish the optional collaboration policy in the core Skill.');
      const end = skill.indexOf('\n## ', start + 1);
      const workflow = skill.slice(start, end < 0 ? undefined : end);
      check(workflow.includes('2,000') && workflow.includes('4 KiB') &&
        workflow.includes('300–800'), 'Publish the long-message and summary guidance.');
      check(workflow.includes('fflShareFile') && workflow.includes('fflShareText') &&
        workflow.includes('fflDownload') && workflow.includes('fflStopSession'),
        'Use actual FFL tool names and share lifecycle.');
      check(workflow.includes('complete authorized text') &&
        workflow.includes('not install') && workflow.includes('original Relay Thread'),
        'FFL is optional; preserve full text fallback and original routing.');
    }],
    ['Rakazo Worker notifications authorize together with the dedicated Worker connection', () => {
      const start = skill.indexOf('## Optional local Worker delegation');
      const end = skill.indexOf('\n## ', start + 1);
      const workflow = skill.slice(start, end);
      const guide = readFileSync(new URL('../skills/nuwa-agent-relay/references/rakazo.md', import.meta.url), 'utf8');
      const notification = guide.slice(guide.indexOf('## Optional Worker delegation with automatic completion notifications'));

      check(workflow.includes('before issuing a') && workflow.includes('authorized together') &&
        workflow.includes('No separate notification'), 'Create the native receiver before combined authorization.');
      check(workflow.includes('shared OAuth grant cannot identify individual Bots') &&
        notification.includes('shared OAuth grant cannot distinguish individual Bots'), 'Do not infer a Bot identity from a common grant.');
      check(notification.includes('schedule_list') && notification.includes('on: { webhook: true }') &&
        notification.includes('Preserve any existing Nuwa Wake receiver'), 'Use a distinct native webhook-only Routine.');
      check(notification.includes('Never ask for the key in chat') &&
        notification.includes('managedByStudio=true and enabled=true') &&
        notification.includes('Do not dispatch before successful authorization'), 'Verify owner authorization before dispatch.');
      check(notification.includes('work.turn_finished') && notification.includes('work_status / work_messages') &&
        notification.includes('notificationBound=true'), 'Verify Job completion and native callback delivery.');
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
