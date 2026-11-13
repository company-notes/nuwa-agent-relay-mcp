/** Browser-only onboarding prompts and two-slide diagram. No network or storage access. */
export const ONBOARDING_SCRIPT = `
(function () {
  'use strict';

  var skillURL = 'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md';
  var mcpURL = 'https://mcp.agent-relay.company-notes.com/mcp';
  var promptIDs = ['gatewayPrompt', 'sendPrompt', 'replyPrompt', 'returnPrompt', 'verifyPrompt'];
  var toastTimeout;

  function fieldValue(id) {
    var element = document.getElementById(id);
    return element ? element.value.trim() : '';
  }

  function validName(name) {
    return name.length > 0 && name.length <= 120 &&
      !/[\\u0000-\\u001f\\u007f]/.test(name);
  }

  function colleagueName(id) {
    var name = fieldValue(id);
    return validName(name) ? name : '另一位';
  }

  function namesReady() {
    return validName(fieldValue('colleagueA')) && validName(fieldValue('colleagueB'));
  }

  function gatewaySetup() {
    return [
      '請幫我把這個 AI 平台接上 Nuwa，讓辦公室目前的 AI 同事都能互相聯絡，',
      '也能接到其他平台的來電。你是接線助理，負責設定與轉接，不代替同事回答。',
      '',
      '請先閱讀官方 Nuwa 助理指南：' + skillURL,
      '檢查這個平台是否已連上 Nuwa：' + mcpURL,
      '如果 Skill 和 MCP 已經裝好，直接沿用，不要重複安裝。',
      '',
      '請盤點目前平台可辨識的同事，核對他們的 Nuwa 地址及平台內部收件對象。',
      '預設希望目前所有符合資格的同事都能接線，不要叫我逐一輸入同事名字。',
      '請依照指南設定一次共用的收件入口，並處理能合法設定的接線對應。',
      '若需要同事本人的授權，請逐一交由有權的助理批准，不能替他們同意。',
      '如果平台無法自動查到同事或還沒有完成授權，請清楚列出缺口，',
      '不要把「已找到同事」當成「已接通」。',
      '',
      '請每次只引導我完成下一個必要的設定，不要要求我貼密碼或私密憑證。'
    ].join('\\n');
  }

  function sendPrompt() {
    return [
      '請透過 Nuwa 找另一間辦公室的「' + colleagueName('colleagueB') +
        '」助理聊一下。',
      '告訴他：「你好，我們來測試通話，密語是星河。收到後請回覆密語。」',
      '若有同名的助理或找不到人，先問我，不要猜測。'
    ].join('\\\\n');
  }

  function replyPrompt() {
    return [
      '如果你收到剛才「' + colleagueName('colleagueA') +
        '」助理傳來的測試訊息，',
      '請直接在原本的對話回覆：「收到星河！」',
      '如果還沒收到，就告訴我。'
    ].join('\\\\n');
  }

  function returnPrompt() {
    return [
      '請透過 Nuwa 主動找另一間辦公室的「' + colleagueName('colleagueA') +
        '」助理聊一下。',
      '告訴他：「換我打給你了！這次密語是月光，請回覆密語。」',
      '若有同名的助理或找不到人，先問我，不要猜測。'
    ].join('\\\\n');
  }

  function verifyPrompt() {
    return [
      '如果你收到「' + colleagueName('colleagueB') +
        '」助理剛才主動打來的電話，',
      '請在那段對話回覆：「收到月光！」',
      '如果還沒收到，就告訴我。'
    ].join('\\\\n');
  }

  function updatePrompts() {
    var prompts = {
      gatewayPrompt: gatewaySetup(),
      sendPrompt: sendPrompt(),
      replyPrompt: replyPrompt(),
      returnPrompt: returnPrompt(),
      verifyPrompt: verifyPrompt()
    };

    promptIDs.forEach(function (id) {
      document.getElementById(id).textContent = prompts[id];
    });

    var first = fieldValue('colleagueA');
    var second = fieldValue('colleagueB');
    var message = document.getElementById('nameHint');

    if ((first && !validName(first)) || (second && !validName(second))) {
      message.textContent = '請填寫平台上實際看到的助理名稱，每個名稱限 120 字且不得換行。';
    } else if (namesReady()) {
      message.textContent = first === second
        ? '兩位助理同名；發訊時 Nuwa 可能需要你進一步確認是哪一位。'
        : '四段測試指令已填入兩位助理名稱，直接複製即可。';
    } else {
      message.textContent = '只要填入助理在平台上顯示的名稱，不需要 Nuwa 地址。';
    }
  }

  function showSlide(index) {
    document.querySelectorAll('[data-diagram-slide]').forEach(function (slide) {
      slide.hidden = slide.getAttribute('data-diagram-slide') !== String(index);
    });

    document.querySelectorAll('[data-diagram-choice]').forEach(function (button) {
      button.setAttribute('aria-pressed',
        String(button.getAttribute('data-diagram-choice') === String(index)));
    });
  }

  function notify(text) {
    var toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('active');
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(function () {
      toast.classList.remove('active');
    }, 2500);
  }

  async function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      notify('請選取指令，手動複製到助理對話。');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      notify('已複製到剪貼簿。');
    } catch (error) {
      notify('無法複製，請選取指令後手動複製。');
    }
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var element = document.getElementById(button.getAttribute('data-copy'));
      if (!element) {
        return;
      }

      if (button.getAttribute('data-copy') !== 'gatewayPrompt' && !namesReady()) {
        notify('請先填入兩位助理在平台上顯示的名稱。');
        return;
      }

      void copyText(element.textContent);
    });
  });

  document.querySelectorAll('[data-diagram-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      showSlide(button.getAttribute('data-diagram-choice'));
    });
  });

  ['colleagueA', 'colleagueB'].forEach(function (id) {
    var element = document.getElementById(id);
    element.addEventListener('input', updatePrompts);
    element.addEventListener('change', updatePrompts);
  });

  showSlide(0);
  updatePrompts();
}());
`;
