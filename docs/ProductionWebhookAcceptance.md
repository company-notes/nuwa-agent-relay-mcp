# Production GrokBot / OpenMausBot verified Wake acceptance

This uses the **production Nuwa Relay and production MailTrigger**. No local Relay Worker, D1, Django MailTrigger, or new messaging broker is needed.

## Operator readiness (once)

- The Relay must have `MAILTRIGGER_RECEIPT_URL=https://agent-relay.company-notes.com/v1/mailtrigger/receipt` and its existing private `MAILTRIGGER_INBOUND_KEY`; `goodsfind.info` must be verified as `MAILTRIGGER_MANAGED_DOMAIN`. Do **not** replace the live `MAILTRIGGER_API_URL`.
- The Relay also requires a new, dedicated Cloudflare Worker secret `WAKE_CREDENTIALS_KEY`, holding **64 hexadecimal characters (32 random bytes)**. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`, and put it in GitHub Actions → Secrets for the Relay API repository. Never paste the secret in chat, source control, shell history or logs. GitHub deploy will apply it with `wrangler secret put`.
- The D1 migration `0004_verified_wake.sql` must have run before the new Worker deploy. The GitHub Actions workflow performs this before deployment. No `WAKE_ALLOWED_HOSTS` variable is needed.
- The remote MCP Worker and public Skill URL must be at the companion updated version.

## B: GrokBot / Cursor Automation (cloud Webhook)

1. In the target Bot's owner conversation, install the Nuwa Skill and connect `https://mcp.agent-relay.company-notes.com/mcp`. Sign in and select one active B Work ID with `agentAddressGetStatus`. Explicitly approve `relayProvisionHostMailbox`.
2. Ask the Bot to create a Webhook-triggered Automation that can call Nuwa MCP tools **in the triggered run**. Give its instructions the two branches `nuwa.wake.verification` → `relayVerifyWake`, and `nuwa.message.available` → `relayMessage`, process and `relayReplyThread`. Confirm this is a real runnable Automation, not simply a remembered prompt.
3. Obtain the Automation's `POST to` URL and `key` via the platform's secure UI. If no safe way exists to pass the sender key to the MCP call, do not paste it into chat. Use an approved secret transfer mechanism.
4. With approval, call `relayRegisterWake({workAddressID:B,callbackURL:"<actual HTTPS URL>",authMode:"bearer",bearerToken:<private sender key>})`. Nuwa will send a single verification POST with `Authorization: Bearer <key>`.
5. The Automation extracts the event's `verificationId` and `challenge`, confirms with `relayVerifyWake` using B Work OAuth, and returns a non-secret status. `relayWakeSubscription` must show `enabled:true` and `pending:null`. A HTTP 200 from the Automation does not mean verification succeeded.

## B: OpenMausBot desktop (local secret Webhook)

1. Install Nuwa Skill in B's owner Bot chat; connect Nuwa MCP using B's own Work, approve provisioning.
2. Create a Webhook Automation. The local product typically listens on `http://127.0.0.1:8800/hooks/<secret-path>`. A **real path is a secret**; rotate any path already shared.
3. Start a trusted, user-approved Tunnel to **only** the dedicated webhook receiver, such as `cloudflared tunnel --url http://127.0.0.1:8800` for a **temporary** test or a stable ngrok / Cloudflare named Tunnel. Never expose OpenMausBot's main harness `8799`.
4. Combine the actual Tunnel HTTPS origin with OpenMausBot's existing secret `/hooks/...` path. Do not expose full URL in chat. Confirm the Tunnel and local OpenMausBot app are running.
5. Call `relayRegisterWake({workAddressID:B,callbackURL:<complete private HTTPS hook URL>,authMode:"capability"})` using an approved private tool input path. A challenge POST must reach OpenMausBot. Its Webhook Automation, not the HTTP response, must call `relayVerifyWake` with B Work OAuth to activate.
6. For OpenMausBot **My Cloud**, use its already public HTTPS webhook directly; skip local Tunnel.

## A → B → A: production check

1. In a separate authenticated A Work, approve `relayProvisionHostMailbox` and call `sendToAgent` exactly once to B's actual Agent Address, using an innocuous unique marker such as "Nuwa production wake smoke test".
2. Save the message and thread identifiers. Call `relayReceipt` on A's Work; require `submissionStatus:"sent"`, `arrivedInMailTrigger:true`, `receiptSource:"webhook"`.
3. Inspect B's `relayWakeEvents` and the Bot's **real** Automation run history for `nuwa.message.available` with the same Message ID. A successful Wake POST alone proves only that the provider accepted the request.
4. The B Agent retrieves the real message through `relayMessage` and replies using `relayReplyThread`. Check A's `relayThreadHistory` for that reply. This is the acceptance criterion for a real Agent execution.
5. If timed out, inspect Receipt, Wake state, provider run log and reply separately; do not re-send the same original message blindly.

MailTrigger only handles A→B email transport and B receipt; it does not call GrokBot/OpenMausBot directly and needs **no new feature** for these webhook adapters. Its existing recipient-side `NAR receipt` Webhook Route must be enabled. If the Work's MailTrigger mailbox or route cannot be provisioned on `goodsfind.info`, that is a separate provider-side issue to diagnose.

### Studio MCP local CLI

Use your own configuration directory and B Work. Commands are:

```powershell
$env:NUWA_RELAY_URL = "https://agent-relay.company-notes.com"
nuwa-studio-mcp login
nuwa-studio-mcp identity --work-id <B-WORK-UUID>
nuwa-studio-mcp provision

# For a private OpenMausBot URL, omit the positional URL to enter it without terminal echo.
nuwa-studio-mcp wake register --auth-mode capability
nuwa-studio-mcp wake status

# If your Agent receives the challenge and cannot call MCP itself,
# the owner can verify using the private one-time challenge.
nuwa-studio-mcp wake verify --verification-id <VERIFICATION-UUID>
nuwa-studio-mcp wake status
```

Do not type a secret capability URL directly into a command line, or a Bearer key into shell history. The CLI prompts privately when omitted. The existing `wake listen` is a fixed-text Echo test receiver and is **not** a GrokBot/OpenMausBot executor.
