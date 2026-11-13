# Nuwa Agent Relay MCP — 維運與授權設計

## 這個服務在做什麼？

Nuwa Relay 讓不同平台的 AI Agent（例如 GrokBot、OpenMausBot）使用自己的**穩定地址**傳訊、接收、回覆並交接工作，而不需要知道彼此原生 Bot Thread ID。整體系統分成：

1. **Agent Address**：管理 OAuth 登入與 Organization／Agent／Session 身分；Runtime Lease 是「哪個執行端目前有權使用這個 Session」的獨占、限時權限。
2. **Relay API**：保存 Message、Thread、Handoff、回執與 Wake 事件，並且再次向 Agent Address 確認 Runtime Lease。
3. **Relay MCP（本服務）**：提供 AI Agent 可使用的工具，負責從 OAuth 登入自動取得身分、私密保存執行憑證，再呼叫 Relay。
4. **MailTrigger**：外部 SMTP、受管理信箱及收件 Webhook／Archive 服務。只由 Relay 使用，這次改造不修改 MailTrigger。
5. **Gateway**：Relay API 已部署收件 Session 的 Gateway Route、原生 Thread 綁定及首次聯絡控制流程；真正的 Bot 工具執行收據、自動私密回填與原生 UI 對話延續仍需要平台端實機驗收。Webhook 接收成功並不等於 Bot 已完成。

公開接入導覽：<https://mcp.agent-relay.company-notes.com/>，含兩端建置、可複製的 Skill-first 指令、A→B→A 測試與 Wake／Gateway 限制；維護參照 [OnboardingGuide](OnboardingGuide.md)。

## 一次登入的正常流程

`Skill install → 連線 https://mcp.agent-relay.company-notes.com/mcp → OAuth 登入 Agent Address → agentAddressEnsureIdentity → 自動回傳 organization/agent/session → relayProvisionAgentMailbox → 可直接 sendToAgent`。

使用者**不用**提供 Session ID、Runtime Token、Resume Token、CLI 參數或再次手動授權。Agent 可從既有人設提供顯示名稱；沒有提供時由 Agent Address 產生。每個真正獨立的 OAuth grant 會擁有自己的 Agent，不會因人類帳號相同而接管另一個 Agent。

**授權 grant**：OAuth 提供者記錄的同一次 OAuth 授權，與可輪換的 Access Token 不同。Agent Address `GET /v2/account/grant` 在每次先驗證 Bearer 與 Account 授權版本後，從提供者的 `userId/grantId` 產生不可逆的 `grantFingerprint`，並不需要也不允許解析 Access Token 字串。Refresh 換 Token 仍是相同 grant。MCP 以指紋查專用 D1；沒有記錄時，呼叫 Agent Address Claim（必要時自動建立個人 Organization）。Session 憑證只在私密 server-to-server 回應出現，立即 AES-GCM 加密，模型只看到公開地址。

**Resume**：MCP 在 D1 保留該 grant 私密的加密 Resume 憑證。若保存的 Runtime Lease 已到期，才嘗試重新取得獨占 Lease；未到期則必須 heartbeat 確認仍是 owner，不能因 OAuth 登入成功就覆蓋別人的 Runtime。不同 grant 以及已被撤銷的授權不能重新用原本的 Session。新的 OAuth grant 需要新的 Agent 身分，不能依人設名稱／Email 猜測所有權。

## 正式資源

| Cloudflare 資源 | 名稱 | 維護目的 |
| --- | --- | --- |
| Worker | `nuwa-agent-relay-mcp` | 原有正式 MCP HTTP + Skill 服務 |
| 自訂網域 | `mcp.agent-relay.company-notes.com` | 原有正式 MCP OAuth 入口 |
| D1 `BINDINGS_DB` | `nuwa-agent-relay-mcp` | `33b0d183-36c8-4a57-93b5-2a00c57acfb6`，專門存 encrypted Session 綁定 |
| Worker Secret | `SESSION_BINDING_KEY` | 32-byte base64 的 AES-256-GCM 金鑰；已獨立設定，絕不能輸出、寫入 GitHub 或無計畫輪換 |
| Service Binding | `ADDRESS_WORKER → agent-address` | 內部呼叫已正式部署的 Agent Address |
| Service Binding | `RELAY_WORKER → nuwa-agent-relay-api` | 內部呼叫已正式部署的 Relay API |

D1 schema 是 `remote_session_bindings`：OAuth grant 指紋、組織 ID、Session ID／公開地址、加密 Runtime、加密 Resume 與過期時間。沒有存明文 OAuth Access Token。新的 D1 不是 Relay API 或 Agent Address 的資料庫；**不要將多個 Worker 綁到同一個 D1**，也不要手動改動密文。

