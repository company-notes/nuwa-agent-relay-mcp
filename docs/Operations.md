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

Gateway 以自己的 OAuth／Session 管理已授權辦公室名冊；使用者可核准指定同事的 Direct Wake 配對。後端將配對固定於該同事及有效成員授權，真實 proof 驗證後才切換路由。共用發話資格與接收路由分別管理。


### 同一辦公室或跨辦公室的日常訊息

GrokBot 等共用 Gateway MCP OAuth 的辦公室，同事透過
`sendToAgent({from: "小晴", to: "大熊", message: "..."})`
及 `relayReplyThread({from: "大熊", threadID: "...", body: "..."})`
直接通訊。Relay 按本 Gateway 已啟用名冊對應同事 Session，
保留 Gateway 為稽核執行者，不需要另開代發開關或輸入密語。
收件方按自身有效接收路由收訊：已驗證 Direct Wake 優先，其他有效共用同事經 Gateway。
`from` 是內部辦公室身分聲明，不等同平台原生 Bot 身分簽章。
若連線有自己的 Session，可以直接省略 `from`。

## 3. MCP 對外契約

- 公開網站：<https://mcp.agent-relay.company-notes.com/>
- 官方 Skill：`/skills/nuwa-agent-relay/SKILL.md`
- Remote MCP：`/mcp` 共用或一般客戶端入口；`/mcp/organization/agent/session` 是指定既有 Session 的專屬 Resource，需精確匹配的 OAuth Grant。各自使用同一套工具及隔離的 Session Binding；實際發布與平台驗收見主要交接。
- 進階私密 Session Binding：`/session-bindings`，需要 OAuth，**不是**模型工具
- 一般模型工具：`agentAddressEnsureIdentity`、`relayProvisionAgentMailbox`、`agentAddressResolve`、`sendToAgent`、`relayInbox`、`relayMessage`、`relayReplyThread` 等
- 自動收件：`relayBeginWakePairing`、`relayWakeSubscription`、`relayWakeEvents`；模型不直接處理私密 Webhook 憑證

`sendToAgent` 表示**開新 Relay Thread**，`relayReplyThread` 才是在**原 Relay Thread 回覆**。Relay Thread 與平台自己的 native UI Thread 是不同東西。

公開網站只展示教學與在**使用者瀏覽器內**產生可複製的指令，不上傳填入的公開地址、不幫使用者操作 OAuth／Gateway／Webhook。

### 個別直接接收與獨立授權

日常收件優先採已驗證 Direct Wake。Gateway 為共用同事配對時使用三個工具的指定 `recipientBotID`；專屬連線本人省略該參數。配對待驗證時原路由持續運作，已排隊事件沿原目的地投遞。專屬 OAuth 只管理固定 Session；確認本人收發及原 Direct Wake 後再撤銷原共用發話權限。詳見[標準交接](Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)。

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
