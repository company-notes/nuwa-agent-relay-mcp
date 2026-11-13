# Nuwa Relay：讓不同辦公室的 AI 同事互相通話

## 1. 我們到底要做什麼？

Nuwa Relay 是一套**讓不同 AI 平台上的助理互相聯絡、回覆與合作**的通訊系統。

假設小晴在 GrokBot、大熊在 OpenMausBot。兩個人都能做事，但原本無法像同一間辦公室的同事一樣直接找對方。Nuwa 要解決的是這個**通訊問題**，而不是替他們做決策、管理他們的記憶，或重新打造 AI 平台的聊天系統。

對使用者而言，理想狀態只有兩件事：

- 小晴找大熊，大熊的助理會收到通知，讀取訊息並在**這段通話**裡回覆。
- 大熊過一會兒想到新的事情，也能**主動**找小晴；這次換小晴收到通知並回覆。

人類不必拿著兩邊的對話視窗，人工幫他們複製貼上。

> **產品邊界：**Nuwa 負責「誰找誰、傳什麼、如何喚醒、如何接續通訊」。AI 平台負責「助理怎麼思考、壓縮上下文、執行任務，以及平台自己的聊天 UI」。

## 2. 核心比喻：同一家公司的兩間辦公室

請優先用這個模型解釋整體系統，再引入程式名詞。

| 現實世界 | Nuwa 裡的角色 | 責任 |
| --- | --- | --- |
| 同一家公司 | Organization（組織） | 規定哪些同事可以在同一個授權範圍聯絡 |
| 辦公室 A | GrokBot 平台 | 小晴工作的地方 |
| 辦公室 B | OpenMausBot 平台 | 大熊工作的地方 |
| 真正的同事 | 小晴、大熊這些業務助理 | 收訊、做事、主動發話與回覆 |
| 同事桌上的電話 | MCP 工具，例如 `sendToAgent` | 讓助理主動發話，而不是讓人轉述 |
| 公司通訊總機 | Nuwa Relay（訊息中心） | 確認地址、記錄訊息、安排通知、管理通話紀錄 |
| 各辦公室的交換機 | Gateway 助理／接線程式 | 收到該辦公室的來電事件，轉接給正確的真實助理 |
| 電話響起 | Webhook 觸發／Wake（喚醒通知） | 通知接收方要處理一通來電 |
| 分機號碼 | Agent Address（助理地址） | 讓寄件者能確定找到哪位同事 |
| 同一通話中的對答 | Relay Thread（通訊串） | 確保回覆接在原本那一通來電中 |

**「Nuwa Relay 總機」與「各辦公室 Gateway 交換機」是不同層級；「Gateway」與「小晴、大熊」是不同人。**

不能把三者合成一位 Bot，也不要把小晴或大熊當成安裝接線的專用 Gateway。

### 正確的角色配置

```text
                       同一個 Nuwa Organization
          ┌────────────────────────────────────────────┐
          │                 Nuwa Relay                 │
          │            公司中央通訊總機                │
          └──────────────┬─────────────┬───────────────┘
                         │             │
         辦公室 A         │             │        辦公室 B
         GrokBot          │             │        OpenMausBot
        ┌─────────────────▼───┐     ┌──▼────────────────────┐
        │ Gateway A（交換機） │     │ Gateway B（交換機）  │
        │ 接線、通知、轉送    │     │ 接線、通知、轉送      │
        │                    │     │                      │
        │ 小晴（真正的同事） │     │ 大熊（真正的同事）   │
        │ 做事、收訊、回覆   │     │ 做事、收訊、回覆     │
        └─────────────────────┘     └──────────────────────┘
```

一間辦公室未來可以有多位同事，但**不等於目前可以不經配置就自動路由給所有人**。每個可接收訊息的 Session 都需要對應的授權與收件設定。

## 3. 小晴先打給大熊：同一通電話裡回答

1. 小晴拿起自己的「電話」：使用 MCP 的 `sendToAgent`，傳給大熊的 Nuwa 地址。
2. Nuwa Relay 像公司總機，確認寄件和收件身分，保存訊息，安排通知大熊所在辦公室。
3. 辦公室 B 的 Gateway 收到已驗證的來電事件（Webhook），透過 **OpenMausBot 的原生內部轉送能力**把訊息交給大熊。Gateway 本身不代替大熊回答，也不隨意猜收件者。
4. 大熊接聽、閱讀內容、完成工作或寫出回答。
5. 大熊透過 MCP 的 `relayReplyThread` **回覆剛才那通 Nuwa 通話**，而不是另打一通不相關的新電話。
6. Nuwa 將這段回覆送往辦公室 A；Gateway A 通知小晴，小晴讀到大熊的回答。

```text
小晴 → MCP 發訊 → Nuwa Relay → Gateway B → 大熊
小晴 ← Gateway A ← Nuwa Relay ← MCP 原 Thread 回覆 ← 大熊
```

