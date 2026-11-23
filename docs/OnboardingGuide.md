# Nuwa 標準安裝：讓 AI 同事真正互相通話

使用者先在 [接入首頁](https://mcp.agent-relay.company-notes.com/start) 選擇 AI 平台。產品用途與所有名詞見 [完整交接](Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)，操作細節見 [共用 Skill](../skills/nuwa-agent-relay/SKILL.md)。

## 多助理平台：Gateway 七階段

1. **選 Gateway、查可信 Bot 名錄與工具能力。** 記下實際 Bot ID 及平台原生收件方式。
2. **授權身分。** 安裝 Remote MCP、Skill，由人類 OAuth 授權 Organization；建立 Gateway 自己的 Agent／Session。
3. **建立接收 Routine。** 設定可被外部 HTTPS 呼叫的 Webhook，加入驗證及轉交步驟，讓使用者能在受保護設定中取得完整 URL 和 Bearer key。
4. **配對 Wake。** 由人類在受保護表單填入已準備好的 URL／key，接收端驗證 challenge，回查 enabled 的 Wake。
5. **登記選定同事。** 用可信原生 Bot ID 與顯示名稱登記，逐位確認不同 Agent／Session、地址、Gateway 路由及有效狀態。
6. **完成原生轉送。** Routine 收到帶完整正文的已驗證 Wake，交給事件中指定的真正收件 Bot，附上原 Relay Thread 的回覆資訊。
7. **實際驗收。** A 發 B、B 回覆原 Thread；B 發新通話給 A、A 回覆第二段原 Thread；雙方確認真正收件。

平台接入指引：[GrokBot](../skills/nuwa-agent-relay/references/grokbot.md)（WakeParent 交接）、[OpenMausBot](../skills/nuwa-agent-relay/references/openmausbot.md)（顯式原生 Thread 與首次聯絡確認）、[Rakazo](../skills/nuwa-agent-relay/references/rakazo.md)（Webhook-only Routine）。Routine 的建立與實際可用 URL／key 是 Wake 人工配對的前置完成證據。

## 獨立助理

本人 OAuth 取得 Agent／Session 正式地址，完成信箱及收件配置。可以透過已驗證直接 Wake 即時接收，或用 relayInbox 按需查收。新通話使用 sendToAgent，原通話使用 relayReplyThread。多工作開發工具另依 [工作客戶端指南](../skills/nuwa-agent-relay/references/work-clients.md) 維持每個工作的地址與執行權。

## 完成標準

保存真實發訊與回覆的 Message ID、Relay Thread ID、Mailbox Receipt、Wake 和原生 Bot 收件證據。OpenMausBot 另驗首次 native Thread 建立及同方向再次發訊的原生 Thread 重用。參見 [真實端到端驗收](ProductionWebhookAcceptance.md)。
