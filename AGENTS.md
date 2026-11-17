# Nuwa Agent Relay MCP development rules

The checked-in [CODE_PRINCIPLES.md](CODE_PRINCIPLES.md) is mandatory for
TypeScript, JavaScript, and Python code. Preserve the published OAuth, MCP,
Agent Address and Relay API contracts while refactoring.

## Service boundaries

- `server/src/OAuthResourceServer.ts` owns upstream OAuth verification.
- `server/src/APIClients.ts` owns authenticated backend transport.
- `server/src/ToolSet.ts` owns shared MCP tool registration/error handling.
- `server/src/AddressTools.ts` owns identity tools; `RelayTools.ts` owns Relay tools.
- `server/src/MCPServer.ts` composes the tool groups only.
- `studio/src` owns the desktop Python client and local Wake receiver,
  not Cloudflare Worker transport or backend authorization decisions.

## Error handling and layout

- Rule 11/12: catch exceptions only where recovery, reporting or an
  intentional public error translation is possible. Use the shared
  `Logger` for remote MCP operational failures and `logging` for Studio.
  Never print token values, request bodies, callback paths or raw network
  exception messages.
- Rule 14: braces on their own lines for all JS/TS control statements.
- Rule 20: group setup, validation, network calls and result handling in
  readable phases. Keep `if/else` and `try/catch/finally` contiguous;
  don't add blank lines merely because a branch begins or ends.
- Rule 21: remove unused old code paths instead of leaving parallel
  implementations or obsolete imports.
- Python follows ordinary top-level PEP 8 declaration spacing; that is not
  a license to split a single logical operation into disconnected blocks.

## Verification and rollout

- Keep already released identity recovery and ordinary messaging together. A new
  deployment must retain `agentAddressSelectSession`, `sendToAgent`, and
  `relayReplyThread`; verify the recovered Gateway can send and reply using its
  original address without re-pairing Wake or re-enrolling coworkers. Integrate
  concurrent fixes before deploying; do not deploy an older sibling branch
  over a previously released feature.
- Ordinary Relay calls use one Account Status/Grant snapshot per HTTP request
  and one authoritative Runtime check/renewal in Relay. The MCP binding only
  resumes or refreshes when required and records the lease returned by Relay.
  Keep this single path; do not add duplicate identity lookups or per-message
  mailbox setup. Deploy matching Agent Address, Relay API, then MCP versions.

- Remote MCP: `npm ci && npm run check && npm test && npm run build`.
- Studio: run the Python tests for the supported Linux and Windows targets
  through CI; keep deployment preview separate from production.
- Always add or update regression tests for behavioral changes and record
  actual Red/Green results when investigating a bug.
- Work in a PR with CI passing. A merge into `main` can deploy the
  production remote MCP; do not merge an audit/refactor without deployment
  authorization.
