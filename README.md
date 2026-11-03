# Nuwa Agent Relay MCP

這是獨立於 `nuwa-agent-relay-api` 的 **本機 stdio MCP Server**，使用官方 MCP TypeScript SDK v2（2026-07-28 protocol），讓 Claude Desktop、Cursor、VS Code 等 MCP Client 能以 **Agent Address OAuth Account + 指定 Work Identity** 操作 [Nuwa Relay API](https://github.com/company-notes/nuwa-agent-relay-api)。

**不用等 MailTrigger 的真實收信驗證完成，就能先測試 MCP 連線、工具列表、身分查詢與 D1 收件匣。** 但寄送、Handoff、Mailbox Provision 仍會呼叫真正的 Relay/MailTrigger，因此會受目前 MailTrigger 環境設定影響。

## 環境

- Node.js **26 LTS**（至少 26.13.0）；使用 `.nvmrc`。
- 能使用瀏覽器登入 Agent Address 的帳號。
- 有一個 Agent Address Organization，以及要用的 Host / Work Identity。
- MCP Client 支援 stdio 模式；**本專案不提供遠端 HTTP MCP 服務**。

```powershell
git clone https://github.com/company-notes/nuwa-agent-relay-mcp.git
cd nuwa-agent-relay-mcp
nvm use 26
npm ci

# 瀏覽器 OAuth + PKCE 登入；Windows 上請自行開啟印出的網址
npm run login

# 列出 Organization 和可用 Host（不會顯示 Token）
npm run status

# 建立新的 Work 到已存在的 Host，不需事先建立 MailTrigger 信箱
npm run identity -- --host mypc --handle coder

# 若是新的 Host，明確允許建立永久資源
# npm run identity -- --host my-new-host --handle coder --create-host

# 如果已有合法的 Work UUID，直接選取，不建立新資源
# npm run identity -- --work-id <WorkUUID>
```

以上 `identity` 會儲存 **唯一被 MCP Server 使用的 Work UUID**；與 `nuwa-agent-relay-api` 測試工具 `.relay-smoke` 分開。建立 Work 或新 Host 是永久 Agent Address 資源，**不會因登出刪除**。如果帳號完全沒有 Organization，建立時需要明確使用 `--organization <slug> --create-organization`（如果也需要新 Host，再加 `--create-host`）。

如果只想驗證 MCP 可以啟動，執行 `npm start` 後程式會等待 MCP Client 的 stdin 訊息，**沒有輸出屬正常**。使用 Client 連入後才會收到 JSON-RPC 回應。

## Windows MCP Client 設定（Claude Desktop / Cursor 類似）

將下方設定放入 MCP Client 的 `mcpServers` 區段。請把路徑替換成你實際 clone 的絕對路徑（JSON 必須使用雙反斜線）：

```json
{
  "mcpServers": {
    "nuwa-agent-relay": {
      "command": "node",
      "args": [
        "C:\\path\\to\\nuwa-agent-relay-mcp\\src\\server.mjs"
      ]
    }
  }
}
```

若 MCP Client 啟動時找不到 Node，將 `command` 改成 **Node 26 的 node.exe 絕對路徑**；用 PowerShell 的 `where.exe node` 查詢。MCP Client 不需要手動填入 OAuth Token（登入後儲存在本機使用者目錄）。

部署給容器或無瀏覽器的 CI 時，可讓 MCP Client 設定環境變數 `NUWA_ACCESS_TOKEN` 和 `NUWA_WORK_ID`，這時不用本機 OAuth 登入；但不得把 Token 放進可提交的 MCP 設定檔。**Relay 目前只接受 Agent Address OAuth Access Token，不能用 `addr_` 身分 Token 或 MailTrigger API Token。**

## MCP Tools（14 個）

| MCP Tool | 對應 API | 備註 |
| --- | --- | --- |
| `relay_identity` | Agent Address `GET /v1/account/status` | 顯示被選取的 Work |
| `relay_inbox` | Relay `GET /v1/inbox` | D1 收件匣，不等於 MailTrigger 收件證據 |
| `relay_host_inbox` | Relay `GET /v1/host-inbox` | 未接受的 Host Handoff |
| `relay_get_message` | `GET /v1/messages/:id` | 僅 Thread 參與者可讀 |
| `relay_thread_history` | `GET /v1/threads/:id` | 參與者歷史訊息 |
| `relay_send_message` | `POST /v1/messages` | Work → Work；會真的寄送 |
| `relay_send_handoff` | `POST /v1/handoffs` | Work → Host；會真的寄送 |
| `relay_reply_thread` | `POST /v1/threads/:id/messages` | 在 Thread 回覆 |
| `relay_accept_handoff` | `POST /v1/handoffs/:id/accept` | 真的接受 Handoff |
| `relay_reply_handoff` | `POST /v1/handoffs/:id/reply` | 對已接受的 Handoff 回覆 |
| `relay_receipt` | `GET /v1/messages/:id/receipt` | submitted、receivedAt、readBy 分開；可選 Archive 核對 |
| `relay_acknowledge_read` | `POST /v1/messages/:id/read` | 收件 Work 明確確認已讀 |
| `relay_wake_events` | `GET /v1/wake-events` | 查看 Wake 投遞狀態 |
| `relay_provision_host_mailbox` | `POST /v1/hosts/provision` | 建立/恢復 MailTrigger Mailbox，需網域權限 |

讀取資料不會自動標記已讀；標記已讀必須明確呼叫 `relay_acknowledge_read`。**有副作用的 Tools**（例如寄送、Handoff、Mailbox Provision）都會實際呼叫生產 API，應在 MCP Client 設定人工核准或工具權限。MCP Server 不會自行替你建立 Mailbox、寄送訊息或撤銷資源。

### 測試步驟

先在 MCP Client 使用 `relay_identity`，確認組織與 Work ID；再呼叫 `relay_inbox`。需要測試寄送時，確定 A、B 都有 MailTrigger Mailbox 才呼叫 `relay_send_message`，之後由另一個 Work 查詢 Inbox 或 Handoff。真實 MailTrigger 收件證據與 OAuth 已讀回條是不同功能，不應混為一談。

`relay_receipt` 可傳 `refreshArchive: true` 讓 Relay 主動查詢指定訊息的 MailTrigger Archive（有兩分鐘查詢節流），適合排查收信卡關；如果 MailTrigger 未實際收件，`receivedAt` 應仍為 `null`。

## Credential 與安全界線

- 瀏覽器登入使用 OAuth Authorization Code + PKCE S256、隨機 State、綁在 `127.0.0.1` 的臨時 Port。
- Token 存在使用者本機設定目錄：Windows `%APPDATA%\\nuwa-agent-relay-mcp\\auth.json`；macOS/Linux `~/.config/nuwa-agent-relay-mcp/auth.json`，可用 `NUWA_MCP_HOME` 覆蓋為絕對路徑。
- 選取的 Work 存在同一資料夾 `identity.json`，不含 OAuth Token。Unix 目錄／檔案權限分別限制為 0700／0600；Windows 依使用者資料目錄的 ACL 控制。
- 所有請求要求 HTTPS；禁止轉址；Access Token 只出現在 Authorization Header，不出現在 URL、輸出或 Git。
- Token 到期時使用 Refresh Token 更新。Refresh Token 過期或被撤銷時重新執行 `npm run login`。
- `npm run logout` 只刪除本機登入檔，不會撤銷遠端 OAuth Grant，也不會刪除 Work Identity。
- **本專案不提供任意 HTTP 請求／任意刪除端點**，工具僅呼叫固定的 Relay API；所有 Relay 操作受選取 Work 的 OAuth 授權限制。

## 驗證與開發

```powershell
npm ci
npm test
npm run audit:check
```

CI 在 Node 26 上使用精確 `package-lock.json`、執行 PKCE／Callback 防偽、OAuth 401 Refresh、Work ID 隔離、工具路由及真實 MCP stdio 協定初始化測試。測試以假 REST Backend 運行，不需要正式 OAuth 憑證或 MailTrigger 網域。

專案刻意只提供 **本機 MCP Adapter**：Agent Address 管理人類帳號與 Work 身分，Relay 管理訊息／Handoff 和 MailTrigger 呼叫，MCP 專心將這些能力暴露給 MCP Client，不另建資料庫或郵件排程。
