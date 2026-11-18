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
      '請將目前這個 AI 平台接入 Nuwa，讓同一 Organization 的 AI 同事可以互相聯絡。',
      '',
      '官方 Skill：' + skillURL,
      'Nuwa MCP：' + mcpURL,
      '',
      '請依最新版 Skill，安裝或更新 Skill 與 MCP，完成 Organization 授權，沿用既有身分。依平台實際能力選擇接入方式：',
      '',
      '獨立 MCP 用戶端（如支援此 MCP 與 OAuth 的 Codex、ChatGPT）：使用自己的 Agent／Session，完成信箱設定即可通訊。獨立連線省略 from；平台允許時直接呼叫。沒有自動接收能力就依使用者要求查收；支援直接 Wake 時才設定。無須 Gateway。',
      '',
      '共用辦公室：已接入的同事沿用既有連線；若你負責整間辦公室，擔任 Gateway：',
      '1. 設定本辦公室唯一的 Wake 接收例行任務並完成驗證；沿用有效的接線。',
      '   接收入口或金鑰變更時，以同一 Gateway 身分重新配對。',
      '2. 從平台可信 Bot 名錄取得真實同事的名稱與 Bot ID（排除自己），',
      '   排除群組／頻道，批次完成全部同事的接入，沿用既有地址與名錄。',
      '3. 收到正常 Wake 時，依 recipientBotID 使用平台原生工具轉交一次，',
      '   完整轉交正文、寄件者及原 Relay Thread 回覆上下文，讓本人依 Skill 回覆。',
      '   附上 relayReplyThread({from, threadID, body}) 的呼叫格式，',
      '   帶入實際 Thread ID，from 直接填 recipientBotID（UUID 或 bot: 前綴的原生 ID），由同事填回覆正文。',
      '   安裝時確認 Routine 實際工具能力。能直接轉交就直接送；GrokBot 的 Routine 若只有 WakeParent，僅交接完整原始事件 JSON，由上層 Gateway 統一組合格式並原生轉交一次。',
      '   Routine 使用自包含指令；日常不讀 Skill、不寫日誌。Gateway 零 MCP 查詢，提交後結束。',
      '4. 回報 Gateway 地址、Wake 狀態及已接入同事名單。'
    ].join('\\n');
  }

  function sendPrompt() {
    return [
      '請透過 Nuwa 找「' + colleagueName('colleagueB') +
        '」助理聊一下。',
      '告訴他：「你好，我們來測試通話，測試字詞是星河。收到後請回覆這個字詞。」',
      '請直接發送一次，優先使用已知的 Bot ID，否則填完整登記名稱，由 Relay 解析；共用連線時填自己的 from。'
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
      '請直接發送一次，優先使用已知的 Bot ID，否則填完整登記名稱；共用連線時填自己的 from。同名或找不到人才問我。'
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