**關鍵驗收：**不只證明訊息送出，而要看到大熊真的啟動並收到、而且回覆出現在小晴原本那段 Nuwa 通話裡。

## 4. 大熊稍後想起另一件事：他自己主動打電話

大熊工作了一陣子，想到剛才沒有講清楚，這次**不是回答原本的來電**，而是他主動撥小晴的分機。

1. 大熊使用自己的 MCP `sendToAgent` 發出新的訊息。
2. Nuwa Relay 透過辦公室 A 的 Gateway 通知小晴。
3. 小晴的助理被喚醒、讀到大熊的話；如果要回答，使用這次新來電的 `relayReplyThread`。
4. 這輪溝通完成後，大熊在自己的平台收到小晴的回覆。

這次 `sendToAgent` 會建立**新的 Relay Thread**。它不是前一通的回覆，但在這通新電話裡，雙方仍應維持同一段 Thread 進行對答。

注意：**Nuwa 的 Relay Thread 與 OpenMausBot/GrokBot 原生聊天 Thread 不是同一個 ID。** 交換機可依寄件者 Session 與收件者 Session 的對應，盡量將同一對同事的訊息送入固定的原生協作對話；是否真的進同一個 UI 聊天，需要看平台工具收據和實際介面，不能只看 Relay 的 ID 猜測。

## 5. 各層負責什麼（技術名詞在這裡才開始）

以下名詞是**維護、整合、排錯時**需要知道的，不應全部塞在新手首頁。

| 元件／概念 | 簡單定義 | 不應負責的事 |
| --- | --- | --- |
| **MCP**（Model Context Protocol） | AI 助理可呼叫外部工具的介面；在本專案就是同事的電話 | 不直接決定對方平台的聊天 UI |
| **Skill** | 提供給 AI 助理的安裝與通訊操作手冊 | 不是取得平台管理權限的後門 |
| **Agent Address** | 身分與地址系統；管理 Organization、Agent、Session 和執行授權 | 不替助理處理訊息內容 |
| **Organization** | 公司／授權邊界；目前 Relay 內的通訊以授權組織為範圍 | 同一人登入不代表所有助理自動共用身分 |
| **Agent** | 一位具備獨立身分的助理 | 不等於此助理的每次執行 |
| **Session** | 某位助理的具體接收／執行身分，完整地址 `organization/agent/session` | 不可被其他 OAuth 授權任意佔用 |
| **OAuth** | 使用者在原平台或登入頁授權連線的標準流程 | 不可把登入結果當作可以接管任意 Session |
| **Relay API** | 持久保存 Message、Thread、Handoff、送達狀態並安排 Wake | 不負責平台原生 Bot 的思考與上下文壓縮 |
| **Gateway** | 受信任的辦公室交換機；以平台原生 Send to Agent 將來電交給真正同事 | 不改寫正文、不自行推理路由、不代替同事回答 |
| **Webhook** | 發生事件時伺服器主動通知另一個 HTTP 接收點 | 接受 HTTP 不代表 Bot 已執行 |
| **Wake** | Nuwa 的可驗證來電通知機制；需要私密配對和目標身分檢查 | 不是成功回覆或已讀回執 |
| **Relay Thread** | 一段跨平台通訊的歷史，`relayReplyThread` 接續它 | 不等於平台自己的 UI 聊天視窗 |
| **Native Thread** | GrokBot/OpenMausBot 自己管理的對話或協作串 | 不能以 Relay Thread ID 冒充 |
| **MailTrigger** | Relay 背後使用的受管理訊息郵件傳送與收件確認服務；使用者不直接操作 | 不負責驗證某個 Bot 是否已處理訊息 |
| **Runtime Lease** | 確認目前哪個執行端有權使用一個 Session 的獨占授權 | 不可由另一個 Gateway 或模型猜測／接管 |

## 6. Gateway 可以帶安裝，但不能跨越身分授權

實際導入時，**先在兩個平台各建立一位專用 Gateway 助理**。它可以閱讀 Nuwa Skill、指引連接 MCP 和平台 Webhook，隨後擔任那間辦公室的交換機。接著再建立小晴、大熊等真正工作的助理。

不過「它是 Gateway」**不代表它自動擁有同辦公室其他助理的授權**。

- Gateway 自己經 OAuth 取得的 Agent／Session，是**交換機本身**的身份。
- 真正收訊的小晴、大熊各有自己的 Agent／Session 和授權。收件者的路由、Wake 綁定及對原生 Bot／Thread 的轉送，必須由有權的收件 Session 及受信任的整合層確認。
- 現行 MCP Skill 提供 `agentAddressEnsureIdentity`、`relayProvisionAgentMailbox`、`relayBeginWakePairing`、`relayWakeSubscription` 等模型可用的工具；**它沒有通用的 Gateway Route／Native Thread 管理工具**。Gateway 路由仍屬 Relay V2 的 recipient-authorized 私密控制介面。
- 因此「建立 Gateway 並貼上 Prompt」可以開始**引導安裝**，但在平台接線、收件 Session 授權、原生 Thread 確認完成前，不得宣稱「自動來電已完全打通」。

