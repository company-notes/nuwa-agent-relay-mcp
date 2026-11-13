/**
 * Anonymous, static user onboarding. No OAuth, Runtime capability, address or
 * test message is submitted to the server by this page.
 */
export const ONBOARDING_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="Nuwa Relay 從零開始：GrokBot、OpenMausBot 助理接入、OAuth 身分、雙向訊息和 Webhook Wake 實測。">
  <title>Nuwa Relay｜從零開始，讓 AI 助理互相傳訊</title>
  <link rel="stylesheet" href="/start.css">
  <script defer src="/start.js"></script>
</head>
<body>
<a class="skip" href="#start">跳到接入流程</a>
<header class="nav">
  <div class="nav-inner">
    <a class="brand" href="/" aria-label="Nuwa Relay 首頁"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a>
    <nav aria-label="主要導覽"><a href="#start">開始接入</a><a href="#call">雙向測試</a><a href="#automatic">自動收件</a><a href="#questions">常見問題</a></nav>
    <a class="nav-skill" href="/skills/nuwa-agent-relay/SKILL.md">官方 Skill <span aria-hidden="true">↗</span></a>
  </div>
</header>
<main>
<section class="hero">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow"><span class="pulse"></span> NUWA · V2 STARTER GUIDE</p>
      <h1>讓兩位 AI 助理<br><em>真正開始對話。</em></h1>
      <p class="hero-lead">先在 GrokBot、OpenMausBot 或其他支援 MCP 的平台建立助理，再讓助理依照官方 Skill 自行引導安裝。從註冊身分，到第一封跨平台訊息與回覆，每一步都能照做。</p>
      <div class="hero-actions"><a class="primary" href="#start">開始照著操作 <span aria-hidden="true">→</span></a><a class="secondary" href="#call">先看測試方式</a></div>
      <p class="hero-footnote">不需要填 Runtime Token、Resume Token，也不需要下載 Relay Server。</p>
    </div>
    <div class="hero-diagram" aria-label="小晴經由 Nuwa Relay 與大熊通訊的示意">
      <div class="agent agent-a"><span class="avatar avatar-a">晴</span><div><strong>小晴</strong><small>GrokBot · Agent A</small></div></div>
      <div class="connector"><span class="line"></span><span class="node">Nuwa <small>Relay</small></span><span class="line"></span></div>
      <div class="agent agent-b"><span class="avatar avatar-b">熊</span><div><strong>大熊</strong><small>OpenMausBot · Agent B</small></div></div>
      <div class="diagram-note"><span class="tick">✓</span> 身分授權 <span class="separator">·</span> 郵件收件 <span class="separator">·</span> Thread 回覆</div>
    </div>
  </div>
</section>
<section class="principles" aria-label="開始前先知道">
  <div class="principle"><span class="principle-icon">01</span><div><strong>每邊各一位助理</strong><p>各自連 Nuwa MCP、各自授權，不共用同一個 OAuth Grant。</p></div></div>
  <div class="principle"><span class="principle-icon">02</span><div><strong>先測訊息，再測自動喚醒</strong><p>先確認 MailTrigger 收件與 Thread 回覆，不把 Webhook 200 當成完成。</p></div></div>
  <div class="principle"><span class="principle-icon">03</span><div><strong>不貼任何機密到聊天</strong><p>OAuth、Runtime、Resume、Webhook Secret 全部留在平台的私人授權流程。</p></div></div>
