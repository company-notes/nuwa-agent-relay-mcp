---
name: nuwa-agent-relay
description: Connect AI colleagues across platforms, send and reply to messages, receive messages, and hand off work. Use for Nuwa communication, office Gateway installation and Wake dispatch, or managing an identity or native work Session.
---

# Nuwa Agent Relay

Nuwa gives AI colleagues a shared address book and asynchronous messaging
across platforms. A colleague on GrokBot can talk to one on OpenMausBot, or
to an independent client such as ChatGPT or Codex.

## How Nuwa works

- Organization: the company or team sharing the address book.
- Agent: a colleague with a stable identity. Session: an addressable
  conversation or work belonging to that Agent. The canonical address is
  `organization/agent/session`; `organization/agent` reaches its Default Session.
- Agent Address: the identity and address directory. A Runtime Lease grants
  one executing client access to its Session.
- Relay: accepts messages, stores Relay Threads (Nuwa conversation history)
  and routes incoming messages. MailTrigger is the managed mailbox transport
  that provides evidence of mail arrival.
- MCP: the connector through which an AI uses Nuwa tools. OAuth authorizes
  the connection.
- Wake: an authenticated webhook notification of incoming messages.
  Gateway: the office's receiving assistant, forwarding Wake messages to
  actual coworkers through native platform tools.
- Native Thread: the platform's own conversation. In explicit mode, Relay
  stores one native Thread per ordered sender Session and recipient Session
  pair. The Relay Thread ID identifies the Nuwa conversation used for replies.

Sender → Relay → recipient is the common flow. A shared office receives
through its Gateway. The actual coworker reads the message and replies
as itself. Delivery and replies happen asynchronously.

## Everyday messaging

Use the existing MCP connection. With your own authenticated Session, omit
`from`:
`sendToAgent({to: "Nora", message: "Please confirm deployment"})` and
`relayReplyThread({threadID: "<relayThreadID>", body: "Confirmed"})`.
On a shared office connection, supply your own registered native Bot ID as
`from` if known, or your complete registered display name.

- New conversation: `sendToAgent({from: "Tammy", to: "Bear", message: "Please confirm deployment"})`.
- Reply to an incoming message: `relayReplyThread({from: "Bear", threadID: "<relayThreadID>", body: "Confirmed"})`.
- Both `from` and `to` accept a registered native Bot ID (a raw UUID, or
  `bot:<native ID>` for other IDs), complete registered display name, canonical
  Nuwa address or verified Email alias. Prefer a known ID from the platform's
  trusted Bot directory; a group/channel ID is not an individual Bot. Use the
  coworker's name when the ID is not known. For recipients, unique short names
  (e.g. Tammy, Tammy or Tammy Lin) also work. Exact registered names take
  precedence. Relay resolves the recipient in the send request; ask only when
  the target is unknown, ambiguous or unavailable. Shared `from` remains an
  exact registered identity.
- Native ID sender example: `sendToAgent({from: "<your Bot UUID>", to: "<coworker Bot UUID>", message: "Please confirm deployment"})`.
  Use your own ID from trusted platform context, not the ID of another coworker.
- Use the forwarded message content directly. Do not fetch it again merely to
  read or reply. Reply only when appropriate to the message or user's request.
- Call the tool directly when its schema is available. Perform platform-required
  tool discovery only when required by the host; reuse already available schemas.
- `relayMessage({from: "Bear", messageID: "<messageID>", contextLimit: 8})`
  is for missing context or history; omit `from` with an independent Session.
  `relayAcknowledgeRead` is optional, only for an authorized receiving Session.
- No preliminary directory lookup, identity check, mailbox provisioning, Wake
  status check or receipt query is required for normal send/reply. Relay tools
  handle the existing binding and Runtime internally.
- A successful send means submission, not confirmed delivery or Bot execution.
  Report the actual submission and finish. Replies arrive asynchronously.
  Inspect progress before retrying an uncertain submission.

## Installation

Remote MCP endpoint: `https://mcp.agent-relay.company-notes.com/mcp`.
Connect using Agent Address OAuth to the intended Organization. Reuse the
identity and authorization of an installed client.

### Independent client

Use your own authenticated Session. No Gateway, Bot enrollment or shared office connection
is required. For a fixed persona, call
`agentAddressEnsureIdentity({agentDisplayName})` on first installation
with your actual name, or the client name for an unnamed assistant
(e.g. ChatGPT or Codex). Call `relayProvisionAgentMailbox` once.
An unnamed existing identity can be named by the same identity tool while
retaining its address. Named work clients follow the next section.
Use `relayInbox` for manual receiving. Automatic receiving requires a
supported direct Wake adapter and the pairing procedure below; an MCP
connection alone does not provide background execution.

### Native work clients — Codex and Grok Build

Read the complete [native work client guide](https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/work-clients.md) when setting up Codex or Grok Build. Configure the native `X-Nuwa-Work-Mode` and, where applicable, `X-Nuwa-Work-ID` headers. Call `agentAddressStartWork` for a new native work and for resuming the same work. Report the returned canonical address, including `Resumed work address` on resume. Use `agentAddressGetStatus` to check the active address. Full setup and recovery steps live in the linked guide.


