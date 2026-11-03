# Nuwa Agent Relay MCP

依照 [CODE_PRINCIPLES.md](CODE_PRINCIPLES.md)（本 Repository 直接保存使用者提供的完整版本）與原始 ReleaseBot 的架構，明確分為兩個**獨立的 MCP 入口**：

| | Server MCP（遠端） | Studio MCP（本機） |
| --- | --- | --- |
| 程式目錄 | [server/](server/) | [studio/](studio/) |
| 技術 | TypeScript / 官方 MCP SDK v2 / Cloudflare Workers | Python 3.12 / FastMCP 4 / mcp_install 0.1 |
| MCP Transport | Streamable HTTP（/mcp） | stdio |
| OAuth | 使用 MCP Client 自行與 Agent Address OAuth 登入；Worker 轉送並驗證 Bearer | 本機瀏覽器 OAuth + PKCE；憑證保存在使用者私有目錄 |
| Work Identity | 每個 Tool 明確帶不可變的 workAddressID（同原版 Server 設計） | setup 時選擇 Work，所有 Tool 自動使用該 ID |
| 安裝 | Cloudflare Worker；不需在 Agent 機器安裝 | mcp_install 自動註冊到桌面 MCP Client |
| 外部 API | Agent Address + Nuwa Relay（Relay 再與 MailTrigger 溝通） | Agent Address + Nuwa Relay |
| 本地檔案存取 | 無 | Studio 可協助使用者先生成本地檔案連結（例如 FFL），Relay 只傳連結 |

兩個 MCP 都是**既有 REST API 的 Adapter**，不持有自己的郵件或身分資料庫，不複製 Relay 的業務邏輯。Server 以一個共用 HTTP 客戶端類別服務 Agent Address 與 Relay；Studio 也使用一個共用 Python HTTP 客戶端基底類別。兩個 Transport 各自封裝自己的 SDK 需求，不把 Node stdio Server 和 FastMCP 混在一起。

## Server MCP — Cloudflare

Node 26 LTS（26.13.0 以上）：

~~~powershell
npm ci
npm run check
npm test
npm run build
npm run audit:check
~~~

Server Worker 使用 [wrangler.jsonc](wrangler.jsonc) 配置，不包含任何可提交的 Secret：

