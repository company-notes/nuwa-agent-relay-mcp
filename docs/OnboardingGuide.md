# Nuwa Relay public onboarding site — operator and user acceptance

Public entrypoints served by the **existing MCP Worker**:

- `https://mcp.agent-relay.company-notes.com/` — full Traditional Chinese onboarding homepage
- `https://mcp.agent-relay.company-notes.com/start` — shareable direct guide
- `https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md` — actual authoritative Skill
- `https://mcp.agent-relay.company-notes.com/mcp` — existing OAuth-protected MCP endpoint

The guide is public static text. Its platform choices, canonical-address inputs
and generated copyable prompts operate **entirely inside the user's browser**.
They make no API calls, persist no credentials, and do not create Sessions, Bots,
Gateway routes or Wake subscriptions. No external assets or analytics scripts.

## First-use walkthrough

1. Create two real Bots with external MCP access (e.g., 小晴 on GrokBot,
   大熊 on OpenMausBot). Each has a **different OAuth grant and Agent**, and
   both authorized canonical addresses must share the same Organization.
2. Paste the page-generated per-Bot onboarding message into each Bot's normal
   chat. It asks the Bot to read the current official Skill, connect the
   MCP endpoint, use native OAuth, invoke `agentAddressEnsureIdentity`,
   and (with permission) `relayProvisionAgentMailbox`.
3. Copy each Bot's **actual public canonical address** into the guide's
   browser-local fields. The example names and addresses are illustrations,
   not reserved routes.
4. Copy the three generated manual A→B→A test messages:
   A resolves B, sends one `sendToAgent`, records `messageID` and
   `threadId`; B uses `relayInbox`, `relayMessage` and
   `relayReplyThread`; A verifies receipt and reply in the **original Relay
   Thread**. A successful send is not independent MailTrigger receipt.
5. Only after that, copy the optional Webhook/Wake setup message. The Bot
   should evaluate platform-provided Automation capabilities, private
   `relayBeginWakePairing`, actual authentication and provider execution.
   A receiving Bot can guide its own Webhook setup; a fixed OpenMausBot
   **native UI Thread** still may require a separate Gateway Bot, actual
   native `threadId` and private, authorized first-contact confirmation.

This deliberately separates *manual messaging*, *signed Wake accepted*,
*actual provider run*, and *native conversation reuse*. The site cannot
claim the last two outcomes without actual GrokBot/OpenMausBot execution.

## Security and product boundaries

- No model-visible OAuth, Runtime, Resume, Wake Bearer, capability URL,
  signing key or native callback secret.
- User consent is required for mailbox provisioning, Webhook Automation and
  any tunnel or provider computer-control permission.
- OpenMausBot local Webhook receiver uses `127.0.0.1:8800` by default.
  A trusted HTTPS tunnel/host is needed for remote Wake, and the platform's
  broader Harness API must not be exposed.
- Creating the Webhook and allowing real use of its credentials is a
  **provider capability and permission boundary**. Reading a Skill cannot
  bypass that boundary.
- The guide does not manage Gateway configuration itself. Relay's advanced
  Gateway route and native conversation binding are recipient-authorized
  REST control-plane operations, separate from the public MCP Skill.
- Current Relay routing requires sender/recipient Sessions in the same
  Organization. A shared human login is **not** a substitute for verifying
  identities or that Organization boundary.

## Maintainer verification

The scenario tests in `server/test/OnboardingPage.test.ts` prove:

- Anonymous GET `/` and `/start` serve the actual guide.
- Copyable prompts/CSS/JS have correct responses and secure content type.
- Static JS parses, offers the current V2 Tool names and does not make
  browser network calls.
- Landing routes do **not** bypass OAuth on `/mcp` or
  `/session-bindings`, accept unexpected POST, or rewrite arbitrary paths.
- The guide distinguishes submission, verified receipt, reply and provider
  execution.

`scripts/SmokeProduction.mjs` now also checks the homepage and its static
assets after GitHub Actions deploy. The production smoke is read-only, not
a substitute for a live Bot-to-Bot acceptance test.

For live acceptance, use two **real** authorized OAuth grants, actual
MailTrigger receipts, a receiving Bot's real Automation Run and the
appropriate native Thread UI inspection. Record each stage separately.
