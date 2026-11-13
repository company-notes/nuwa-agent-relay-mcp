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
    return element ? element.value.trim().toLowerCase() : '';
  }

  function validAddress(text) {
    var parts = text.split('/');
    return (parts.length === 2 || parts.length === 3) &&
      parts.every(function (part) {
        return /^[a-z0-9][a-z0-9-]*$/.test(part);
      });
  }

  function addressFor(id) {
    var address = fieldValue(id);
    return validAddress(address) ? address : '（先填入這位助理真正的 Nuwa 地址）';
  }

  function colleagueName(id) {
    var address = fieldValue(id);
    return validAddress(address) ? address.split('/')[1] : '另一位';
  }

  function addressesReady() {
    var sender = fieldValue('addressA');
    var recipient = fieldValue('addressB');

    return validAddress(sender) && validAddress(recipient) &&
      sender.split('/')[0] === recipient.split('/')[0] &&
      sender !== recipient;
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
      '請透過 Nuwa 跟另一間辦公室的「' + colleagueName('addressB') +
        '」助理聊一下（地址：' + addressFor('addressB') + '）。',
      '告訴對方：「你好！來測試一下通話，密語是星河。請回答我密語。」',
      '請只發一次，若尚未送出就告訴我。'
    ].join('\\n');
  }

  function replyPrompt() {
    return [
      '剛才「' + colleagueName('addressA') + '」助理（' + addressFor('addressA') +
        '）打電話給你，密語是星河。',
      '如果你真的收到，請直接在剛才那段對話回覆：「收到星河！」',
      '如果還沒收到，就告訴我，不要猜測。'
    ].join('\\n');
  }

  function returnPrompt() {
    return [
      '現在換你主動聯絡另一間辦公室的「' + colleagueName('addressA') +
        '」助理（地址：' + addressFor('addressA') + '）。',
      '開一段新的對話，告訴對方：「我也能主動打給你！這次的密語是月光。」',
      '請對方收到後回覆密語。'
    ].join('\\n');
  }

  function verifyPrompt() {
    return [
      '「' + colleagueName('addressB') + '」助理（' + addressFor('addressB') +
        '）剛才主動聯絡你，密語是月光。',
      '如果你真的收到，請直接在那段對話回覆：「收到月光！」',
      '如果還沒收到，就告訴我。'
    ].join('\\n');
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

    var sender = fieldValue('addressA');
    var recipient = fieldValue('addressB');
    var message = document.getElementById('addressHint');

    if ((sender && !validAddress(sender)) || (recipient && !validAddress(recipient))) {
      message.textContent = '請填入助理真正回報的地址，通常是 公司/助理/對話，以斜線分隔。';
    } else if (sender && recipient && sender.split('/')[0] !== recipient.split('/')[0]) {
      message.textContent = '兩位助理的地址不在同一個 Nuwa 組織，請先確認。';
    } else if (sender && recipient && sender === recipient) {
      message.textContent = '請填入兩位不同助理的地址。';
    } else if (addressesReady()) {
      message.textContent = '四段測試指令都已填好地址，直接複製即可，不必再改。';
    } else {
      message.textContent = '請填入兩位助理的地址；網頁只會在本機組成指令，不會上傳。';
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

      if (button.getAttribute('data-copy') !== 'gatewayPrompt' && !addressesReady()) {
        notify('請先填入同一組織中兩位不同助理的有效 Nuwa 地址。');
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

  ['addressA', 'addressB'].forEach(function (id) {
    var element = document.getElementById(id);
    element.addEventListener('input', updatePrompts);
    element.addEventListener('change', updatePrompts);
  });

  showSlide(0);
  updatePrompts();
}());
`;
