---
name: nuwa-agent-relay
description: Connects authorized AI Agents through Nuwa Relay MCP. Use for first-time setup, stable address recovery, messages, Thread replies, Handoffs, Wake, and recipient-approved shared Gateway rosters.
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

## Office Gateway: discover the current office's coworkers by default

The user experience is **set up the office once**, without asking the user to
type every coworker's name or repeat the MCP/Skill installation for each one.
A dedicated Gateway receives authenticated notifications and forwards them to
the real platform Bot. Each coworker remains a separate Agent/Session with its
own authorization and message history. A coworker's address is **not** the
Gateway's address.

**Set up an office when its user requests connection:**

1. Check whether this platform already has Nuwa MCP and the official Skill;
   reuse both if installed. Connect once through the platform's normal OAuth
   login, then call `agentAddressEnsureIdentity` for the **Gateway itself**.
2. Configure the platform Webhook / Automation receiver and pair the Gateway's
   one Wake through `relayBeginWakePairing` in the private authorized browser
   flow. When its trusted receiver gets the one-time `nuwa.wake.verification`
   event, pass only that event's `verificationId` and `challenge` to the
   owning Gateway Session through its trusted automation channel, then call
   `relayVerifyWake` once. Check `relayWakeSubscription.enabled === true`
   before inviting coworkers. Do not expose callback URLs, bearer keys or
   signing secrets in any chat or tool arguments. If the platform cannot
   return the event's challenge through a trusted channel, report the receiver
   limitation; do not bypass verification.
3. When the user asks to connect the whole office, discover existing
   eligible **native Bots in this platform** from its authoritative local
   Bot directory when available. Collect each real display name and trusted
   platform Bot ID. Skip the Gateway Bot itself, unverified or missing IDs.
   This is an **onboarding operation**, not a per-message Gateway action.
   Never scan the entire Nuwa Organization as if every Agent worked in the
   same physical office, and do not call extra Agent Address MCP directory
   tools to translate each coworker's name.
4. For each verified platform Bot, call `relayGatewayInviteTeammate` once
   with `recipientName` (the real native display name) and `recipientBotID`.
   **Relay** resolves the name to an authorized existing Agent/Session using
   its own directory lookup. If a verified canonical address is already
   available, `recipientAddress` may be used instead; specify exactly one
   name or address. If Relay reports no unique match, stop and report the
   registration/identity gap rather than inventing an address. An invitation
   is *pending*, not successful incoming routing.
5. The actual recipient checks `relayGatewayInvitation` and, only with
   authorization for **its own Session**, invokes
   `relayGatewayApproveInvitation`. The Gateway cannot perform this step
   with its own OAuth/Runtime or implicitly grant consent to everyone.
   Coworkers who already have the Skill and MCP connected reuse them;
   they do **not** register another Wake receiver.
6. Call `relayGatewayTeammates` and report: discoverable coworkers,
   active recipients, pending approvals, identities lacking native Bot IDs,
   and provider receiver/run limitations. Tell the user only about the
   remaining permissions or manual actions, not technical secrets.
7. Re-run discovery when new colleagues arrive, when explicitly requested.
   Use `relayGatewayRemoveTeammate` with the real platform `recipientName`
   to remove exactly one selected coworker. Relay refreshes the authorized
   directory for this destructive action; no extra name-lookup MCP call or
   internal Nuwa address is required. Use `relayGatewayDeclineInvitation`
   for a coworker's own authorized revocation.

**Platform modes:** Use `threadMode: "platform"` if the provider manages
its own native conversation. Use `threadMode: "explicit"` and
`firstContactMode: "automatic"` only if a trusted platform observer can
capture and privately confirm actual native Thread IDs. For an approved
shared Gateway, Relay accepts that private confirmation through
`PUT /v2/gateway-teammates/{recipientSessionID}/first-contacts/{senderSessionID}`
using the Gateway's own authorized Runtime, **not** the recipient's token.
This is a receiver-side trusted adapter/API operation, never a model-facing
MCP tool or an instruction to read credentials in the LLM. The provider
receipt observer is not bundled: do not claim hands-free native Thread
continuation until it has been integrated and tested. Never invent IDs.

**Important implementation boundary:** The server currently supports a
single shared verified Wake, directory listing, and recipient-approved
*individual* invitations. It does **not** yet provide a fully automatic
organization/office membership policy, a trusted universal platform Bot
directory mapping, or a blanket delegation allowing the Gateway to
authorize other Sessions. The office cannot truthfully claim every coworker
is active just because the list was discovered. If those missing capabilities
matter to this platform, state the unfinished stage and offer the authorized
next step. Do not create made-up coworkers, use message text to select a
recipient, impersonate the coworker, or claim a webhook HTTP 2xx means the
real Bot ran.

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
`recipientPlatformThreadID` (when provided), and forward the event exactly
once to that native Bot/conversation. Relay has already resolved names,
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

- The authenticated client owns its own Session and exclusive Runtime Lease. Sharing a human account or knowing a canonical address does not allow impersonation.
- Runtime, Resume and OAuth tokens never belong in model-facing MCP fields; only the private server can recover them.
- `relayRemoveWake` removes the selected Session callback only when deliberately requested.
- A successful send means submission, not confirmed mailbox arrival, read acknowledgement or task completion.
- If the receiving platform cannot preserve its native UI Thread automatically, report that limitation instead of claiming the Relay Thread guarantees native continuity.
