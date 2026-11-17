# Nuwa Relay MCP：維運時必須知道的事

**先了解整體系統：**[Nuwa 的辦公室電話架構](Architecture.md)；**要自己接入：**[從零開始](OnboardingGuide.md)；**驗收平台實際執行：**[Webhook／Gateway 驗收](ProductionWebhookAcceptance.md)。

本文只保留會影響安全、身分、正式資源或故障排查的規則。每次做過什麼、哪些 PR 合併及某個畫面曾顯示什麼，應查 GitHub PR／Commit／CI，不應寫成長期交接內容。

## 1. MCP 在整體架構的位置

Nuwa 是讓不同平台的 AI 同事直接通訊的系統。每個辦公室可以有專用的 **Gateway 交換機**；真正的同事（例如小晴、大熊）各自使用 **MCP 工具**傳話、回覆或交辦工作。

本 MCP 服務只負責提供 AI 可以呼叫的 Nuwa 工具，並在私密伺服器端保存及使用必要的授權。它**不負責**在 GrokBot／OpenMausBot 建立 Bot、不保證外部 Webhook 已啟動真實 Agent，也不代替 Gateway 修改其他助理的對話。

| 元件 | 作用 |
| --- | --- |
| **Agent Address** | 像公司人事與分機簿：決定組織、Agent、Session、地址與執行授權 |
| **Relay API** | 像中央通訊總機：保存訊息、通話、交辦、送達紀錄及喚醒通知 |
| **Relay MCP（本服務）** | 像同事桌上的電話：將 Agent 使用的工具呼叫轉換成有權限的 Relay 請求 |
| **Gateway** | 各辦公室交換機：收到通知後用平台內部能力轉送給真正的同事 |
| **MailTrigger** | Relay 背後使用的郵件收發與收件回執服務；使用者不需要直接設定 |

## 2. 身分與授權：最容易踩錯的地方

- **Organization**：授權上的「公司」，Nuwa 通訊和尋找同事以此為邊界。
- **Agent**：一位有獨立身分的助理。
- **Session**：一位 Agent 的具體執行／接收身分；公開地址是 `organization/agent/session`。
- **OAuth Grant**：一個 AI 客戶端獲授權的身分關係；同一人類帳號的**不同 Grant 仍是不同 Agent**。
- **Runtime Lease**：同一 Session 在某一刻可由誰執行的獨占、限時授權；OAuth 登入成功不等於取得任意 Session 的 Runtime。

一般 Skill-first 安裝是：

```text
閱讀官方 Skill → 客戶端連上 MCP → 使用平台原生 OAuth 授權
→ agentAddressEnsureIdentity → 經同意 relayProvisionAgentMailbox
→ 取得公開地址，開始使用 sendToAgent
```

使用者通常不需要接觸 Runtime／Resume 憑證。MCP 的私密 D1 保存這些憑證的加密資料，模型只接觸公開地址。OAuth Access Token 更新不應改變原 Grant 的 Session；真正更換 Grant 時預設建立新 Agent；但經組織擁有者明確要求，可用 `agentAddressSelectSession({address})` 選回同 Organization 內閒置的舊 Session。Server 內部更新加密綁定，保留原 Session ID、Wake、名冊與路由；不要求模型輸入 Resume Token。若該 Session 有有效 Runtime Lease，仍須拒絕接管。

**Gateway 例外也不能破壞此規則：**Gateway 自己取得的 OAuth／Session 只屬於它自己，不能拿來替小晴或大熊登記收件路由。收件 Session 的 Wake、Gateway Route 與 native Thread 仍須收件方授權與可信整合。


### 可選辦公室代發（尚非原生 Bot 強驗證）

管理者可在既有 12 位同事名冊與共用 Wake 不變的前提下，
明確開啟 `relayGatewayOfficeDelegation(enabled: true)`。
預設關閉。啟用後，`sendToAgent(from, to, message)` 與
`relayReplyThread(from, threadID, body)` 可指定本 Gateway 的已啟用同事；
`from` 支援同事姓名、已驗證 Email alias 或 Nuwa 地址。Relay
分開保存實際 OAuth/Runtime 執行者（Gateway Session）與宣告寄件者
（同事 Session），不能視為平台身分簽章。外人與其他辦公室的同事
不能透過這個 Gateway 代發，也不能讀取同事的收件匣或接受其 Handoff。

個別同事可在批次登記時選用 16–128 字暗語，或用
`relayGatewayCoworkerPassphrase` 更換、`relayGatewayRemoveCoworkerPassphrase`
移除；已設定就強制驗證，缺漏或不一致一律拒絕。
伺服器只儲存加鹽 PBKDF2 的雜湊；但共享 MCP 的模型與工具紀錄可能
看到使用者傳給工具的明文，因此不保證同事之間的暗語隔離。
不可把暗語驗證當成 GrokBot 的原生 Bot 身分證明。
正式的可信執行身分橋接另由 Issue #39 驗收。

## 3. MCP 對外契約

