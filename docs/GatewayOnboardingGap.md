# Nuwa Gateway：共用接收入口、同事授權與剩餘整合邊界

## 它要做什麼？

一個 AI 平台可以有一位專用 Nuwa Gateway，像辦公室的交換機。它只需配置一次來電入口。使用者希望預設讓這個平台目前所有符合資格的 AI 同事接入，不必逐個登記名稱；Gateway 應先盤點現有助理，再依法完成授權與路由。別的辦公室打來時，Nuwa 指定正確收件同事，Gateway 只負責轉交；同事自己閱讀、思考、發話與回答。

安裝 Gateway 的通用指令**不應出現虛構同事姓名**。第一次安裝就可以盤點全部現有同事，但「自動找到」不等於「無須授權即已能接線」。

## 身分與接線必須分開

- **Organization**：同一家公司的授權邊界。
- **Agent／Session**：每位真正同事的身分與具體通話工作階段，和 Gateway 各自獨立。
- **MCP**：真實同事透過 Nuwa 發訊／回覆的工具；平台可以共用工具安裝，但不能因此共用同一人的身分。
- **Gateway**：專用接線助理或可信程式，持有一個已驗證的來電入口；不能冒用同事的 OAuth 或 Runtime。
- **Wake**：Nuwa 通知 Gateway 有訊息到達的來電事件；HTTP 成功不代表同事已接聽。
- **Relay Thread**：跨平台訊息的同一通電話；原通話回覆用 `relayReplyThread`。
- **Native Thread**：GrokBot／OpenMausBot 自己的協作對話；不是 Relay Thread ID。

## 一般人找同事只用平台名稱

使用者在 GrokBot 或 OpenMausBot 中認得的是「小晴」、「大熊」等
**原生 Bot 顯示名稱**，不是 `organization/agent/session` 內部地址。
公開網頁只收兩個顯示名稱，讓助理生成簡單的雙向測試對話。

發話助理只呼叫一次 `sendToAgent(to: "大熊")`；Relay 在同一個
請求內用已授權 Organization 的 Agent Address 名冊，以顯示名稱或
handle 精確找出唯一收件 Session ID。沒有額外 MCP 工具、Gateway 查找、
LLM 推理或第二次地址解析服務呼叫。Relay **不會**把中文字猜成 slug，
也不會在同名、未註冊或缺乏 Default Session 時發送。轉送所需的
canonical address 在 Relay 內部依權威名冊組合。

這只能完成**已註冊名稱到 Nuwa 身分**的查詢，不等於已能從 GrokBot
或 OpenMausBot 的原生 Bot 名稱查到所有平台 Bot ID，或證明 Gateway
已替該同事完成接線。這仍屬下方的自動發現／接收端整合缺口。

## 目前的受權登記與共用 Wake 契約

這部分由 Relay API 的 `GatewayRoster`、`GatewayBindings`、`WakeService`
與 MCP 的 `GatewayTools` 接合，使用受信任且與 OAuth Grant 綁定的 Session：

1. **Gateway 自己先設定接線。** 用自己的 OAuth Session 初始化身份，經私密配對建立一個已驗證的 Webhook／Wake。
2. **使用者同意接通整間辦公室後，Gateway 預設盤點現有同事。** `agentAddressListAgents`／`agentAddressListSessions` 只提供 Organization 的 Nuwa 地址，無法分辨誰在本平台；還必須從可信的平台 Bot 清單核對原生 Bot ID。對每一位能確認的本辦公室同事，呼叫 `relayGatewayInviteTeammate` 提出 **pending** 邀請，沒有授權就不轉送。
3. **同事以自己的 Session 授權。** 用 `relayGatewayInvitation` 檢查，再在明確同意後用 `relayGatewayApproveInvitation`。這一步不能由 Gateway 的 OAuth 代替；同事不用另設 Webhook，也不需要重複安裝既有 Skill/MCP。Gateway 應把待授權項目整理給使用者，而不是要求使用者逐字輸入所有名字。
4. **Relay 選擇正確的 Gateway。** 通訊仍寄給同事的 Agent／Session。當實際送達回執確認，Relay 依已啟用的名單找到共用的 Gateway Wake，產生已選好的 Bot ID、寄件者地址與原 Thread；Gateway 不從不可信正文推測接線目標。
5. **名單可以分別撤銷。** Gateway 用 `relayGatewayRemoveTeammate` 移除其名單中同事；同事用 `relayGatewayDeclineInvitation` 撤回授權。撤銷一個人不能影響其他人，更不能刪除僅存在於待批准邀請之外的獨立路由。
6. **兩端互相通話。** A 的同事對 B 發新訊息，B 的同事用同一 Relay Thread 回覆；稍後 B 可以用新 `sendToAgent` 發起另一通電話，由 A 的 Gateway 通知 A。

新名單只建立接收轉送的委派，**不授予 Gateway 替同事發訊、讀取私人信箱或接管 Runtime 的權限**。

## 不能誤以為已解決的事情

**預設全部加入**仍有三個需要補足的整合邊界：

- **自動發現及授權策略**：目前缺少可信的「本辦公室原生 Bot ↔ Nuwa Agent／Session」自動對應、組織管理員核准全辦公室加入的授權契約，以及批次註冊／後續同步工具。既有 `agentAddressListAgents` 涵蓋整個 Organization，不應直接當成同平台 Bot 清單。已有身分的同事可以自行批准加入；沒有自己的身分或尚未批准的 Bot 不能被 Gateway 冒名開通。
- **平台真實執行適配器**：Relay 的已簽署 Wake 與路由資料不等於平台已啟動正確的 Bot。需要可信的 GrokBot Routine／OpenMausBot Webhook Automation 驗證和原生 Send-to-Agent 執行證據。
- **OpenMausBot 首次原生 Thread 自動確認**：Relay 已提供 first-contact reserve／confirm 邏輯，但平台實際發送後的 native Thread ID，仍須由可信的執行結果觀察器和收件者受權的私密確認流程回填。不能讓模型猜 ID 或把 Relay Thread ID 當 native ID。

## 如何驗證

一個聚焦的情境：**兩間辦公室各有一個 Gateway，兩位真實同事有自己的 Session；在 B 這邊後續加第二位同事仍使用同一 Gateway Webhook**。

驗收應包含：未批准邀請不轉送；錯誤 Session 不能批准；A→B、B→A 原通話回覆；B 主動新通話再由 A 回覆；不同寄件者原生對話分流；撤銷及未批准邀請不影響他人；失效 Gateway、重試與 callback 失敗不造成重複原生 Thread。

**Worker＋D1 的整合測試只證明 Relay 邏輯。** 實際 GrokBot／OpenMausBot 的 Webhook、模型運行和同一原生 UI 對話，仍必須分別以真實平台驗收。

詳細基本架構請讀 [Architecture](Architecture.md)，使用者接入流程請讀 [OnboardingGuide](OnboardingGuide.md)，Relay 的原生 Thread 契約見 Relay API 的 `docs/gateway-first-contact-v2.md`。
