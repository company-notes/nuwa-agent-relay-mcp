# Nuwa Relay：讓不同平台的 AI 同事互相通話

## 先理解要完成什麼

把 GrokBot、OpenMausBot 等 AI 平台看成同一家公司裡的不同辦公室。Nuwa 是跨辦公室的通訊總機；在各平台建立一位接線助理，配置一次收件入口，讓真正工作的 AI 同事能直接找對方並回覆。

使用者希望**預設讓這間辦公室目前所有符合資格的同事都能加入**，不必逐一報出名字，更不應每加入一位同事就重新安裝 Skill、MCP 或 Webhook。網站上的小晴、大熊只是示意人物，不是實際設定時預設存在的助理。

## 給一般使用者的三步驟

1. **建立接線助理。** 在每個要使用的平台建立一位專用的 Nuwa 接線助理。已有 Nuwa 的平台更新至最新版 Skill 與 MCP，沿用既有接線助理與地址。
2. **請它協助設定整間辦公室。** 在[官方首頁](https://mcp.agent-relay.company-notes.com/start)複製「Nuwa 接線助理的通用啟動指令」，貼給接線助理。它會依最新版 Skill 完成接入和接線，回報 Gateway 地址、Wake 狀態及已接入同事名單。

3. **找兩位真正的同事試通話。** 在[公開導覽](https://mcp.agent-relay.company-notes.com/start)填入兩位同事在 GrokBot、OpenMausBot 等平台顯示的**助理名稱**，網頁會產生四段可複製的自然語言指令。一般使用者不需要知道 Nuwa 地址。由 A 找 B、B 在原對話回覆、B 再主動找 A、A 回覆第二通。

這是正式的使用者體驗契約。平台整合層負責原生 Bot 的轉交與對話上下文；共用 MCP 以辦公室授權及已登記的 from 對應寄件 Session，並保留 Gateway 稽核 actor。獨立 MCP 連線使用本人 Session。

## 正常接線的技術契約

1. Gateway 在一個已授權 Organization 下擁有自己的 Agent Address，
   並透過一次配對建立本辦公室唯一的 Wake。
2. Gateway 從平台可信 Bot 名單取得每位同事的顯示名稱和原生 Bot ID，
   使用 `relayGatewayEnrollOfficeCoworkers` 一次登記整個辦公室。
   Relay 建立或重用真實 Agent／Default Session、MailTrigger 信箱與接線路由。
3. 其他辦公室的同事使用 `sendToAgent`，直接填入已知的原生 Bot UUID（其他原生 ID 加 `bot:`）、姓名、真實
   Agent Address 或已驗證 Email 別名。Relay 在同一個請求中解析地址。
4. 郵件確認收件後，Relay 只 Wake 收件辦公室的 Gateway。
   Gateway 使用經驗證的 `recipientBotID`，直接將 `senderDisplayName`
   與 `body` 所代表的「誰傳來什麼訊息」交給真正的收件 Bot。
   `relayThreadID` 保留在可信回覆上下文，`messageID` 用於去重。Gateway 附上
   `relayReplyThread({from, threadID, body})` 呼叫格式，代入原 Thread ID 與事件中的 `recipientBotID`，作為收件同事自己的 `from`。
5. 真正的收件同事使用原 `relayThreadID` 回覆；共用 MCP 時填自己的
   已知原生 Bot ID `from`（也可用完整登記名稱、地址或已驗證 Email），獨立 Session 則省略。主動新通話使用 `sendToAgent`。
   工具 schema 已可用時直接呼叫；平台必要的工具載入依平台規則完成。
   已讀 Receipt 與額外訊息查詢由底層診斷流程按需處理。
   同一架構適用於同辦公室或跨辦公室的雙向通話。
6. 日常 Wake 只做一次原生轉交、零 MCP 查詢，提交後立即結束。完整正文
   已在 Wake 中，不需要額外讀訊、查名冊、查收件回執或等待同事回覆。

在 GrokBot 等共用 Gateway MCP 的辦公室，同事正常呼叫
`sendToAgent({from: "小晴", to: "大熊", message: "..."})`，
回覆時使用 `relayReplyThread({from: "大熊", threadID: "...", body: "..."})`。
Relay 以該 Gateway 的已啟用名冊對應同事 Session，不必另外開啟
「代發」或設定密語。若客戶端有自己的 Session，可省略 `from`。
不論同事在同一辦公室或不同辦公室，收件方都使用既有 Gateway Wake。
Relay 另記錄實際共用 OAuth Gateway Session，避免把姓名聲明誤當
平台原生 Bot 身分簽章。

## 測試時如何判斷成功？

| 情境 | 必須確認 |
| --- | --- |
| A 找 B | B 的真實 AI 助理實際收到訊息，不是只有 Gateway 回報收到通知 |
| B 回 A | 回覆出現在原 Nuwa Thread，而非無關的新通話 |
| B 主動找 A | 建立一通新 Nuwa Thread，A 也能被自動通知 |
| A 回 B | A 能在新通話中回覆，B 真正收到 |
| 兩個人找同一位助理 | 不同寄件者的原生協作對話分開，不互相洩露內容 |
| 同事取消授權 | 只停止這位同事的接線，不影響其他人 |

網站表單只在瀏覽器內替換已填好的助理名稱，不會向 Nuwa 上傳表單內容，也不會替你操作任何授權。助理收到指令後，只需呼叫一次 `sendToAgent` 並傳入已知的 Bot ID 或顯示名稱；Relay 在同一個請求內完成授權範圍中的名稱解析。沒有唯一匹配時會拒絕發送並要求確認，不額外呼叫 MCP 名冊工具。想查送達問題應先檢查 `relayReceipt`、Wake 和原生 Bot 執行紀錄，送達不明時不要盲目重寄。

更詳細的電話架構與系統邊界見 [Architecture](Architecture.md)，真實跨平台驗收見 [ProductionWebhookAcceptance](ProductionWebhookAcceptance.md)。
