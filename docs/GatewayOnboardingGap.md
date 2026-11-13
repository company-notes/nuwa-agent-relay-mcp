# Gateway 導入流程：已支援、尚缺的契約與正確驗收

## 要達到的使用體驗

同一個公司在 GrokBot、OpenMausBot 等平台各有一個通訊入口。使用者在**每個平台只安裝一次 Nuwa Skill/MCP 與一個受信任的 Webhook 接線入口**。之後想讓某位真正工作的 AI 助理加入，只需要求平台的 Gateway 為**使用者指定的同事**登記通訊名單，授權其可收件與轉送；不需要替每位同事重新裝整組 Skill／MCP／Webhook，也不應讓 Gateway 假裝自己就是那位同事。

示例（小晴、大熊是用來解釋的虛構名稱，**不能硬寫在通用安裝 Prompt**）：

```text
GrokBot 辦公室                              OpenMausBot 辦公室
   真正的同事 A    → Nuwa Relay →             Gateway B → 真正的同事 B
   真正的同事 A    ← Nuwa Relay ←             真正的同事 B（原通話回覆）

   真正的同事 A    ← Gateway A ← Nuwa Relay ← 真正的同事 B（新通話）
```

**Gateway 是平台入口，不是同事自己。** 安裝 Gateway 時尚不知道要有哪幾位同事。名單只應在使用者日後要求時建立、查詢、撤銷。

## 已核對的正式程式碼

以下以三個 Repo 的現行 `main` 為準，不以 Agent Address V1 的 Host／Work 設計充當已上線功能。

| 需求 | 目前真實能力 | 重要限制 |
| --- | --- | --- |
| 一位助理經 Skill／MCP 安裝 Nuwa | MCP `agentAddressEnsureIdentity` 取得**目前 OAuth Grant 本身**的 Agent／Session；`relayProvisionAgentMailbox` 配置該 Agent 收件 | **不會自動替同平台其他 Bot 建立獨立身份** |
| 查找已有同事 | `agentAddressListAgents`、`agentAddressListSessions`、`agentAddressResolve` | **查詢目錄**不代表有權新增、管理或冒用該同事 |
| 讓一個收件 Session 轉送到一個平台 Bot | Relay API `PUT /v2/gateway-route`，收件 Session OAuth + Runtime 授權、`recipientBotID`、`threadMode` | 路由**綁在收件 Session**，不是「一個 Gateway 註冊整間辦公室」 |
| 同一寄件者再次找同一收件者 | Relay `gateway-conversations` 綁定 sender Session 到實際 native Thread ID | OpenMausBot 第一次建立 Thread 的可信收據**自動**回填尚未完成 |
| GrokBot 不提供可指定原生 Thread | Gateway `threadMode: platform` | 不可以發明平台沒有的 native Thread ID |
| 自動通知來電 | `relayBeginWakePairing`／`relayWakeSubscription`；Relay 向**收件 Session**已驗證的 Webhook 發 Wake | **不存在**可直接由某 Gateway 為所有同事引用的共用 Wake Target／授權轉接名單管理工具 |
| 同事自己用 MCP 主動送訊 | `sendToAgent`、`relayReplyThread` | 呼叫歸屬**本次授權的 Session**。平台安裝過 Skill 不等於 Gateway 的 OAuth 可以安全冒充其他同事 |

已核對來源：
- MCP [官方 Skill](../skills/nuwa-agent-relay/SKILL.md)、`server/src/AddressTools.ts`、`server/src/RelayTools.ts`。
- Relay API `src/GatewayBindings.ts`、`docs/gateway-v2.md`、`docs/gateway-first-contact-v2.md`。
- Agent Address `README.md`、`docs/identity-architecture.md`，及目前 Organization/Agent/Session 的 Account API。

## 必須補上的端到端設計（未完成，不能當作現況）

### 一、受權通訊名單

提供一個可讓 Gateway 在**同一 Organization 及經所有者明確委派**下操作的名單介面：

