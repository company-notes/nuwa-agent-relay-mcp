# Native work clients: Codex and Grok Build

Read the core Nuwa Skill for the address format, OAuth authorization, inbox and ordinary messaging. Follow this guide for native work Session setup and resumption.

### Named work Sessions

A work connector (Codex or Grok Build) keeps one Agent per OAuth grant and
uses a separate Session for each native work conversation. Configure the
remote MCP connector once with its normal OAuth login, plus the native work
mode headers. For Codex, add to the existing MCP server configuration:

```toml
http_headers = { "X-Nuwa-Work-Mode" = "codex" }
```

The Codex host must supply its stable thread ID in MCP tool-call metadata.
For Grok Build, add to the existing remote MCP server configuration:

```toml
headers = { "X-Nuwa-Work-Mode" = "grok-build", "X-Nuwa-Work-ID" = "{{session_id}}" }
```

The host supplies the native Session identity automatically. Keep the same
OAuth grant across restarts and token refresh. Fixed-persona and office
connectors use their existing configuration without these work headers.

- At the start of a new native work Session, choose a concise, meaningful
  kebab-case name derived from the actual task and a human-readable title.
  Call `agentAddressStartWork({sessionName: "fix-share-parser", sessionDisplayName: "Fix share parser"})`.
  Immediately tell the user the returned canonical address:
  `Active work address: nuwa/codex/fix-share-parser` (use the actual result).
  The first work initializes the Agent's shared managed mailbox.
- On resume of the same native work, call `agentAddressStartWork({})`.
  Report the returned address as `Resumed work address: ...`. A restored
  Runtime retains the original Session and Threads. If initialization
  previously failed, repeat with the original meaningful name.
- When asked for the address, call `agentAddressGetStatus({})` and report
  the current Session's canonical address. This is a read-only operation.
- Explicitly suspend a work with `agentAddressReleaseWork({})`. Closing the
  host also lets its Runtime lease expire. Its durable binding and history
  remain available. After a new OAuth grant, an authorized owner can restore
  a known idle work with `agentAddressSelectSession({address: "nuwa/codex/fix-share-parser"})`
  in the intended native work. Do this before initializing a new work Agent.
- Contact a specific work Session with its full canonical address.
  Ordinary sending, replying and checking the Inbox reuse the bound
  Session automatically and omit `from`. A remote connection alone does
  not wake a native work process; use manual Inbox unless a direct adapter
  has been verified.
- If host work context is missing, the connector fails closed. Verify the
  client integration rather than inventing a native Session ID.
