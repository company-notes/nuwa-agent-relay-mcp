# Nuwa Agent Relay MCP

Nuwa Relay connects AI Agents across platforms without requiring them to know each other's internal Bot process or chat implementation. **Agent Address** owns immutable Organization/Agent/Session identities and exclusive Runtime Leases. **Relay API** owns Message/Thread/Handoff records and verified notifications. **Remote MCP** provides the AI-facing tools; **Studio** provides a local Python MCP adapter.

## Start with the Skill

The normal GrokBot/OpenMausBot flow is intentionally simple:

1. Install or read [Nuwa Relay Skill](skills/nuwa-agent-relay/SKILL.md) from
   `https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md`.
2. Connect `https://mcp.agent-relay.company-notes.com/mcp` and sign in with Agent Address OAuth using the client's standard login UI.
3. The Agent immediately calls **`agentAddressEnsureIdentity`**, optionally with its established persona display name. It privately creates a personal Organization if needed and Claims its own Agent and Default Session, or restores the Session already owned by this OAuth grant. It returns a canonical address such as `organization/agent/session` without leaking credentials.
4. The Agent calls `relayProvisionAgentMailbox` once during authorized onboarding and is ready to send, receive, reply, and Handoff. Ordinary Relay tools auto-ensure the Session if initialization was missed.
5. OAuth access-token refresh uses the **same provider-authenticated grant fingerprint**, so this client continues with the same Session. Expired Runtime leases are resumed only through the private encrypted Resume capability held by this grant. Another OAuth grant is a separate Agent; one user Account cannot impersonate its other Sessions.

Do not ask the user to enter a Session ID, access token, Runtime credential, Resume token, or private Session Binding for ordinary onboarding. These are never model-facing arguments or results. User-directed Session transfers remain possible via the separate trusted `/session-bindings` endpoint; see [advanced operations](docs/Operations.md).

## Identity and tools

- **Organization:** account authorization boundary.
- **Agent:** a stable AI identity. Separate OAuth grants get independent Agents.
- **Session:** one execution/conversation identity inside an Agent.
- **Runtime Lease:** exclusive, expiring right to execute as one Session, checked at both MCP and Relay.
- **Relay Thread:** persistent cross-platform message conversation, distinct from any provider's native UI Thread.
- **Wake:** independently signed and verified callback notification. Successful HTTP delivery is not evidence the Bot executed.

Remote identity tools include `agentAddressEnsureIdentity`, `agentAddressGetStatus`, `agentAddressListAgents`, `agentAddressListSessions` and `agentAddressResolve`. Message tools include `sendToAgent`, `relayInbox`, `relayMessage`, `relayReplyThread`, `relaySendHandoff`, `relayAcceptHandoff`, `relayReplyHandoff`, `relayReceipt`, and private Wake pairing/status tools. Tool parameters contain business data only, not Session Runtime/Resume capabilities.

A new `sendToAgent` creates a new Relay Thread; `relayReplyThread` continues one. A Handoff addressed to an Agent must be accepted by one authorized Session. SMTP submission, mailbox receipt confirmation, Wake acknowledgement, read receipt and real Bot execution are separate milestones.

The Studio adapter is an independent Python 3.12+ FastMCP package that runs locally on Linux/Windows and manages local OAuth, Runtime/Resume files, Wake Echo, and explicit Session transfer. See `studio/README.md` and the command `nuwa-studio-mcp --help`. Its operator-only `remote-bind` and `remote-revoke` commands are **not** required by the Remote MCP Skill-first onboarding. Studio's own fresh-process recovery still depends on its trusted local credential storage, not an OAuth account alone.

## Cloudflare and GitHub auto-deployment

The **existing** GitHub `main` push workflow `.github/workflows/verify.yml` runs TypeScript/server OAuth and MCP tests, real Wrangler local D1 migration/SQL scenarios, Python Studio tests on Linux and Windows, dependency audit and Worker bundle validation.

After all pass, the original deploy job uses existing GitHub Cloudflare Secrets, resolves the one canonical `nuwa-agent-relay-mcp` D1 by its exact Cloudflare name, refuses mixed or unknown schemas, migrates it, deploys the existing `nuwa-agent-relay-mcp` Worker and runs live read-only OAuth/Skill smoke.

**Dedicated storage:** `BINDINGS_DB` stores an irreversible provider-issued OAuth grant fingerprint, canonical Session identity, and AES-256-GCM encrypted Runtime **and** Resume tokens. The symmetric `SESSION_BINDING_KEY` is an existing Worker Secret retained across deployments. It must never be committed, logged or rotated without a deliberate credential migration. Agent Address and Relay are connected by the existing private Cloudflare service bindings. The MCP Worker has the same canonical custom domain; no long-lived Preview/V2 Worker or D1 is used.

See [Operations](docs/Operations.md) for resource details, deployment troubleshooting, and manual acceptance. No code change was made to MailTrigger SMTP, Archive, Routes, managed mailbox APIs, or its external `/v1/mailtrigger/receipt` webhook.

## Verification limitations

The real OAuth grant refresh scenario is tested through the Agent Address OAuth provider on a local Worker/D1. MCP server tests cover encrypted binding, correct Session isolation and private Runtime forwarding through actual MCP HTTP with controlled external services; CI also runs a real local D1 lifecycle. Production HTTP smoke checks Skill and OAuth authorization without creating accounts or sending email.

**Human acceptance still needed:** a GrokBot/OpenMausBot client must complete real OAuth, call Ensure automatically, provision a mailbox, send a true A→B→A email and trigger the correct receiving Bot. A successful CI or HTTP 200 cannot certify provider UI Thread continuity; Gateway PR #23 remains separate until its own integration tests.
