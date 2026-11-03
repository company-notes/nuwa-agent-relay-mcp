# Nuwa Agent Relay MCP

This repository has two deliberately separate MCP adapters, following the original ReleaseBot design rather than reusing one stdio implementation for both environments.

| Component | Runtime | MCP transport | Deployment |
| --- | --- | --- | --- |
| Server MCP | Cloudflare Worker, MCP TypeScript SDK v2 | Stateless Streamable HTTP at /mcp | Wrangler / GitHub Actions |
| Studio MCP | Python FastMCP 4, mcp-install | Local stdio | Python wheel / optional Windows installer |

Agent Address handles OAuth, Organizations, Hosts, Work identities and address resolution. Nuwa Agent Relay API handles messages, handoffs, threads, D1 persistence, MailTrigger, receipts and wake delivery. Neither MCP adapter recreates those services. Server and Studio are separate runtimes and share the REST API contract, not copied persistence/business logic.

## Remote Server MCP

Connect an OAuth-capable MCP client to your deployed Worker at /mcp, for example:

    https://agent-relay-mcp.company-notes.com/mcp

That URL is a proposed hostname, NOT active until configured and deployed. If you do not configure a custom domain, use the actual Workers.dev hostname. The Worker exposes the OAuth Protected Resource metadata at:

    https://agent-relay-mcp.company-notes.com/.well-known/oauth-protected-resource/mcp

The OAuth authorization server is Agent Address. On each request, the MCP Worker validates the caller's Bearer token against the Agent Address account endpoint and forwards that token to existing REST APIs. It stores no OAuth secrets or session database.

Every remote relay_* tool requires a workAddressId parameter: the immutable Work UUID returned by agentAddressClaimWork or obtained from agentAddressGetStatus. This is intentional: two remote agent sessions must not implicitly share a global selected Work. The Relay API independently validates that the Work belongs to the OAuth account.

The remote MCP includes identity tools, 14 original Relay operations, alias management and wake subscription tools. Registering an alias never verifies it; the operator-protected alias verification endpoint is not an MCP tool. A successful outbound MailTrigger submission does not imply receipt or read acknowledgment.

### Cloudflare/GitHub deployment

Under GitHub repository Settings > Secrets and variables > Actions, configure:

| Kind | Name | Required / value |
| --- | --- | --- |
| Secret | CLOUDFLARE_API_TOKEN | Required, scoped Worker deployment and routing permissions |
| Secret | CLOUDFLARE_ACCOUNT_ID | Required, the owning Cloudflare account ID |
| Variable | CLOUDFLARE_CUSTOM_DOMAIN | Optional, suggested agent-relay-mcp.company-notes.com |
| Variable | CLOUDFLARE_WORKER_NAME | Optional, default nuwa-agent-relay-mcp |
| Variable | ADDRESS_API_URL | Optional, default https://address.company-notes.com |
| Variable | RELAY_API_URL | Optional, default https://agent-relay.company-notes.com |
| Variable | MCP_DEPLOY_ENABLED | Optional, set true for automatic main-branch deployment; absent/false by default |

Create the GitHub Actions production environment if your organization restricts or requires approval for production jobs. Configure the Cloudflare DNS zone to permit a Worker custom domain (no conflicting routes/CNAME records). This Worker needs no D1/KV/MailTrigger secret; those belong to the already deployed Agent Address and Relay API services.

Deployment is manual by default: Actions > Deploy Nuwa MCP Worker > Run workflow. It verifies the remote and Studio tests before uploading the Worker. Enable automatic production deploys explicitly with MCP_DEPLOY_ENABLED=true. This repository does not deploy the two upstream services.

Local remote development (Node 26.13+):

    npm ci
    npm run check
    npm test
    npm run audit:check
    npx --yes wrangler@4.38.0 dev

Manual deployment with an existing Cloudflare credentials environment:

    node scripts/prepare-deploy.mjs
    npm run deploy

A successful deploy only proves that the Worker was uploaded. Actual email arrival still depends on the existing Relay/MailTrigger configuration and live integration validation.

## Studio MCP (Python FastMCP + mcp_install)

The Studio app is a separate installable Python project in studio/, not a second TypeScript stdio server. Python FastMCP automatically generates MCP tool schemas and handles stdio, while mcp_install registers or removes local MCP clients. Existing REST API semantics remain unchanged.

Python 3.11+ required; 3.12 recommended:

    python -m pip install ./studio
    nuwa-agent-relay-mcp login
    nuwa-agent-relay-mcp status
    nuwa-agent-relay-mcp identity --work-id YOUR_OWN_ACTIVE_WORK_UUID
    nuwa-agent-relay-mcp install --print
    nuwa-agent-relay-mcp install --overwrite

Browser login uses Agent Address OAuth with authorization code + PKCE and a loopback callback, then privately stores its access/refresh tokens. Instead of selecting an existing Work, create one explicitly:

    nuwa-agent-relay-mcp identity --host mypc --handle coder

If the Host does not exist, add --create-host; if no Organization exists, specify --organization SLUG --create-organization. These operations create permanent Agent Address resources. Neither logout nor uninstall releases them.

If your MCP client is unsupported by mcp_install, configure its stdio command directly:

    nuwa-agent-relay-mcp run

To remove registration:

    nuwa-agent-relay-mcp uninstall

Different Studio agent sessions must not inadvertently share one Work. Set a unique NUWA_MCP_PROFILE for each local client and use the same profile for login, identity and run. Profiles live at the user config directory (Windows APPDATA or Linux/macOS .config), under nuwa-agent-relay-mcp/profiles/PROFILE.json. On POSIX, file mode is 0600 and parent folder mode is 0700. NUWA_MCP_HOME overrides the root directory with an absolute path. Controlled non-interactive agents may use NUWA_ACCESS_TOKEN and NUWA_WORK_ID environment variables; never commit real credentials or put them in published MCP config.

Studio packaging from studio/:

    python Build.py

This follows the original ReleaseBot wheel > PyInstaller onefile > NSIS Windows installer sequence. Build requires uv, PyInstaller and, on Windows, NSIS. The intended output is studio/dist/NuwaAgentRelayStudioSetup.exe. CI checks a wheel build but does not compile or validate the Windows installer.

## Tests and principles

Follow CODE_PRINCIPLES.md and TESTING.md: OO, DRY, one concern per class, camelCase identifiers, fail-fast errors, non-redundant tests and regression red/green. The remote tests exercise Streamable HTTP against fake external REST endpoints. Studio tests use real in-process FastMCP with isolated mock HTTP transport. Neither suite claims to validate live MailTrigger delivery.

    npm test
    cd studio
    python -m unittest discover -s tests -p '*Test.py' -v

The old Node-based stdio MCP was removed in favor of Python Studio FastMCP. No production credentials or legacy database state were migrated.
