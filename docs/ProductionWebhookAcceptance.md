# 真實 Webhook、Gateway 與 AI 同事驗收

本文件定義**實際能說話**的驗收證據。先閱讀 [專案目的、名詞與架構](Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)，由 [七階段安裝流程](OnboardingGuide.md) 建立收件入口。

## 兩位同事的基本雙向驗收

1. A 用自己的 Session 執行 sendToAgent，取得 Message ID 和新的 Relay Thread ID。
2. MailTrigger 提供信箱到件回執；Relay 發出已驗證 Wake；收件平台的 Gateway／Routine 將完整訊息交給真實 B。
3. B 實際收到訊息，在原 Relay Thread 使用自己的身分呼叫 relayReplyThread。A 透過自己的接收路由實際收到回覆。
4. B 主動建立另一條 Relay Thread 發給 A；A 原 Thread 回覆，B 實際收到。

將以上四步的寄件 Session、收件 Session、Gateway actor、Receipt、Wake、原生 Bot 送達／回覆與 Relay Thread 一一對應。跨平台驗收的 A 與 B 分屬不同 Gateway；同平台驗收用於確認各平台各自的接線路徑。

## OpenMausBot 原生對話驗收

- 首次聯絡的 Wake 帶 null 原生 Thread ID；coordinate_bots 建立新的原生對話並回傳真正 native Thread ID；relayGatewayConfirmFirstContact 回報成功。
- 同一寄件者第二次找同一收件者，使用先前的原生 Thread；另一寄件者找同一收件者，建立隔離的新原生 Thread。
- 原生 Bot 收件與原 Nuwa Relay Thread 回覆均有可信平台證據。首次聯絡狀態在 Relay DB 轉為 completed。

## 最重要的觀察邊界

| 證據 | 代表意義 |
| --- | --- |
| sendToAgent 回傳 Message／Thread ID | Relay 已接收發訊 |
| MailTrigger Receipt | 郵務信箱已收件 |
| Wake delivered | 通知接收端回應成功 |
| 原生平台收件／回覆紀錄 | 真正的 Bot 收到、執行並回覆 |
| 發起者收到原 Thread 回覆 | 完成往返 |

配對需要先有啟用的外部 HTTPS Webhook Routine 及其私有 Bearer key；人類於受保護網頁操作 Wake 配對。接收端以真實事件 ID 和原生 Bot ID 執行一次轉交，保存可追查的收據。工具提交結果不明時，先核對已有紀錄與原生 Thread 以維持一次性。

## 測試及追蹤

先以真實 Worker／D1／MCP 測試重現協定問題，通過 GitHub CI 後進行真實平台驗收。實機證據與待完成情境集中在 [MCP Issue #26](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/26)。平台原生 Bot 身分證明作為獨立安全驗收，見 [MCP Issue #39](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/39)。
