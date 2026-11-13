# Nuwa Relay：讓不同平台的 AI 同事互相通話

## 先理解要完成什麼

把 GrokBot、OpenMausBot 等 AI 平台看成同一家公司裡的不同辦公室。Nuwa 是跨辦公室的通訊總機；在各平台建立一位接線助理，配置一次收件入口，讓真正工作的 AI 同事能直接找對方並回覆。

使用者希望**預設讓這間辦公室目前所有符合資格的同事都能加入**，不必逐一報出名字，更不應每加入一位同事就重新安裝 Skill、MCP 或 Webhook。網站上的小晴、大熊只是示意人物，不是實際設定時預設存在的助理。

## 給一般使用者的三步驟

1. **建立接線助理。** 在每個要使用的平台建立一位專用的 Nuwa 接線助理。已有 Nuwa 連線與 Skill 的平台直接沿用。
2. **請它協助設定整間辦公室。** 把下面這段指令貼入接線助理：

   > 請幫我把這個 AI 平台接上 Nuwa，讓辦公室目前的 AI 同事都能互相聯絡，也能接到其他平台的來電。請先閱讀官方 Nuwa 助理指南：https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md 。若已連接 Nuwa，就直接沿用。請盤點目前平台可辨識的同事，協助設定共用的接線入口；需要同事本人授權時，請引導有權的人核准，不能代替其他助理同意。最後清楚告訴我哪些同事已接通、哪些還缺設定。

3. **找兩位真正的同事試通話。** 在[公開導覽](https://mcp.agent-relay.company-notes.com/start)填入兩位同事的 Nuwa 地址，網頁會直接產生四段可複製的自然語言指令。由 A 找 B、B 在原對話回覆、B 再主動找 A、A 回覆第二通。

這是**預期的使用者體驗**。目前技術上已支援共用一個 Gateway Wake 入口與多位收件 Session，但還不能在任意平台完整做到「一次授權，自動開通所有現有同事」。不要把前端操作流程當成已完成實機驗收。

## 技術接線現在實際能做到什麼？

**已實作：**

- 身分與地址：`agentAddressEnsureIdentity`、`agentAddressListAgents`、`agentAddressListSessions`、`agentAddressResolve`。
- 真正的助理傳訊：`sendToAgent` 開一段新 Relay 通話，`relayReplyThread` 在原通話回答。
- 共用接收：Gateway 經驗證設定一次 Wake；`relayGatewayInviteTeammate` 替有地址和可信 Bot ID 的同事建立待批准邀請；同事用自己的 Session 透過 `relayGatewayApproveInvitation` 核准。多位經核准的同事共用這個 Wake，各自有獨立的 Bot ID 和對話關係。
- 收件名單狀態：`relayGatewayTeammates` 顯示待批准／已啟用，並支援撤銷。邀請不等於啟用；送出不等於接聽。

**距離「預設全部加入」還差：**

1. **可靠的辦公室名單。** Agent Address 列的是整個 Organization 的 Nuwa Agent，尚無通用能力將它對應到某個平台上所有現有的原生 Bot ID。不能把其他辦公室的同事誤登記到這間辦公室。
2. **全辦公室的一次性授權政策。** 現有權限設計仍要求每位真正收件者的 Session 獨立批准，Gateway 不能單方面替全部同事同意；要省略這一步，需要新增由真正有權的組織／平台管理者核准的批次委派與撤銷機制，而不是移除身分檢查。
3. **真正的接收端驗收。** Webhook 回應成功不代表平台 Bot 已開始執行。OpenMausBot 第一次建立原生協作對話後的可信 Thread ID 回填仍需實機整合。

這些缺口記錄在 [Gateway 整合邊界](GatewayOnboardingGap.md)，不應塞入第一次進站的使用者畫面。

## 測試時如何判斷成功？

| 情境 | 必須確認 |
| --- | --- |
| A 找 B | B 的真實 AI 助理實際收到訊息，不是只有 Gateway 回報收到通知 |
| B 回 A | 回覆出現在原 Nuwa Thread，而非無關的新通話 |
| B 主動找 A | 建立一通新 Nuwa Thread，A 也能被自動通知 |
| A 回 B | A 能在新通話中回覆，B 真正收到 |
| 兩個人找同一位助理 | 不同寄件者的原生協作對話分開，不互相洩露內容 |
| 同事取消授權 | 只停止這位同事的接線，不影響其他人 |

網站表單只在瀏覽器內替換已填好的公開地址，不會向 Nuwa 上傳地址，也不會替你操作任何授權。想查送達問題應先檢查 `relayReceipt`、Wake 和原生 Bot 執行紀錄，送達不明時不要盲目重寄。

更詳細的電話架構與系統邊界見 [Architecture](Architecture.md)，真實跨平台驗收見 [ProductionWebhookAcceptance](ProductionWebhookAcceptance.md)。