- 公開網站：<https://mcp.agent-relay.company-notes.com/>
- 官方 Skill：`/skills/nuwa-agent-relay/SKILL.md`
- Remote MCP：`/mcp`，需要 OAuth
- 進階私密 Session Binding：`/session-bindings`，需要 OAuth，**不是**模型工具
- 一般模型工具：`agentAddressEnsureIdentity`、`relayProvisionAgentMailbox`、`agentAddressResolve`、`sendToAgent`、`relayInbox`、`relayMessage`、`relayReplyThread` 等
- 自動收件：`relayBeginWakePairing`、`relayWakeSubscription`、`relayWakeEvents`；模型不直接處理私密 Webhook 憑證

`sendToAgent` 表示**開新 Relay Thread**，`relayReplyThread` 才是在**原 Relay Thread 回覆**。Relay Thread 與平台自己的 native UI Thread 是不同東西。

公開網站只展示教學與在**使用者瀏覽器內**產生可複製的指令，不上傳填入的公開地址、不幫使用者操作 OAuth／Gateway／Webhook。

## 4. 正式資源：只能使用現有的

| Cloudflare 資源 | 正式名稱／用途 |
| --- | --- |
| Worker | `nuwa-agent-relay-mcp` |
| 網域 | `mcp.agent-relay.company-notes.com` |
| D1 Binding | `BINDINGS_DB` → `nuwa-agent-relay-mcp`（只有 MCP 的加密 Session 綁定） |
| Worker Secret | `SESSION_BINDING_KEY`（加密綁定用；只放 Cloudflare Secret） |
| Service Binding | `ADDRESS_WORKER → agent-address` |
| Service Binding | `RELAY_WORKER → nuwa-agent-relay-api` |

**不要**把 Relay API D1、Agent Address D1 與 MCP Bindings D1 混用；不要任意清除加密資料或無計畫旋轉 `SESSION_BINDING_KEY`，否則既有授權綁定將無法恢復。

## 5. 正式發布規則

唯一部署入口是本倉庫 `.github/workflows/verify.yml`，由 `main` push 觸發：

1. 執行 TypeScript、MCP HTTP、真實本機 Wrangler D1、Studio Linux／Windows、資安依賴與程式風格檢查。
2. `scripts/PrepareProduction.mjs` 用既有 GitHub Cloudflare Secrets 找到**正式原名 D1**，產生單次的部署設定。不要提交 D1 ID 或私密金鑰到 Git。
3. `scripts/GuardBindingD1.mjs` 拒絕錯誤、未知、混合的 D1 schema；只允許正確的 MCP 綁定資料庫遷移。
4. 使用原本的 Worker 與網域發布，保留現有 Worker Secret。
5. `scripts/SmokeProduction.mjs` 驗證首頁／Skill、OAuth Discovery、私密端點拒絕未授權。這些是**線上健康／安全檢查**，不是實際 Bot-to-Bot 通話驗收。

不得為文件或網站變更另建生產 Worker、D1 或 MailTrigger 服務；不要改動既有 MailTrigger SMTP、路由、受管理信箱或 Relay 收件回執路徑。

## 6. 需要真的查問題時

| 症狀 | 先查什麼 |
| --- | --- |
| 登入後地址錯亂 | OAuth Grant 對應的 Agent／Session、Lease 狀態；不要用 Email 推測身份 |
| 小晴說已發送但大熊看不到 | `relayReceipt` 的配送證據，而不只是 `sendToAgent` 返回 |
| 送達但沒響鈴 | `relayWakeSubscription`、`relayWakeEvents`、平台 Webhook 真正是否觸發 |
| 交換機響了但大熊沒有收到 | 收件 Session Route、平台 Bot ID、內部工具收據、原生 Thread 綁定 |
| 回覆跑到別的話題 | 是否用 `relayReplyThread`、是否混淆 Relay 與平台 native Thread |
| 只有 HTTP Smoke 綠色 | 仍需要真人完成 GrokBot／OpenMausBot 自動接收與互相回覆驗收 |

不知道是否已送達時不要重送；不知道原生 Thread 是否已建立時不要再開一條。

## 7. 開發與交接規則

- `CODE_PRINCIPLES.md`：OO、DRY、separation of concerns；Rule 20 檢查有意義的空行／邏輯分組。
- `TESTING.md`：優先真實使用情境、權限隔離、Worker HTTP 和 D1；單元測試不能冒充平台 E2E。
- Skill 是目前模型能用的工具清單，不能為了讓文案更簡單而捏造不存在的管理工具。
- 收件回呼、OAuth、Runtime、Resume、Bearer、簽章金鑰不得出現在模型聊天、外部 Prompt、公開網頁、命令參數或 GitHub 記錄中。
- 永遠區分「寄送提交、配送確認、來電通知、Gateway 轉送、同事執行、同事回覆」。
- 交接只留下現行架構、授權邊界、操作流程與重要未驗收事項；修訂細節交給 PR 與 Commit 記錄。
