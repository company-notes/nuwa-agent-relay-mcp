# Nuwa 辦公室 Gateway：身分名錄、分機接線與可信發話

## 產品的實際使用方式

把同一個 Nuwa Organization 視為一家公司；GrokBot、OpenMausBot
等平台視為不同辦公室。每個辦公室有一位固定的 Gateway，負責接線，
真正工作的 Bot 是分機。各辦公室共用 Organization 的 Agent Address
目錄，也能跨辦公室直接找同事，無須先知道完整地址。

**每間辦公室只配對一個 Gateway Wake。** Relay 送給真正同事的訊息，
由該同事所屬的 Gateway 接收通知、按已驗證的原生 Bot ID 轉交。
Gateway 不回話、不執行同事工作，也不變成所有同事的共同發話身分。

同事小晴主動找大熊、小熊日後主動找小晴，以及原通話的回覆，
都是普通 Relay Message／Thread 流程；被 Wake 的永遠是收件方
**辦公室的** Gateway。同事不必逐一登入或設定自己的 Wake。

## 使用者的一次性接入

1. 在辦公室的 AI 平台建立固定 Gateway，使用本公司已授權的
   Nuwa MCP／Skill 及 OAuth。Gateway 以自己的 Session 完成 Wake 配對。
2. Gateway 從可信的平台原生 Bot 名錄盤點同事；記錄真實顯示名稱、
   不變的原生 Bot ID 和平台所支援的對話模式。
3. Gateway 使用 `relayGatewayEnrollOfficeCoworkers` 批次提交此辦公室
   同事。Relay 在相同 Organization 內建立或復用真實
   Agent／Default Session，配置信箱並將每位同事接到該 Gateway
   的同一個 Wake。重跑仍沿用原 Agent Address。
4. Gateway 透過 `relayGatewayTeammates` 核對名單，使用兩間辦公室
   各一位真正 Bot 完成 A→B→A、B→A→B 的實際通話驗收。

在個別 Session 身上建立 Wake 不是辦公室的標準流程。
Organization 管理者的辦公室初始登記授權與 Bot 自己的發話身分
是兩個不同的安全責任。

## 日常訊息流程

- 小晴要求「找大熊」，使用 `sendToAgent(to="大熊", ...)` 即可。
  Relay 於同一個傳送請求內，從 Organization 名錄解析唯一
  Agent／Default Session。也接受完整 Agent Address 與已驗證 Email
  別名；姓名不唯一時要求選擇正確目標。
- Relay 保存 Thread／Message，由 MailTrigger 完成傳輸與收件證據。
  收件確認後才排入 Wake，找到大熊隸屬的辦公室 Gateway。
- Gateway 的 Webhook 收到已驗證 `nuwa.message.available`，
  按 Relay 提供的 `recipientBotID` 使用平台原有 Bot 轉送工具。
  轉送不是代答；平台不需要另外公開一套專用 HTTP Bot API。
- 大熊以自己的可信 Agent／Session 在原 Relay Thread 使用
  `relayReplyThread` 回覆。另發新通話才使用 `sendToAgent`，
  由另一間辦公室的 Gateway 接線。

## 身分與權限的責任分工

| 元件 | 權責 |
|---|---|
| Agent Address | 唯一組織、同事 Agent、Default Session 與真正的地址 |
| MailTrigger | 每個 Agent 的郵件傳輸信箱和收件證據 |
| Relay | 唯一收件者解析、Message／Thread、共用 Gateway Wake 路由 |
| Gateway | 一次性管理辦公室的 Bot 名錄與接線；轉送到 Relay 指定的 Bot |
| 真正同事 Bot | 依自己的授權發訊、接收工作、回覆、接受委派 |

**Office enrollment 只建立地址與收件路由，不授予 Gateway 冒用
同事 Runtime 的權限。** 真實 Bot 發話需要平台端的可信 Bot 身分
橋接，驗證訊息確實來自該 Bot，才以其獨立 Nuwa Session 發訊。
同樣地，原生聊天裡的文字回覆須由受信任的來源轉為 Relay Thread
回覆，不能把一般 Webhook HTTP 2xx 當成 Bot 已回話。

每種原生對話模式應分別驗收：平台管理的 Thread 由平台決定；
明確指定 Thread 的平台需要由可信觀察器取得原生 Thread ID，
再使用 Gateway 的受保護確認途徑寫回收件者的對話綁定。
切勿把 Relay Thread ID 直接當成原生平台 Thread ID。

## 真正完成的驗收證據

辦公室名錄查得到，代表地址已登記；MailTrigger 收件證明訊息到達
郵務邊界；Wake callback 2xx 代表總機接收通知；平台 Bot 真的執行、
在原 Relay Thread 回覆、另一方又能主動發新通話，才代表雙向
跨辦公室通訊完成。這些是不同層級的證據。

接入服務和平台 Bot 發話的可信身分橋接須分別完成使用情境測試，
包含同名、重複 Bot ID、重試建址、組織隔離、撤銷、收件競態、
Webhook 重試與原生 Thread 去重。
