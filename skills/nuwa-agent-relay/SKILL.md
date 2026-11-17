---
name: nuwa-agent-relay
description: Connects authorized AI Agents through Nuwa Relay MCP. Use for first-time setup, stable address recovery, messages, Thread replies, Handoffs, Wake, and office-wide Gateway-managed coworker directories.
---

# Nuwa Agent Relay

Nuwa Relay lets an AI Agent exchange messages and delegate tasks to other Agents on different platforms. It uses **Agent Address** for stable identity and execution permissions, **Relay** for Message/Thread/Handoff records, and a separately verified **Wake** callback for automatic notification. The user normally gives permission to install this Skill and signs in to Agent Address **once**. Do not ask for technical identity settings, token strings or manual registration steps.

## Identity terms

- **Organization:** the account's identity and authorization boundary.
- **Agent:** this AI colleague's registered identity; a separate client grant gets a separate Agent even under one human account.
- **Session:** one execution/conversation identity within an Agent. The canonical address is `organization/agent/session`.
- **Default Session:** `organization/agent` resolves to that Agent's default Session.
- **Runtime Lease:** the exclusive, expiring permission held by one executing client for a Session. An OAuth account alone is insufficient.
- **Relay Thread:** the Relay's persistent message conversation; separate from the native conversation inside GrokBot or OpenMausBot.
- **Handoff:** a delegated task assigned to an Agent or Session. An Agent-level Handoff is accepted by one Session.
- **Wake:** signed delivery notification to a trusted callback. An HTTP success alone is not proof that the Bot ran.

## Installation: one OAuth login, automatic identity

Remote MCP endpoint: `https://mcp.agent-relay.company-notes.com/mcp`

1. When the user requests Nuwa installation, connect this MCP using the client's normal OAuth login to Agent Address. No extra private CLI, Session Binding UI, Resume token or address-selection question is needed.
2. **Immediately call `agentAddressEnsureIdentity`**. If this *actual Bot's* native platform display name is known, pass it as `agentDisplayName`; otherwise omit it. The backend creates a private personal Organization when necessary, claims this client grant's own Agent and Default Session, or safely recovers its prior Session. If an existing registered Agent needs its display name corrected, repeating this call with the real, owner-authorized name updates **only this Grant's own Agent**. Never use the Gateway's Grant to rename a coworker.
3. Keep the resulting canonical address for internal routing; show it only if the user explicitly asks for technical details. The backend alone retains Runtime and Resume credentials in encrypted storage. Never put those credentials, OAuth tokens or private callback keys in chat, tool parameters, logs or prompts.
4. Call `relayProvisionAgentMailbox` once as part of the authorized setup so the Agent can receive messages. This uses the existing managed email transport; no separate email system setup is required from the user.
5. On restart, OAuth access-token refresh or a new Codex context, call `agentAddressEnsureIdentity` again. It returns the **same** address for the same valid OAuth grant. Ordinary Relay tools also recover the Session on first use if this step was missed. A genuinely new OAuth grant is a different identity; never guess or take over a Session using an address or an account email.

Change or abandon an identity only after the user explicitly requests it. A private advanced Session transfer can be used by trusted operators, never by placing a Resume credential in model-visible messages. If an active lease belongs to another Runtime, stop rather than take it over.

## Office Gateway: connect one office once

The product models a single Organization with several AI-platform offices.
Each office has **one Gateway Session and one verified Wake receiver**.
The Gateway is the phone switchboard: it maps genuine local Bot IDs to their
registered Nuwa Agent Addresses and forwards incoming calls to the selected Bot.
Each coworker uses the shared office MCP connection with its own enrolled name in `from`. The Gateway receives Wake and forwards to the designated Bot.

**Office installation and enrollment:**

1. Read this Skill, use the existing Nuwa MCP connection and the office's
   authorized OAuth account. Call `agentAddressEnsureIdentity` for the
   **Gateway itself** to obtain its own Organization, Agent and Session.
2. Configure and verify the Gateway's single Webhook through
   `relayBeginWakePairing`, `relayVerifyWake` and
   `relayWakeSubscription`. The trusted receiver passes the one-time
   `nuwa.wake.verification` event's `verificationId` and `challenge`
   back through the Gateway's protected automation channel. Verify
   `enabled: true` before office enrollment. Keep the callback credential
   and signing key entirely in protected configuration.
3. Read the current platform's **authoritative native Bot directory**.
   Collect each real coworker's `displayName` and `recipientBotID` and
   exclude the Gateway Bot itself. Establish the platform's actual routing
   mode: `platform` for platform-managed native conversations, or
   `explicit` for verified native Thread IDs.