- 登記／查詢／刪除一位真正的同事及其平台 Bot ID；重複登記冪等，不得把名字當作身分證據。
- 區分「代為建立目錄／路由」和「冒充同事讀訊、發訊」兩種權限。前者可以經受權委派，後者必須符合該同事的發訊身分／Runtime 原則。
- 每位同事仍保留獨立 Agent／Session 地址，歸屬相同 Organization，可限制及撤銷 Gateway 的管理權。
- 初次安裝只建立 Gateway 的平台入口，不憑空建立示例同事。

### 二、共用接收入口

一個平台 Gateway 可保有**一個實際 Webhook**；由 Relay 把多位受權同事對應到這個入口。當訊息到達：

- Relay 驗證真正收件的 Session 與其路由，生成包含收件 Bot ID 的可信 Dispatch Event。
- Gateway 驗證來電、確認名單及目標、不查詢不相關同事、不用正文選擇任意 Bot，僅把訊息轉入平台本機目標。
- 同事的加入／退出只更新名單映射，不要求重新建 Webhook 或每位同事重新安裝 Skill。

這是舊架構文件稱為 **Reference Wake Target／work_wake_bindings／gateway_teammates** 的設計方向。**這些是 V1 時期的提案名稱，不是現有 V2 schema。** 應根據 V2 Organization／Agent／Session 與受權委派重新定義。

### 三、發訊方身分與 Skill 共用

「平台已安裝 Skill／MCP」與「某個 Bot 擁有可作為自己身分發訊的授權」必須分開。

若平台原生共用 MCP 但所有 Bot 都共用同一 OAuth Grant，直接呼叫現行 `sendToAgent` 會以這個**Grant 的 Session**為寄件者，無法自動證明是哪個原生 Bot 發話。要讓平台同事「只裝一次、各以自己地址發訊」，需設計具平台 Bot ID 來源驗證、可撤銷委派與稽核的可信代理／傳訊入口，不得把其他同事的 Runtime 憑證放入 Prompt 或偷用 Gateway 身分。

### 四、原生 Thread 延續

OpenMausBot 使用明確的 sender Session × recipient Session 對話映射；首次工具建立後，由可信平台執行結果觀察器安全回填實際 native Thread ID。後續訊息帶固定原生 ID。Relay Thread ID 和平台原生 Thread ID 不可互換。GrokBot 若沒有可指定的原生 Thread 則保留平台自動管理。

## 依使用者情境的驗收

1. 新使用者在平台 A、B 各建立一位任意名稱的 Gateway；只配置一次 Nuwa Skill/MCP 與平台接收入口；尚無同事時不建立任何虛構名單。
2. 日後使用者說「把這位 Bot 加入通訊名單」，Gateway 在受權委派下建立可查詢的真實對應，**不要求新增一組 Webhook**。
3. 加入第二位同事不影響第一位；刪除其中一位不清空其他人的路由。
4. 同事 A 發給 B 的真實訊息，Relay 依身分向 Gateway B 派送，B 的真正 Bot 收到，並在原 Relay Thread 回覆。
5. B 在稍後主動發起新的 Relay Thread；Gateway A 通知真正的 A，A 回覆。
6. 同一寄件者再次聯絡同一收件者使用同一條已綁定的原生工作對話；不同寄件者互不污染。
7. 權限錯誤、重送、訊息正文注入、失效原生 Thread、Webhook timeout 都 fail closed，不重複建立或冒用身份。
8. 分別確認發訊、收件、Webhook、真正的平台 Bot 執行及回覆。HTTP 200／CI 綠燈不代替真正的平台 E2E。

## 對新手網站的要求

首頁只出現「不同平台同事 → Nuwa → 對方同事」的簡單圖，**細部 Gateway 路由應由使用者選擇後才看到**。通用 Gateway Prompt 不帶任何虛構同事姓名；平台已安裝過 Skill／MCP 就沿用；名單是後續使用者主動新增的工作。**在上面缺口尚未開發完畢前，網站不得把完整一鍵 Gateway 註冊或全自動雙向接線寫成已經可以操作成功。**