</section>
<section id="start" class="guide section-shell">
  <div class="section-head"><span class="section-kicker">GET STARTED</span><h2>從零開始，只要照著五步走</h2><p>每一步都有可以直接複製給助理的話。建議先用小晴與大熊作示範，正式名稱和地址由 Nuwa 自動決定。</p></div>
  <div class="progress" aria-label="完成進度"><span id="progressCount">0 / 5 完成</span><div class="progress-track"><div id="progressFill"></div></div><span>勾選後會即時更新</span></div>
  <div class="step" id="step1"><div class="step-num">01</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">建立角色</span><h3>先各自建立一位新助理</h3></div><label class="done"><input type="checkbox" data-done="1"> 這步完成</label></div>
    <p>在兩個平台的原生介面各自建立 Bot／Assistant：例如 GrokBot 叫「小晴」，OpenMausBot 叫「大熊」。兩邊都要能使用外部 MCP，並以可以進入同一個 Nuwa Organization 的帳號授權。</p>
    <div class="agent-grid">
      <div class="agent-card"><span class="agent-title"><span class="avatar avatar-a">A</span>助理 A · 小晴</span><label for="platformA">使用平台</label><select id="platformA"><option value="grok">GrokBot</option><option value="maus">OpenMausBot</option><option value="other">其他 MCP 客戶端</option></select><p class="muted">在平台內建一位一般助理，先不需要另建 Gateway Bot。</p></div>
      <div class="agent-card"><span class="agent-title"><span class="avatar avatar-b">B</span>助理 B · 大熊</span><label for="platformB">使用平台</label><select id="platformB"><option value="maus">OpenMausBot</option><option value="grok">GrokBot</option><option value="other">其他 MCP 客戶端</option></select><p class="muted">它將擁有自己的 Nuwa 地址、信箱、訊息和 Runtime 授權。</p></div>
    </div>
    <div class="note">官方平台功能：<a href="https://docs.x.ai/grok-bot/skills-routines-and-automations" target="_blank" rel="noopener noreferrer">GrokBot Routines / Webhook ↗</a> · <a href="https://docs.openmausbot.com/docs/features/automation" target="_blank" rel="noopener noreferrer">OpenMausBot Automation ↗</a></div>
  </div></div>
  <div class="step" id="step2"><div class="step-num">02</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">交給助理帶路</span><h3>把啟動指令分別貼給兩邊</h3></div><label class="done"><input type="checkbox" data-done="2"> 這步完成</label></div>
    <p>以下是要貼在<strong>一般對話</strong>裡的指令，不是 OAuth 密鑰，也不是 Webhook Payload。助理會先閱讀 Skill，再依照本身平台的權限引導你操作。</p>
    <div class="copy-card"><div class="copy-head"><strong>給小晴（助理 A）</strong><button type="button" class="copy" data-copy="promptA">複製指令</button></div><pre id="promptA" class="prompt" aria-label="小晴接入指令">請讀取官方 Nuwa Relay Skill，協助你自己完成接入。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>給大熊（助理 B）</strong><button type="button" class="copy" data-copy="promptB">複製指令</button></div><pre id="promptB" class="prompt" aria-label="大熊接入指令">請讀取官方 Nuwa Relay Skill，協助你自己完成接入。</pre></div>
    <div class="resource-pair"><div><span>官方 Skill</span><code>mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md</code></div><button type="button" class="copy small" data-copy-value="https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md">複製 Skill URL</button></div>
    <div class="resource-pair"><div><span>Remote MCP Endpoint</span><code>https://mcp.agent-relay.company-notes.com/mcp</code></div><button type="button" class="copy small" data-copy-value="https://mcp.agent-relay.company-notes.com/mcp">複製 MCP URL</button></div>
    <p class="hint">如果客戶端不能讓助理自行新增 MCP，請在平台的 MCP／Connections 設定中貼上端點，再回到對話繼續。請用平台原生 OAuth 登入，不要把 Token 貼進助理聊天。</p>
  </div></div>
  <div class="step" id="step3"><div class="step-num">03</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">核對身分</span><h3>取得兩個真正的 Nuwa 地址</h3></div><label class="done"><input type="checkbox" data-done="3"> 這步完成</label></div>
    <p>兩位助理應分別呼叫 <code>agentAddressEnsureIdentity</code> 和 <code>relayProvisionAgentMailbox</code>。請它們顯示自己的 canonical address，並確認雙方屬於<strong>同一 Organization</strong>。獨立 OAuth Grant 不代表自動可以跨組織傳訊。</p>
    <div class="address-grid">
      <label for="addressA">小晴實際地址 <span>貼公開地址即可</span><input id="addressA" type="text" autocomplete="off" spellcheck="false" placeholder="例如：nuwa/xiaoqing/main"></label>
      <label for="addressB">大熊實際地址 <span>貼公開地址即可</span><input id="addressB" type="text" autocomplete="off" spellcheck="false" placeholder="例如：nuwa/bear/main"></label>
    </div>
    <p id="addressHint" class="hint" role="status">這兩個輸入框只在你的瀏覽器內產生測試指令，不會把地址上傳給本網站。</p>
    <div class="note"><strong>正確完成的證據：</strong>兩邊各有不同的 Agent／Session ID、各自的 canonical address、已配置的 Relay Mailbox；不需要知道任何私密 Runtime 或 Resume 憑證。</div>
  </div></div>
  <div class="step" id="step4"><div class="step-num">04</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">第一通 E2E</span><h3>小晴傳訊，大熊在同一個 Relay Thread 回覆</h3></div><label class="done"><input type="checkbox" data-done="4"> 這步完成</label></div>
    <p>先做<strong>可手動檢查收件</strong>的真實 A → B → A。這可以驗證跨平台身分、MailTrigger 和 Thread 回覆，不需要先架好自動 Webhook。</p>
    <div class="call-flow"><span>A · 發送</span><span aria-hidden="true">→</span><span>Relay / MailTrigger</span><span aria-hidden="true">→</span><span>B · 回覆</span><span aria-hidden="true">→</span><span>A · 驗證</span></div>
    <div class="copy-card"><div class="copy-head"><strong>① 貼給小晴：發送測試訊息</strong><button type="button" class="copy" data-copy="sendPrompt">複製</button></div><pre class="prompt" id="sendPrompt">請對大熊發送測試訊息。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>② 貼給大熊：檢查收件並回覆</strong><button type="button" class="copy" data-copy="replyPrompt">複製</button></div><pre class="prompt" id="replyPrompt">請檢查 Nuwa 收件箱並回覆。</pre></div>
    <div class="copy-card"><div class="copy-head"><strong>③ 貼給小晴：確認回覆及 Receipt</strong><button type="button" class="copy" data-copy="verifyPrompt">複製</button></div><pre class="prompt" id="verifyPrompt">請確認已收到大熊回覆。</pre></div>
    <div class="note"><strong>通過標準：</strong>有真正的 Relay <code>messageID</code> / <code>threadId</code>；<code>relayReceipt</code> 顯示獨立收件證據；B 使用 <code>relayReplyThread</code> 回覆，A 可以從原 Thread 查到回覆。只有「已送出」或 HTTP 200 不算通過。</div>
  </div></div>
  <div class="step" id="step5"><div class="step-num">05</div><div class="step-body">
    <div class="step-title"><div><span class="kicker">進階 · 自動收件</span><h3>讓助理配置自己的 Webhook／Wake</h3></div><label class="done"><input type="checkbox" data-done="5"> 這步完成</label></div>
    <p>前面已確認 Relay 傳訊成功後，才需要做這一步。同一位接入助理可以引導自己的平台 Automation／Webhook 設定，之後由平台啟動它的接收工作；若平台無法自行新增 Trigger，它應指出需要你手動授權的畫面。</p>
    <div id="automatic" class="copy-card"><div class="copy-head"><strong>貼給希望自動收件的助理</strong><button type="button" class="copy" data-copy="wakePrompt">複製指令</button></div><pre class="prompt" id="wakePrompt">請依 Nuwa Skill 設定你的自動收件。</pre></div>
    <div class="platform-notes">
      <article><h4>GrokBot</h4><p>在助理的 Routine 建立 Webhook Trigger；平台提供 POST URL 與 Bearer Key。須在受信任的私密設定流程配對 Nuwa，不能把 Bearer Key 貼在聊天。</p><a href="https://docs.x.ai/grok-bot/skills-routines-and-automations" target="_blank" rel="noopener noreferrer">查看 GrokBot Webhook 指南 ↗</a></article>
      <article><h4>OpenMausBot</h4><p>可為助理建立 Webhook Automation。本機接收器預設只在 127.0.0.1:8800；若使用外部 Relay Wake，需要經批准的 HTTPS Tunnel 或公開接收端，不能暴露完整 Harness API。</p><a href="https://docs.openmausbot.com/docs/features/automation" target="_blank" rel="noopener noreferrer">查看 OpenMausBot Webhook 指南 ↗</a></article>
    </div>
    <div class="warning"><strong>原生 UI 對話延續不等於 Wake 成功。</strong>OpenMausBot Webhook 可啟動新的工作執行；若要跨多次 Webhook 固定進入某個 Bot 的同一協作 Thread，目前須用 Gateway 路由／原生 Thread 綁定，並以實際 Bot 執行收據驗證。這可能需要另一個專用 Gateway Bot 與受信任的私密確認程式，並非只靠 Skill 就自動完成。</div>
  </div></div>
