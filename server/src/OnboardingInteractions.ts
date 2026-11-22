/** Browser-only onboarding prompts and two-slide diagram. No network or storage access. */
export const ONBOARDING_SCRIPT = `
(function () {
  'use strict';

  var skillURL = 'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md';
  var mcpURL = 'https://mcp.agent-relay.company-notes.com/mcp';
  var promptIDs = ['gatewayPrompt', 'sendPrompt', 'replyPrompt', 'returnPrompt', 'verifyPrompt'];
  var toastTimeout;

  var platforms = {
    grokbot: {
      name: 'GrokBot', office: true, gatewayIdentity: 'grokbot', examples: ['小晴', '大熊'],
      setup: 'GrokBot 使用 platform 模式。安裝時確認 Routine 的實際工具能力；能直接轉交就直接送。GrokBot 的 Routine 若無原生轉交能力但支援 WakeParent，僅交接完整原始事件 JSON，由上層 Gateway 組合格式並原生轉交一次。'
    },
    openmausbot: {
      name: 'OpenMausBot', office: true, gatewayIdentity: 'openmausbot',
      separateConnectors: true, examples: ['Cosmo', '同事 B'],
      setup: '確認接收 Routine 能呼叫 coordinate_bots、relayGatewayConfirmFirstContact 且可讀取可信原生回執，為同事設定 explicit／automatic。將 Skill 的 OpenMausBot 完整流程放入 Routine（已安裝時完整替換既有轉交指令，沿用有效的 Wake 與名錄）：recipientPlatformThreadID 為 null 時用 thread: "new" 轉交一次，立即用 Wake 的三個識別碼及原生回執呼叫 relayGatewayConfirmFirstContact，確認成功才結束；為字串時直接使用該 ID 轉交一次後結束。'
    },
    rakazo: {
      name: 'Rakazo', office: true, gatewayIdentity: 'rakazo', examples: ['同事 A', '同事 B'],
      wakeSetup: 'Rakazo 支援由 Webhook 事件觸發的 Routine，不是只有定時任務。' +
        '先使用 schedule_list 檢查本 Gateway Bot 是否已有有效的 Nuwa Wake 接收 Routine；若有就沿用，不要重建。' +
        '若沒有，直接呼叫 schedule_create，name 使用 "Nuwa Wake Receiver"，' +
        'on: { webhook: true }，prompt 寫入依官方 Skill 產生的完整、自包含 Wake 驗證與原生轉交指令。' +
        '不設定 cron、every、runAt 或任何定時欄位，這是僅由 Webhook 觸發的 Routine；' +
        '如操作需核准，直接向使用者提出核准請求，不要改成定時輪詢。' +
        '先完成 Routine 建立，才產生 Wake 配對連結。' +
        '建立成功後請使用者開啟 Rakazo Routines 管理介面，從該 Routine 取得 Webhook HTTPS URL 和 key，' +
        '由使用者直接填入 Nuwa 的安全配對表單；不要把 key 貼在聊天中，也不要猜測任何 URL 或 key。' +
        '驗證 Wake 後才宣稱接線完成。',
      setup: '接著確認 Rakazo 可信 Bot 名錄、原生轉交工具與原生對話識別能力，依 Skill 判斷適用的接線模式。' +
        '若 schedule_create 的工具 Schema 不支援 on，或實際呼叫失敗，請回報工具 Schema 或實際錯誤及所需權限，' +
        '不要自行推斷只能建立定時任務、要求使用者代為建立 Routine，或假稱已完成。'
    },
    codex: {
      name: 'Codex', agent: 'codex',
      setup: '依 Skill 的 Named work Sessions 章節設定 Codex 原生工作識別：在遠端 MCP 設定加入 X-Nuwa-Work-Mode: codex。確認原生 threadId 隨工具請求傳遞。'
    },
    claude: {
      name: 'Claude CLI', agent: 'claude', fixed: true,
      setup: '依 Skill 的 Independent client 說明，設定 Claude CLI 的 Remote MCP 及 OAuth，使用 agentAddressEnsureIdentity 取得自己的固定地址。多工作 Session 接入尚待支援，請以另一個已接入的助理或工作測試。'
    },
    'grok-build': {
      name: 'Grok Build', agent: 'grok-build',
      setup: '依 Skill 的 Named work Sessions 章節設定 Grok Build 原生工作識別：在遠端 MCP headers 加入 X-Nuwa-Work-Mode: grok-build 與 X-Nuwa-Work-ID: {{session_id}}。確認原生工作 ID 隨請求傳遞。'
    }
  };

  function fieldValue(id) {
    return document.getElementById(id).value.trim();
  }

  function selectedPlatform() {
    return platforms[fieldValue('platform')] || platforms.grokbot;
  }

  function isAddress(value) {
    return /^[a-z0-9][a-z0-9_-]*\\/[a-z0-9][a-z0-9_-]*\\/[a-z0-9][a-z0-9_-]*$/i.test(value);
  }

  function validContact(name, platform) {
    return name.length > 0 && name.length <= 255 &&
      !/[\\u0000-\\u001f\\u007f]/.test(name) &&
      (platform.office ? name.length <= 120 || isAddress(name) : isAddress(name));
  }

  function contactsReady(platform) {
    var first = fieldValue('colleagueA');
    var second = fieldValue('colleagueB');
    return validContact(first, platform) && validContact(second, platform) &&
      (!isAddress(first) || first.toLowerCase() !== second.toLowerCase());
  }

  function gatewaySetup(platform) {
    return [
      '請擔任 ' + platform.name + ' 的 Nuwa 接線助理（Gateway），讓同一 Organization 的 AI 同事可以互相聯絡。',
      '',
      '官方 Skill：' + skillURL,
      'Nuwa MCP：' + mcpURL,
      '',
      '請依最新版 Skill，安裝或更新 Skill 與 MCP，完成 Organization 授權，沿用既有身分。',
      '本平台新辦公室的 Gateway 身分名稱固定使用「' + platform.gatewayIdentity +
        '」。先確認目前連線屬於這個辦公室；首次建立時使用 ' +
        'agentAddressEnsureIdentity({agentDisplayName: "' + platform.gatewayIdentity +
        '"})。已安裝的同一辦公室沿用原有身分、Wake 與名錄，即使現有名稱不同。' +
        '目前授權若屬於其他辦公室，請使用者為本辦公室取得獨立授權，保留對方原有設定。',
      '1. ' + (platform.wakeSetup ||
        '設定本辦公室唯一的 Wake 接收例行任務並完成驗證；沿用有效的接線。') +
        ' 只變更 Webhook 接收網址時，請使用者開啟 https://agent-relay.company-notes.com/manage，經 Agent Address OAuth 登入後選擇原有 Gateway Session 的「更新連線網址」，貼上新 Quick Tunnel 網址，保留原本的路徑與加密金鑰。只有首次設定或更新 Bearer key 才使用配對流程：配對連結直接交給使用者，由使用者自己開啟瀏覽器、登入並填寫 Webhook HTTPS URL 和 Bearer key。Gateway 負責接收驗證事件。',
      '2. 從平台可信 Bot 名錄取得真實同事的名稱與 Bot ID（排除自己及群組／頻道），批次接入同事，沿用既有地址與名錄。同步新增與改名，保留獨立成員的接入模式；移除需明確授權。' +
        (platform.separateConnectors
          ? ' 逐一確認 Gateway 與每位同事的 nuwa-agent-relay 連接器。未開啟時列出助理名稱，請管理者開啟後再標記可通訊。'
          : ''),
      '3. ' + platform.setup,
      '4. 收到正常 Wake 時，依 recipientBotID 使用平台原生工具轉交一次，完整轉交正文、寄件者及原 Relay Thread 回覆上下文，讓本人依 Skill 回覆。附上 relayReplyThread({from, threadID, body}) 的呼叫格式，帶入實際 Thread ID，from 直接填 recipientBotID（UUID 或 bot: 前綴的原生 ID），由同事填回覆正文。',
      platform.separateConnectors
        ? '   Routine 使用自包含指令；依 OpenMausBot 首次／後續流程完成轉交。首次必須確認，後續零 MCP 查詢，提交後結束。'
        : '   Routine 使用自包含指令；日常零 MCP 查詢，提交後結束。明確原生首聯確認依平台契約執行。',
      '5. 回報 Gateway 地址、Wake 狀態及已接入同事名單、各自地址和收件方式；引導我使用兩位已接入的同事進行雙向通訊。發送方提交一次後結束，等待接收方自然收到及回覆。'
    ].join('\\n');
  }

  function directSetup(platform) {
    var lines = [
      '請將你自己（' + platform.name + '）接入 Nuwa。',
      '',
      '官方 Skill：' + skillURL,
      'Nuwa MCP：' + mcpURL,
      '',
      '請依最新版 Skill，安裝或更新 Skill 與 MCP，完成 Organization 授權，沿用既有身分。此次僅設定目前的 ' + platform.name + ' 客戶端，無須 Gateway。',
      platform.setup
    ];

    if (!platform.fixed) {
      lines.push('新工作開始時依任務取有意義的工作名稱，呼叫 agentAddressStartWork 並主動回報正式地址；Resume 時恢復原 Session 的地址，詢問地址時使用 agentAddressGetStatus。使用原生工作識別，確認不同工作能取得各自的地址。');
    }

    lines.push('完成後回報設定狀態、目前正式地址及收件方式，必要時引導我重新載入客戶端。日常直接發訊或回覆，獨立連線省略 from；沒有自動接收能力就依使用者要求查收。');
    lines.push(platform.fixed
      ? '引導我選擇另一個已接入同一 Organization 的助理進行雙向通訊。'
      : '引導我開啟第二個獨立工作，取得另一個正式地址，測試兩個工作雙向傳訊及原對話回覆。');

    return lines.join('\\n');
  }

  function contact(id) {
    var value = fieldValue(id);
    return value || '另一位已接入的助理';
  }

  function sendPrompt(id, word, reverse, platform) {
    var target = contact(id);

    return [
      '請透過 Nuwa 主動聯絡「' + target + '」。',
      '告訴他：「' + (reverse ? '換我聯絡你了！' : '你好，我們來測試通話。') +
        '測試字詞是' + word + '，請回覆這個字詞。」',
      platform.office
        ? '請直接發送一次，優先使用已知的 Bot ID，或填同事名稱、唯一簡稱、完整地址；共用連線時填自己的 from，獨立連線省略 from。' +
          (platform.separateConnectors ? ' 送出後結束，等待對方自然回覆。' : '')
        : '請使用上面的完整地址直接發送一次，獨立連線省略 from；共用連線時填自己的 from。'
    ].join('\\n');
  }

  function replyPrompt(id, word, platform) {
    return [
      '請查收「' + contact(id) + '」剛才傳來的測試訊息。',
      '請用 Nuwa 接續原本的對話回覆：「收到' + word + '！」按自己的接入方式回覆；獨立連線省略 from，共用連線填自己的 from。',
      platform.office
        ? '實際收到完整訊息後直接回覆一次，不需要額外查詢；若已回覆，回報結果即可。' +
          (platform.separateConnectors ? ' 此指令供訊息自然到達後使用；等待自然回覆即可。' : '')
        : '已收到訊息就直接回覆一次；尚未收到時請查收自己的收件匣。若已回覆，回報結果即可。'
    ].join('\\n');
  }

  function updateInstallMethod() {
    var platform = selectedPlatform();
    var office = Boolean(platform.office);
    var studio = !office && fieldValue('installMethod') === 'studio';

    document.getElementById('installMethodPicker').hidden = office;
    document.getElementById('studioOptions').hidden = !studio;
    document.getElementById('directOptions').hidden = studio;
    document.getElementById('directScope').hidden = office;
    document.getElementById('setupResult').textContent = office
      ? '接線助理回報已接入的同事、各自的地址和收件方式後，就能開始下方測試。'
      : studio
        ? 'Studio 新版發布後即可使用此方式。目前可切換至直接安裝，立即完成接入。'
        : '請確認助理回報設定完成及目前的正式地址，再選擇第二個已接入的通訊對象。';
  }

  function updatePlatform(resetContacts) {
    var platform = selectedPlatform();
    var office = platform.office;
    var first = document.getElementById('colleagueA');
    var second = document.getElementById('colleagueB');
    var name = platform.name;

    document.getElementById('platformIntro').textContent = office
      ? '在 ' + name + ' 內指定或建立一位接線助理（Gateway），由它為整個辦公室接收、轉交訊息，並接入真正工作的同事。新安裝的接線身分名稱為「' + platform.gatewayIdentity + '」。'
      : name + ' 可直接使用自己的通訊連線和聯絡地址。' +
        (platform.fixed ? '目前使用固定地址；獨立工作地址功能尚待支援。' : '每個獨立工作（Session）有自己的工作地址，恢復工作時沿用原地址。');

    document.getElementById('installTitle').textContent = office ? '請接線助理帶你設定' : '安裝 Nuwa 至 ' + name;
    document.getElementById('installIntro').textContent = office
      ? '將下面的指令貼給 ' + name + ' 的接線助理。新安裝的 Gateway 名稱為「' + platform.gatewayIdentity + '」；既有辦公室沿用原身分。它會依官方指南完成安裝，並在需要登入或授權時請你操作。'
      : '依你的需求選擇一種方式：一次設定多種工具，或只設定目前的 ' + name + '。';

    document.getElementById('setupPromptTitle').textContent = name + (office ? ' 接線助理安裝指令' : ' 直接安裝指令');
    updateInstallMethod();

    document.getElementById('testTitle').textContent = office ? '找兩位助理，直接測試通話' : platform.fixed
      ? '與另一個已接入的助理測試通訊' : '開啟兩個獨立工作，測試通訊';

    document.getElementById('testIntro').textContent = office
      ? '選擇兩位已接入 ' + name + ' 的同事，填入他們在平台上顯示的名稱或正式地址。'
      : platform.fixed
        ? '詢問 ' + name + ' 目前的正式地址，再選擇另一個已接入的助理或工作，填入兩個完整地址。'
        : '在 ' + name + ' 開啟兩個獨立工作，請它們分別開始測試工作並回報自己的正式地址，再填入兩個完整地址。';

    document.getElementById('labelA').textContent = office ? '助理 A 的名稱' : platform.fixed ? 'Claude CLI 的完整地址' : '工作 A 的完整地址';
    document.getElementById('labelB').textContent = office ? '助理 B 的名稱' : platform.fixed ? '另一位助理的完整地址' : '工作 B 的完整地址';
    first.placeholder = office ? '例如：' + platform.examples[0] : '例如：company/' + platform.agent + '/' + (platform.fixed ? 'main' : 'send-check');
    second.placeholder = office ? '例如：' + platform.examples[1] : '例如：company/' + (platform.fixed ? 'codex/reply-check' : platform.agent + '/reply-check');
    document.getElementById('testNote').textContent = office
      ? '兩位助理可以使用相同或不同平台；同名時請改填完整 Nuwa 地址。'
      : '也可以把另一個平台已接入的助理或工作當作 B。範例地址僅供參考，請填入實際回報的完整地址。';

    if (resetContacts) {
      first.value = '';
      second.value = '';
    }

    updatePrompts();
  }

  function updatePrompts() {
    var platform = selectedPlatform();
    var ready = contactsReady(platform);
    var prompts = {
      gatewayPrompt: platform.office ? gatewaySetup(platform) : directSetup(platform),
      sendPrompt: sendPrompt('colleagueB', '星河', false, platform),
      replyPrompt: replyPrompt('colleagueA', '星河', platform),
      returnPrompt: sendPrompt('colleagueA', '月光', true, platform),
      verifyPrompt: replyPrompt('colleagueB', '月光', platform)
    };

    promptIDs.forEach(function (id) {
      document.getElementById(id).textContent = id === 'gatewayPrompt' || ready
        ? prompts[id] : '填入上面的聯絡對象，就能直接複製。';
    });

    var first = fieldValue('colleagueA');
    var second = fieldValue('colleagueB');
    var message = document.getElementById('nameHint');

    if ((first && !validContact(first, platform)) || (second && !validContact(second, platform))) {
      message.textContent = platform.office
        ? '請填寫實際助理名稱或完整地址，不得換行。'
        : '請填寫實際回報的三層完整地址：組織／助理／工作。';
    } else if (first && second && isAddress(first) && first.toLowerCase() === second.toLowerCase()) {
      message.textContent = '請填入兩個不同的完整地址，才能驗證雙向通訊。';
    } else if (ready) {
      message.textContent = first === second
        ? '兩位助理同名；建議填入各自的完整 Nuwa 地址。'
        : '四段測試指令已填入聯絡對象，直接複製即可。';
    } else {
      message.textContent = platform.office
        ? '填入平台上的助理名稱或正式地址即可。'
        : '請先向兩位助理詢問各自的完整地址。';
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

      if (button.getAttribute('data-copy') !== 'gatewayPrompt' && !contactsReady(selectedPlatform())) {
        notify('請先填入兩個有效的聯絡對象。');
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

  document.getElementById('platform').addEventListener('change', function () {
    updatePlatform(true);
  });

  document.getElementById('installMethod').addEventListener('change', updateInstallMethod);

  showSlide(0);
  updatePlatform(false);
}());
`;
