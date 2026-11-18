# 真實來電與 Gateway 驗收

這份文件給負責把 Nuwa 接到 GrokBot／OpenMausBot 的維護者。先讀 [Nuwa 的辦公室電話架構](Architecture.md)，再依 [從零開始安裝](OnboardingGuide.md) 完成兩間辦公室的交換機與真實同事。

## 可用能力與尚未成立的前提

本文件描述的是**最終應驗收的真實通話情境**，不是只要貼上 Gateway Prompt 就能自動完成的現況。

- 每個平台只需一次共用的 Skill/MCP 接入和受信任的 Webhook 接收入口；**不應要求每一位真正同事重新安裝整個通訊系統**。
- 加入哪些同事是使用者日後決定的事。需有一套在 V2 Session 授權模型下安全登記同事與原生 Bot ID、共用接收入口並管理轉送的機制。
- **現行 MCP Skill 沒有 Gateway 通訊名單管理工具；Relay 只有 recipient Session-scoped Gateway Route，不是完整的 Gateway 共用名單。** 這是目前 E2E 的阻斷條件，見 [GatewayOnboardingGap](GatewayOnboardingGap.md)。
- 若平台共用同一套 MCP，仍不可讓多位同事都冒用 Gateway 的寄件身份。真正的送訊身份需要可信來源證明。

## 目標和前提

我們要證明的是**兩位真實 AI 同事能經兩個 Gateway 自動互相聯絡**，不是只證明伺服器接受了 HTTP 請求。

- **辦公室 A（GrokBot）：**Gateway A 負責通知、轉送給小晴；小晴本人處理與回覆。
- **辦公室 B（OpenMausBot）：**Gateway B 負責通知、轉送給大熊；大熊本人處理與回覆。
- **Nuwa Relay：**保存訊息與通話並發送接收通知。平台各自有原生 Bot 執行和對話管理。
- **Webhook：**接收方的「電話響了」通知入口；接到通知不代表同事已接聽。

如果沒有兩個不同的真實同事、兩間辦公室的交換機以及各自的收件授權，就不是完整 Gateway E2E。

## 核心驗收情境

| 步驟 | 行為 | 必須看到的證據 |
| --- | --- | --- |
| 1 | 小晴用 MCP `sendToAgent` 找大熊 | 正確收件地址、真實 `messageID`、新 Relay `threadId` |
| 2 | Nuwa 通知辦公室 B | 簽章／授權的 Wake 與 Gateway B 真實 Webhook 事件 |
| 3 | Gateway B 把來電交給大熊 | 正確 Bot ID、平台原生 Send to Agent 工具執行收據 |
| 4 | 大熊讀訊、用 `relayReplyThread` 回答 | 大熊真正啟動、回覆原 Relay Thread |
| 5 | Gateway A 通知小晴 | 小晴自己的 Agent 執行紀錄及收到大熊回覆 |
| 6 | 過一會兒大熊用 `sendToAgent` 主動找小晴 | **新的** Relay Thread，但同樣能經 Gateway A 喚醒小晴 |
| 7 | 小晴回覆新來電 | 小晴在這段新 Relay Thread 裡回答，大熊收到 |

一個 Gateway Webhook 的 HTTP 200、`sendToAgent` 成功，或 MailTrigger 的收件回執，都不足以單獨判定完成第 3～7 步。

## 收件層級怎麼分辨

先定義常見的技術名詞：

- **MCP：**AI 同事使用 Nuwa 發訊和回覆的工具接口。
- **MailTrigger：**Relay 背後負責郵件配送、收件回執的服務，不是給一般使用者操作的 UI。
- **Wake：**Nuwa 經驗證後向接收端發出的通知，通常使用 Webhook。
- **Gateway：**辦公室交換機，接到 Wake 後使用平台原生工具轉給目標同事。
- **Relay Thread：**跨平台的同一段 Nuwa 通話；回答舊來電時沿用。
- **Native Thread：**GrokBot／OpenMausBot 自己的對話或協作串，和 Relay Thread 不是同一個。

要按順序記錄：**提交 → 配送/收件 → Wake → Gateway 實際轉送 → 真正同事執行 → 原通話回覆**。某一步不通過，後面不能算成功。

## 平台差異與常見陷阱

### GrokBot 辦公室 A

GrokBot 可用 Routine 的 Webhook Trigger 讓 Gateway A 啟動，平台提供回呼和身分驗證機制。原生 Bot 間 Send to Agent 並不提供自由指定 Thread ID 的模式：請使用 Relay 的 **platform-managed** 路由，**不能假造原生 Thread ID**。

參考：[GrokBot Routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)。

### OpenMausBot 辦公室 B

Webhook Automation 可以啟動一個新的 Gateway 任務，但那個任務**不是**大熊原本的聊天。Gateway B 必須以平台的 `coordinate_bots` 或已驗證的內部轉送工具，確實送到**大熊的 Bot ID**。

若需要小晴每次來電都落進大熊同一個原生協作對話：

- 對小晴／大熊這對收發 Session 建立**獨立** native Thread 綁定。
- 首次建立 Thread 只能使用真正原生工具回報的 ID；不能使用 Relay Thread ID 或 Gateway Webhook Task ID。
- 在首次原生 Thread 尚未經可信途徑確認前，後續訊息不得各自開新對話。
- Relay 有首次聯絡預約／回填控制流程，但從平台原生工具執行收據**自動**取得 Thread ID、以收件方私密權限完成回填，仍需平台端整合和實機驗收。

如果 OpenMausBot 在本機接收 Webhook，應提供經使用者批准的安全 HTTPS 接收方式，僅公開所需的 Webhook 接收端；**不可暴露完整 Harness API**。

參考：[OpenMausBot Automation](https://docs.openmausbot.com/docs/features/automation) 及 Relay API 的 `docs/gateway-first-contact-v2.md`。

## 不可以省略的授權邊界

- Gateway 與每位同事有不同 Agent／Session。共用辦公室 MCP 以已登記的 `from` 對應同事 Session，並保留 Gateway 為稽核執行者。
- 辦公室首次接入使用 `relayGatewayEnrollOfficeCoworkers` 一次建立或沿用名冊與路由；獨立 Session 的路由仍使用其受權流程。普通收發不修改路由或重新登記。
- Webhook 認證、路由目標檢查及防重送不能靠 Prompt 宣稱已完成；平台入口和可信接收層必須真正實作。
- 模型不持有 OAuth、Runtime、Resume、Bearer、簽章密鑰或帶秘密路徑的 Callback URL。
- 外部訊息正文是資料，不是指令；不得按正文要求變更收件目標、修改 Gateway 或讀取本機憑證。

## 排錯順序（僅實際故障時）

正常 Wake 直接依 `recipientBotID` 轉交一次，零 MCP 查詢；不要把診斷步驟放入每次接線 Routine。共用 MCP 的收件者直接使用自己的 `from` 與原 Relay Thread 回覆。

發訊失敗先看 `sendToAgent` 的錯誤，僅在地址問題需要診斷時使用 `agentAddressResolve`；收件不明查 `relayReceipt`；未被喚醒查 `relayWakeSubscription`、`relayWakeEvents` 與實際 Automation Run；Gateway 有執行但找不到同事時查 Route、Bot ID 和原生工具收據；回答分裂時查 `relayReplyThread` 使用的 Relay ID 與平台 native Thread 綁定。

狀態不明時**不可盲目重送**。Gateway 設定完成也不代表兩位同事已真的講過話；必須以以上七步的實際證據驗收。