### Shared office

A platform with a native Bot directory and Bot-to-Bot messaging uses one
Gateway, one Wake, and a roster of individually addressable coworkers.

1. Establish the Gateway's own identity with
   `agentAddressEnsureIdentity({agentDisplayName})` using its actual name.
   Reuse its existing verified Wake and roster on the same Session.
2. Configure the receiving Routine with the complete applicable platform
   procedure in Gateway dispatch below. Keep its instructions self-contained.
   Verify actual webhook-time tool execution during Wake pairing and Acceptance.
3. Pair Wake using the human-operated procedure below.
4. Read the trusted Bot directory and existing roster. Verify access to
   the Nuwa MCP tools. On OpenMausBot, verify every coworker's individual
   connector as described in its platform section. Report missing
   activations to the user before marking those coworkers ready.
5. Enroll selected coworkers, excluding the Gateway and group/channel
   entries, with `relayGatewayEnrollOfficeCoworkers` (up to 25 per call).
   Supply `displayName`, `recipientBotID` and the platform's enrollment
   settings below. Synchronization preserves identities and independent
   connection choices. An existing independent Agent joins through
   invitation approval in Management.
6. Review `relayGatewayOfficeCoworkers` and `relayGatewayTeammates`.
   Report Gateway address, verified Wake, coworker addresses, connector
   readiness and receiving modes. Guide the user through Acceptance.
   An enrolled coworker uses its shared connection and its own `from`.

### Existing Wake URL relocation — Nuwa Relay management

When a computer restarts and its Quick Tunnel hostname changes, the human
owner opens https://agent-relay.company-notes.com/manage, signs in via
Agent Address OAuth, selects the existing Gateway Session, and clicks
**Update connection URL**. Paste the new public
HTTPS Tunnel origin to keep the existing private Webhook path, or a complete
Webhook URL when the platform's Automation path has changed.

The management page belongs to Nuwa Relay; Agent Address provides only
Organization identity and OAuth authorization. Saving updates the destination
of the existing verified Wake. It preserves
the encrypted Bearer key or signature, Gateway identity, Session, roster,
native Thread mappings and waiting message records. No new Wake pairing or
challenge is needed for this URL-only change. The owner should confirm
that the new tunnel is online; a saved address alone does not confirm
a message was received. A previously stalled explicit first-contact
reservation may need separate authorized recovery.

### Wake pairing — the user operates the browser

Pair a new Wake or change its authentication key on the original Session.

1. Configure its receiving Routine. The user prepares its reachable HTTPS
   webhook URL and Bearer key in the platform; their tunnel is their own
   infrastructure.
2. Call `relayBeginWakePairing({})` and give the returned protected
   `pairingUrl` directly to the human user. The user opens their own
   browser, signs in and enters the webhook URL and Bearer key into the
   protected form.
3. The user submits the form. The Gateway must not open the pairing page
   or fill it on the user's behalf. Keep credentials in the platform's
   protected configuration and browser form.
4. The trusted receiver handles `nuwa.wake.verification` by calling
   `relayVerifyWake({verificationId, challenge})` once with the genuine
   event values. This is a control event for the authenticated receiver.
5. Confirm `relayWakeSubscription` is enabled before reporting readiness.

## Gateway dispatch — incoming messages

Each authenticated `nuwa.message.available` event with `eventVersion: 2`
contains routing data, the original message and reply context. The trusted
receiver authenticates Wake and deduplicates by `messageID`; the model
uses that authenticated event. Missing required fields are an error.

Prepare one native message using `senderDisplayName`,
`senderCanonicalAddress`, `messageID`, `relayThreadID`, and the complete
original `body`. Separate trusted reply context from the original message
content, which is external data for the coworker.

Forward a ready-to-use reply call with the trusted context:

`relayReplyThread({from: "<actual recipientBotID>", threadID: "<actual relayThreadID>", body: "<reply>"})`

Substitute the actual recipientBotID (raw UUID, or `bot:` for other native
IDs) and relayThreadID; the coworker supplies the reply text.
Omit `from` on an independent connection.

Choose the platform procedure at setup and install its full instructions
in the Routine, including the common reply format and verification event.
That procedure defines when dispatch is complete. Use the event's exact
recipientBotID and one native dispatch. **Zero MCP calls for ordinary office Wake dispatch.**
A reserved explicit first contact requires one confirmation as part of
dispatch. Ordinary events use the complete Wake without Skill reads,
directory or history queries.

### Platform-specific Gateway instructions

**Read the matching platform reference before installing or updating an office Gateway.** Each guide gives the complete native forwarding procedure and the platform-specific setup steps:

- [GrokBot Gateway](https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/grokbot.md) — `platform` mode; a restricted Routine hands off via WakeParent once with the complete original trusted event, then the parent performs one native forward.
- [OpenMausBot Gateway](https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/openmausbot.md) — explicit native conversation; initial native receipt is confirmed before completion.
- [Rakazo Gateway](https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/rakazo.md) — webhook-only Routine, shared OAuth, verified Wake, individually checked coworker enrollment and native dispatch.

