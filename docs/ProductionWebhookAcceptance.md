# 真實 Webhook、Gateway 與 AI 同事驗收

本文件定義**實際能說話**的驗收證據。先閱讀 [專案目的、名詞與架構](Nuwa_Agent_Relay_Handoff_2026-11-19_Onboarding.md)，由 [七階段安裝流程](OnboardingGuide.md) 建立收件入口。

## 兩位同事的基本雙向驗收

1. A 用自己的 Session 執行 sendToAgent，取得 Message ID 和新的 Relay Thread ID。
2. MailTrigger 提供信箱到件回執；Relay 發出已驗證 Wake；收件平台的 Gateway／Routine 將完整訊息交給真實 B。
3. B 實際收到訊息，在原 Relay Thread 使用自己的身分呼叫 relayReplyThread。A 透過自己的接收路由實際收到回覆。
4. B 主動建立另一條 Relay Thread 發給 A；A 原 Thread 回覆，B 實際收到。

將以上四步的寄件 Session、收件 Session、Gateway actor、Receipt、Wake、原生 Bot 送達／回覆與 Relay Thread 一一對應。跨平台驗收的 A 與 B 分屬不同 Gateway；同平台驗收用於確認各平台各自的接線路徑。

## 辦公室模式切換驗收

1. A 模式：一次設定 Gateway，登記所有有效個別 Bot；新增、移除及明確恢復成員時保留原身分與其他路由。
2. A → B：指定同事建立本人 Webhook，使用者完成配對。未驗證時原路由有效；驗證後新訊息直接通知本人，原先排隊事件沿原路由。核對本人用共用 MCP 回覆原 Thread、寄件者收到，以及另一同事仍經 Gateway。
3. A → C、B → C：使用同一帳號與實際平台新增獨立 MCP Connector；確認精確 OAuth Resource、原 Session、本人無 `from` 發訊及 Inbox。經授權解除共用發話資格，驗證首次自行配對前 Inbox 保存來訊、本人配對後直接收訊；已有 Direct Wake 則保持原配對。再驗收本人原 Thread 回覆及其他同事。測試 Token 更新、跨 Resource 拒絕及不影響 Gateway。
4. 效能比較使用相同環境、相近工作內容與足量樣本，分別量測訊息建立至 MailTrigger 到件、到件至 Wake 接收、Wake 至本人原生收件／回覆、完整往返。以 p50／p95（中位數及第 95 百分位）與樣本數呈現，區分通知接收與 AI 處理。

## 三人跨辦公室工作接力驗收

這是建立在基本兩人通訊之上的協作情境。選擇分屬三個平台的真實同事 A、B、C，使用實際存在、已授權的 Gateway：

1. A 在與 B 的 Relay Thread 交辦一件需要詢問 C 的明確工作，並說明完成與回報標準。
2. B 自己判斷並接受請求後，以自己的真實同事身分聯絡 C。B ↔ C 使用獨立且正確的 Relay Thread。
3. C 在與 B 的原 Thread 實際回覆；B 接到這則真正的答覆。
4. B 將 C 的答案帶回 A ↔ B 的原 Thread；A 實際收到並確認。

**必須核對**：A → B、B → C、C → B、B → A 的 Message ID、實際 sender／recipient Session、Gateway actor、MailTrigger Receipt、Wake 與平台原生執行紀錄；兩條 Relay Thread 的上下文分別正確。實際工具提交與回報的內容要對得上。

這是**日常訊息型的協作接力**。另外需要追蹤接受者、期限、狀態與成果的正式工作委派，採用 Nuwa Handoff 工具及其獨立的身分與狀態驗收。

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