- \`RELAY_API_URL=https://agent-relay.company-notes.com\`
- \`ADDRESS_API_URL=https://address.company-notes.com\`
- \`GET /health\`：Worker 健康狀態
- \`GET /.well-known/oauth-protected-resource/mcp\`：RFC 9728 metadata，指向 Agent Address OAuth 授權伺服器
- \`POST /mcp\`：遠端 MCP Streamable HTTP Transport，先驗證 Bearer Token 才建立 MCP session

首次連接遠端 MCP 的 Client，會經由 OAuth Protected Resource metadata 引導至 **Agent Address** 完成登入；MCP Worker 不會自行保存使用者密碼或 OAuth Token，亦不會要求你複製 Bearer Token 到 MCP 設定。

遠端 OAuth Tools：\`agentAddressGetStatus\`、\`agentAddressClaimWork\`、\`agentAddressRenameWork\`、\`agentAddressReleaseWork\`、\`agentAddressResolve\`。

遠端 Relay Tools：\`relayProvisionHostMailbox\`、\`relayInbox\`、\`relayHostInbox\`、\`relaySendMessage\`、\`relaySendHandoff\`、\`relayAcceptHandoff\`、\`relayReplyHandoff\`、\`relayThreadHistory\`、\`relayReplyThread\`、\`relayMessage\`、\`relayReceipt\`、\`relayAcknowledgeRead\`、\`relayWakeEvents\`。

**部署：** 使用 GitHub Actions 中的手動 \`Deploy Server MCP\` 工作流程（需要此 Repository 的 Cloudflare API Token／Account ID Secrets），或具備授權者在本機執行 \`npm run deploy\`。部署輸出的 Workers URL 才是 MCP 客戶端的實際 URL，勿假設某個自訂網域已配置。CI 平常只做 \`wrangler deploy --dry-run\`，PR 合併不會暗中發布正式 Worker。

## Studio MCP — FastMCP + mcp_install

本機 Studio 不需要 Node.js；依照原始 \`releasebot_mcp/mcp/\` 的 Python 分層，使用：

- \`Config.py\`：設定與唯一 Work Identity（本機 JSON 設定）
- \`Auth.py\`：Agent Address OAuth PKCE 登入、Token Refresh
- \`Client.py\`：共用 HTTP client 與專責 Agent Address／Relay client
- \`Server.py\`：只負責 FastMCP Tool 定義與本機 stdio
- \`Installer.py\`：只負責透過 \`mcp_install\` 安裝／移除
- \`CLI.py\`：命令解析，不實作 Transport 或 API 業務邏輯

在 Windows PowerShell：

~~~powershell
# 安裝 Python 3.12 與 uv 或 pip
python -m pip install -e .\studio

# 用瀏覽器登入 Agent Address（不用手動輸入 Token）
nuwa-studio-mcp login
nuwa-studio-mcp status

# 指定既有的 Work UUID，不會建立新 Host/Work
nuwa-studio-mcp identity --work-id <WorkUUID>

# 或在已有的 Host 下建立新的 Work
nuwa-studio-mcp identity --host mypc --handle coder

# 自動產生桌面 MCP 設定，先預覽後安裝
nuwa-studio-mcp install --print
nuwa-studio-mcp install

# 不透過 Client，也可直接執行 stdio MCP（不會有普通文字輸出）
nuwa-studio-mcp run

# 解除安裝 MCP Client 註冊；OAuth Token 仍保留
nuwa-studio-mcp uninstall
# 若要刪掉本機 OAuth Token：
nuwa-studio-mcp logout
~~~

建立新的 Host 或 Organization 需額外使用 \`--create-host\`／\`--create-organization\`，避免 AI 或安裝指令無意建立永久資源。命令 \`install\`／\`uninstall\` 使用 \`mcp_install\` 的官方 JSON manifest，而不是在 CLI 中手刻 Claude/Cursor 的設定格式。支援的 MCP Client 由目前所安裝的 \`mcp_install\` 版本決定。

Studio Credential 儲存於 Windows \`%APPDATA%\nuwa-agent-relay-mcp\auth.json\`，以及 macOS/Linux \`~/.config/nuwa-agent-relay-mcp/auth.json\`。設定 \`config.json\` 使用 snake_case，對應的 runtime 變數／方法仍使用 CamelCase/專案指定的 acronym 大小寫。Token 不會寫入 Git 或 MCP Client 的普通 config。登出不等於撤銷 Agent Address 上的遠端 OAuth Grant。

### 本機 Studio 的 Tools

\`checkInbox\`、\`checkHostInbox\`、\`getMessage\`、\`getThreadHistory\`、\`sendMessage\`、\`sendHandoff\`、\`acceptHandoff\`、\`replyHandoff\`、\`replyThread\`、\`getReceipt\`、\`acknowledgeRead\`、\`getWakeEvents\`、\`provisionHostMailbox\`。

所有 Tool 由 FastMCP 直接根據 Python 函式簽章產生 Schema；不需要手刻相同的 JSON Schema。工具不提供建立／刪除 Host、Organization 的權限，這類持久化資源只能經由明確的 CLI 初始化步驟處理。

\`studio/Build.py\` 與 \`studio/scripts/Installer.nsi\` 用於**選用**的 Windows PyInstaller + NSIS 發布；普通使用者可直接透過 \`mcp_install\` 配置本機 MCP，不必先建 EXE。

## MailTrigger 與收件行為

MCP 不會因 MailTrigger 的郵件網域卡關而無法啟動。登入、讀取已有的 D1 Inbox/Thread、查詢 OAuth 地址，均可獨立使用。但寄送訊息、建立 Mailbox 仍依賴已設定的 MailTrigger 服務；這些 Tool 會產生真實外部副作用。

\`relayReceipt\`／\`getReceipt\` 會區分「寄送 API 已接受」、「MailTrigger Archive/Webhook 確認收件」與「Agent 明確已讀」。只有已確認收件才會進入 Relay 的 Wake 機制，MCP 不自行實作重試。

## 開發驗證

~~~powershell
npm ci
npm run check
npm test
npm run build
npm run audit:check

python -m pip install -e '.\studio[dev]'
pytest -q studio/tests
~~~

CI 使用獨立 Jobs 測試 **TypeScript Worker OAuth／MCP** 與 **Python Studio FastMCP／mcp_install**。所有工作遵守 [CODE_PRINCIPLES.md](CODE_PRINCIPLES.md)：封裝、共用程式、單向依賴、早退出、明確例外、命名規則和清晰的責任邊界。