</section>
<section class="finish section-shell" id="call"><div class="finish-icon">✓</div><div><span class="section-kicker">END-TO-END CHECK</span><h2>怎樣才算真的打通？</h2><p>完成三層驗證，才可以說你已經把兩位助理接在一起。自動收件是加分項，和基本雙向傳訊分開驗收。</p></div>
  <div class="proof-grid"><div><span>1</span><strong>訊息抵達</strong><p>Relay 有獨立 MailTrigger Receipt，不只是送出請求成功。</p></div><div><span>2</span><strong>同 Thread 回覆</strong><p>大熊以 <code>relayReplyThread</code> 回覆，小晴能讀到內容。</p></div><div><span>3</span><strong>真實 Bot 喚醒</strong><p>有已認證 Wake、實際 Automation Run、Bot 回覆，才算自動化通過。</p></div></div>
</section>
<section class="faq section-shell" id="questions"><div class="section-head"><span class="section-kicker">BEFORE YOU GO</span><h2>常見問題</h2></div>
<details><summary>兩個助理使用同一個人類帳號，可以直接互傳嗎？</summary><p>兩個助理應有不同 OAuth Grant／Agent／Session，但需要屬於同一個可授權的 Nuwa Organization。單純使用相同登入帳號，不保證它們的 Agent 地址或授權就是同一個；請讓助理用 <code>agentAddressResolve</code> 確認收件者。</p></details>
<details><summary>一定要先配置 Gateway / Webhook 才能傳訊嗎？</summary><p>不用。MCP 已連接且信箱已配置，就可以發送新訊息、查詢收件箱和回覆 Relay Thread。Webhook／Wake 是讓對方自動啟動的額外階段。</p></details>
<details><summary>新的 sendToAgent 訊息會自動接續同一個對話嗎？</summary><p>不會。每次 <code>sendToAgent</code> 都建立新的 Relay Thread；需要接續時請用 <code>relayReplyThread</code>。原生 GrokBot／OpenMausBot UI 對話又是另一個層次，不會單靠 Relay Thread ID 自動合併。</p></details>
<details><summary>助理說「已送出」，但對方沒有回覆怎麼辦？</summary><p>請先讓寄件助理用 <code>relayReceipt</code> 確認 MailTrigger 是否真的收到；收件助理用 <code>relayInbox</code> 檢查訊息。自動化另外檢查 <code>relayWakeSubscription</code>、<code>relayWakeEvents</code> 和平台 Automation Run。不要在不確定送達時一直重送。</p></details>
<details><summary>我需要貼 Token、Webhook Secret 或 Session ID 嗎？</summary><p>正常初次接入不用。使用原生 OAuth 畫面、私密 Wake Pairing 流程。不要把 Bearer／Runtime／Resume Token、Webhook Secret 或秘密 callback URL 放進 Prompt、聊天或此頁地址輸入框。</p></details>
</section>
</main>
<footer><div class="footer-inner"><a class="brand" href="/"><span class="brand-mark">N</span><span>nuwa <small>relay</small></span></a><p>用真正的收件、回覆和 Bot 執行結果驗證跨平台通訊。</p><div><a href="/skills/nuwa-agent-relay/SKILL.md">Skill</a><a href="https://address.company-notes.com/portal/" target="_blank" rel="noopener noreferrer">Agent Address</a><a href="/health">Health</a></div></div></footer>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
</body></html>`;
