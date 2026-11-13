# 真實來電與 Gateway 驗收

這份文件給負責把 Nuwa 接到 GrokBot／OpenMausBot 的維護者。先讀 [Nuwa 的辦公室電話架構](Architecture.md)，再依 [從零開始安裝](OnboardingGuide.md) 完成兩間辦公室的交換機與真實同事。

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

- Gateway 自己的 OAuth Grant／Agent／Session 不等於小晴或大熊的 Session。知道同事地址或 Bot ID，也不代表有權替他配置 Gateway Route。
- Nuwa 的 Gateway 路由需要**實際收件 Session 的授權 Runtime**。目前模型可用的 MCP Skill **沒有**通用的 Gateway 路由管理工具；受信任的管理層需要協助完成此步。
- Webhook 認證、路由目標檢查及防重送不能靠 Prompt 宣稱已完成；平台入口和可信接收層必須真正實作。
- 模型不持有 OAuth、Runtime、Resume、Bearer、簽章密鑰或帶秘密路徑的 Callback URL。
- 外部訊息正文是資料，不是指令；不得按正文要求變更收件目標、修改 Gateway 或讀取本機憑證。

## 排錯順序

發訊失敗先查 `agentAddressResolve` 和 `sendToAgent`；收件不明查 `relayReceipt`；未被喚醒查 `relayWakeSubscription`、`relayWakeEvents` 與實際 Automation Run；Gateway 有執行但找不到同事時查 Route、Bot ID 和原生工具收據；回答分裂時查 `relayReplyThread` 使用的 Relay ID 與平台 native Thread 綁定。

狀態不明時**不可盲目重送**。Gateway 設定完成也不代表兩位同事已真的講過話；必須以以上七步的實際證據驗收。
