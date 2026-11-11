# Code Principles review — Relay MCP / Studio — 2026-11-11

Basis: the exact uploaded `CODE_PRINCIPLES.md` (49,002 bytes, CRLF preserved;
Git blob `b4be09250ee3bd32e4adf8eb1d7b46e4939212c6`).

## Review 1 — full baseline inspection

Coverage: every tracked `server/src/*.ts`, `server/test/*.ts`,
`studio/src/*.py`, `studio/tests/*.py`, entry point and build scripts.
Inspected try/catch and Python except blocks, module boundaries, OAuth
credential handling, exception diagnostics, one-line JS/TS controls,
Rule 20 spacing, method type, dynamic imports and duplicate ownership.

Findings:
- `MCPToolSet` returned exceptions to MCP callers without logging them.
- HTTP OAuth errors used individual console calls instead of a shared
  operational logger.
- Address and Relay tools were bundled into `server/src/Tools.ts`.
- The single Python `WakeReceiver.py` held registration, persistence,
  Echo execution, HTTP parsing and dispatch in one file.
- A local HTTP Content-Length parse used exceptions for routine validation.

## Review 2 — after first corrections

- Implemented a shared sanitized `Logger`; ToolSet logs safe error type
  and tool name, does not send unknown exception strings to callers.
- Extracted `ToolSet.ts`, `AddressTools.ts` and `RelayTools.ts`;
  removed obsolete mixed-domain `Tools.ts`.
- Extracted `WakeSubscription.py`, `WakeInbox.py` and `WakeEcho.py`;
  `WakeReceiver.py` now owns inbound HTTP validation and delivery.
- Replaced exception-based Content-Length control flow with explicit
  validation and safe debug messages.
- Linux CI identified a forgotten `json` import in the moved
  subscription module; fixed before the next review.
- Removed unnecessary test-local imports and a redundant dynamic OS
  import; pure validators use static methods.

## Review 3 — final source scan and CI

- Rechecked all tracked TS/JS/Python sources, tests and module imports for
  silenced errors, locally imported modules, unbraced JS controls,
  credential-bearing exception reporting, dead references and unrelated
  responsibilities.
- Added regression tests: unknown MCP tool error is recorded without
  leaking its message, Wake challenge rejection is logged without its
  signing secret, and malformed HTTP Content-Length yields a safe 411.
- Kept Python's standard top-level declaration spacing rather than
  mechanically removing intentional blank lines.
- Verified Linux remote MCP server, Linux Studio and Windows Studio jobs
  pass on Actions run 42963201080.

This review does not prove an actual external agent or Cursor webhook was
invoked; network service integrations still need authenticated live
acceptance tests after an authorized deployment. PR #18 is Draft and does
not deploy production.
