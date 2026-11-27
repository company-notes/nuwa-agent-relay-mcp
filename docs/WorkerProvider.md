# Studio Worker Provider — Rakazo pilot

This isolated pilot extends the existing Nuwa Remote MCP without changing the original Fleet Gateway or the message Inbox transport.

## Boundary

The remote assistant discovers approved tools through the ordinary Nuwa MCP endpoint. Studio alone reads the Windows user's protected Worker credential and invokes the fixed local `http://127.0.0.1:3791/mcp`. The shared `worker-provider.json` allowlist limits both cloud and local execution. The Gateway remains authoritative for project/model selection, workspaces, Job state, Git policy and delivery. The original Session Router Skill remains the routing policy.

The first transport is a dedicated authenticated HTTPS long-poll request/result channel, backed by a Cloudflare Durable Object per remote OAuth grant. A Studio request waits up to 20 seconds for work; no idle periodic cloud-to-local HTTP request or public local port is needed. Tool results are correlated with one outstanding request. A tool call times out after 45 seconds; the Studio never automatically replays a command after a transport failure. The original Gateway requestId is preserved for its idempotency contract.

## Windows setup and use

1. Install T3 Code, AI Worker Gateway and Nuwa Studio 0.2.14. Install the canonical [Session Router Skill](https://mcp.agent-relay.company-notes.com/skills/session-router/SKILL.md).
2. Connect the assistants to the ordinary Nuwa Remote MCP. Trusted assistants can share the same OAuth grant and Windows Worker. Retrieve each assistant's stable Bot ID (platform-qualified) or canonical Agent Address.
3. Ask the assistant to connect the local Worker. It creates and verifies its native webhook receiver if supported. Open the authorization link on the Worker computer and enter the one-time code (only if unpaired), assistantIdentity JSON, webhook URL and key in the same local page. Agent Address clients without a webhook leave both webhook fields empty and authorize manual status checks.
4. Studio verifies the receiver and registers this assistant in the encrypted Gateway registry. Retry a bad webhook key without another Worker code. For another assistant on a paired Worker, open the same local authorization page and register its own identity and receiver; do not replace the existing pairing.
5. Verify worker_provider_status and worker_notification_status({assistantIdentity}) with registered=true, and enabled=true for webhook clients, plus actual test receipt. Every work_start, worker_task_start and work_continue requires assistantIdentity. Studio resolves the private route; Gateway binds the Job or checks its existing route before forwarding. Verify notificationBound and actual callback delivery.
6. After restart, Gateway recovers the registry and Studio resumes the pairing. The assistant retrieves its own identity again without needing notification tokens. Reuse requestId after an uncertain dispatch; inspect existing work instead of automatically replaying.
7. Revoke remotely with owner approval or locally using worker revoke. Uninstall stops the owned task without deleting existing identities or Jobs. Revocation and disabling previously bound callbacks remain separate operations.

## Authorization boundary

The scope is an authenticated OAuth grant and the assistant identity, not a dedicated grant per Bot. Bot ID or Agent Address is caller-supplied routing metadata, not cryptographic proof of identity. Only trusted assistants may share a grant. A client able to supply another registered identity may use that route; the system cannot establish the true Bot behind a shared authorization. Separate grants are isolated. Per-Job read isolation is not provided.

Webhook credentials are entered only on the loopback Studio page and sent to the authenticated local Gateway registry endpoint. Remote MCP cannot register or overwrite receivers or supply raw route capabilities. Gateway derives a scoped private route, encrypts receiver settings, binds Jobs and checks continuation ownership. Old unbound Jobs are not reassigned automatically. Agent Address manual mode provides identity-based ownership without inventing a notification channel.

## Platform and acceptance

The Windows service uses a separate GUI-subsystem executable and a current-user Task Scheduler logon task, with no administrator privilege or exposed local port. The local authorization page is loopback-only, uses an unpredictable path and accepts same-origin form submissions. Pairing codes are not URLs, command-line arguments or logs. The official public landing page contains no code or credentials; the installed current-user protocol handler launches the fixed pairing command without forwarding the URL. The assistant must leave opening the link, code entry and confirmation to the owner.

The current AI Worker Gateway credential contract is Windows DPAPI. macOS and Linux retain their existing Studio messaging support; Worker service installation for those systems requires a supported local Gateway credential contract and verified launchd/systemd user-service integration. No non-Windows service is registered by this release.

The final release gate is the real Rakazo-to-T3 flow, including authorization, start/continue, delivery, combined notification authorization/test/receipt, independent Studio startup, recovery and revocation. The shared connection does not grant per-Job read access isolation.
