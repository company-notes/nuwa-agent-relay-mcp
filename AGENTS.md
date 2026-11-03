# Agent development instructions

Read [CODE_PRINCIPLES.md](CODE_PRINCIPLES.md) before changing **any** Server, Studio, test or build code. The full document, not this short reminder, is authoritative.

## Rule #20 — Vertical spacing

- Separate **logical phases**, not individual statements: initialization, validation, request/operation, result checks, cleanup/return.
- Use **one blank line** between independent groups of statements. Keep statements for one coherent operation together.
- Keep `if/elif/else` and `try/except/finally` visually contiguous, without decorative blank lines.
- In loops and test cases, group related checks together; add a blank line when switching to a different concern (identity, authorization, routing, response, persistence).
- When a method combines multiple independent phases, extract a focused method owned by the responsible class instead of using many decorative blank lines.
- Do not densely pack unrelated operations onto the same line or use one-line command chains for independent steps.
- Do not put a blank line after *every* `if`, `for`, or `try`; spacing follows meaning.

## Other mandatory conventions

- Follow OO, DRY and separation of concerns: Server and Studio MCP are separate adapters; Agent Address and Relay REST APIs own their business rules.
- Use camelCase identifiers and the prescribed acronym casing. On-disk JSON configuration keys and URL query parameter keys are documented snake_case exceptions.
- Prefer early returns, fail-fast errors, clear one-way dependency boundaries and class-owned helpers. Avoid implicit fallbacks, swallowed exceptions or inner imports to evade circular dependencies.
- Preserve existing OAuth, Work scoping, REST contracts, tool names and MailTrigger safety boundaries in readability-only refactors.

## Verify after every refactor

- Remote: `npm ci`, `npm run check`, `npm test`, `npm run build`.
- Studio: `python -m pip install -e './studio[dev]'`, `pytest -q studio/tests`.
- Keep Linux and Windows Studio CI green. Avoid invoking real production MailTrigger send actions during automated tests.
- When correcting an actual bug, add a regression test, demonstrate red first, then green and rerun surrounding suites.

Do not deploy or merge while CI is failing. GitHub Actions deployment is explicitly manual.