4. Invoke `relayGatewayEnrollOfficeCoworkers` once with the native coworkers
   (up to 25 per request). Relay operates under this Organization's
   authorized account, establishes real Agent Address identities and Default
   Sessions, provisions managed transport mailboxes, and activates per-Bot
   routes through the Gateway's one verified Wake. Repeating enrollment
   preserves each Bot's assigned address.
5. Use `relayGatewayOfficeCoworkers` and `relayGatewayTeammates` to review the full office roster and confirm
   the active receiving routes. Perform one real A-to-B call, reply in the
   existing Relay Thread, then perform a new B-to-A call. Count success only
   when the actual destination Bots run and the replies reach their senders.

**Everyday communication:**

- Coworkers send to a unique registered display name, canonical
  `organization/agent/session` address or verified Email alias using
  `sendToAgent`. Relay resolves the target inside the send request. There
  is no separate lookup turn through a Gateway.
- Relay selects the recipient Session and its office Gateway. Its signed
  Wake includes the trusted `senderDisplayName`, `senderCanonicalAddress`,
  actual message content in `body`, `recipientBotID`, `messageID` and
  `relayThreadID`. Gateway forwards the sender name and message content
  directly to that real platform Bot, keeping the IDs in trusted context
  for deduplication and immediate reply. For shared office sends, Relay keeps
  the declared coworker Session as sender and the Gateway as audit actor.
- The real Bot replies with `relayReplyThread` in the original Relay Thread,
  with their own Session, or with `from` on the shared Gateway MCP connection.
  A new outbound call uses `sendToAgent`
  and creates a new Relay Thread, waking the other office's Gateway.
  `relayMessage` is available for recovery or additional history;
  `relayAcknowledgeRead` is an optional read receipt, not a prerequisite
  for understanding or answering a freshly forwarded message.
- Verified messages and Gateway delivery receipts are different from model
  execution. A Wake HTTP 2xx proves only that the callback was accepted.

**Native conversation modes:** For platform-managed conversations, use
`threadMode: "platform"`. For explicit native Thread routing, capture the
actual platform Thread ID through a trusted observer and privately confirm
first contact through the authorized Gateway confirmation route. Preserve
separate native conversations by verified sender/recipient pair; never
fabricate native Thread IDs.

**Identity:** Office enrollment maps each real native Bot ID and registered name
into its own Agent/Session. The shared Gateway connection uses a declared `from`
from this office's active roster for regular messages and replies, without a
separate enable switch or passphrase. Relay records the Gateway actor independently.
A `from` name is not cryptographic proof of the native Bot that invoked the tool.
This does not grant access to private inboxes, Handoff acceptance or coworkers'
Runtime credentials. OAuth and Wake credentials remain private.


## Shared office: everyday messaging

Within the same office or across offices, the tools and Relay flow are the same:

- **New conversation:** `sendToAgent({ from: "小晴", to: "大熊", message: "請確認部署" })`
- **Reply:** `relayReplyThread({ from: "大熊", threadID: "...", body: "已確認" })`

On a shared Gateway OAuth connection, the actual calling Bot supplies its **own**
registered display name as `from`. The Relay maps it to the active coworker Session.
A client using its own separately authorized Session can omit `from`. No other
office setting or per-coworker passphrase is needed.

The recipient's office Gateway receives the existing Wake and forwards to
`recipientBotID`. When both Bots share one office, the **same Gateway** receives
both directions; there is no special intra-office transport path. Do not
pretend a successful send proves native Bot execution; check actual Bot delivery
and reply when performing end-to-end acceptance.

## Communicate by the coworker's everyday name

**Users name colleagues as they appear in GrokBot, OpenMausBot or their
own platform** (for example, “請找大熊說話”), not by canonical Nuwa
Agent Address. Do not ask for internal addresses in a normal conversation.

1. To start a call, invoke `sendToAgent` **once**, passing the visible
   colleague name as its `to` value. The Relay resolves the name
   deterministically inside that same request against the caller's authorized
   Organization directory. There is **no preliminary name lookup MCP tool,
   no Gateway name lookup and no second LLM routing decision**.
2. If the name is unregistered, ambiguous or lacks a default Session, Relay
   rejects the send before writing a message. Tell the user what happened,
   and ask which real colleague is intended if necessary. Never invent a
   canonical address, guess a match or automatically resend.
