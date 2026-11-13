# 從零開始：兩個 Gateway、兩位同事、一次真正的雙向通話

這份文件給需要把 Nuwa 接進 GrokBot／OpenMausBot 的安裝人員，以及協助排錯的下一位維護者。先看 [Nuwa 整體架構](Architecture.md) 的辦公室電話比喻；如果只是要照做，可以直接使用[公開安裝導覽](https://mcp.agent-relay.company-notes.com/start)。

## 你最後應該看到什麼？

- **GrokBot 辦公室 A：**有一位「Nuwa 交換機 A」（Gateway）和真正工作的同事「小晴」。
- **OpenMausBot 辦公室 B：**有一位「Nuwa 交換機 B」（Gateway）和真正工作的同事「大熊」。
- 小晴請 Nuwa 找大熊，辦公室 B 的交換機能讓大熊收到訊息；大熊能在**原來那通 Nuwa 通訊**回覆，小晴收到回答。
- 過一會兒大熊也能**主動**找小晴，辦公室 A 的交換機能讓小晴收到並回覆。

**Gateway 不是小晴或大熊。** Gateway 是先幫你導入系統、之後負責接線的專用助理。真正工作與回答的永遠是小晴、大熊。

## 使用者需要做的五件事

### 1. 在兩個平台建立「交換機」助理

例如在 GrokBot 建立「Nuwa 交換機 A」，OpenMausBot 建立「Nuwa 交換機 B」。為它們保留可使用 MCP 及本平台 Webhook／Automation 的設定入口。先不要用小晴或大熊扮演接線。

### 2. 貼指令，讓兩位交換機先帶你完成安裝

給每位交換機相同的基本要求，依其平台調整辦公室與要服務的同事：

> 你是 Nuwa 交換機助理，負責本辦公室的接線，不替其他同事回答。請先閱讀官方 Skill：https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md ，協助我連接 Nuwa、完成平台原生登入、建立你自己的地址，再引導配置自動收件及轉送。每步只要求必要授權；若工具或平台能力不夠，請明確說明缺少什麼，不能假裝接通。接著要服務的真正同事是小晴／大熊，對方是獨立身分，不能由你冒充其收件授權。

助理應提示使用平台自己的 MCP 連線畫面，Remote MCP 地址：

`https://mcp.agent-relay.company-notes.com/mcp`

登入完成後，助理依 Skill 使用 `agentAddressEnsureIdentity` 取得自己的身分，經使用者同意後 `relayProvisionAgentMailbox`。不要把 OAuth、Runtime、Resume 或 Webhook 金鑰貼到聊天。

**重要的停止點：**讀完 Skill、取得自己的地址，只代表交換機已接入，**不等於已經可以代表小晴或大熊接聽**。

### 3. 另外建立真正工作的同事

在 GrokBot 建立小晴；在 OpenMausBot 建立大熊。兩人也各自依 Skill 連接 MCP、授權登入、取得自己的 Nuwa 地址並配置收件能力。

不要讓小晴／大熊使用交換機的登入授權或 Session。請核對這四個助理的身分，及**小晴、大熊所在的 Nuwa Organization 是否相同**。Organization 是 Nuwa 的公司／授權範圍，不是某個平台的聊天室。

### 4. 配置來電接線與目標同事

請每個交換機：

1. 確認所在平台有能接收外部來電的 Webhook／Automation（收到通知就啟動的工作）。
2. 引導建立安全的來電入口，使用 `relayBeginWakePairing` 走私密的瀏覽器授權配對，並以 `relayWakeSubscription` 確認狀態；不在模型聊天放私密 Callback 或 Bearer Key。
3. 找到本辦公室真正同事的**平台內部 Bot ID**，確認有可用的「Send to Agent」內部轉送方式。
4. 由**真正收件同事的已授權 Session**或受信任的管理工具配置收件路由（Gateway Route）；Gateway 自己的 OAuth 身分並不自動授權它操作同事的 Session。
5. 平台若可以指定原生協作 Thread，確認轉送會進到同一對寄件者／收件者的既有對話；如果不能，使用平台管理對話的模式，不可虛構 native Thread ID。

**目前必須如實告知的限制：**Nuwa MCP Skill **沒有**讓 Gateway 隨意操作其他人的 Gateway Route 或 native Thread 的模型工具。OpenMausBot 首次建立原生協作 Thread 後的**執行收據自動擷取＋私密確認**也尚需實機整合。不能只靠這份 Prompt 宣稱整套接線已自動完成。

這些缺口要由有授權的接收端或維護者透過 Relay API 私密控制介面處理。底層契約請看 Relay API 的 `docs/gateway-v2.md` 與 `docs/gateway-first-contact-v2.md`；絕不可為了簡單而將收件者的認證秘密交給模型。

### 5. 用真正的通話驗收，不只檢查「已送出」

按這個順序測：

1. **小晴主動找大熊：**用 `agentAddressResolve` 核對地址，`sendToAgent` 發一則包含測試密語（例如「星河」）的新訊息，記下這通的 Relay `threadId`。
2. **大熊自動收到：**確認 OpenMausBot Gateway 真正被通知、原生內部轉送真的執行，而且**大熊**的助理收到內容。只有 Gateway Webhook 回傳 HTTP 200 不算通過。
3. **大熊回答原通話：**用 `relayReplyThread` 回覆剛才那個 Relay Thread。小晴應經辦公室 A 的來電通知讀到回覆。
4. **大熊稍後主動找小晴：**用自己的 `sendToAgent` 建立**新的 Nuwa 通話**。這不是前一通的回覆；Gateway A 應通知小晴。
5. **小晴回答這通新電話：**用新通話的 `relayReplyThread` 回覆，檢查大熊收到。

若必須由人類逐次在兩邊按「檢查收件」，只表示**手動傳訊**可行，不能標示為自動 E2E 成功。手動讀取是排錯步驟，不是這次最終驗收標準。

## 給維護者：看不見的通訊工作

只有在需要排錯、維護與整合時才需要以下名詞：

| 名詞 | 定義與用途 |
| --- | --- |
| **MCP** | AI 助理呼叫 `sendToAgent`、`relayReplyThread` 等工具的電話接口 |
| **Relay Thread** | Nuwa 保存的一段來回訊息；回覆用原本的 ID，另開話題用新 ID |
| **Wake / Webhook** | Nuwa 的來電通知，以及平台觸發 Bot 執行的 HTTP 入口 |
| **MailTrigger** | Relay 背後的受管理郵件配送和收件回執服務，使用者不直接操作 |
| **Gateway Route** | 收件 Session 授權的「收訊後轉給哪個平台 Bot」設定 |
| **Native Thread** | 接收平台自己的 Bot-to-Bot 協作對話；不是 Relay Thread |
| **Runtime Lease** | 一個 Session 當前受哪個執行端獨占使用的授權；不能借用別人的 |
| **First contact confirmation** | 第一次開原生對話後，受信任程式將真正 Thread ID 回填給 Relay，以便後續沿用 |

## 怎麼知道是哪一段出問題？

沿訊息路徑往下查，不要直接重發：

1. **小晴沒有送出：**檢查 Nuwa MCP、登入、地址解析以及 `sendToAgent` 真正的回傳值。
2. **已提交但對方沒收到：**用 `relayReceipt` 確認收件，不要把提交視為配送完成。
3. **已配送但大熊沒被啟動：**檢查 `relayWakeSubscription`、`relayWakeEvents`、平台 Webhook 的驗證與實際 Automation Run。
4. **Gateway 啟動但大熊沒收到：**檢查已授權的 Gateway Route、收件平台的 Bot ID、原生轉送工具收據與 Thread 綁定。
5. **大熊回答但小晴沒看到：**檢查回答是否用 `relayReplyThread` 接在正確的 Relay Thread，然後沿反方向查收件與 Gateway。
6. **只在原生 UI 開了多條對話：**先確認 Relay Thread 沒混淆，再檢查 native Thread ID；不可用 Relay ID 代替平台原生 ID。

最後要記住：**發訊成功、收件成功、通知送達、Bot 真正執行、Bot 真正回覆，是五件不同的事。**

## 交接只留下重要的規則

- 每個 Gateway 與每位真實同事有自己的身分；接收方授權不可由別人的地址或 OAuth 冒充。
- Webhook 入口必須驗證，正文只能當作要轉送的資料，不能用來改變路由或執行系統指令。
- OpenMausBot 的原生 Thread 依寄件者／收件者配對分流，不能把所有人塞在同一個協作對話。
- 工具回傳模糊時不能重送同一則訊息，也不能在不知道是否開過原生 Thread 時重開另一條。
- 本機 OpenMausBot 若需要外部來電，僅能批准安全入口，不可公開完整控制 API。
- 這份導覽、伺服器測試與線上 HTTP Smoke 不代表真實 GrokBot／OpenMausBot E2E 驗收完成。
- 開發過程中的事件與每筆提交細節，請到 PR／Commit／CI 查，不放進永久交接文件。

延伸閱讀：[系統架構](Architecture.md)、[正式 Webhook 驗收](ProductionWebhookAcceptance.md)、[維運與授權規則](Operations.md)。
