# Remote MCP V2: private Session binding

## Goal

Remote MCP lets a connected AI client use Nuwa Relay on behalf of an authorized **Agent Session** without exposing execution secrets to the model. Agent Address V2 owns immutable Organization/Agent/Session identity and the exclusive Runtime Lease. Relay V2 performs Message, Thread, Handoff, MailTrigger receipt and Wake operations, and independently renews the executing Session's Lease.

A Runtime Token proves that one process currently owns a Session. A Resume Token is a different, stronger credential used to acquire a **new** Runtime when no live holder exists. Neither belongs in an MCP tool schema, model output, prompt, browser URL or logs.

## Architecture

1. The user connects Remote MCP to Agent Address using the MCP client's own OAuth grant.
2. The user privately obtains the desired Session's **Resume Token** through an approved Agent Address V2 identity flow; the model cannot fetch or display this secret.
3. A trusted CLI/client sends `POST /session-bindings` with that MCP client's OAuth bearer token in the **Authorization header** and `{"sessionID":"<immutable UUID>","resumeToken":"<private secret>"}` in the HTTPS JSON body. This is **not** a model-facing MCP tool.
4. MCP authenticates the OAuth token with Agent Address and requests Session Resume. Agent Address refuses an active Runtime instead of silently taking it over. MCP receives a fresh Runtime Token only on this private server-to-server path.
5. MCP encrypts the Runtime Token with AES-256-GCM using the secret `SESSION_BINDING_KEY`. The ciphertext and only a SHA-256 hash of the MCP OAuth access token are stored in the dedicated D1 `remote_session_bindings` table. AES additional authenticated data includes the token hash and Session ID.
6. The model calls `sendToAgent`, `relayReplyThread`, `relayMessage`, etc., with **message parameters only**. The MCP server looks up the bound Session and renews its Runtime with Agent Address, then passes `session_id` and `X-Nuwa-Runtime-Token` to Relay through the private service binding. Relay does its own Runtime authorization before acting.
7. The user privately revokes the binding with OAuth-protected `DELETE /session-bindings`, which releases the remote lease and removes the encrypted record. `GET /session-bindings` returns binding status without secrets.

This design requires no change to Relay's authorization, MailTrigger SMTP or MailTrigger webhook contract.

## Trusted Studio workflow

The `remote-bind` command is an **explicit runtime transfer**. A Session cannot safely run on the Studio process and Remote MCP at the same time.

- Select/claim your Session with `nuwa-studio-mcp identity --create ...` or an explicitly authorized Resume.
- Unregister the local Session Wake callback if one is active. The CLI refuses transfer while local Wake credentials exist.
- Export the OAuth **access token for the actual connected MCP client grant** to a secret-safe environment variable. It is **not necessarily** the OAuth token stored by Studio, because those can be two separate OAuth grants. Some MCP clients do not expose this token; for those clients this binding setup is not available until a trusted first-party interactive provisioning flow is implemented.
- Explicitly authorize ownership transfer:

```sh
nuwa-studio-mcp remote-bind \
  --mcp-origin https://mcp-staging.example.com \
  --mcp-oauth-token-env NUWA_REMOTE_MCP_OAUTH \
  --authorize-runtime-transfer
```

The CLI checks that the Remote OAuth token has no current binding, then releases the local Runtime lease and clears its local Runtime Token. The private Resume Token remains in local secure storage. It then asks the remote server to Resume and checks the returned Session ID. If the second step fails, **do not** reuse the released Runtime Token; retry only through an explicit, authorized Resume after verifying the remaining lease state.

Unbind remotely without needing the local Runtime:

```sh
nuwa-studio-mcp remote-revoke \
  --mcp-origin https://mcp-staging.example.com \
  --mcp-oauth-token-env NUWA_REMOTE_MCP_OAUTH
```

Never put any OAuth access token, Runtime Token or Resume Token directly on a shell command line or into committed configuration; use protected environment or a secret manager.

## Deliberate identity and security constraints

- **Binding is scoped to the individual OAuth access token**, not every user in the Organization. Another grant or another bearer token cannot access it. This is fail closed, but OAuth access-token refresh changes the binding key. A client that automatically rotates tokens will need an explicit safe rebinding flow once the old exclusive Runtime lease has been released or expired. A stable, grant-scoped binding is a potential improvement, but must come from authoritative Agent Address OAuth grant information; never infer it from account email or parse an opaque OAuth token.
- Runtime binding uses the true Agent Address Resume protocol, not a copied local Runtime token. It refuses takeover of an active lease.
- The D1 record contains no plaintext OAuth, Runtime or Resume token. The 256-bit AES key is a **Cloudflare Worker secret**, never a `wrangler.jsonc` variable or source file.
- Binding status and MCP messages never return execution credentials. Any model-facing Wake pairing link handles secrets only in the approved private browser flow; direct model tools never accept signing keys, private bearer credentials or verification challenges.
- The receiver's ordinary MailTrigger endpoint `/v1/mailtrigger/receipt` is intentionally unchanged. That path is an external email delivery contract, not old identity semantics.

## Infrastructure and acceptance

The repository's `wrangler.jsonc` uses an intentionally unconfigured D1 database ID. Provision **a new isolated staging D1**, apply `migrations/0001_session_bindings.sql`, and set the `SESSION_BINDING_KEY` Worker secret to a cryptographically generated 32-byte base64 value. Do not point the MCP binding at an existing Relay D1.

Run `npm run check`, `npm test`, the Studio Linux/Windows test suites and a Wrangler Worker dry-run. Verify staging with real Agent Address OAuth, D1 persistence and independent Session lease ownership. User scenario acceptance must show:

- Private bind, encrypted D1 row and a model tool call with no Runtime or Resume secret parameters
- Same OAuth grant's Session can send and reply; another OAuth token cannot
- Concurrent Session Resume is rejected, wrong Organization is denied, and stale Runtime fails closed
- Private revoke releases Runtime and immediately blocks further model tools
- OAuth refresh or account grant revocation fails closed rather than sharing another Session
- MailTrigger A→B→A delivery is independently confirmed through the existing receipt webhook
- A real receiving provider starts a Session on signed Wake, not merely HTTP 2xx

Do not claim production E2E from local controlled-integration tests. Do not merge/deploy these Draft PRs or touch production D1 until the above is validated on approved isolated staging.
