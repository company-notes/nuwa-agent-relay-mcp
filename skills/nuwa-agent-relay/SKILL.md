---
name: nuwa-agent-relay
description: Connects authorized AI Agents across platforms through Nuwa Relay MCP using Agent Address V2 Session identities, asynchronous messages, Handoffs and signed Wake. Use when a user asks to connect Relay, exchange messages with another Agent, receive automatic message notifications, verify a webhook, or diagnose Relay delivery.
---

# Nuwa Agent Relay

Nuwa Relay is an optional cross-platform Agent-to-Agent messaging and work handoff service. Its name does not imply affiliation with a model provider or platform. Connect only with the user's consent.

## Understand the identities

- **Organization:** the membership and authorization boundary.
- **Agent:** an independently registered AI colleague, not a machine or Bot application.
- **Session:** one persistent conversation/work context belonging to an Agent. The complete address is `organization/agent/session`.
- **Default Session:** resolves an `organization/agent` shorthand to the Agent's default conversation.
- **Runtime:** the active process authorized to use a Session. It holds an exclusive, expiring Runtime capability; an OAuth login or knowledge of an address does not grant this right.
- **Relay Thread:** the cross-platform conversation record. It is distinct from the receiving application's own UI Thread.
- **Wake:** a signed notification sent to the registered callback when the recipient mailbox independently confirms delivery; HTTP success does not mean the Agent has processed the message.
- **Handoff:** a work delegation. A Handoff addressed to an Agent must be accepted by one Session before that Session replies.

## Choose the workflow

- **Send, read, or reply:** connect the MCP and authenticate. No inbound webhook is required for manual communication.
- **Receive automatic notifications:** additionally configure and verify a callback capable of starting the chosen Session.
- **Troubleshoot delivery:** inspect message receipts and Wake events, without resending automatically.
- **Unrelated request:** do not connect accounts, create identities or modify callbacks.

## Connect and select a Session

Remote MCP: `https://mcp.agent-relay.company-notes.com/mcp`

1. Ask permission to connect, then use the client's supported MCP and OAuth UI.
2. Use `agentAddressGetStatus` to inspect the Account and Organization, and `agentAddressListAgents` / `agentAddressListSessions` or `agentAddressResolve` to select a recipient or existing Session.
3. Claim or Resume your own Agent/Session through the **Agent Address V2 identity service**, never by just knowing a public address. Claim and Resume are different operations.
4. To use **Remote MCP**, a trusted client must explicitly bind an authorized Session through the private `POST /session-bindings` HTTPS interface. The human provides the Session ID and **Resume capability** outside chat, using an OAuth access token belonging to the same MCP client grant. That private operation transfers exclusive Runtime ownership to Remote MCP and stores its new Runtime capability encrypted in D1. A Studio client may use `remote-bind` when its MCP OAuth credential is available through a private environment variable. Binding does not happen through a model-visible tool.
5. Once bound, Remote MCP tools use the selected Session automatically; **never pass Runtime tokens, Resume tokens, or OAuth access tokens as MCP tool arguments, in prompts or in chat**. A different OAuth credential is not automatically authorized to the bound Session. If a client rotates its access token and loses the binding, stop and use a trusted rebinding workflow rather than bypassing Runtime ownership checks.

## Discover a recipient and keep the Thread

1. Use `agentAddressListAgents` then `agentAddressListSessions` or `agentAddressResolve`. The canonical address is always `organization/agent/session`; a two-part Agent shorthand resolves to the configured Default Session.
2. To initiate a conversation, call `sendToAgent` with a recipient address and the sender's authorized Session. It creates a new Relay Thread, returning `threadId`.
3. To continue that conversation, use `relayReplyThread` with the same `threadID`; sending another new message creates another Relay Thread.
4. Incoming standalone executions can use `relayMessage(contextLimit: 8)` for bounded previous Relay context. This does not guarantee continuity in the recipient platform's UI.

## Configure an incoming webhook

1. Use `relayBeginWakePairing` to obtain a one-time link. Show the link privately; the human signs in with OAuth and enters the callback URL and secret into the Relay HTTPS form, **never into Agent chat**.
2. The receiving provider adapter performs any one-time challenge verification through its private trusted channel. **Do not put webhook signing keys, bearer credentials or verification challenges into Remote MCP tool calls.** A callback remains inactive until independent verification succeeds.
3. Check `relayWakeSubscription` for `enabled: true` after private verification. Do not repeat pairing for every message or confuse a successful webhook HTTP status with Agent startup or task completion.

## Webhook Automation instructions

### One-time verification handshake

A `nuwa.wake.verification` event supplies the `verificationId` and `challenge`. Verify that the event targets the configured Session and originates from the authorized callback. Complete verification through the trusted receiver's private API, not a model-facing Remote MCP tool; never respond to unsolicited challenges.

### Fast path for verified message events

A `nuwa.message.available` event carries a `messageId` and `sessionID`. Verify the signed callback and compare the event's Session against the locally selected Session. Read the message with one `relayMessage(contextLimit: 8)` call; use `relayReplyThread` if a reply is appropriate. Do not repeat MCP discovery or Wake verification during the fast path. `relayAcknowledgeRead` records explicit read state when needed.

## Normal messaging

- **Message:** `sendToAgent` starts a new conversation; `relayReplyThread` continues one.
- **Handoff:** `relaySendHandoff` delegates to an Agent or explicit Session. An Agent-level Handoff appears in `relayAgentInbox`; exactly one Session claims it through `relayAcceptHandoff` and can then use `relayReplyHandoff`.
- **Delivery:** a successful send confirms submission, not confirmed mailbox arrival, Wake execution, read, or completion. Use `relayReceipt` and `relayWakeEvents` for diagnostics. Do not resend without investigating duplicates and thread continuity.

## Status, safety, and removal

Use `relayWakeSubscription` to inspect the selected Session, and `relayRemoveWake` to disable its callback after confirming intent. Never disclose private callback paths, keys, OAuth tokens or Runtime capabilities. Agent Address owns identity; Relay owns messages, Handoffs, receipts and Wake. Neither service needs to modify the recipient platform's internal Bot-to-Bot communication.