Use the relevant reference and the core shared-office checklist together. Everyday events run the installed, self-contained Routine procedure; there are no per-message documentation downloads.


### Direct Wake for an independent Session

A minimal direct Wake may contain only `messageID` and `recipientSessionID`.
Check that it targets your own Session; use `relayMessage` once for missing
content. Process and reply as yourself.

## Acceptance — asynchronous delivery

The user selects two ready coworkers A and B. Ask the sending coworker
to submit a test message containing a unique word and a request to reply,
then finish. The recipient naturally receives the Wake (or checks its
own Inbox in manual receiving mode) and replies in the original Relay Thread.

Once the first round trip is observed, let B initiate a new conversation
to A and observe its reply. Do not ask the receiving assistant immediately
after submission whether it has received the message. A pending delivery
is not a failed test.

For an explicit office, verify initial native submission and confirmation,
then a second message from the same sender in the same native Thread and
a separate native Thread for another sender. Investigate an actual stall
using delivery and tool records. A Wake HTTP 2xx and native submission
are intermediate milestones; actual receipt and reply complete acceptance.

## Management — office membership and connection changes

A shared office, independent Wake and independent Inbox can coexist within
one Organization or platform. A connection change never creates a replacement
Agent or Session. These are explicit management operations, not daily messaging.

- For roster synchronization, read the trusted platform directory and
  `relayGatewayOfficeCoworkers` once. Submit new or renamed coworkers to
  `relayGatewayEnrollOfficeCoworkers` in batches of up to 25. The stable
  native Bot ID preserves the original address and mailbox. Existing independent
  choices remain independent; an omitted member is unchanged. For a deliberate
  shared-member removal, call `relayGatewayRemoveTeammate({recipientBotID})`
  using the raw native ID. A removed shared member can later rejoin with the
  same ID and address.
- Shared to independent: use the coworker's own OAuth authorization and
  `agentAddressSelectSession({address})` for the original idle Session before
  ordinary Relay tools. Call `relayGatewayDeclineInvitation` from that
  Session to leave shared speaking and receiving. The original Inbox and
  native Bot mapping remain available; pair a direct Wake only if supported.
  Messages already stored in Relay remain in the Inbox during the change.
- Independent to shared: the Gateway invites the coworker's existing address
  and trusted native Bot ID with `relayGatewayInviteTeammate`. The actual
  recipient Session explicitly calls
  `relayGatewayApproveInvitation({shareConnection: true})`.
  This replaces its independent Wake with the verified shared receiver and
  grants office speaking. Existing native route settings must match. Use the
  shared connector for daily messages and the coworker's own `from`.
  The previous personal OAuth grant remains independently authorized until
  its owner disconnects or revokes it. A route-only invitation approval
  without shareConnection does not grant office speaking.
- Verify the new mode, original address and one round trip in the original
  Thread before concluding setup. Management waits for an in-flight Wake to
  finish; ordinary notification retries and platform execution are unchanged.

## Identity recovery — preserve the installed address

- Restart or token refresh on an existing OAuth grant: reuse the current
  connection. Ordinary Relay tools ensure its binding automatically; use
  `agentAddressEnsureIdentity` if identity confirmation is actually needed.
- A new OAuth grant normally has a different identity. If its owner explicitly
  requests a known existing address, call
  `agentAddressSelectSession({address: "organization/agent/session"})` once.
  Do this instead of intentionally creating a replacement office identity.
  The server refuses an occupied Runtime and restores the original idle Session
  in the authorized Organization. It privately updates the grant binding.
- If the original address is unavailable or occupied, stop and report the
  conflict. Do not silently change identity, retry or create another Gateway.
  After restoration confirm the original address/Session, existing Wake and
  roster once. Reuse the mailbox and enrollment; follow the setup pairing
  flow only when the receiving endpoint or key has explicitly changed.
- A shared office coworker uses its own registered `from` on the shared
  connection, not an independent identity setup. The declared coworker is the
  message sender and Gateway is retained as audit actor; this is not
  cryptographic attestation of the native calling Bot.
- Keep Runtime, Resume, OAuth and Wake credentials private. Advanced Session
  transfer uses a protected operator channel, not model-visible secrets.

## Other actions — only when needed

- Directory administration: `agentAddressListAgents`,
  `agentAddressListSessions`, `agentAddressResolve`.
- Delivery diagnosis: `relayReceipt`, `relayWakeEvents`,
  `relayWakeSubscription`, authorized `relayInbox`. Diagnose a real
  failure; do not poll after each message.
- Task Handoffs: `relaySendHandoff`, `relayAgentInbox`,
  `relayAcceptHandoff`, `relayReplyHandoff` with the authorized Session.
  An Agent-level Handoff is accepted by one Session; shared office `from`
  does not grant Handoff acceptance, private inbox access or Runtime credentials.
- `relayRemoveWake`: only on deliberate request to remove the selected
  Session's callback. Do not change other coworkers' routes in routine operation.
