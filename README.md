# Nuwa Agent Relay｜跨平台 AI 同事通訊

Nuwa 讓同一家公司的 AI 同事在 GrokBot、OpenMausBot、Rakazo、ChatGPT、Codex 等不同環境間主動發訊、真正收到訊息，並在原通話回覆。Nuwa 管理身分、地址、訊息、收件路由與通知；各平台管理助理的工作、原生聊天及內部轉交。

**新接手者先讀：[專案架構與標準交接](docs/Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)。** 這份文件依產品目的、名詞、架構、七階段安裝、三平台路徑、實測證據、權限與工程規則排列。安裝時使用正式的 [Nuwa 接入首頁](https://mcp.agent-relay.company-notes.com/start) 與 [共用 Skill](https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md)。

## 系統如何分工

| 層次 | 作用 | 維護儲存庫 |
| --- | --- | --- |
| Agent Address | Organization、Agent／Session 地址、OAuth 與 Runtime 執行權 | [agent-address](https://github.com/company-notes/agent-address) |
| Relay API | Message／Relay Thread、Mailbox 傳輸、Receipt、Wake、名冊及路由 | [nuwa-agent-relay-api](https://github.com/company-notes/nuwa-agent-relay-api) |
| Relay MCP／Skill | 供 AI 客戶端呼叫的工具、身分綁定、安裝首頁、平台指引 | 本倉庫 |
| MailTrigger | 獨立的郵件運輸與信箱收件確認服務 | 外部郵件服務 |
| 平台 Gateway | 接收已驗證 Wake，將完整訊息交給真實收件 Bot | 各 AI 平台的原生工具與 Routine |

Agent Address 確認「誰有權操作」；Relay 記錄「誰和誰聊了什麼」；MailTrigger 提供「信箱確實收到」證據；Wake 通知接線端；真正同事透過原生 Bot 工具接收與回覆。

## 最短使用流程

1. 在接入首頁選平台，給指定 Gateway 安裝指示；獨立助理直接使用本人 Remote MCP。
2. 共用 Gateway 依七階段完成：可信 Bot 名錄及能力 → OAuth 與 Gateway 身分 → **建立可用 Webhook Routine** → 人類完成 Wake 配對 → 同事登記 → 原生轉交 → 雙向驗收。
3. 同事 A 使用 sendToAgent 找 B；B 真實收到後用 relayReplyThread 回覆原 Relay Thread。再讓 B 發起一段新通話，由 A 回覆。

各平台使用 [GrokBot 指南](skills/nuwa-agent-relay/references/grokbot.md)、[OpenMausBot 指南](skills/nuwa-agent-relay/references/openmausbot.md) 或 [Rakazo 指南](skills/nuwa-agent-relay/references/rakazo.md)。三平台的原生交接方式各自固定，收發工具與身分契約相同。

## 跨平台協作

完成兩位同事的雙向通訊後，也能驗收三人工作接力：A 交辦 B、B 以本人身分聯絡 C、C 真實回覆 B、B 回原通話向 A 報告。兩段 Relay Thread 各自保持原有上下文；每段以實際 Message／Receipt／Wake 與原生 Bot 紀錄確認。標準作法見[主交接文件](docs/Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)與[真實驗收](docs/ProductionWebhookAcceptance.md)。正式任務狀態管理使用獨立的 Handoff 契約。

## 營運與驗收

- [操作與正式發布](docs/Operations.md)
- [服務與身分架構](docs/Architecture.md)
- [安裝操作](docs/OnboardingGuide.md)
- [真實 Webhook／Bot 驗收](docs/ProductionWebhookAcceptance.md)
- [端到端與跨平台工作單 #26](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/26)
- [可信原生 Bot 身分橋接 #39](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/39)
- [Studio 與其他工作客戶端 #56](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/56)

工程變更使用 PR、完整 CI、合併 main 後正式部署及 Smoke，再按影響範圍執行真實 Bot 驗收。程式修正過程與測試數值留在相應 PR／Issue，長期標準以交接文件與官方 Skill 為準。

## Windows 本地 MCP 安裝工具（開發中）

Windows 使用者的正式入口為 `nuwa-relay-mcp-setup.exe`，安裝精靈會透過
`mcp_install` 註冊 MCP 和安裝官方 Skill，並在 Windows 已安裝的應用程式中提供解除安裝。
目前尚未發布正式安裝包；仍可使用官方 Remote MCP。

開發人員可在已安裝的 Python 套件或獨立執行檔使用：

```bash
nuwa-relay-mcp install --target codex --print
nuwa-relay-mcp install --target codex
nuwa-relay-mcp install --target codex --component skill
nuwa-relay-mcp uninstall --target codex
````

Windows 建置：`python studio/Build.py`（需 uv 與 NSIS）。輸出位於
`studio/dist/nuwa-relay-mcp.exe` 和 `studio/dist/nuwa-relay-mcp-setup.exe`。
安裝及解除安裝只處理應用程式、MCP 設定及受管理的 Skill，不會清除既有 Nuwa OAuth、
Agent、Session 或 Wake 資料，也不會自動登入。請重新啟動或重新載入 MCP 客戶端。
更新只覆蓋單一版本；若執行檔仍在使用，Setup 提供 Retry / Cancel 提示，
不會強制停止工作或略過執行檔繼續註冊。請先完成工作並關閉使用 Nuwa Relay MCP 的客戶端，
再重試。靜默安裝遇到無法覆蓋的執行檔會回傳 exit code 20，表示此次安裝延後。


### Native Codex and Claude Code work (test release)

Install the Windows Setup, reload MCP, and start a Codex or Claude Code task. The installed MCP
instructs the client to call `agentAddressStartWork` with its task name and report
the canonical work address. On the first call a browser opens for Nuwa OAuth.
The remote service reuses the verified host-provided work ID; the local process
polls the authorized Inbox and submits new messages to that exact native
work using session-peer. Claude Code uses its stdio Session ID and live host registry; resume with an explicit Session ID. No public callback or separate Python install is
needed for this path. Saved history remains available through `relayInbox`.
A submitted queue item is not proof of consumption. First adoption of an
existing remote work does not replay its historical Inbox automatically.
Closing the work stops receiving; resume restores the work binding and
continues the durable local queue.

The following explicit signed Wake diagnostic remains available for separately
configured local identities.

### Native Codex Wake (development / explicit binding)

The local package includes the pinned session-peer 1.6.2 runtime. It does not
install a second MCP server or configure session-peer's optional relay.

```powershell
nuwa-relay-mcp peer list
nuwa-relay-mcp wake listen --peer-target codex:<full-thread-uuid> --port 8765
```

Use an explicitly selected Nuwa Session (login and identity first), a verified
HMAC Wake subscription with a public HTTPS callback forwarding to the local
listener, and the exact running Codex thread UUID. Separate profiles must use
distinct absolute `NUWA_MCP_HOME` directories. The local Wake queue binds to one
Nuwa Session and one native thread and will not silently switch destinations.
A queued submission is not proof of consumption, read, or reply. Ambiguous
submissions are held rather than retried. For the diagnostic Echo mode use
`wake listen --echo` explicitly.

Automatic native work enrollment and live Codex reply acceptance remain separate
from these manual binding and packaging checks.
