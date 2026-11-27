# Studio Worker Provider — Rakazo pilot

This isolated pilot extends the existing Nuwa Remote MCP without changing the original Fleet Gateway or the message Inbox transport.

## Boundary

The remote assistant discovers approved tools through the ordinary Nuwa MCP endpoint. Studio alone reads the Windows user's protected Worker credential and invokes the fixed local `http://127.0.0.1:3791/mcp`. The shared `worker-provider.json` allowlist limits both cloud and local execution. The Gateway remains authoritative for project/model selection, workspaces, Job state, Git policy and delivery. The original Session Router Skill remains the routing policy.

The first transport is a dedicated authenticated HTTPS long-poll request/result channel, backed by a Cloudflare Durable Object per remote OAuth grant. A Studio request waits up to 20 seconds for work; no idle periodic cloud-to-local HTTP request or public local port is needed. Tool results are correlated with one outstanding request. A tool call times out after 45 seconds; the Studio never automatically replays a command after a transport failure. The original Gateway requestId is preserved for its idempotency contract.

## Windows setup and use

1. Install T3 Code and AI Worker Gateway on a Windows test Worker. Install Nuwa Studio 0.2.14 using Windows Setup.
2. Connect Rakazo to the normal Nuwa Remote MCP with an OAuth grant dedicated to this assistant. Install the canonical [Session Router Skill](https://mcp.agent-relay.company-notes.com/skills/session-router/SKILL.md).
3. Ask the assistant to connect the local Worker. It creates and verifies its native webhook-only Routine before requesting the one-time Worker code. Open the authorization link on the Worker computer, launch Studio and enter the code, webhook URL and key on the same local page. Authorize Worker access and automatic completion notifications together.
4. Studio verifies the webhook, persists the dedicated route and starts the background task. If webhook verification fails after pairing, retry notification authorization without another Worker code. For an existing dedicated pairing, use Connect Worker to complete missing notification authorization without replacing the pairing.
5. Verify worker_provider_status and worker_notification_status (managedByStudio=true and enabled=true), refresh tools and verify the test notification. Only then dispatch a Job. Studio inserts the private routing metadata automatically; confirm notificationBound=true. Continue the same Job and verify the actual receiver receives both completion events.
6. On restart, the local Gateway recovers the encrypted notification route and Studio resumes the authorized binding. Reuse the original requestId after an uncertain dispatch; inspect existing work instead of automatically replaying.
7. Revoke remotely with owner approval or locally using worker revoke. Uninstall stops the owned task without deleting existing identities or Jobs. Revocation and disabling previously bound callbacks remain separate operations.

## Authorization boundary

Automatic routing requires a grant dedicated to exactly one assistant and one Studio profile. The authenticated OAuth grant is not a verified per-Bot identity within a shared connection. Do not authorize a shared grant for a single Bot's receiver. Existing direct/shared clients with explicitly configured private notification routes retain their routes; no automatic migration or retroactive assignment of old Jobs is supported.

Webhook credentials are entered only on the loopback Studio page and sent to the authenticated local Gateway configuration endpoint. Gateway verifies the receiver, encrypts the settings, derives a stable per-connection route, binds new Jobs and verifies ownership before continuation. The assistant does not persist setupId, notificationSetupToken or notificationRouteId in managed mode. Completion events require a self-contained native Routine and must be verified separately from test events.

## Platform and acceptance

The Windows service uses a separate GUI-subsystem executable and a current-user Task Scheduler logon task, with no administrator privilege or exposed local port. The local authorization page is loopback-only, uses an unpredictable path and accepts same-origin form submissions. Pairing codes are not URLs, command-line arguments or logs. The official public landing page contains no code or credentials; the installed current-user protocol handler launches the fixed pairing command without forwarding the URL. The assistant must leave opening the link, code entry and confirmation to the owner.

The current AI Worker Gateway credential contract is Windows DPAPI. macOS and Linux retain their existing Studio messaging support; Worker service installation for those systems requires a supported local Gateway credential contract and verified launchd/systemd user-service integration. No non-Windows service is registered by this release.

The final release gate is the real Rakazo-to-T3 flow, including authorization, start/continue, delivery, combined notification authorization/test/receipt, independent Studio startup, recovery and revocation. The dedicated pilot does not grant per-Job access isolation.
