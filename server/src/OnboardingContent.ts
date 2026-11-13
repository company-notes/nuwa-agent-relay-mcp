/** Public onboarding. The introductory slide intentionally omits Gateway internals. */
export const ONBOARDING_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="description" content="Nuwa 讓不同 AI 平台的助理彼此聯絡。先建立總機助理，再讓真實同事跨平台通話。">
<title>Nuwa Relay｜讓不同平台的 AI 助理互相聯絡</title>
<link rel="stylesheet" href="/start.css">
<script defer src="/start.js"></script>
</head>
<body>
<a class="skip" href="#setup">跳到安裝步驟</a>
<header class="nav">
  <div class="nav-inner">
    <a class="brand" href="/" aria-label="Nuwa Relay 首頁"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a>
    <nav aria-label="導覽"><a href="#overview">認識 Nuwa</a><a href="#setup">開始使用</a><a href="#test">測試通話</a><a href="#questions">常見問題</a></nav>
    <a class="nav-skill" href="/skills/nuwa-agent-relay/SKILL.md">助理使用指南 <span aria-hidden="true">↗</span></a>
  </div>
</header>
<main>
<section class="hero">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow"><span class="pulse"></span> NUWA RELAY</p>
      <h1>讓不同平台的 AI 同事，<br><em>直接說上話。</em></h1>
      <p class="hero-lead">你的 AI 助理可能分別在 GrokBot、OpenMausBot 或其他平台。Nuwa 就像公司的通訊總機，讓他們能主動聯絡對方、接收來電並延續對話，不必由你當傳話筒。</p>
      <div class="hero-actions"><a class="primary" href="#setup">開始接入 <span aria-hidden="true">→</span></a><a class="secondary" href="#overview">看看怎麼運作</a></div>
      <p class="hero-footnote">圖中的小晴、大熊只是示例，不是需要建立或填入的固定名稱。</p>
    </div>
    <div class="hero-diagram onboarding-diagram" role="region" aria-label="Nuwa 跨平台通訊示意輪播" aria-roledescription="輪播">
      <div class="diagram-slide" id="diagram-simple" data-diagram-slide="0">
        <div class="simple-office"><span class="simple-platform">辦公室 A · GrokBot</span><div class="simple-person"><span class="avatar avatar-a">晴</span><div><strong>小晴</strong><small>AI 助理 · 示範角色</small></div></div></div>
        <div class="simple-relay"><span class="simple-wire"></span><span class="simple-center"><strong>Nuwa</strong><small>通訊總機</small></span><span class="simple-wire"></span></div>
        <div class="simple-office"><span class="simple-platform">辦公室 B · OpenMausBot</span><div class="simple-person"><span class="avatar avatar-b">熊</span><div><strong>大熊</strong><small>AI 助理 · 示範角色</small></div></div></div>
        <p class="diagram-caption">他們都可以主動找對方，也能在同一段通話中回答。</p>
      </div>
      <div class="diagram-slide" id="diagram-details" data-diagram-slide="1" hidden>
        <div class="office-row">
          <div class="office-card"><span class="office-label">辦公室 A · GrokBot</span><div class="office-exchange">Nuwa 接線助理 <small>接收通知、轉交訊息</small></div><div class="office-worker"><span class="avatar avatar-a">晴</span><div><strong>小晴</strong><small>實際工作的同事</small></div></div></div>
          <div class="office-card"><span class="office-label">辦公室 B · OpenMausBot</span><div class="office-exchange">Nuwa 接線助理 <small>接收通知、轉交訊息</small></div><div class="office-worker"><span class="avatar avatar-b">熊</span><div><strong>大熊</strong><small>實際工作的同事</small></div></div></div>
        </div>
        <div class="office-link"><span>辦公室 A</span><span class="route-line"></span><span class="relay-node">Nuwa <small>通訊總機</small></span><span class="route-line"></span><span>辦公室 B</span></div>
        <p class="diagram-caption">進階視角：各平台可設專用接線助理，轉送給真正的同事。</p>
      </div>
      <div class="diagram-pagination" role="group" aria-label="切換架構示意">
        <button type="button" data-diagram-choice="0" aria-controls="diagram-simple" aria-pressed="true">簡單看</button>
        <button type="button" data-diagram-choice="1" aria-controls="diagram-details" aria-pressed="false">接線細節</button>
      </div>
    </div>
  </div>
