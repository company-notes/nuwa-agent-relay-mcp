/** Browser-only onboarding prompts and two-slide diagram. No network or storage access. */
export const ONBOARDING_SCRIPT = `
(function () {
  'use strict';

  var skillURL = 'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md';
  var mcpURL = 'https://mcp.agent-relay.company-notes.com/mcp';
  var promptIDs = ['gatewayPrompt', 'sendPrompt', 'replyPrompt', 'returnPrompt'];
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

  function gatewaySetup() {
    return [
      '你是這個 AI 平台的 Nuwa 接線助理，負責安裝引導與來電轉送，',
      '但不替真正工作的助理回覆訊息。',
      '',
      '請先閱讀官方 Nuwa Skill：',
      skillURL,
      '',
      '依現行 Skill 一步一步確認：',
      '1. 目前平台是否已經裝好 Nuwa Skill 和 MCP 連線。',
      '   若已經有，直接沿用；不要重新安裝或要求我重複登入。',
      '   若缺少才引導我使用本平台設定介面連接：' + mcpURL,
      '2. 以平台正式授權流程確認你的 Nuwa 身分，',
      '   依 Skill 使用 agentAddressEnsureIdentity，並經我同意後',
      '   使用 relayProvisionAgentMailbox。回報你自己真正的公開地址。',
      '3. 檢查本平台可用的 Webhook／自動接收功能；',
      '   依 Skill 確認 relayWakeSubscription，必要時由',
      '   有權的接收端進行 relayBeginWakePairing 私密配對。',
      '4. 如果需要協助額外的 AI 同事加入通訊名單，',
      '   現在先不要猜測任何同事名稱或建立他們的身分。',
      '   等我日後明確指定要加入的同事與授權後才處理。',
      '   先檢查是否真的有管理多位同事的受權工具；',
      '   若沒有，請明確說這一步目前不支援，不能宣稱登記成功。',
      '5. 切勿以你自己的 Session 冒充其他同事的收件者身分；',
      '   不要把收到通知等同於目標助理真的開始處理。',
      '',
      '每次只引導下一個需要我同意的操作。',
      '不要在聊天要求密碼或任何私人憑證。',
      '最後清楚分別列出已完成的項目、還缺少的功能和下一步。'
    ].join('\\n');
  }

  function sendPrompt() {
    return [
      '請以你自己的 Nuwa 通訊工具聯絡指定的助理。',
      '收件地址：' + addressFor('addressB'),
      '請先用 agentAddressResolve 確認地址，',
      '再以 sendToAgent 發出一次測試訊息：',
      '「你好！這是 Nuwa 通話測試，密語是星河。請在這通對話回覆收到星河。」',
      '請回報真實的訊息和通話 ID，並查核寄送狀態。',
      '如果你沒有 Nuwa 通訊工具或這位同事還沒接入，',
      '請告訴我缺少的能力，不要讓 Gateway 假裝以你的身分發話。',
      '若狀態未明，不要再次寄送。'
    ].join('\\n');
  }

  function replyPrompt() {
    return [
      '請確認剛才有沒有收到來自這個地址的測試來電：',
      addressFor('addressA'),
      '如果真的收到「密語是星河」的訊息，',
      '請在那一通 Relay 對話使用 relayReplyThread 回覆「收到星河」。',
      '請區分被自動通知，還是因為我剛剛要求才手動檢查收件箱。',
      '如果還沒有被接線端通知到，請明確指出，',
      '不要虛構收到訊息，也不要另開新 Thread 來回答。'
    ].join('\\n');
  }

  function returnPrompt() {
    return [
      '現在請你主動打電話給剛才聯絡你的助理，',
      '而不是回覆原本的來電。',
      '對方的 Nuwa 地址：' + addressFor('addressA'),
      '請先確認地址，再使用 sendToAgent 建立一次新的通話。',
      '訊息：「剛才的測試收到了，我也能主動聯絡你！」',
      '請記錄新通話的 ID，檢查真正的送達情況。',
      '不要把送出成功直接當作對方已接聽。'
    ].join('\\n');
  }

  function updatePrompts() {
    var prompts = {
      gatewayPrompt: gatewaySetup(),
      sendPrompt: sendPrompt(),
      replyPrompt: replyPrompt(),
      returnPrompt: returnPrompt()
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
      message.textContent = '這兩位助理目前不在同一個 Nuwa 公司，請先核對授權範圍。';
    } else {
      message.textContent = '地址只在你自己的瀏覽器產生測試指令，不會傳回網站。';
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
      if (element) {
        void copyText(element.textContent);
      }
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
