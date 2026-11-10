# Production Webhook Onboarding — Agent-Driven Acceptance

This document describes the **product experience**, not a manual diagnostic script. Nuwa's official production Relay and MailTrigger handle every message; the user should not need to operate a local Relay, inspect Work IDs, manually register a callback or run CLI commands.

## What the human does

1. Give the receiving Agent the [Nuwa Skill](https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md) and ask it to install and configure Nuwa.
2. Approve the Agent Address OAuth connection and any necessary identity, mailbox, Webhook Automation or Tunnel permissions. **The Agent itself** creates/reads its webhook, fills `relayRegisterWake` and completes `relayVerifyWake`. The user should always see what connection, identity, Automation and public hostname were configured. Only credential values and secret URL path components are redacted. The Agent should obtain and transfer secrets through trusted tools rather than requiring them to be pasted in chat.
3. Ask a different, Nuwa-connected Agent A to send a message to the receiving Agent B. **Agent A calls `sendToAgent`**. No special smoke-test commands.
4. If B is configured to respond to the message, the reply arrives through the same Nuwa conversation. The Agents may inspect Relay Receipt, Wake events and Thread History with MCP as needed; those are not steps for the human.

User-facing requests can be as short as:

> “Install this Skill, connect yourself to Nuwa, and set up automatic incoming messages. Ask for permissions only when necessary: https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md”

> “Send a message to my GrokBot / OpenMausBot through Nuwa and ask for a reply.”

## What the receiving Agent does

### GrokBot / Cursor Automation (public HTTPS)

The receiving Agent uses the provider's supported setup interface to create a Webhook-triggered Automation, with the same Nuwa MCP Work available during that Automation's actual webhook-triggered run. The provider supplies the callback and sender key. **The Agent passes them directly** to `relayRegisterWake` with `authMode: "bearer"` and uses the provider's Automation to handle the `nuwa.wake.verification` event with `relayVerifyWake`.

The Automation also handles `nuwa.message.available`: read the authorized message with `relayMessage`, avoid duplicate processing and respond through `relayReplyThread`. A webhook POST accepted by the provider is not evidence that the model completed a run.

Do not ask the human to manually copy the Webhook URL or Bearer key. If the provider **does not expose** a supported way for the Agent to create an Automation or access the credential, tell the human which *single* authorization or feature is required. Never claim that Skill instructions can bypass a provider's permission model.

### OpenMausBot desktop (local capability webhook)

The receiving Agent creates or selects its own local Webhook Automation. After the human approves a trusted Tunnel, the Agent installs/configures/starts it through the vendor's official tools, exposing only the local webhook receiver on port 8800. It transforms its private localhost callback to a private HTTPS callback without asking the human to copy the secret path, then calls `relayRegisterWake` with `authMode: "capability"`.

The OpenMausBot webhook-triggered run receives the verification event, calls `relayVerifyWake` for the same Work, and later handles message events using its authenticated Nuwa MCP. A stable, actively running Tunnel is needed for a local machine; hosted OpenMausBot with an existing public callback needs no Tunnel.

If any previous real local hook URL has appeared in chat or logs, rotate it before reuse. Do not expose the broader OpenMausBot harness API.

### No native webhook

Message sending and manual reading remain possible with MCP. Automatic Wake is not supported yet; do not silently install a new background agent listener.

## The normal acceptance criterion

The human asks A to send one real message. **One `sendToAgent` call** should cause one MailTrigger delivery and, after a genuine recipient Receipt, automatic dispatch to B's verified webhook. B's real Agent runtime fetches the message and, if asked, replies using its own Nuwa MCP.

Submission, MailTrigger arrival, webhook acceptance, Agent execution and reply are distinct facts. Agent A may diagnose them **through its tools** if the reply does not arrive, without making the human run five commands or resend a message blindly.

## One-time Nuwa service operator prerequisite

Before enabling new registrations, the Relay API's Cloudflare Worker must have a stable 32-byte hex `WAKE_CREDENTIALS_KEY` secret for encrypted third-party webhook credentials. The API repository's GitHub Actions deployment applies the private secret. This is **an operator task once per service**, not something an end user or their Agent should manage.

The production configuration retains the existing `MAILTRIGGER_RECEIPT_URL=https://agent-relay.company-notes.com/v1/mailtrigger/receipt`, `MAILTRIGGER_INBOUND_KEY`, `MAILTRIGGER_API_URL`, and verified `goodsfind.info` managed domain. No `WAKE_ALLOWED_HOSTS` operator allowlist exists in the new flow.

MailTrigger does not need to know whether the receiving Agent is GrokBot or OpenMausBot. It only handles message delivery and its existing recipient Receipt Action; Relay handles the verified webhook Wake.

## Maintainer-only troubleshooting

If automatic receipt/reply fails, maintainers should inspect the actual provider Automation run and its MCP authorization, the B Work's `relayWakeSubscription`, MailTrigger receipt via `relayReceipt`, Wake delivery via `relayWakeEvents`, and the reply in `relayThreadHistory`. Do not present these internal checks as the user's installation process. The local fixed-text Echo listener is a test fixture, not the real GrokBot/OpenMausBot runtime.