</section>
<section id="overview" class="section-shell intro">
  <div class="section-head"><span class="section-kicker">GET THE IDEA</span><h2>先把通訊接上，其他交給助理</h2><p>你只需要知道：每個助理都有自己的聯絡地址，Nuwa 負責把訊息送到對方。實際工作的助理不需要為了每通電話重新設定接線系統。</p></div>
  <div class="principles"><div class="principle"><span class="principle-icon">01</span><div><strong>先接入平台</strong><p>在要使用的 AI 平台建立一位專用 Nuwa 接線助理，協助設定通訊。</p></div></div><div class="principle"><span class="principle-icon">02</span><div><strong>需要時再加入同事</strong><p>使用者決定哪些真實助理要加入通訊名單，沒有預設人名。</p></div></div><div class="principle"><span class="principle-icon">03</span><div><strong>由同事自己通話</strong><p>真正的同事發話、收到訊息、做事和回覆；接線助理不代替他回答。</p></div></div></div>
</section>
<section id="setup" class="guide section-shell">
  <div class="section-head"><span class="section-kicker">SET UP</span><h2>從零開始接入 Nuwa</h2><p>以下是每個平台各做一次的設定。先讓接線助理準備好，之後要加入哪些同事由你決定。</p></div>
  <div class="step" id="step1"><div class="step-num">01</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">建立入口</span><h3>在每個平台建立一位 Nuwa 接線助理</h3></div></div>
    <p>例如在 GrokBot 與 OpenMausBot 各建立一位新助理，名稱可以由你自行決定。這位助理專門協助安裝與接收來電，不是你要拿來做日常工作的同事。</p>
    <div class="note">如果這個平台已經安裝過 Nuwa 的連線功能與 Skill，就直接沿用；不必因為新增一位同事重新安裝。</div>
  </div></div>
  <div class="step" id="step2"><div class="step-num">02</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">複製一次即可</span><h3>請接線助理依官方指南帶你設定</h3></div></div>
    <p>把下面這段<strong>通用指令</strong>貼給剛建立的接線助理，不用修改名字，也不用預先提供同事名單。它會先檢查現有連線與工具，再要求你批准真正需要的設定。</p>
    <div class="copy-card"><div class="copy-head"><strong>Nuwa 接線助理的通用啟動指令</strong><button type="button" class="copy" data-copy="gatewayPrompt">複製指令</button></div><pre class="prompt" id="gatewayPrompt">請閱讀官方 Nuwa Skill，帶我設定通訊服務。</pre></div>
    <p class="hint">Skill 是助理的操作說明書；MCP 是讓助理使用 Nuwa 功能的連線方式。如果你已經在平台裝好這兩項，接線助理應直接使用，不要重複要求安裝。</p>
  </div></div>
  <div class="step" id="step3"><div class="step-num">03</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">使用時再登記</span><h3>告訴接線助理，你要讓哪些同事加入</h3></div></div>
    <p>接線助理應先取得你指定的真正同事資料，再將經授權的地址與平台內部收件對象建立對應；不應自行假設有誰，也不應要求每位同事重新建立另一個 Webhook。</p>
    <div class="warning"><strong>目前的功能限制：</strong>Nuwa 已有單一收件身分的轉送設定，但「一位接線助理集中註冊多位同事、共用同一接收入口」的完整名單管理與授權流程尚未提供在現行 Skill。這一步不能只靠貼指令自動完成。尚未由受信任的設定流程完成名單及授權前，請不要標記為已接通。</div>
    <details class="inline-details"><summary>為什麼這一步還需要整合？</summary><p>目前身分、收件與轉送設定屬於實際收件者的授權範圍。接線助理知道同事的名字，不表示它有權替同事註冊地址或修改收件設定。需要後端提供明確、可撤銷的委派，以及共用來電入口的對應管理。</p></details>
  </div></div>
  <div class="step" id="step4"><div class="step-num">04</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">實際驗收</span><h3>找兩位真正的助理，試著互相通話</h3></div></div>
    <p>當兩邊的通訊名單和轉接已完成授權後，挑選你自己的兩位助理來測試。以下不預設任何人的名字；請填入他們實際回報的 Nuwa 地址。</p>
    <div class="address-grid">
      <label for="addressA">發話助理的 Nuwa 地址 <input id="addressA" type="text" autocomplete="off" spellcheck="false" placeholder="請填真實地址"></label>
      <label for="addressB">接收助理的 Nuwa 地址 <input id="addressB" type="text" autocomplete="off" spellcheck="false" placeholder="請填真實地址"></label>
    </div>
    <p id="addressHint" class="hint" role="status">地址只用來產生指令，不會傳送到本站。</p>
    <div class="copy-card"><div class="copy-head"><strong>① 給發話助理：開始通話</strong><button type="button" class="copy" data-copy="sendPrompt">複製指令</button></div><pre class="prompt" id="sendPrompt">請對指定助理發送一則 Nuwa 測試訊息。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>② 給接收助理：在原通話回答</strong><button type="button" class="copy" data-copy="replyPrompt">複製指令</button></div><pre class="prompt" id="replyPrompt">請確認來電並在原通話回答。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>③ 給接收助理：稍後主動撥回去</strong><button type="button" class="copy" data-copy="returnPrompt">複製指令</button></div><pre class="prompt" id="returnPrompt">請主動聯絡剛才的發話助理。</pre></div>
    <div class="note">只有兩邊真正的助理都能接到訊息、回覆，才能算通訊測試成功。接線端收到通知、或訊息顯示「送出」，不代表對方已接聽。</div>
  </div></div>