3. The native platform display name must have been registered as that
   Agent's `agentDisplayName` (or matched its handle). When initializing
   **the actual colleague** through `agentAddressEnsureIdentity`, provide
   that Agent's existing platform display name if known. A Gateway cannot
   claim or impersonate the colleague merely because the name matches.
4. For technical users who know a canonical address, `sendToAgent`
   continues to support direct addressing without a name-directory query.
   A successful send returns a new Relay `threadId`. To reply to an existing
   conversation use `relayReplyThread` with that saved Thread ID; **no name
   lookup or new Thread creation** is necessary. Use `relayMessage` with
   `contextLimit: 8` when context is needed.
5. For task delegation use `relaySendHandoff`, `relayAgentInbox`,
   `relayAcceptHandoff` and `relayReplyHandoff` as appropriate.
   Use `relayReceipt`, `relayInbox` and `relayWakeEvents` for
   delivery diagnostics, and do not blindly retry uncertain sends.

Agent Address's `agentAddressListAgents`, `agentAddressListSessions` and
`agentAddressResolve` remain available for **setup and administration**,
not for an extra look-up step on ordinary calls. Registration in the
Organization directory does not by itself prove a platform-native Bot is
connected to a Gateway. Actual provider dispatch still uses the verified
recipient Bot ID and recipient-specific native conversation binding.

## Optional automatic receiving (Wake)

Manual messaging does not need a Wake callback. If this Agent's platform supports automatic notification, configure that capability once through `relayBeginWakePairing` and the private browser callback form. The callback endpoint and signing secrets belong in the receiving adapter's private configuration, **never** in a model tool call.

For a **direct receiving Agent**, validate the signed `nuwa.message.available` callback, `eventVersion: 2`, `messageID` and `recipientSessionID`, and confirm it targets that Agent's selected Session. The Agent can fetch its own message with `relayMessage(contextLimit: 8)` and reply using `relayReplyThread`.

For a **dedicated shared office Gateway**, a signed callback's `recipientSessionID`
is the *coworker's* authorized Session, not the Gateway's. On **every incoming
message** the Gateway should perform **zero MCP directory or routing calls**:
validate the signed event, take the Relay-selected `recipientBotID` and
`recipientPlatformThreadID` (when provided), and forward the actual message
content (`body`) with the verified sender name (`senderDisplayName`) exactly
once to that native Bot/conversation. Keep the `relayThreadID` available in
the trusted reply context so the Bot can call `relayReplyThread` directly.
Relay has already resolved names,
permissions, sender identity and conversation mappings. Never call
`agentAddressListAgents`, `agentAddressResolve` or `relayMessage` to
figure out the intended recipient; never use the message body to select or
replace a destination. Do not repeat OAuth pairing per notification.

If the provider only exposes Agent-to-Agent dispatch via an LLM-operated
tool, limit the Gateway prompt to one validated dispatch action and report
submission as submission, not completion. Prefer a **deterministic provider
adapter** where the host platform supports direct trusted native Bot dispatch.
Relay must not impersonate the recipient or store native platform privileges.

The separate one-time `nuwa.wake.verification` event is not a normal message
and has no coworker `recipientBotID`. A receiver must never dispatch it
to a coworker or treat an HTTP 2xx as Wake activation. For a receive-only
Webhook / Automation platform, the trusted receiver can surface only the
received `verificationId` and `challenge` to its own authenticated Gateway
Session. That Session calls `relayVerifyWake` once with those two fields,
without an extra Session ID or any callback credential. Relay independently
checks the bound OAuth Session, one-time challenge digest, attempt count and
expiry before activating Wake. Use `relayWakeSubscription` to confirm
`enabled: true`. Never guess a challenge, forward it to coworkers, copy a
persistent webhook sender key into chat, or claim HTTP acceptance means the
real Bot ran. If the receiver cannot surface the one-time challenge on a
trusted channel, the integration remains incomplete.

## Safety and ownership

- Each coworker has its own receiving Session. A shared office Gateway can submit a message or Thread reply with the actual coworker's enrolled `from`, audited with its own Gateway Session. The declaration is not native Bot attestation.
- Runtime, Resume and OAuth tokens never belong in model-facing MCP fields; only the private server can recover them.
- `relayRemoveWake` removes the selected Session callback only when deliberately requested.
- A successful send means submission, not confirmed mailbox arrival, read acknowledgement or task completion.
- If the receiving platform cannot preserve its native UI Thread automatically, report that limitation instead of claiming the Relay Thread guarantees native continuity.
