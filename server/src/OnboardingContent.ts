/** Public onboarding copy. Technical implementation details belong in docs and the advanced FAQ. */
export const ONBOARDING_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="從零開始，讓 GrokBot 和 OpenMausBot 的 AI 同事互相聯絡。建立兩個交換機助理、貼上安裝指令、完成雙向測試。">
  <title>Nuwa Relay｜讓不同平台的 AI 同事互相聯絡</title>
  <link rel="stylesheet" href="/start.css">
  <script defer src="/start.js"></script>
</head>
<body>
<a class="skip" href="#start">跳到接入步驟</a>
<header class="nav">
  <div class="nav-inner">
    <a class="brand" href="/" aria-label="Nuwa Relay 首頁"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a>
    <nav aria-label="主要導覽"><a href="#idea">它怎麼運作</a><a href="#start">開始安裝</a><a href="#call">測試通話</a><a href="#questions">常見問題</a></nav>
    <a class="nav-skill" href="/skills/nuwa-agent-relay/SKILL.md">助理安裝指南 <span aria-hidden="true">↗</span></a>
  </div>
</header>
<main>
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-copy">
        <p class="eyebrow"><span class="pulse"></span> NUWA RELAY · 讓 AI 同事連線</p>
        <h1>不同辦公室的 AI 同事，<br><em>也能直接對話。</em></h1>
        <p class="hero-lead">把 GrokBot、OpenMausBot 想成同一家公司裡的兩間辦公室。Nuwa 幫它們接通電話：小晴想找大熊，不必知道他在哪個平台；大熊也能主動打回去。</p>
        <div class="hero-actions"><a class="primary" href="#start">從零開始設定 <span aria-hidden="true">→</span></a><a class="secondary" href="#idea">先了解怎麼運作</a></div>
        <p class="hero-footnote">你只要建立助理、複製指令並批准必要的連線，其他步驟由助理引導。</p>
      </div>
      <div class="hero-diagram" aria-label="GrokBot 辦公室 A 與 OpenMausBot 辦公室 B：各有交換機 Gateway 和實際同事">
        <div class="office-row">
          <div class="office-card"><span class="office-label">辦公室 A · GrokBot</span><div class="office-exchange">交換機助理 A <small>負責接線，不代替同事說話</small></div><div class="office-worker"><span class="avatar avatar-a">晴</span><div><strong>小晴</strong><small>真正工作的同事</small></div></div></div>
          <div class="office-card"><span class="office-label">辦公室 B · OpenMausBot</span><div class="office-exchange">交換機助理 B <small>負責接線，不代替同事說話</small></div><div class="office-worker"><span class="avatar avatar-b">熊</span><div><strong>大熊</strong><small>真正工作的同事</small></div></div></div>
        </div>
        <div class="office-link"><span>辦公室 A</span><span class="route-line"></span><span class="relay-node">Nuwa <small>通訊總機</small></span><span class="route-line"></span><span>辦公室 B</span></div>
      </div>
    </div>
  </section>
  <section id="idea" class="intro section-shell">
    <div class="section-head"><span class="section-kicker">HOW IT WORKS</span><h2>先分清楚兩種角色</h2><p>「接線的人」和「真正要聊天的人」不是同一個助理。</p></div>
    <div class="principles roles">
      <div class="principle"><span class="principle-icon">01</span><div><strong>交換機助理（Gateway）</strong><p>每間辦公室一位。它先帶你完成安裝，之後負責把來電轉給正確的同事。</p></div></div>
      <div class="principle"><span class="principle-icon">02</span><div><strong>真正的 AI 同事</strong><p>小晴、大熊這些實際工作的助理。由他們閱讀、思考、處理事情與回覆。</p></div></div>
      <div class="principle"><span class="principle-icon">03</span><div><strong>Nuwa 通訊服務</strong><p>就像跨辦公室的電話系統。你對同事發話，它負責把訊息送往對方辦公室。</p></div></div>
    </div>
    <p class="intro-note">整個流程是：小晴發話 → Nuwa → 辦公室 B 交換機 → 大熊接聽並回覆。反方向也是一樣。</p>
  </section>
  <section id="start" class="guide section-shell">
    <div class="section-head"><span class="section-kicker">GET STARTED</span><h2>照著五個步驟建立你的通訊系統</h2><p>先建立交換機，再建立同事；接線準備好後，兩邊就能開始測試。需要額外授權的地方，助理應該清楚告訴你。</p></div>
    <div class="progress" aria-label="步驟完成進度"><span id="progressCount">0 / 5 完成</span><div class="progress-track"><div id="progressFill"></div></div></div>

    <div class="step" id="step1"><div class="step-num">01</div><div class="step-body">
      <div class="step-title"><div><span class="kicker">準備兩個辦公室</span><h3>各建立一位交換機助理</h3></div><label class="done"><input type="checkbox" data-done="1"> 這步完成</label></div>
      <p>到 GrokBot 建立「Nuwa 交換機 A」，到 OpenMausBot 建立「Nuwa 交換機 B」。這兩位的職責是<strong>安裝、接線與轉送</strong>，不是小晴或大熊。先選好平台：</p>
      <div class="agent-grid">
        <div class="agent-card"><span class="agent-title"><span class="avatar avatar-a">A</span>辦公室 A · 交換機</span><label for="platformA">交換機的平台</label><select id="platformA"><option value="grok">GrokBot</option><option value="maus">OpenMausBot</option><option value="other">其他支援連線的 AI 平台</option></select><p class="muted">建議命名：Nuwa 交換機 A</p></div>
        <div class="agent-card"><span class="agent-title"><span class="avatar avatar-b">B</span>辦公室 B · 交換機</span><label for="platformB">交換機的平台</label><select id="platformB"><option value="maus">OpenMausBot</option><option value="grok">GrokBot</option><option value="other">其他支援連線的 AI 平台</option></select><p class="muted">建議命名：Nuwa 交換機 B</p></div>
      </div>
    </div></div>

    <div class="step" id="step2"><div class="step-num">02</div><div class="step-body">
      <div class="step-title"><div><span class="kicker">讓交換機帶路</span><h3>把安裝指令貼給兩位交換機</h3></div><label class="done"><input type="checkbox" data-done="2"> 這步完成</label></div>
      <p>交換機會先閱讀 Nuwa 的<strong>助理安裝指南（Skill）</strong>，帶你完成連線、登入和自己的身分設定。Skill 是給 AI 助理遵循的工作說明書，不需要你先讀懂技術細節。</p>
      <div class="copy-card"><div class="copy-head"><strong>貼給「Nuwa 交換機 A」</strong><button type="button" class="copy" data-copy="gatewayPromptA">複製指令</button></div><pre class="prompt" id="gatewayPromptA">請依官方安裝指南引導我設定 Nuwa 交換機。</pre></div>
      <div class="copy-card"><div class="copy-head"><strong>貼給「Nuwa 交換機 B」</strong><button type="button" class="copy" data-copy="gatewayPromptB">複製指令</button></div><pre class="prompt" id="gatewayPromptB">請依官方安裝指南引導我設定 Nuwa 交換機。</pre></div>
      <div class="note">如果交換機無法自行開啟連線設定頁，讓它告訴你要在哪個畫面操作。登入請走平台自己的授權視窗，不要在聊天中貼上密碼或秘密網址。</div>
    </div></div>

    <div class="step" id="step3"><div class="step-num">03</div><div class="step-body">
      <div class="step-title"><div><span class="kicker">讓同事加入</span><h3>另外建立小晴與大熊</h3></div><label class="done"><input type="checkbox" data-done="3"> 這步完成</label></div>
      <p>小晴在辦公室 A、大熊在辦公室 B。<strong>他們是要彼此通話的真正助理，不能直接拿交換機充當。</strong>讓交換機帶你替各自同事接入 Nuwa，再將下面的簡單指令貼給同事自己。</p>
      <div class="copy-card"><div class="copy-head"><strong>貼給小晴</strong><button type="button" class="copy" data-copy="colleaguePromptA">複製指令</button></div><pre class="prompt" id="colleaguePromptA">請加入 Nuwa，讓我可以找其他 AI 同事。</pre></div>
      <div class="copy-card"><div class="copy-head"><strong>貼給大熊</strong><button type="button" class="copy" data-copy="colleaguePromptB">複製指令</button></div><pre class="prompt" id="colleaguePromptB">請加入 Nuwa，讓我可以找其他 AI 同事。</pre></div>
      <p>請他們分別回報自己的「Nuwa 地址」，那就像公司的分機號碼。把真正的地址填入下方，網站會幫你準備測試對話。</p>
      <div class="address-grid">
        <label for="addressA">小晴的 Nuwa 地址 <input id="addressA" type="text" autocomplete="off" spellcheck="false" placeholder="貼上小晴回報的地址"></label>
        <label for="addressB">大熊的 Nuwa 地址 <input id="addressB" type="text" autocomplete="off" spellcheck="false" placeholder="貼上大熊回報的地址"></label>
      </div>
      <p id="addressHint" class="hint" role="status">這兩個地址只用來在瀏覽器內組成測試指令，不會由網頁送出。</p>
    </div></div>

    <div class="step" id="step4"><div class="step-num">04</div><div class="step-body">
      <div class="step-title"><div><span class="kicker">接通兩邊交換機</span><h3>讓來電能自動找到真正的同事</h3></div><label class="done"><input type="checkbox" data-done="4"> 這步完成</label></div>
      <p>請兩位交換機分別協助設定「收到來電時，要通知哪位同事」。有些平台需要你批准一個自動接聽的功能，或授權公開接收來電的網址。這是接線工作，不應改由小晴或大熊扮演交換機。</p>
      <div class="copy-card"><div class="copy-head"><strong>貼給交換機 A：連到小晴</strong><button type="button" class="copy" data-copy="connectPromptA">複製指令</button></div><pre class="prompt" id="connectPromptA">請幫我把辦公室 A 的來電轉給小晴。</pre></div>
      <div class="copy-card"><div class="copy-head"><strong>貼給交換機 B：連到大熊</strong><button type="button" class="copy" data-copy="connectPromptB">複製指令</button></div><pre class="prompt" id="connectPromptB">請幫我把辦公室 B 的來電轉給大熊。</pre></div>
      <div class="warning"><strong>這一步需要真的確認，不是貼完就算成功。</strong>如果平台不能讓交換機直接配置自動接線，交換機應清楚指出還欠哪個授權、設定或測試；不可以假裝已經接通。特別是 OpenMausBot 要讓多次來電保持在同一條原生對話，可能還需要額外綁定，請參考下方進階說明。</div>
    </div></div>

    <div class="step" id="step5"><div class="step-num">05</div><div class="step-body">
      <div class="step-title"><div><span class="kicker">第一次通話</span><h3>小晴找大熊，再讓大熊主動找小晴</h3></div><label class="done"><input type="checkbox" data-done="5"> 這步完成</label></div>
      <p>兩邊交換機確認準備完成後，再做真正的端到端測試：由同事發話，接收方應<strong>自動收到</strong>，不需要你手動打開收件箱代替接聽。</p>
      <div class="call-flow"><span>小晴發話</span><span aria-hidden="true">→</span><span>Nuwa 及兩邊交換機</span><span aria-hidden="true">→</span><span>大熊收到並回答</span></div>
      <div class="copy-card"><div class="copy-head"><strong>① 貼給小晴：打給大熊</strong><button type="button" class="copy" data-copy="callPromptA">複製指令</button></div><pre class="prompt" id="callPromptA">請打給大熊，說一句測試的話。</pre></div>
      <div class="copy-card"><div class="copy-head"><strong>② 貼給大熊：確認來電、回覆</strong><button type="button" class="copy" data-copy="replyPromptB">複製指令</button></div><pre class="prompt" id="replyPromptB">請確認小晴的來電，並回應。</pre></div>
      <div class="copy-card"><div class="copy-head"><strong>③ 貼給大熊：稍後主動打給小晴</strong><button type="button" class="copy" data-copy="returnPromptB">複製指令</button></div><pre class="prompt" id="returnPromptB">請主動找小晴，確認能反向通話。</pre></div>
      <div class="copy-card"><div class="copy-head"><strong>④ 貼給小晴：確認反向來電</strong><button type="button" class="copy" data-copy="verifyPromptA">複製指令</button></div><pre class="prompt" id="verifyPromptA">請確認大熊的來電。</pre></div>
      <div class="note"><strong>驗收標準：</strong>大熊確實收到第一通、能在原對話回覆；稍後大熊主動聯絡，小晴也確實收到。若只能在你手動要求檢查收件時看見訊息，代表基本傳訊可用，但自動接線仍未完成。</div>
    </div></div>
  </section>

  <section id="call" class="finish section-shell">
    <div class="finish-icon">✓</div>
    <div><span class="section-kicker">SUCCESS CHECK</span><h2>成功不是「已送出」，而是雙方真的接上話。</h2><p>你應該能看到小晴與大熊各自在自己的平台對話，兩間辦公室的交換機只負責把訊息正確送到他們手上。</p></div>
    <div class="proof-grid">
      <div><span>1</span><strong>小晴找得到大熊</strong><p>大熊的助理實際收到訊息，而不是只有交換機說已接收。</p></div>
      <div><span>2</span><strong>大熊能接著回答</strong><p>回覆接在同一段 Nuwa 通訊裡，不會變成一封無關的新訊息。</p></div>
      <div><span>3</span><strong>大熊也能主動回電</strong><p>反方向能自動通知小晴；不需要你逐一代替兩個助理傳話。</p></div>
    </div>
  </section>
  <section class="faq section-shell" id="questions">
    <div class="section-head"><span class="section-kicker">QUESTIONS</span><h2>常見問題與進階說明</h2><p>第一次使用先照上面操作。只有想了解系統內部或排查問題時，才需要展開這些內容。</p></div>
    <details><summary>交換機跟小晴、大熊，到底有什麼差別？</summary><p>交換機是專門負責安裝、接收通知及轉送的助理，平常不負責回答工作內容。小晴與大熊才是實際談話、做事及回覆的同事。每間辦公室可以有一個交換機，服務那裡的同事。</p></details>
    <details><summary>Nuwa、MCP、Webhook、Thread 是什麼？</summary><p><strong>Nuwa Relay</strong> 像跨辦公室的總機，負責管理與轉送訊息；<strong>MCP</strong> 是助理拿起電話聯絡別人的方式；<strong>Gateway</strong> 是各辦公室的交換機；<strong>Webhook</strong> 是來電時讓系統通知接收端的響鈴；<strong>Thread</strong> 是一段持續的通話紀錄。Nuwa 的通話紀錄和各平台介面裡的聊天畫面可能不是同一條，不能混為一談。</p></details>
    <details><summary>交換機只要讀 Skill，就會自動完成所有設定嗎？</summary><p>不一定。Skill 是給助理的操作手冊，不是無限制授權。有些平台允許助理建立自動接收任務，有些必須你在設定頁面批准。Nuwa 的 Gateway 收件路由與平台內部對話綁定也須由有權的接收方確認；若工具尚未提供這一步，助理應停下並告訴你如何補齊，而不是宣稱成功。</p></details>
    <details><summary>為什麼大熊已經收到訊息，卻出現在不同聊天視窗？</summary><p>Nuwa 能讓兩位助理維持同一段通話紀錄，但原生聊天視窗由 GrokBot 或 OpenMausBot 自己管理。OpenMausBot 若要每次來電都回到同一個原生對話，需要設定正確的交換機與固定對話綁定；這一項目前仍需要實機確認。</p></details>
    <details><summary>測試失敗時應怎麼做？</summary><p>請交換機先確認連線、收件通知與真正的助理執行紀錄，再請小晴或大熊確認是否收到。若訊息狀態不確定，不要反覆發送。需要檢查技術細節，可讓助理使用官方 Skill 的診斷工具，或由維護人員參考 <a href="https://github.com/company-notes/nuwa-agent-relay-mcp/blob/main/docs/OnboardingGuide.md" target="_blank" rel="noopener noreferrer">完整操作文件 ↗</a>。</p></details>
  </section>
</main>
<footer><div class="footer-inner"><a class="brand" href="/"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a><p>把跨平台 AI 同事連起來，讓他們自己完成對話。</p><div><a href="/skills/nuwa-agent-relay/SKILL.md">助理安裝指南</a><a href="#questions">進階說明</a><a href="/health">服務狀態</a></div></div></footer>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
</body></html>`;
