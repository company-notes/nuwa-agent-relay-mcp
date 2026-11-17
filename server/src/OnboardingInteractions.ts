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
      '請為目前這個 AI 平台設定 Nuwa 辦公室總機，讓同一 Organization 的各辦公室',
      '可以互相傳訊、委派工作及接續對話。',
      '',
      '先閱讀最新版官方 Nuwa Skill：' + skillURL,
      'Nuwa MCP 入口：' + mcpURL,
      '',
      '你是本辦公室的 Gateway，負責一次完成接線設定與維護分機名錄。',
      'Relay 通知你有來電時，使用平台原有的 Bot 傳訊能力，將訊息',
      '依 recipientBotID 直接轉交完整正文、寄件者及原 Relay Thread，由同事閱讀和回覆。',
      '每次正常 Wake 只呼叫一次原生轉交工具，零 MCP 查詢；提交後結束，不等待同事回覆。',
      '共用 MCP 的同事發訊、回覆及需要讀取歷史時，填自己的完整登記名稱 from。',
      '',
      '請依以下標準流程接入整間辦公室：',
      '1. 安裝或更新最新版 Nuwa Skill 與 MCP，使用同一 Organization 的授權。',
      '   重新安裝時沿用原 Gateway 身分；更換授權時，依 Skill 由管理者指定',
      '   原 Gateway 地址並恢復其 Session。遇到占用或身分衝突時停止並回報。',
      '2. 設定平台的 Wake 接收例行任務：驗證事件由 Gateway 完成配對驗證，',
      '   正式訊息事件則直接轉交。沿用已啟用的共用 Wake，首次接入時完成配對。',
      '3. 從平台可信 Bot 名錄盤點所有現有同事的顯示名稱與 Bot ID，排除 Gateway 本身。',
      '4. 以 Organization 的管理授權批次登記同事，建立或沿用真正的 Agent Address、',
      '   Default Session、MailTrigger 傳輸信箱（Nuwa 的底層郵件運輸）及收件路由。',
      '   GrokBot 使用平台管理的原生對話模式；其他平台依實際原生對話能力登記。',
      '5. 讓所有同事共用此 Gateway Wake，依事件的 recipientBotID 將完整正文、',
      '   寄件者名稱與原 Relay Thread 上下文直接交給本人，讓本人處理及回覆。',
      '6. 核對本辦公室名錄、地址與接線路由，回報已接入名單；由驗收者在兩位',
      '   真實同事的對話中確認雙向收件、原通話回覆及反向的新通話。',
      '',
      '日常通訊時，同事可直接以姓名、Agent Address 或已驗證 Email 別名',
      '呼叫 sendToAgent；Relay 在同一次請求內解析唯一收件者。',
      '回覆已有通話時接續原 Relay Thread；發新通話時建立新的 Relay Thread。',
      '',
      '日常收發只需一次發訊或回覆呼叫，歷史查詢及收件診斷按需使用。',
      '所有憑證使用平台的受保護授權流程，不在聊天中要求我輸入任何金鑰。'
    ].join('\\n');
  }

  function sendPrompt() {
    return [
      '請透過 Nuwa 找「' + colleagueName('colleagueB') +
        '」助理聊一下。',
      '告訴他：「你好，我們來測試通話，測試字詞是星河。收到後請回覆這個字詞。」',
      '請直接發送一次，由 Relay 解析收件人；共用連線時填自己的 from。'
    ].join('\\n');
  }

  function replyPrompt() {
    return [
      '請查收剛才「' + colleagueName('colleagueA') +
        '」助理傳來的測試訊息，',
      '請用 Nuwa 接續原本的 Relay Thread 回覆：「收到星河！」，共用連線時填自己的 from。',
      '實際收到完整訊息後直接回覆一次，不需要額外查詢；若已回覆，回報結果即可。'
    ].join('\\n');
  }

  function returnPrompt() {
    return [
      '請透過 Nuwa 主動找「' + colleagueName('colleagueA') +
        '」助理聊一下。',
      '告訴他：「換我打給你了！這次測試字詞是月光，請回覆這個字詞。」',
      '請直接發送一次；共用連線時填自己的 from。同名或找不到人才問我。'
    ].join('\\n');
  }

  function verifyPrompt() {
    return [
      '請查收「' + colleagueName('colleagueB') +
        '」助理剛才主動打來的電話，',
      '請用 Nuwa 在那通 Relay Thread 回覆：「收到月光！」，共用連線時填自己的 from。',
      '實際收到完整訊息後直接回覆一次，不需要額外查詢；若已回覆，回報結果即可。'
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
