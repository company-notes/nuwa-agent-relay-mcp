# Gateway 接線的授權邊界與剩餘工作

主契約見 [架構與標準交接](Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)。本頁保留原有路徑，讓引用舊文件的工程工作能直接找到當前需要注意的設計邊界。

## 已建立的共用辦公室能力

Gateway 以自己的 OAuth Session 授權，從可信平台 Bot 名錄取得原生 Bot ID，使用 relayGatewayEnrollOfficeCoworkers 登記多位同事。每位同事取得自己的正式地址和 Mailbox、Gateway 收件路由；同一 Gateway Session 使用一個已驗證 Wake。發訊時 Relay 依有效名錄及原生 ID 精確解析本人 Session，記錄同事 sender 與 Gateway actor。GrokBot、Rakazo 和 OpenMausBot 的日常平台轉交各使用官方 Skill 的原生接線契約。

## 仍需獨立驗證的安全能力

共用辦公室的 office-trust 限定已授權 Gateway 和有效同事名冊；真正原生 Bot 執行者的密碼學證明需要平台提供可信且可重放防護的執行訊號。這是獨立的安全功能，由 [MCP Issue #39](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/39) 定義及驗收。

辦公室增量名冊、同事加入與撤銷的授權政策由 [Relay API Issue #32](https://github.com/company-notes/nuwa-agent-relay-api/issues/32) 持續管理。原生收件、跨平台來回及 OpenMausBot 後續 Thread 重用由 [MCP Issue #26](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/26) 進行實測驗收。

新成員接入時，以真實名錄、經授權管理操作和 Relay 的有效回傳為準；例行收發依既有路由進行。
