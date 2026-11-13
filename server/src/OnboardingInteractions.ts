/** Browser-only prompt builder: all submitted values remain local and are written as text. */
export const ONBOARDING_SCRIPT = `
(function () {
  'use strict';

  var skillURL = 'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md';
  var mcpURL = 'https://mcp.agent-relay.company-notes.com/mcp';
  var promptIDs = [
    'gatewayPromptA', 'gatewayPromptB', 'colleaguePromptA', 'colleaguePromptB',
    'connectPromptA', 'connectPromptB', 'callPromptA', 'replyPromptB',
    'returnPromptB', 'verifyPromptA'
  ];
  var toastTimeout;

  function value(id) {
    var field = document.getElementById(id);
    return field ? field.value.trim() : '';
  }

  function isAddress(address) {
    var parts = address.split('/');

    return (parts.length === 2 || parts.length === 3) &&
      parts.every(function (part) {
        return /^[a-z0-9][a-z0-9-]*$/.test(part);
      });
  }

  function recipientAddress(id, colleague) {
    var address = value(id).toLowerCase();
    return isAddress(address) ? address : '（請先填寫' + colleague + '回報的 Nuwa 地址）';
  }

  function platformName(id) {
    var platforms = {
      grok: 'GrokBot',
      maus: 'OpenMausBot',
      other: '支援外部連線的 AI 平台'
    };

    return platforms[value(id)] || platforms.other;
  }

  function gatewayPrompt(office, platform, coworker) {
    return [
      '你是辦公室 ' + office + ' 的「Nuwa 交換機助理」。你不是' + coworker + '，',
      '不要代替他回答工作內容。先帶我從零設定通訊，之後只負責接線和轉送。',
      '',
      '先閱讀官方 Nuwa Relay Skill：',
      skillURL,
      '請依照它的現行規格操作，不要照過時文章猜工具名稱。',
      '',
      '第一階段：幫你自己接入 Nuwa。',
      '1. 在 ' + platform + ' 使用可用的外部連線功能接上：' + mcpURL,
      '   若你無法直接設定，請告訴我平台上要按哪個位置，再讓我批准。',
      '2. 依照官方登入畫面授權，呼叫 agentAddressEnsureIdentity，',
      '   再經我同意呼叫 relayProvisionAgentMailbox。',
      '3. 顯示你的公開 Nuwa 地址，確認身份和所屬公司。',
      '',
      '第二階段：帶我準備接線到真正的同事「' + coworker + '」。',
      '4. 檢查本平台的 Webhook / Automation 功能及受信任的來電驗證。',
      '   為接收 ' + coworker + ' 的來電設定通知時，',
      '   必須先取得該同事自己 Session 的授權；不能只配對你的 Gateway Session。',
      '5. 重要：' + coworker + ' 是另外一位助理，有自己的接收身份與授權。'
      '   不能用你自己的 Session 假冒他的接收權限；路由與平台內部 Bot',
      '   的設定，須由有權的接收方經由受信任的工具完成。',
      '6. 如果缺少這些受權工具、私密確認能力或 Webhook 入口，',
      '   請明確告訴我缺什麼、該在哪裡操作，不能宣稱已接通。',
      '',
      '現在請一步一步引導我，每次只詢問下一個必要的授權。',
      '不要請我在聊天貼密碼、私密連線網址或任何密鑰。',
      '完成後說明「已設定」與「尚待真實通話驗證」的差別。'
    ].join('\\n');
  }

  function colleaguePrompt(name, office) {
    return [
      '你是 ' + office + ' 真正工作的 AI 同事「' + name + '」，不是交換機。',
      '我會用 Nuwa 讓你跟另一間辦公室的 AI 同事聯絡。',
      '',
      '請先閱讀官方 Skill：' + skillURL,
      '並幫你自己接入：' + mcpURL,
      '若連線需要我在平台設定，請引導我完成，再使用原生登入授權。',
      '呼叫 agentAddressEnsureIdentity，經我同意後呼叫 relayProvisionAgentMailbox。',
      '請回報你自己的公開 Nuwa 地址，讓我可以填到網站中。',
      '你自己的身份不能和交換機共用，也不要代替交換機改變來電路由。',
      '',
      '收到其他同事的來電時，閱讀真實訊息、做必要的事，',
      '並在原來的 Relay Thread 使用 relayReplyThread 回答。',
      '如尚未收到自動通知，請清楚說明，不要把人工查看收件箱當作自動接聽。',
      '不要在聊天索取或輸出任何認證密鑰。'
    ].join('\\n');
  }

  function connectPrompt(office, colleagueID, colleague) {
    return [
      '請繼續設定辦公室 ' + office + ' 的交換機。',
      '真正收件的同事是「' + colleague + '」，其公開 Nuwa 地址是：',
      recipientAddress(colleagueID, colleague),
      '',
      '請確認這個地址在正確的公司內，並核對你在 ' +
        platformName(office === 'A' ? 'platformA' : 'platformB') + ' 的實際收件 Bot ID。',
      '請協助我配置平台的 Webhook / Automation，',
      '引導真正的收件同事在其授權 Session 中使用',
      'relayWakeSubscription、必要時 relayBeginWakePairing 完成私密配對。',
      '不能只以 Gateway 自己的 OAuth Session 完成該同事的來電註冊。',
      '只有在有權的收件 Session 批准下，才能登記 Gateway 路由。'
      '如果是 OpenMausBot，請檢查要不要固定 Bot-to-Bot 對話，',
      '以及是否有實際 Thread ID 和安全的首次聯絡確認工具。',
      '若任何能力尚未提供，先列出缺少的步驟，不要新建不相關的對話。',
      '不能用一次 Webhook HTTP 成功就宣稱' + colleague + '已接聽。',
      '全部完成後，說明如何用真正的來電測試它。'
    ].join('\\n');
  }

  function callPrompt() {
    return [
      '小晴，現在請你直接打給另一間辦公室的大熊，測試 Nuwa 通話。',
      '他的公開地址：' + recipientAddress('addressB', '大熊'),
      '先用 agentAddressResolve 確認對象，不要猜地址。',
      '如果有權傳送，請只用 sendToAgent 發出一次訊息：',
      '「嗨，大熊！我是小晴。第一次通話的密語是星河，',
      '請在這段通話裡回答我：大熊收到星河。」',
      '保留真正的 messageID 和 threadId。',
      '用 relayReceipt 檢查實際送達情形。',
      '不要把「送出」直接說成「大熊已接聽」，也不要不確定時重寄。'
    ].join('\\n');
  }

  function replyPrompt() {
    return [
      '大熊，請確認剛才小晴打來的測試電話是否真的自動通知到你。',
      '預期寄件者：' + recipientAddress('addressA', '小晴'),
      '如果有真實的喚醒執行，請讀取該 Nuwa 訊息，確認密語「星河」，',
      '用 relayReplyThread 回覆原 Thread：「大熊收到星河。」',
      '回報是自動接到來電，還是因為我現在要求你手動查詢。',
      '若沒收到，請只用 relayInbox 和 relayWakeEvents 診斷，',
      '不要虛構已經接聽或建立新 Thread。'
    ].join('\\n');
  }

  function returnPrompt() {
    return [
      '大熊，現在換你主動找小晴，不是回覆前一通來電。',
      '小晴的 Nuwa 地址：' + recipientAddress('addressA', '小晴'),
      '先用 agentAddressResolve 核對收件對象。',
      '只發出一次新的 sendToAgent：',
      '「小晴，我是大熊。剛才那通電話我想補充一句：今天順利接通了！」',
      '這次主動發起新通話會建立新的 Relay Thread，請保留結果供核對。',
      '請確認寄送狀態，不要直接宣稱小晴已經被通知或回覆。'
    ].join('\\n');
  }

  function verifyPrompt() {
    return [
      '小晴，現在請你核對大熊主動打回來的電話。',
      '預期寄件者：' + recipientAddress('addressB', '大熊'),
      '請區分「系統自動喚醒你」與「我在聊天室要求你人工查收」。',
      '如果有真實來電，讀取該訊息，使用那通電話的 threadId',
      '呼叫 relayReplyThread 回覆：「小晴也收到你的來電！」',
      '回報你是否真的被自動通知，以及這次新的通話是否能在原 Thread 回覆。',
      '不要把發送成功或僅有來電通知當成你已回答。'
    ].join('\\n');
  }

  function updateAddressHint() {
    var a = value('addressA').toLowerCase();
    var b = value('addressB').toLowerCase();
    var hint = document.getElementById('addressHint');

    if (a && b && isAddress(a) && isAddress(b) && a.split('/')[0] !== b.split('/')[0]) {
      hint.textContent = '兩個地址不屬於同一家公司，先請交換機幫你核對身分和授權，再測試通話。';
      hint.classList.add('address-error');
    } else if ((a && !isAddress(a)) || (b && !isAddress(b))) {
      hint.textContent = '請貼助理真正回報的地址；通常包含公司名稱、助理名稱與對話名稱，以斜線分隔。';
      hint.classList.add('address-error');
    } else {
      hint.textContent = '地址只用來在這個網頁內產生測試指令，不會上傳。';
      hint.classList.remove('address-error');
    }
  }

  function refresh() {
    var entries = {
      gatewayPromptA: gatewayPrompt('A', platformName('platformA'), '小晴'),
      gatewayPromptB: gatewayPrompt('B', platformName('platformB'), '大熊'),
      colleaguePromptA: colleaguePrompt('小晴', '辦公室 A'),
      colleaguePromptB: colleaguePrompt('大熊', '辦公室 B'),
      connectPromptA: connectPrompt('A', 'addressA', '小晴'),
      connectPromptB: connectPrompt('B', 'addressB', '大熊'),
      callPromptA: callPrompt(),
      replyPromptB: replyPrompt(),
      returnPromptB: returnPrompt(),
      verifyPromptA: verifyPrompt()
    };

    promptIDs.forEach(function (id) {
      document.getElementById(id).textContent = entries[id];
    });

    updateAddressHint();
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
    }, 2200);
  }

  async function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      notify('請選取文字，手動複製到助理的聊天視窗。');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      notify('已複製，請貼到對應助理的對話中。');
    } catch (error) {
      notify('無法使用剪貼簿，請選取文字手動複製。');
    }
  }

  function updateProgress() {
    var count = document.querySelectorAll('[data-done]:checked').length;
    document.getElementById('progressCount').textContent = count + ' / 5 完成';
    document.getElementById('progressFill').style.width = (count * 20) + '%';
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var prompt = document.getElementById(button.getAttribute('data-copy'));

      if (prompt) {
        void copyText(prompt.textContent);
      }
    });
  });

  ['platformA', 'platformB', 'addressA', 'addressB'].forEach(function (id) {
    var field = document.getElementById(id);
    field.addEventListener('input', refresh);
    field.addEventListener('change', refresh);
  });

  document.querySelectorAll('[data-done]').forEach(function (field) {
    field.addEventListener('change', updateProgress);
  });

  refresh();
  updateProgress();
}());
`;
