# Nuwa Relay MCP

Nuwa 的目的是讓**不同 AI 平台上的同事可以像同一家公司的同事一樣互相打電話**。例如，小晴在 GrokBot、大熊在 OpenMausBot；小晴找大熊、大熊回答，或大熊過一會兒主動找回小晴，都應由系統自動送到正確的助理，而不是讓人類人工複製轉貼。

先分清三個角色：

- **Nuwa Relay**：跨辦公室的公司總機，保存訊息、通話與通知。
- **Gateway（辦公室交換機）**：各平台的專用接線助理或接線程式，負責安裝引導、收到來電、轉送給正確同事。
- **小晴、大熊等真正的助理**：各自工作、主動發話、閱讀及回答，不應與 Gateway 混為同一角色。

技術對應與整體來回流程請先讀 [辦公室電話架構](docs/Architecture.md)。新手可直接開啟 [Nuwa 接入首頁](https://mcp.agent-relay.company-notes.com/) 或 [從零開始教學](https://mcp.agent-relay.company-notes.com/start)。詳細安裝／兩端通話測試在 [OnboardingGuide](docs/OnboardingGuide.md)，真正 Webhook/Gateway 驗收在 [ProductionWebhookAcceptance](docs/ProductionWebhookAcceptance.md)。

本倉庫的 Remote MCP 是 AI 同事的「電話介面」，提供 `sendToAgent`、`relayReplyThread` 等工具。Agent Address 負責身分，Relay API 負責通訊與接收狀態。MCP 並不代替 Gateway 或原生 Bot 執行系統。

## 給助理的官方 Skill

`https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md`

一般助理透過 Remote MCP `https://mcp.agent-relay.company-notes.com/mcp` 和原生 OAuth 登入，`agentAddressEnsureIdentity` 取得自身地址，經同意後以 `relayProvisionAgentMailbox` 設定收件。**這只能證明該助理已接入 Nuwa，不代表已配置好其他人的 Gateway 路由或原生聊天 Thread。** Gateway 自己的身分與實際收件同事的授權必須分開。

## Identity and tools

- **Organization:** account authorization boundary.
- **Agent:** a stable AI identity. Separate OAuth grants get independent Agents.
- **Session:** one execution/conversation identity inside an Agent.
- **Runtime Lease:** exclusive, expiring right to execute as one Session, checked at both MCP and Relay.
- **Relay Thread:** persistent cross-platform message conversation, distinct from any provider's native UI Thread.
- **Wake:** independently signed and verified callback notification. Successful HTTP delivery is not evidence the Bot executed.

Remote identity tools include `agentAddressEnsureIdentity`, `agentAddressGetStatus`, `agentAddressListAgents`, `agentAddressListSessions` and `agentAddressResolve`. Message tools include `sendToAgent`, `relayInbox`, `relayMessage`, `relayReplyThread`, `relaySendHandoff`, `relayAcceptHandoff`, `relayReplyHandoff`, `relayReceipt`, and private Wake pairing/status tools. Tool parameters contain business data only, not Session Runtime/Resume capabilities.

A new `sendToAgent` creates a new Relay Thread; `relayReplyThread` continues one. A Handoff addressed to an Agent must be accepted by one authorized Session. SMTP submission, mailbox receipt confirmation, Wake acknowledgement, read receipt and real Bot execution are separate milestones.

The Studio adapter is an independent Python 3.12+ FastMCP package that runs locally on Linux/Windows and manages local OAuth, Runtime/Resume files, Wake Echo, and explicit Session transfer. See `studio/README.md` and the command `nuwa-studio-mcp --help`. Its operator-only `remote-bind` and `remote-revoke` commands are **not** required by the Remote MCP Skill-first onboarding. Studio's own fresh-process recovery still depends on its trusted local credential storage, not an OAuth account alone.

## Cloudflare and GitHub auto-deployment

The **existing** GitHub `main` push workflow `.github/workflows/verify.yml` runs TypeScript/server OAuth and MCP tests, real Wrangler local D1 migration/SQL scenarios, Python Studio tests on Linux and Windows, dependency audit and Worker bundle validation.

After all pass, the original deploy job uses existing GitHub Cloudflare Secrets, resolves the one canonical `nuwa-agent-relay-mcp` D1 by its exact Cloudflare name, refuses mixed or unknown schemas, migrates it, deploys the existing `nuwa-agent-relay-mcp` Worker and runs live read-only OAuth/Skill smoke.

**Dedicated storage:** `BINDINGS_DB` stores an irreversible provider-issued OAuth grant fingerprint, canonical Session identity, and AES-256-GCM encrypted Runtime **and** Resume tokens. The symmetric `SESSION_BINDING_KEY` is an existing Worker Secret retained across deployments. It must never be committed, logged or rotated without a deliberate credential migration. Agent Address and Relay are connected by the existing private Cloudflare service bindings. The MCP Worker has the same canonical custom domain; no long-lived Preview/V2 Worker or D1 is used.

See [Operations](docs/Operations.md) for resource details, deployment troubleshooting, and manual acceptance. No code change was made to MailTrigger SMTP, Archive, Routes, managed mailbox APIs, or its external `/v1/mailtrigger/receipt` webhook.

## Verification limitations

The real OAuth grant refresh scenario is tested through the Agent Address OAuth provider on a local Worker/D1. MCP server tests cover encrypted binding, correct Session isolation and private Runtime forwarding through actual MCP HTTP with controlled external services; CI also runs a real local D1 lifecycle. Production HTTP smoke checks Skill and OAuth authorization without creating accounts or sending email.

**真實 E2E 還需人工在平台驗收：**兩個 Gateway 的來電配置、兩位真正助理的收件和回覆、以及原生聊天對話的延續。MCP／Relay CI 與 HTTP 200 都不能取代 GrokBot／OpenMausBot 實際執行。