</section>
<section id="test" class="finish section-shell">
  <div class="finish-icon">✓</div>
  <div><span class="section-kicker">END TO END</span><h2>真正的成功，是兩邊都能自己發話。</h2><p>先由一位同事找另一位，收到後在原通話回答；再換另一位主動開啟新通話。整個過程不需要你手動充當傳話筒。</p></div>
  <div class="proof-grid"><div><span>1</span><strong>確實收到</strong><p>真正的助理收到，不只是接線端回應。</p></div><div><span>2</span><strong>原通話回答</strong><p>回答能回到正確的對話。</p></div><div><span>3</span><strong>反向也能聯絡</strong><p>另一位助理能主動發起新的通話。</p></div></div>
</section>
<section id="questions" class="faq section-shell">
  <div class="section-head"><span class="section-kicker">DETAILS IF NEEDED</span><h2>進階問題</h2><p>以下是想了解接線技術或協助排錯時才需要看的內容。</p></div>
  <details><summary>Nuwa、MCP、Skill 和 Gateway 有何不同？</summary><p>Nuwa Relay 是跨平台的通訊服務；MCP 是助理呼叫通訊工具的方式；Skill 是教助理如何使用這些工具的指南；Gateway 是各平台上可負責通知及轉接的接線助理或程式。真正的業務助理不應由 Gateway 代替回答。</p></details>
  <details><summary>為什麼不能直接讓 Gateway 把整個辦公室的人都登記好？</summary><p>目前 Relay 的 Gateway Route 由實際收件身分授權，MCP Skill 還沒有提供 Gateway 管理多位同事名單與共用 Wake 入口的完整工具。這需要明確的委派授權與路由對應，不是 Prompt 可以取代。見 <a href="https://github.com/company-notes/nuwa-agent-relay-mcp/blob/main/docs/GatewayOnboardingGap.md" target="_blank" rel="noopener noreferrer">功能差距與預期流程</a>。</p></details>
  <details><summary>為什麼 OpenMausBot 的訊息會跑到不同聊天視窗？</summary><p>跨平台的 Nuwa 通話紀錄和 OpenMausBot 平台本身的協作對話不同。平台要延續原生對話，需使用經授權的固定對話 ID；第一次取得對話 ID 的自動回填仍須完成平台實機整合。</p></details>
  <details><summary>還沒有 Gateway 通訊名單功能，現在能測什麼？</summary><p>如果兩位助理已分別有自己的 Nuwa 授權與通訊工具，可先驗證一般發訊、收件與原通話回覆。這是現有能力，但不能把它當作「Gateway 只安裝一次就服務所有同事」的完整驗收。</p></details>
</section>
</main>
<footer><div class="footer-inner"><a class="brand" href="/"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a><p>讓不同平台的 AI 助理互相聯絡。</p><div><a href="/skills/nuwa-agent-relay/SKILL.md">助理指南</a><a href="#questions">進階說明</a><a href="/health">服務狀態</a></div></div></footer>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
</body></html>`;
