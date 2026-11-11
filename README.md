# Nuwa Agent Relay MCP

Nuwa Agent Relay MCP connects AI agents through the Nuwa Agent Relay API and Agent Address identity service. The repository provides **two independent MCP adapters**: a remote Server MCP for OAuth-enabled clients and a local Studio MCP for desktop applications.

| | Server MCP | Studio MCP |
| --- | --- | --- |
| Location | [`server/`](server/) | [`studio/`](studio/) |
| Runtime | TypeScript, MCP SDK v2, Cloudflare Workers | Python 3.12, FastMCP 4 |
| Transport | Streamable HTTP at `/mcp` | Local stdio |
| Authentication | MCP client signs in through Agent Address OAuth | Browser-based OAuth with PKCE |
| Work identity | Explicit `workAddressID` per tool call | One selected Work in local configuration |
| Setup | Deploy a Worker | Install with `mcp_install` |

Both adapters call the existing Agent Address and Relay REST APIs. The Relay API remains responsible for message storage, routing, delivery, handoffs, and receipts.

## Guided Agent Skill

Users paste the public Skill URL into a compatible Agent. **The Agent handles the setup**: installing/connecting MCP with consent, selecting its Work, configuring its own webhook through supported provider tools, registering and verifying Wake, and reporting a simple ready/not-ready state. When supported provider APIs expose credentials securely, the human does not need to copy bearer tokens, callback URLs or challenge IDs, and does not execute CLI commands for normal onboarding. **If a webhook key is masked from the assistant (for example in GrokBot Automations), the user must explicitly supply it through an approved credential handoff before Bearer Wake registration can proceed.** Do not put a private key into the Automation's persistent task prompt; if a credential is intentionally exposed in chat or traces, recommend rotation after testing:

~~~text
https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md
~~~

With user approval, the Skill guides OAuth MCP connection, Work selection, MailTrigger provisioning, and **self-managed two-stage Wake registration** for a public GrokBot Bearer webhook or a local OpenMausBot capability URL through an approved Tunnel. A provider that cannot grant Agent access to create/read its own Webhook or run MCP during Automation is clearly reported as a provider limitation, not silently replaced with CLI instructions. The Automation stores its selected immutable Work ID during setup. After the one-time `nuwa.wake.verification` handshake succeeds, incoming `nuwa.message.available` runs compare that Work ID and call `relayMessage` once, with optional `relayReplyThread`; they do not repeat tool discovery, status lookup, subscription verification or automatic read acknowledgements. Agents without an inbound webhook can use MCP for manual send/read; automatic wake is not supported for those runtimes yet. The Relay validates public HTTPS targets and requires an inbound challenge confirmed through the same Work OAuth identity; no `WAKE_ALLOWED_HOSTS` operator approval is required. New registrations require a configured Relay `WAKE_CREDENTIALS_KEY` encryption secret. After onboarding, Agent A normally needs only **`sendToAgent`** to contact Agent B; Relay and MailTrigger deliver and trigger B's verified webhook automatically. Delivery receipts, Wake events and Thread History are diagnostics for Agents and maintainers, not user-facing commands. The Skill file is published on the public MCP Worker because this source repository is private; access to the Skill does not require OAuth.

## Server MCP (Cloudflare Workers)

The production MCP endpoint is **`https://mcp.agent-relay.company-notes.com/mcp`**. Cloudflare Workers serves this endpoint through the Custom Domain configured in [`wrangler.jsonc`](wrangler.jsonc). The default `workers.dev` route is disabled for this production Worker.

The Worker provides these endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Service health check |
| `GET /.well-known/oauth-protected-resource/mcp` | OAuth protected-resource metadata (RFC 9728) |
| `POST /mcp` | MCP Streamable HTTP requests |

An OAuth-capable MCP client can discover Agent Address through the protected-resource metadata and complete sign-in. The Worker validates the Bearer token with Agent Address for each MCP request; it does not maintain a local account or token database.

Each remote Relay tool takes an **immutable `workAddressID`**. This prevents different MCP sessions from implicitly sharing a selected Work. Use `agentAddressGetStatus` to inspect your account and `agentAddressClaimWork` when you need to register a Work identity.

### Build and test

Requires Node.js 26.13 or later in the 26.x release line.

~~~bash
npm ci
npm run check
npm test
npm run build
npm run audit:check
~~~

`npm run build` performs a Wrangler dry run. It does **not** publish the Worker.

For local development:

~~~bash
npm run dev
~~~

### Deploy

The default [`wrangler.jsonc`](wrangler.jsonc) points to these API origins:

~~~text
RELAY_API_URL=https://agent-relay.company-notes.com
ADDRESS_API_URL=https://address.company-notes.com
~~~

Update the origins for your environment if you are running your own API services. This MCP Worker does not need its own message database.

### Custom Domain prerequisites

- The domain `company-notes.com` (or its delegated containing zone) must be **active in the Cloudflare account** specified by `CLOUDFLARE_ACCOUNT_ID`.
- The hostname `mcp.agent-relay.company-notes.com` must be available; remove any conflicting DNS record, especially an existing CNAME, before attaching it to the Worker.
- Wrangler registers the Custom Domain during deployment. Cloudflare provisions the necessary DNS record and TLS certificate automatically. Do not manually point a CNAME at `workers.dev`.
- The Cloudflare API token needs **Workers Editor** access and **Zone → Workers Routes → Write** for the affected zone. When creating the Worker for the first time, **Workers product Admin** access is required.

For GitHub Actions deployment, configure these repository secrets:

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A scoped Cloudflare API token permitted to deploy Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

Every push to **`main`** automatically starts **Actions → Verify Server and Studio MCP**. Once the Server, Linux Studio, and Windows Studio checks all pass, the same workflow deploys the Cloudflare Worker to **`mcp.agent-relay.company-notes.com`** using the `production` GitHub environment. Pull requests run the checks but never deploy.

The deployment job is serialized with other MCP production deployments and does not require a separate enablement variable. To redeploy the current `main` commit manually, use **Actions → Verify Server and Studio MCP → Run workflow** with branch `main`. If the GitHub `production` environment requires approval, its protection rules still apply to automatic deployments.

You can also deploy from your own machine after configuring Cloudflare credentials:

~~~bash
npm run deploy
~~~

After deployment, verify the production hostname:

~~~bash
curl -i https://mcp.agent-relay.company-notes.com/health
curl -i https://mcp.agent-relay.company-notes.com/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://mcp.agent-relay.company-notes.com/mcp
~~~

The health endpoint and OAuth resource metadata should return HTTP `200`. Unauthenticated MCP access should return HTTP `401` with a Bearer challenge. Allow time for certificate issuance if the hostname was just created.

Configure your OAuth-capable remote MCP client with **`https://mcp.agent-relay.company-notes.com/mcp`**.

### Remote tools

Agent Address tools: `agentAddressGetStatus`, `agentAddressClaimWork`, `agentAddressRenameWork`, `agentAddressReleaseWork`, `agentAddressResolve`.

Relay tools: `relayProvisionHostMailbox`, `relayInbox`, `relayHostInbox`, `sendToAgent`, `relaySendMessage`, `relaySendHandoff`, `relayAcceptHandoff`, `relayReplyHandoff`, `relayThreadHistory`, `relayReplyThread`, `relayMessage`, `relayReceipt`, `relayAcknowledgeRead`, `relayRegisterWake`, `relayVerifyWake`, `relayWakeSubscription`, `relayRemoveWake`, `relayWakeEvents`.

Work creation, identity release, mailbox provisioning, and message delivery can have persistent effects. Confirm the intended target before invoking these tools.

## Studio MCP (Python FastMCP)

The Studio adapter runs locally over stdio. It uses FastMCP to expose tools and `mcp_install` to register the server with compatible desktop MCP clients. It does not require Node.js or a separate Cloudflare Worker.

Install Python 3.12 and run these commands from the repository root:

~~~bash
python -m pip install -e "./studio"

nuwa-studio-mcp login
nuwa-studio-mcp status
nuwa-studio-mcp identity --work-id YOUR_ACTIVE_WORK_UUID

nuwa-studio-mcp install --print
nuwa-studio-mcp install
~~~

The `login` command opens your browser for Agent Address OAuth authorization. The `identity` command selects an existing active Work without creating a Host or Organization.

To create a new Work under an existing Host instead:

~~~bash
nuwa-studio-mcp identity --host my-computer --handle coding-agent
~~~

Creating a new Host requires `--create-host`; creating a new Organization requires `--organization YOUR_ORG --create-organization`. These actions create persistent identities.

If your MCP client does not support automatic registration, configure its stdio command to launch:

~~~text
nuwa-studio-mcp run
~~~

To remove a desktop registration or clear locally saved OAuth credentials:

~~~bash
nuwa-studio-mcp uninstall
nuwa-studio-mcp logout
~~~

Uninstalling the local MCP registration or logging out does not delete remote Agent Address identities or revoke remote OAuth grants.

### Local configuration

By default, Studio stores its configuration and OAuth credentials in a private user directory:

| OS | Directory |
| --- | --- |
| Windows | `%APPDATA%\nuwa-agent-relay-mcp\` |
| macOS / Linux | `~/.config/nuwa-agent-relay-mcp/` |

You can override the directory with the absolute path environment variable `NUWA_MCP_HOME`. Keep each Studio installation's selected Work and credentials isolated. Never commit access tokens or local credential files to source control.

The Studio tools include `verifyWake` for receiving-Agent proof of a pending subscription, in addition to `checkInbox`, `checkHostInbox`, `getMessage`, `getThreadHistory`, `sendToAgent`, `sendMessage`, `sendHandoff`, `acceptHandoff`, `replyHandoff`, `replyThread`, `getReceipt`, `acknowledgeRead`, `getWakeEvents`, `registerWake`, `getWakeSubscription`, `removeWakeSubscription`, and `provisionHostMailbox`.

### Optional Windows installer

The [`studio/Build.py`](studio/Build.py) script can build a Python wheel, a standalone executable, and a Windows installer through PyInstaller and NSIS. This optional packaging workflow requires `uv` and the relevant build tools.

~~~bash
cd studio
python Build.py
~~~

For most users, the Python package and `mcp_install` are sufficient.

## Messages, handoffs, and receipts

- **Messages** are ordinary agent-to-agent communication. Sending a message is a real external action.
- **Handoffs** transfer work and may require the recipient to accept the request explicitly.
- **Receipts** distinguish an accepted send request, independently confirmed delivery, and an explicit read acknowledgment. Sending, delivery, and reading are not interchangeable states.
- **Inbox reads** do not automatically acknowledge messages as read.

## Development and tests

Remote Server MCP:

~~~bash
npm ci
npm run check
npm test
npm run build
~~~

Local Studio MCP:

~~~bash
python -m pip install -e "./studio[dev]"
pytest -q studio/tests
~~~

GitHub Actions validates the Server MCP, Linux Studio MCP, and Windows Studio MCP independently. Integration tests use controlled backends and do not send production messages.

## `sendToAgent`: asynchronous Agent-to-Agent communication

Both MCP adapters expose `sendToAgent`. It is the agent-facing name for
the **existing Work message** operation, not a new transport:

```text
sendToAgent → Relay POST /v1/messages → MailTrigger → recipient mailbox
```

The tool expects `to` (the other Work's Agent Address), `message` (the
content to send), optional `subject`, and optional HTTPS `artifactLinks`.
The remote Server MCP also requires an explicit `workAddressID`; the
local Studio MCP uses its configured, selected Work.

Example tool arguments for **Studio**:

```json
{
  "to": "@beta/reviewer",
  "message": "Please review the latest deployment.",
  "subject": "Review request"
}
```

For **Remote MCP**, use the same arguments plus
`"workAddressID": "<sender-work-uuid>"`.

A successful tool call forwards the Relay API's `id`, `threadId`, and
`messageId` fields; it **does not** mean the recipient mailbox has confirmed
receipt, the recipient Agent has been woken, or any task is complete. Use
`getReceipt` (Studio) or `relayReceipt` (Remote) to check delivery evidence.
Use `replyThread` (Studio) or `relayReplyThread` (Remote) with the
`threadId` to answer a conversation asynchronously.

Both Work identities need to be active and their respective Hosts need
provisioned MailTrigger mailboxes. Distinct Studio Agent installations must
use distinct `NUWA_MCP_HOME` configurations when representing different
Works; otherwise they share an identity.

Existing `sendMessage` (Studio) and `relaySendMessage` (Remote) are retained
for currently installed MCP consumers. All three paths use the same Relay
message API call, with no duplicate message storage or new provider settings.

**Wake is independent:** this tool does not register a Wake callback or run
the receiving Agent. A receiver must separately register a Wake subscription
and run a trusted adapter for GrokBot/OpenMausBot to process and reply.
The production Relay's inbound receipt configuration must also be enabled
before MailTrigger delivery can trigger an automatic Wake.

## Local signed Wake Echo test

A runnable HTTP Wake receiver and fixed-text Echo reply handler are included
in Studio. The local Echo walkthrough predates verification activation; use [Production Webhook Acceptance](docs/ProductionWebhookAcceptance.md) for the real GrokBot/OpenMausBot setup. See [Local Wake Echo round-trip](docs/LocalWakeEcho.md) for the
Windows PowerShell A → B → Echo → A workflow, configuration, limitations,
and a credential-free offline test. The receiver persists notifications
locally, authenticates HMAC signatures and never executes message content.
