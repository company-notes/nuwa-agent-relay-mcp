# Nuwa Agent Relay MCP — V2 Agent / Session

Nuwa Agent Relay MCP adapts the Agent Address V2 identity API and the Relay V2 messaging API to AI clients. There are two independent adapters:

| Adapter | Interface | Runtime authentication |
|---|---|---|
| **Remote MCP** | Cloudflare MCP at `https://mcp.agent-relay.company-notes.com/mcp` | OAuth and Session Runtime capability supplied to the Relay tool |
| **Studio MCP** | Local Python FastMCP CLI / stdio, Windows and desktop support | OAuth and locally stored, private Session Runtime capability |

The identity hierarchy is **Organization / Agent / Session**. An Agent may have multiple Sessions. Each Session has a unique canonical address and an exclusive active Runtime lease. A Relay Thread is cross-platform conversation history; it does not recreate a recipient Bot application's UI conversation.

> **Status:** V2 work is a Draft and is **not deployed**. In particular, Remote MCP's model-facing Runtime capability argument is unsafe for production clients that record tool traces. See [the security blocker](https://github.com/company-notes/nuwa-agent-relay-mcp/issues/24). Use only environments with an approved secret-safe integration. Never paste Runtime capabilities in model chat or ordinary MCP arguments.

## Remote MCP

The public Agent Skill is available at `https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md` after V2 deployment; the checked-in source is [skills/nuwa-agent-relay/SKILL.md](skills/nuwa-agent-relay/SKILL.md).

OAuth is handled by Agent Address. Directory tools include:

- `agentAddressGetStatus` (Account and Organization)
- `agentAddressListAgents`, `agentAddressListSessions` (identity discovery)
- `agentAddressResolve` (known full or Agent shorthand address)

Relay tool functions include `relayProvisionAgentMailbox`, `relayInbox`, `relayAgentInbox`, `relayMessage`, `relayThreadHistory`, `sendToAgent`, `relayReplyThread`, `relaySendHandoff`, `relayAcceptHandoff`, `relayReplyHandoff`, `relayReceipt`, `relayAcknowledgeRead`, and the Wake pairing/verification/subscription tools.

Every Remote Relay tool currently requires an **immutable Session ID** and **Runtime capability**, in addition to the MCP OAuth principal. The Relay API performs the actual lease verification; remote tool arguments are not a substitute for authentication. Remote claim or Resume is intentionally **not** exposed as a model-facing tool that could reveal its credential in the result.

Ordinary messages may be sent to `organization/agent/session` or the Default Session shorthand `organization/agent`. New sends create a new Relay Thread; replies must reuse the `threadId`. An Agent-targeted Handoff is separately accepted by one participating Session, without affecting sibling Sessions.

## Studio MCP

The local Studio adapter is a Python 3.12+ package with a FastMCP server. It keeps OAuth credentials and active Session Runtime capabilities separately in private files under `NUWA_MCP_HOME` (or the platform-specific user configuration directory).

Install locally from the repo:

```sh
python -m pip install ./studio
nuwa-studio-mcp login
nuwa-studio-mcp identity --create --agent-name example-agent --session-name main
nuwa-studio-mcp status
nuwa-studio-mcp run
```

On claim, Studio stores the returned Resume capability in a separate private local file. Explicitly run `nuwa-studio-mcp identity --resume-session-id <uuid>` to resume that selected Session later; for a Session without an existing local Resume file, use `--resume-token-env RESUME_TOKEN` with the secret held in your environment. Never print or paste Resume credentials into chat. A fresh Codex process normally creates a fresh Agent unless the user explicitly authorizes Resume.

The `nuwa-studio-mcp install` and `uninstall` commands manage local desktop MCP registration; `--print` can inspect the installer plan.

Other commands: `send-to-agent --to <address> --message <text>`, `thread --thread-id <uuid>`, `receipt --message-id <uuid>`, `provision`, `round-trip --to <address>`, and `wake register|verify|status|unregister|listen`. **Provision** creates or reuses external managed mailbox resources through the existing MailTrigger client and requires the user's approval.

The Studio signed Wake listener validates a signed `nuwa.message.available` payload containing `messageId` and `sessionID` and performs a fixed, non-executing Echo test. It must not treat arbitrary incoming message text as executable instructions. `nuwa-studio-mcp logout` clears local OAuth, Runtime, Resume and Wake secrets; remotely registered subscriptions and OAuth grants may remain active, so unregister the callback first if it should stop receiving deliveries.

## MailTrigger boundary

No MailTrigger code, SMTP API, managed routing API or incoming webhook contract changes are needed for V2. MailTrigger only handles sending and receiving email. Relay D1 associates one transport mailbox with an Agent and one notification/subscription with a Session. The Relay webhook URL remains `/v1/mailtrigger/receipt` solely to preserve the external MailTrigger Route configuration.

Do not equate submission to MailTrigger with its independently authenticated arrival, nor a Wake 2xx with actual Bot execution.

## Testing and deployment

For Remote Server:

```sh
npm ci
npm run check
npm test
npm run build
```

For Studio:

```sh
python -m pip install './studio[dev]'
python -m pytest studio/tests
```

CI covers Node Remote MCP tests, Studio Linux and Studio Windows. The tests verify V2 HTTP paths, Session Runtime forwarding, private local secrets, Handoff and signed Wake/Echo. They do **not** prove production MailTrigger delivery or that a provider actually starts an Agent after a Wake. Use the isolated Relay staging smoke and a separate real provider integration acceptance.

**Do not merge or deploy** this Draft until the Runtime-credential safety issue is resolved, Agent Address V2 and Relay V2 have compatible staging instances, and the end-to-end Bot execution path is verified. Production OAuth and existing MailTrigger integrations remain untouched.
