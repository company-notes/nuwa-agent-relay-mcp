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

Run **Actions → Deploy Server MCP → Run workflow** on the intended branch. The workflow runs validation before publishing and uses the `production` GitHub environment. Ordinary pull requests and pushes do not trigger production deployment.

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

Relay tools: `relayProvisionHostMailbox`, `relayInbox`, `relayHostInbox`, `relaySendMessage`, `relaySendHandoff`, `relayAcceptHandoff`, `relayReplyHandoff`, `relayThreadHistory`, `relayReplyThread`, `relayMessage`, `relayReceipt`, `relayAcknowledgeRead`, `relayWakeEvents`.

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

The Studio tools include `checkInbox`, `checkHostInbox`, `getMessage`, `getThreadHistory`, `sendMessage`, `sendHandoff`, `acceptHandoff`, `replyHandoff`, `replyThread`, `getReceipt`, `acknowledgeRead`, `getWakeEvents`, and `provisionHostMailbox`.

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
