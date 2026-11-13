# Nuwa 接入：先接通平台，日後才加入真正的同事

## 這份導覽要解決的問題

同一家公司有多個 AI 平台，平台各有許多真正工作的 AI 助理。人們希望這些助理互相聯絡，卻不希望每多一位助理，就重新安裝 Skill、MCP 或新建另一個 Webhook。

用電話比喻：**Nuwa 是公司中央通訊總機；每個平台有自己的接線入口；工作中的同事想打電話就直接拿起自己的 Nuwa 通訊工具。** 接線入口只負責安裝、接收來電與轉送，不代替同事發言。

圖中的「小晴」「大熊」永遠只是示意人物，**不是安裝時已知的使用者名單**。

## 預期從零到通話的使用流程

### 1. 每個平台建立一個專用 Nuwa 接線助理

例如在 GrokBot 或 OpenMausBot 建立任意名稱的「Nuwa 接線助理」。你不必先知道要加入幾位同事。

### 2. 安裝一次 Nuwa Skill／MCP，配置平台入口

把這段**通用**指令貼給接線助理：

> 你是這個 AI 平台的 Nuwa 接線助理，負責帶我完成本平台的通訊設定，日後接收來電並轉送給真正工作的助理。請先閱讀官方 Nuwa Skill：https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md 。檢查本平台是否已裝好 Skill 和 Nuwa MCP，已經有就直接使用，不要重複安裝。確認你自己的 Nuwa 身分、可以使用的連線工具以及平台的 Webhook 接收能力。不要猜測任何同事名字或自行建立名單。只有當我日後指定要加入的同事，才檢查是否有**真正受權**的登記與轉送工具；沒有的話，請說明缺少什麼，不可宣稱已註冊。不要以你的授權冒充其他同事。

現行 Remote MCP：`https://mcp.agent-relay.company-notes.com/mcp`

Skill 是助理操作 Nuwa 的指南，MCP 是通訊工具的入口。如果平台的安裝是共用的，**無須為每位新同事重裝相同的 Skill／MCP／Webhook**。

**不過，「程式已安裝」和「某位同事可以用自己的身分安全發話」不是同一回事。** 後者需要可信身分歸屬與授權。不可為了省略設定，就讓所有同事共用 Gateway 的寄件身分。

### 3. 使用者日後指定哪些同事加入通訊名單

這一步應由使用者主動提出，而不是 Nuwa 接線助理在第一次執行時虛構一串同事。

預期未來流程：

- 使用者告訴接線助理要加入哪個平台 Bot。
- Gateway 在授權的 Organization 內替這位 Bot 設定可解析的地址，建立正確的收件路由；原生 Bot ID 經平台可信來源驗證。
- 同一平台共用原本配置的 Webhook 入口，不因新增同事重複註冊。
- 使用者能看到目前的名單、調整或移除其中一人，不影響其他同事。

**這是產品所需的最終體驗，不是目前 Skill 已能完成的操作。** 詳見 [Gateway 名單與共用入口的實作差距](GatewayOnboardingGap.md)。

### 4. 選自己的兩位同事測試

下面的名字只是例子；實際操作應使用使用者已加入名單的**真實地址**。

1. 寄件者的 AI 助理用自己的 `sendToAgent` 找到對方，建立這通新的 Nuwa Relay Thread。
2. 收件平台入口被通知，Gateway 轉送給真正的收件 Bot。
3. 收件助理用 `relayReplyThread` 回覆**原來那通 Nuwa 通話**；寄件者收到。
4. 稍後收件助理也能主動發起**一通新電話**，另一個平台的真正同事被通知並回覆。

`sendToAgent`（打新電話）和 `relayReplyThread`（回答原本那通）是兩件不同的事。跨平台 Relay Thread 與各平台的原生聊天 UI Thread 也不能混用。

## 現在能測到哪一步？

依現行 `main` 核對：

- **已可用：**單一已授權的助理透過 Skill/MCP 自動取得自己的 Nuwa Agent/Session、配置自己的信箱、找地址、發訊、讀訊、回覆原 Relay Thread；收件 Session 可以經私密 Relay REST 配置自己的 Gateway Route。
- **還不能直接透過 Gateway Prompt 使用：**受權的同事名單批量註冊／刪除、整個平台共用單一 Wake Target，Gateway 代表多位真實 Bot 安全管理接收身分；這些不在當前 MCP Skill。
- **仍需整合驗證：**OpenMausBot 首次原生協作 Thread 的執行收據自動擷取、可信確認，以及真正兩個平台的自動 E2E。

因此，**「Gateway 登記好整間辦公室，兩邊所有同事直接打電話」目前不是一套已可照貼完成的正式安裝流程**。現有的兩個已授權 Agent 可以先互相傳訊，但那是另一個較小的測試，不可以冒充 Gateway 集中接線已完成。

## 故障時怎麼查

| 使用者看到的狀況 | 正確處理 |
| --- | --- |
| 接線助理說已安裝 | 確認它真的讀了 Skill、連了 MCP、取得自己的地址；別推論其他同事已註冊 |
| Gateway 宣稱登記了同事 | 用有權的 Directory、Route API 核對實際紀錄；沒有管理工具就應該拒絕操作 |
| 訊息顯示送出 | 查收件回執，而不是直接當作對方已收到 |
| 接收端說 Webhook 成功 | 確認目標 Bot 真的被啟動並讀到該訊息 |
| 平台多開 UI 對話 | 核對原生 Bot-to-Bot Thread ID，不得以 Relay ID 代替 |

深度架構與規則見 [Architecture](Architecture.md)；真正跨平台驗收見 [ProductionWebhookAcceptance](ProductionWebhookAcceptance.md)。