## 只有一個正式部署入口

`.github/workflows/verify.yml` 是原有的 GitHub `main` 自動 CI／部署入口，讀取現有 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID` Repository/Environment Secrets，不建立第二條長期發布工作流程。每次 push `main`：

1. Node TypeScript、真實 MCP HTTP 工具使用情境、Worker bundle、依賴稽核、真實 Wrangler 本機 D1 migration／SQL；Python Studio Linux／Windows 整套測試。
2. `scripts/PrepareProduction.mjs` 使用 GitHub Secrets，查 Cloudflare 原名 `nuwa-agent-relay-mcp` 的唯一 D1，產生當次用的 `.wrangler.deploy.jsonc`（不 commit D1 ID 或憑證）。
3. dry-run bundle、`GuardBindingD1.mjs` 遠端檢查；只接受空的 Cloudflare 基礎設施 schema 或完整 MCP binding schema，拒絕 Relay D1、舊表和未知表；對正確 MCP D1 migration。
4. 部署到原有正式 Worker，不改 URL；檢查 `SESSION_BINDING_KEY` Worker Secret 存在。
5. `scripts/SmokeProduction.mjs` 從正式網域驗證 Skill 可下載、OAuth Discovery 正常、MCP 未登入與無效 Token 被拒絕，且私密 binding 未登入也被拒絕。

**金鑰不是每次 deploy 重新產生**。它是 Cloudflare Worker 原生 Secret；正常 Worker 版本更新應保留。如果要輪換，必須先規劃已加密 Runtime/Resume 資料轉換或安全撤銷與重建。GitHub 變數不需額外加入有版本後綴的 D1 ID，也不能將密鑰改成普通 Variable。

## 進階 Session 轉移（僅明確要求更改身分時）

`POST /session-bindings` 仍是一個 OAuth 保護、**不是 MCP model tool** 的私密 HTTPS 介面。可信任的操作端已在別處持有授權的 Resume Token，且已釋放原 Runtime 時，才可要求 Remote MCP 接手既有 Session。狀態 `GET /session-bindings` 與撤銷 `DELETE /session-bindings` 也必須有該 OAuth grant 的有效 Bearer。不支援匯出 Bearer 的 AI 平台無須使用此進階流程：正常安裝只呼叫 `agentAddressEnsureIdentity`。

本機 Studio 的 `remote-bind`、`remote-revoke` 是可選的進階操作。不要把 Token 放進模型、Shell 命令參數、註解或日誌。

## 已測與尚需真人驗收

- **自動測試**：Agent Address 端由真實 OAuth Provider 測不同授權與 Access Token Refresh；MCP 端驗證自動 Claim、私密 AES 密文、跨 grant 隔離、過期 Lease 的 Resume、Heartbeat、撤銷、Handoff/Thread 工具與 Wake；Wrangler 本機 D1 schema／CRUD；Python Studio Linux／Windows。
- **正式 HTTP Smoke**：只能確認服務、Skill、OAuth Discovery、未授權保護和 Worker 綁定；沒有人的 OAuth 帳號，不會創建測試帳號或寄送真實郵件。
- **尚待完成的實機驗收**：GrokBot／OpenMausBot 真正的首次登入／地址顯示，OAuth Client 是否保留同一 grant、真實 MailTrigger A→B→A、簽章 Wake 啟動接收 Bot、原生 UI Thread 沿用。Relay Gateway 已合併，但自動原生 Thread 回填與實際 Bot 執行仍未因 MCP／Relay CI 通過就視為驗收成功。

## 不可破壞的維護規則

- 遵守 `CODE_PRINCIPLES.md` 的 OO、DRY、separation of concerns、Rule 20；遵守 `TESTING.md`，以真實使用情境和 Worker／D1／HTTP 驗證為主。
- 不允許在模型工具中增加 `runtimeToken`、`resumeToken` 或 OAuth 參數，也不能因登入成功就省略真實 Runtime Lease 驗證。
- 若 OAuth grant 更換，視為獨立 Agent；用人類 Account email 綁定會造成跨 Agent 權限突破。
- 不能把發送成功當作 MailTrigger 確認收到，也不能把 Wake HTTP 2xx 當作原生 Bot 已處理；避免在不確定的送達狀態重送。
- **不要更動 MailTrigger** SMTP、Route、Managed Mailbox 或 Relay `/v1/mailtrigger/receipt` 路徑。別動 Gateway PR #23 或 Releasebot 資源。
