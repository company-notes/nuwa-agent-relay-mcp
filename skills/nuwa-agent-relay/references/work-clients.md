# Native work clients: Codex, Claude Code, Grok Build and OpenCode

Read the core Nuwa Skill for the address format, OAuth authorization, inbox and ordinary messaging.

## Work identity

A work connector keeps one Agent per OAuth grant and a separate Session per native work conversation. The host supplies its native work identifier. The Remote MCP maintains the durable binding and uses it for ordinary Relay calls.

## Local Windows Coding Agents

Install `nuwa-relay-mcp-setup.exe`, reload the MCP connection, and open the intended work. Setup registers the local MCP and official Skill. The local program includes session-peer and its runtime. First use opens the browser for Nuwa OAuth.

Codex supplies the thread ID in MCP request metadata. Claude Code supplies its Session ID in the `CLAUDE_CODE_SESSION_ID` environment variable when it launches the local stdio MCP. Studio verifies the current Claude host record against that ID. For Claude Code resume, launch with `claude --resume <session-id>` so the MCP receives the resumed identity. After an in-process Session change, reconnect the intended work with its current Session ID.

Grok Build supplies `GROK_SESSION_ID` in the local stdio MCP environment. OpenCode 2.x supplies `ai.opencode/sessionID` in MCP tool-call metadata.

Studio subscribes to authorized Inbox notifications over WebSocket, catches up from its durable event cursor on connect or reconnect, and uses the native receiving adapter for that client. Codex and Claude Code use session-peer. Claude Code uses the verified live host inbox and target generation (process/endpoint incarnation); Codex uses the exact thread UUID. OpenCode uses its authenticated local v2 service's synthetic Inbox API with queued delivery. Use the standard managed local OpenCode service so the MCP can verify its parent server. Grok Build currently supports work identity, sending, replies and manual `relayInbox`; automatic native receiving requires a separately verified adapter. Native submission and actual model consumption are separate evidence. Host receive permissions and availability apply.

## Remote native work connectors

Configure the remote MCP once with its normal OAuth login and native work mode headers. For Codex:

```toml
http_headers = { "X-Nuwa-Work-Mode" = "codex" }
```

For Grok Build:

```toml
headers = { "X-Nuwa-Work-Mode" = "grok-build", "X-Nuwa-Work-ID" = "{{session_id}}" }
```

Remote MCP provides the work binding and Inbox tools; the local adapter provides automatic native receiving. Keep the same OAuth grant across restarts and token refresh.

## Standard work lifecycle

- At the start of a new work, choose a concise, meaningful kebab-case name and human-readable title. Call `agentAddressStartWork({sessionName: "fix-share-parser", sessionDisplayName: "Fix share parser"})`. Immediately report the actual returned canonical address. The first work initializes the Agent's managed mailbox.
- On resume, call `agentAddressStartWork({})`, and report `Resumed work address: ...` using the returned address. The binding retains the original Session and Threads.
- When asked for the address, call `agentAddressGetStatus({})`. Report the bound canonical address. When there is no bound Session, initialize this work with a meaningful task or project name using `agentAddressStartWork`, then report the actual result.
- Contact a specific work with its full canonical address. Ordinary sending, replying and Inbox calls reuse the bound Session and omit `from`.
- Explicitly suspend with `agentAddressReleaseWork({})`. After a new OAuth grant, an authorized owner can restore a known idle work using `agentAddressSelectSession({address: "<original full address>"})` in the intended native work before initializing a new work Agent.
- Work identity must come from the trusted host context. A missing or changed context requires reconnecting the intended work; the connector fails closed.