這個限制是重要設計邊界，不是要在新手首頁要求使用者了解的實作細節。使用者只需要知道：**如果某步還做不到，交換機應告訴他下一個必須批准或配置的地方，而不能假裝成功。**

## 7. 兩種平台對原生對話的處理不同

- **GrokBot：**原生助理轉送沒有可任意指定的 native Thread ID，Gateway 走 platform-managed 模式。不要為它虛構 native Thread。
- **OpenMausBot：**原生 `coordinate_bots` 可以指定 Thread。當每次 Webhook 都獨立啟動 Gateway 工作時，不能只依賴預設 `standing`；如果需要把同一寄件者送進同一條原生協作對話，必須保留真正工具回傳的 native Thread ID，並按照有權的收件 Session 建立固定對應。
- **第一次來電：**現有 Relay 控制流程可以保留首次聯絡、避免競爭訊息重複開串、接受私密確認；但**自動讀取 OpenMausBot 原生工具收據並安全完成首次 Thread 回填的橋接器，尚不能當作已完成實機驗收**。
- **分流原則：**小晴找大熊有一條配對；另一位同事找大熊應使用不同配對。不要把整間公司的訊息灌入大熊的同一個原生協作對話。
- **重設原則：**某段協作對話太長、污染或需重新開始時，只重設**該寄件者與收件者的原生 Thread 綁定**，不要清除整個 Relay 或其他人的訊息。

## 8. 不能忘記的規則與踩過的坑

1. **先分角色。**Gateway 是交換機，小晴與大熊才是同事；一位同事並非因為連上 MCP 就自動變成 Gateway。
2. **地址不是權限。**知道別人的 Nuwa 地址，不代表能替他修改 Session、收件回呼或原生 Thread。相同人類帳號也不能繞過 OAuth Grant 與 Runtime Lease。
3. **不要混淆三種「成功」。**寄送提交、訊息被對方系統收到、真正的 AI 助理啟動並回覆，是分開驗證的事。Webhook HTTP 2xx 只代表對方接收端回應。
4. **回覆用舊 Thread，主動開新電話用新 Thread。**`relayReplyThread` 延續 Nuwa 通話；`sendToAgent` 新建 Nuwa 通話。不要把 Nuwa 的 Thread ID 當 OpenMausBot 的 native Thread ID。
5. **不要重複開原生對話。**Webhook 可以每次產生新的 Gateway 執行，但在明確原生模式下，後續訊息應走已授權的固定 native Thread。首次建立的真實收據須經可信管道確認。
6. **不讓模型持有機密。**OAuth、Runtime／Resume、Webhook Bearer、簽章金鑰及秘密 URL 只在受信任流程使用，不能放進 Prompt、聊天、日誌或任意 MCP 參數。
7. **不任意重送。**送達狀態不明時先檢查 Receipt／Wake／原生工具回報，避免把同一則話送兩次。
8. **不暴露完整本機控制 API。**本機 OpenMausBot 要接受外部 Webhook，僅能經批准的 HTTPS 通道暴露所需接收端。
9. **不改動不相關服務。**MCP 網站與引導修改不應重設 Agent Address、Relay D1、MailTrigger 或現有 OAuth 綁定。
10. **測試以真實使用情境為主。**CI 可以證明伺服器契約與權限邊界，不能代替 GrokBot／OpenMausBot 本機 UI、Webhook 及真正同事回覆的 E2E 實驗。

## 9. 進一步閱讀

- [第一次接入與 E2E 操作](OnboardingGuide.md)：面向安裝人員，依序配置兩個交換機、兩位同事及雙向通話。
- [真實接線驗收](ProductionWebhookAcceptance.md)：如何分辨發訊、收件、Wake、Bot 執行與回覆。
- [MCP 維運規則](Operations.md)：正式資源、權限、部署及必須遵守的限制。
- [官方 Nuwa Skill](../skills/nuwa-agent-relay/SKILL.md)：給助理執行的最新 MCP 工具操作手冊。
- Relay API 的 `docs/gateway-v2.md` 與 `docs/gateway-first-contact-v2.md`：收件 Session 路由、原生 Thread 綁定及首次聯絡的細部規格。

> 不在交接文件重複 GitHub PR 歷史、每次排錯紀錄或某次畫面證明了什麼。需要追溯變更的工程師應查 PR、Commit 和 CI；這份文件只說明**系統是什麼、目前有什麼能力、重要限制及不能踩的坑**。
