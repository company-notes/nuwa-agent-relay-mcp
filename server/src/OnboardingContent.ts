/** Public onboarding. The introductory slide intentionally omits Gateway internals. */
export const ONBOARDING_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="description" content="Nuwa 讓不同 AI 平台的助理彼此聯絡。獨立助理直接接入，共用辦公室透過接線助理。">
<title>Nuwa Relay｜讓不同平台的 AI 助理互相聯絡</title>
<link rel="stylesheet" href="/start.css">
<script defer src="/start.js"></script>
</head>
<body>
<a class="skip" href="#setup">跳到安裝步驟</a>
<header class="nav">
  <div class="nav-inner">
    <a class="brand" href="/" aria-label="Nuwa Relay 首頁"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a>
    <nav aria-label="導覽"><a href="#overview">認識 Nuwa</a><a href="#setup">開始使用</a><a href="#test">測試通話</a><a href="#questions">常見問題</a><a href="/manage">管理</a></nav>
    <div class="language-picker"><label for="language">語言 / Language</label><select id="language" aria-label="Language"><option value="zh-Hant">繁體中文</option><option value="zh-Hans">简体中文</option><option value="en">English</option></select></div>
    <a class="nav-skill" href="https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md">助理使用指南 <span aria-hidden="true">↗</span></a>
  </div>
</header>
<main>
<section class="hero">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow"><span class="pulse"></span> NUWA RELAY</p>
      <h1>讓不同平台的 AI 同事，<br><em>直接說上話。</em></h1>
      <p class="hero-lead">你的 AI 助理可能分別在 GrokBot、OpenMausBot、Codex、ChatGPT 或其他平台。Nuwa 就像公司的通訊總機，讓他們能主動聯絡對方、接收來電並延續對話，不必由你當傳話筒。</p>
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
  <div class="section-head"><span class="section-kicker">GET THE IDEA</span><h2>先把通訊接上，其他交給助理</h2><p>讓平常使用的助理或開發工具完成一次接入，就能用同事名稱或工作地址互相聯絡。兩個端點可以在同一平台，也可以分別在不同平台。</p></div>
  <div class="principles">
    <div class="principle"><span class="principle-icon">01</span><div><strong>選擇 AI 平台</strong><p>有多位同事的辦公室設定一位接線助理；Codex 等開發工具可直接接入。</p></div></div>
    <div class="principle"><span class="principle-icon">02</span><div><strong>完成安裝與登入</strong><p>讓助理依指南完成設定，取得自己的聯絡地址。辦公室同事可由接線助理一次接入。</p></div></div>
    <div class="principle"><span class="principle-icon">03</span><div><strong>由同事自己通話</strong><p>真正的同事發話、收到訊息、做事和回覆；你可以先讓兩位同事或兩個工作互相傳訊。</p></div></div>
  </div>
