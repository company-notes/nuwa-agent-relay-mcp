# Local A → B → Echo → A test (signed Wake, no Bot required)

> **Verified Wake registration update:** Production Relay now uses pending-challenge registration. The Echo steps below document the pre-verification local test sequence and **cannot alone activate a new subscription**. For real GrokBot/OpenMausBot webhook onboarding use [Production Webhook Acceptance](ProductionWebhookAcceptance.md). Running the offline Echo tests below remains supported; do not present this historical local-only walkthrough as a production acceptance test. A verified HMAC subscription must already be active for Echo Wake delivery.

This is a **real end-to-end test procedure** for the local Nuwa Relay Worker,
the local MailTrigger stack, Studio MCP and the signed incoming Wake adapter.
The fixed-text Echo handler is a deliberately simple test Bot; it **never
executes instructions from the received message**. You do not need GrokBot,
OpenMausBot, NATS or another IM server.

The fast **offline test** can be run immediately with no credentials:

~~~powershell
python -m pip install -e "./studio[dev]"
python -m pytest -q studio/tests/test_wake_receiver.py
~~~

It uses a real loopback HTTP listener and a real Relay HTTP client with a
controlled external-service substitute. It verifies HMAC rejection, Work
isolation, durable queuing, duplicate Wake suppression and a replyThread
round-trip. It is **not** evidence of MailTrigger B's real receipt.

## Prerequisites for the real local round-trip

1. Two active, different Agent Address **Work IDs** in the same Organization.
   Each must have a Host mailbox provisioned in **the same local Relay D1**
   and local MailTrigger instance. You can create the identities with the
   existing Studio OAuth CLI. The mailboxes must be able to deliver via
   MailTrigger's local Internal Fast Path.
2. The local MailTrigger stack: Django, SQLite, SMTP, Redis and separate
   routes/support Celery workers, as described in the MailTrigger/Nuwa local
   handoff. Set the two queue suffixes consistently. **Do not point the local
   test at production MailTrigger data.**