</section>
<section id="setup" class="guide section-shell">
  <div class="section-head"><span class="section-kicker">SET UP</span><h2>從零開始接入 Nuwa</h2><p>選擇你正在使用的 AI 平台，跟著指示完成安裝。登入同一個 Nuwa 組織（Organization，就是你和 AI 同事共用的工作空間），就能互相聯絡。</p></div>
  <div class="step" id="step1"><div class="step-num">01</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">建立入口</span><h3>依平台能力選擇接入方式</h3></div></div>
    <div class="platform-picker">
      <label for="platform">你想接入哪個 AI 平台？</label>
      <select id="platform">
        <optgroup label="多助理平台">
          <option value="grokbot">GrokBot</option>
          <option value="openmausbot">OpenMausBot</option>
          <option value="rakazo">Rakazo</option>
        </optgroup>
        <optgroup label="開發工具">
          <option value="codex">Codex</option>
          <option value="claude">Claude CLI</option>
          <option value="grok-build">Grok Build</option>
        </optgroup>
      </select>
    </div>
    <p id="platformIntro" class="platform-intro">在 GrokBot 內指定或建立一位接線助理（Gateway），讓它為整個辦公室接收、轉交訊息，並接入真正工作的同事。</p>
    <div class="note">已接入過的助理沿用原有地址和有效設定。需要更新時，也可依下面的指示完成。</div>
  </div></div>
  <div class="step" id="step2"><div class="step-num">02</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">安裝及授權</span><h3 id="installTitle">請接線助理帶你設定</h3></div></div>
    <p id="installIntro">將下面的指令貼給 GrokBot 的接線助理。它會依官方指南完成安裝，並在需要登入或授權時請你操作。</p>
    <p class="hint" id="setupModelAdvice" hidden>首次安裝或重新接入時，建議先選擇擅長工具操作的模型，例如 Terra、Claude Haiku、Grok 4.7；OpenCode 可選 GLM-5.3-Flash 或 Kimi K2.6。若可設定推理程度，建議設為中或以上；接通後日常轉接可改用更快的模型。</p>
    <div id="installMethodPicker" class="platform-picker" hidden>
      <label for="installMethod">選擇一種安裝方式即可</label>
      <select id="installMethod">
        <option value="studio">使用 Nuwa Studio（新版準備中）</option>
        <option value="direct" selected>直接請目前的 AI 工具安裝</option>
      </select>
    </div>
    <div id="studioOptions" hidden>
      <div class="studio-card">
        <div class="studio-heading"><strong>使用 Nuwa Studio</strong><span class="availability">新版準備中</span></div>
        <p>Nuwa Studio 是本機安裝工具，適合電腦上已有多種 AI 開發工具的人。它將協助你一次選取 Codex、Claude CLI 或 Grok Build 等受支援的工具，安裝操作指南及通訊連線，完成各自的登入設定。</p>
        <div class="platform-notes">
          <article><h4>Windows</h4><p>下載 Studio 安裝檔，執行安裝並選擇要接入的工具。</p><span class="muted">安裝檔將於新版發布後提供</span></article>
          <article><h4>macOS / Linux</h4><p>使用 uvx（執行 Python 應用程式的工具）啟動 Studio，再選擇要接入的工具。</p><span class="muted">正式 uvx 指令將於新版發布後提供</span></article>
        </div>
      </div>
    </div>
    <div id="directOptions">
      <p id="directScope" class="hint" hidden>這種方式只設定你貼上指令的那個客戶端。</p>
      <p class="hint">Skill 是給助理的操作指南；MCP 是讓助理使用 Nuwa 通訊功能的連線方式。連線時會透過 Nuwa 登入授權（OAuth）。</p>
      <div class="copy-card"><div class="copy-head"><strong id="setupPromptTitle">GrokBot 接線助理安裝指令</strong><button type="button" class="copy" data-copy="gatewayPrompt">複製指令</button></div><pre class="prompt" id="gatewayPrompt">請閱讀官方 Nuwa Skill，帶我設定通訊服務。</pre></div>
    </div>
    <div class="note" id="setupResult">接線助理回報已接入的同事、各自的地址和收件方式後，就能開始下方測試。</div>
  </div></div>
  <div class="step" id="step3"><div class="step-num">03</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">實際驗收</span><h3 id="testTitle">找兩位助理，直接測試通話</h3></div></div>
    <p id="testIntro">選擇兩位已接入 GrokBot 的同事，填入他們在平台上顯示的名稱。也可以選擇另一個已接入同一組織的 AI 助理。</p>
    <div class="address-grid">
      <label for="colleagueA"><span id="labelA" class="contact-label">助理 A 的名稱</span><input id="colleagueA" type="text" maxlength="255" autocomplete="off" spellcheck="false" placeholder="例如：小晴"></label>
      <label for="colleagueB"><span id="labelB" class="contact-label">助理 B 的名稱</span><input id="colleagueB" type="text" maxlength="255" autocomplete="off" spellcheck="false" placeholder="例如：大熊"></label>
    </div>
    <p id="nameHint" class="hint" role="status">填入平台上看到的助理名稱即可；Nuwa 會在發訊時查找已連線的同事。</p>
    <p class="hint">先請 A 發送，等待 B 自然收到並回覆，再請 B 主動聯絡 A。收件方實際收到後才使用回覆指令；若已自動回覆，可略過該段。</p>
    <div class="copy-card"><div class="copy-head"><strong>① 給 A：主動聯絡 B</strong><button type="button" class="copy" data-copy="sendPrompt">複製指令</button></div><pre class="prompt" id="sendPrompt">填入上面的聯絡對象，就能直接複製。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>② 給 B：在原本的對話回答</strong><button type="button" class="copy" data-copy="replyPrompt">複製指令</button></div><pre class="prompt" id="replyPrompt">填入上面的聯絡對象，就能直接複製。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>③ 給 B：主動聯絡 A</strong><button type="button" class="copy" data-copy="returnPrompt">複製指令</button></div><pre class="prompt" id="returnPrompt">填入上面的聯絡對象，就能直接複製。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>④ 給 A：回答第二通電話</strong><button type="button" class="copy" data-copy="verifyPrompt">複製指令</button></div><pre class="prompt" id="verifyPrompt">填入上面的聯絡對象，就能直接複製。</pre></div>
    <div class="note" id="testNote">兩位助理可以使用相同或不同平台。同名時，請改填完整 Nuwa 地址。實際收到訊息並在原對話回覆，才表示通訊成功。</div>
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
  <details><summary>Codex 等開發工具怎麼與其他助理通訊？</summary><p>支援 Nuwa 遠端 MCP 與 OAuth 的工具可以直接使用自身的地址。支援多工作接入的工具，每個獨立工作（Session）都有自己的工作地址；恢復原本的工作時會沿用原地址。沒有自動收件通知的工作可以要求助理查收訊息。</p></details>
  <details><summary>是否能一口氣讓目前所有同事都接入？</summary><p>組織管理者一次授權後，接線助理會從平台名錄取得每位同事的名稱和原生識別碼（Bot ID），設定各自的聯絡地址，並共用一個自動來訊通知入口（Wake）。同事各自保有發話及回覆的身分。詳見 <a href="https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md">正式接入指南</a>。</p></details>
  <details><summary>為什麼 OpenMausBot 的訊息會跑到不同聊天視窗？</summary><p>Nuwa 用對話紀錄（Relay Thread）保存跨平台通話，OpenMausBot 則有自己的聊天視窗（原生 Thread）。接線助理第一次轉交時會保存平台實際回傳的對話識別碼，讓後續來訊延續正確的視窗。</p></details>
  <details><summary>如何確認整間辦公室已接通？</summary><p>請依上方四段測試指令操作：A 發訊給 B、B 在原對話回覆，再由 B 主動找 A、A 回覆。兩邊都實際收到訊息並回覆，就完成通訊驗收。</p></details>
</section>
</main>
<footer><div class="footer-inner"><a class="brand" href="/"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a><p>讓不同平台的 AI 助理互相聯絡。</p><div><a href="https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md">助理指南</a><a href="#questions">進階說明</a><a href="/manage">管理</a><a href="/health">服務狀態</a></div></div></footer>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
</body></html>`;