3. The Nuwa Relay API \`wrangler dev\` instance with **local D1** and its
   local \`.dev.vars\`; a public HTTPS Cloudflare Quick Tunnel forwards to
   \`http://127.0.0.1:8787\`. The Relay and MailTrigger must be able to
   reach the reverse tunnel from the recipient Webhook.
4. Another **distinct** public HTTPS Quick Tunnel to this Echo listener on
   \`http://127.0.0.1:8765\`. This hostname must be in the local Relay's
   \`WAKE_ALLOWED_HOSTS\`.
5. Install Python 3.12 and the Studio package in this MCP repo:

~~~powershell
python -m pip install -e "./studio[dev]"
~~~

**Do not modify production \`MAILTRIGGER_API_URL\` or production D1**, or
write secrets into Git, SVN, documentation, shell history or chat.

### Prepare the local Relay environment

For the **Relay API repo** local \`.dev.vars\`, set:

~~~dotenv
MAILTRIGGER_API_URL=http://127.0.0.1:8000
MAILTRIGGER_AUTH_SCHEME=Token
MAILTRIGGER_MANAGED_DOMAIN=nuwa-local.test
MAILTRIGGER_API_TOKEN=<local MailTrigger test token>
MAILTRIGGER_INBOUND_KEY=<a new private random key>
MAILTRIGGER_RECEIPT_URL=https://<relay-tunnel>.trycloudflare.com/v1/mailtrigger/receipt
WAKE_ALLOWED_HOSTS=<wake-tunnel>.trycloudflare.com
~~~

These are only for **local** \`wrangler dev\`; never put a Quick Tunnel URL into
production. Start or restart \`wrangler dev\` **after** saving \`.dev.vars\`.

For example, start the two tunnels in separate Windows PowerShell windows:

~~~powershell
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8765
~~~

Save the two **different** \`trycloudflare.com\` origins. The first is Relay,
the second is the receiver.

The local MailTrigger \`.test\` domain may lack SPF/DKIM and reject automatic
sender RelaySMTP Route creation. **This is an upstream local-environment
limitation, not a Wake problem**. Use the already verified local MailTrigger
sender-route setup from your local handoff, or use a genuinely verified
test domain before interpreting a provisioning failure as a receiver bug.
Always confirm that the recipient mailbox's \`NAR receipt\` Route calls this
local Relay tunnel and its \`Receipt\` secret.

### Two separate Work identities

In terminal A (sender):

~~~powershell
$env:NUWA_MCP_HOME = "$env:TEMP\nuwa-mcp-a"
$env:NUWA_RELAY_URL = "https://<relay-tunnel>.trycloudflare.com"
nuwa-studio-mcp login
nuwa-studio-mcp identity --work-id <A-work-uuid>
nuwa-studio-mcp provision
~~~

In terminal B (receiver), with a **different** config directory and Work:

~~~powershell
$env:NUWA_MCP_HOME = "$env:TEMP\nuwa-mcp-b"
$env:NUWA_RELAY_URL = "https://<relay-tunnel>.trycloudflare.com"
nuwa-studio-mcp login
nuwa-studio-mcp identity --work-id <B-work-uuid>
nuwa-studio-mcp provision
nuwa-studio-mcp wake register "https://<wake-tunnel>.trycloudflare.com/wake"
nuwa-studio-mcp wake status
~~~

\`wake register\` calls the selected Work's Relay \`POST /v1/wake-subscription\`
and saves its one-time HMAC signing secret privately in
\`NUWA_MCP_HOME\wake.json\`; it does **not** print or send the secret to the
model. The secret is scoped to both the current Work and Relay origin.
On non-Windows platforms it is written with mode \`0600\`.

The callback URL must end exactly in \`/wake\` and use HTTPS. Changing
the tunnel hostname or re-registering rotates the secret: restart the
listener afterwards.

### Run B's receiver, then send from A

In terminal B, **start the receiver before sending**:

~~~powershell
nuwa-studio-mcp wake listen --port 8765
~~~

In terminal A, the **single-command round-trip acceptance test** is:

~~~powershell
nuwa-studio-mcp round-trip --to "@beta/reviewer" --timeout 45
~~~

This sends **one** real message, then checks the same message's Receipt and
Thread history until **both** B's authenticated Webhook receipt and the
Echo reply exist. These diagnostic checks query Nuwa D1, not MailTrigger's
Archive. On timeout it prints the message ID, thread ID and which evidence
is missing. It will **not resend** the original message.

For a manual send without waiting, use:

~~~powershell
nuwa-studio-mcp send-to-agent --to "@beta/reviewer" --message "Local test: are you there?"
~~~

Replace the target with **B's actual Agent Address**, not B's Work UUID.
Save the returned \`id\` and \`threadId\` from the JSON output.

B's receiver should log a message ID, send a fixed reply of the form
\`Nuwa local echo receipt for <messageId>\`, and not execute the original text.
From terminal A:

~~~powershell
nuwa-studio-mcp receipt --message-id <message-uuid>
nuwa-studio-mcp thread --thread-id <thread-uuid>
~~~

Acceptance conditions:
- The sender's receipt reports \`submissionStatus=sent\`,
  \`arrivedInMailTrigger=true\`, \`receiptSource=webhook\`.
- B's local Echo HTTP listener accepted a **signed** Wake for the same message,
  the local Inbox has completed processing and its log shows the response.
- A's Thread history contains **B's reply**. A sender's successful HTTP
  submission by itself proves neither delivery nor Wake.
- No Archive refresh or Archive polling is needed.

A receiving Work can also use \`getWakeEvents\` (Studio MCP) or
\`relayWakeEvents\` (remote MCP) to inspect signed notification retries.

### Failure recovery

- \`wake register\` fails with \`callback_not_allowed\`: set local
  \`WAKE_ALLOWED_HOSTS\` to the **exact wake tunnel hostname**, then restart
  \`wrangler dev\`.
- No \`receivedAt\`: check MailTrigger B's incoming \`NAR receipt\` Route,
  its URL and inbound key. A send HTTP 201 is insufficient.
- \`sent\` but no Echo: check that B registered before the receipt arrived,
  that the listener is still running, the tunnel still points at port 8765,
  and the Work is correct. Failed callbacks can be retried by Relay's Cron.
- A local Echo message may be processed **at least once** if a process crashes
  after a successful reply but before persisting completion. The Echo
  handler checks existing Thread history by message ID to avoid duplicates.
- \`NUWA_RELAY_URL\` must be a clean **HTTPS origin**, not
  \`http://127.0.0.1:8787\`. Local Relay is reached through the public
  temporary tunnel to preserve the Studio client's HTTPS validation.
- If \`wake status\` shows a subscription but no local signing key, call
  \`wake register\` again while the same Work and origin are selected.
- **Do not run two listeners** against the same \`NUWA_MCP_HOME\` at once.
  This local test receiver uses one durable SQLite Inbox per Studio config.

When done, stop B's listener and run:

~~~powershell
nuwa-studio-mcp wake unregister
~~~

This removes B's Relay subscription and local HMAC key. The message
history and local test Inbox are not deleted by that command.
Use the Relay smoke cleanup tools only for Host/Work identities created
specifically by their safe smoke runner.

## What this does NOT do yet

This Echo process is a full local transport-and-reply test, **not** a live
GrokBot or OpenMausBot execution adapter. Those runtimes need their own
platform-specific inbound Webhook integration, job state and response
handling; no LLM execution is implied by the Echo's successful reply.
