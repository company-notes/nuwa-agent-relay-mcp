# Studio Worker Provider — Rakazo pilot

This isolated pilot extends the existing Nuwa Remote MCP without changing the original Fleet Gateway, Worker Gateway or the message Inbox transport.

## Boundary

The remote assistant discovers approved tools through the ordinary Nuwa MCP endpoint. Studio alone reads the Windows user's protected Worker credential and invokes the fixed local `http://127.0.0.1:3791/mcp`. The shared `worker-provider.json` allowlist limits both cloud and local execution. The Gateway remains authoritative for project/model selection, workspaces, Job state, Git policy and delivery. The original Session Router Skill remains the routing policy.

The first transport is a dedicated authenticated HTTPS long-poll request/result channel, backed by a Cloudflare Durable Object per remote OAuth grant. A Studio request waits up to 20 seconds for work; no idle periodic cloud-to-local HTTP request or public local port is needed. Tool results are correlated with one outstanding request. A tool call times out after 45 seconds; the Studio never automatically replays a command after a transport failure. The original Gateway requestId is preserved for its idempotency contract.

## Pilot setup (only after a verified deployment)

1. Use a dedicated Windows test account with an installed and authorized AI Worker Gateway on port 3791. Confirm the local Fleet and T3 host are healthy.
2. Connect Rakazo to Nuwa Remote MCP with a **dedicated OAuth connection assigned only to the test assistant**, not a shared office connection. The pilot grants the selected OAuth principal the full approved tool scope of this dedicated local Gateway, including access to all its visible Jobs. It does not yet implement per-coworker or per-Job access control.
3. Sign in to Studio locally using the ordinary Studio login and the same Nuwa Organization. In the intended Rakazo connection invoke `worker_provider_pair`; the device owner enters its short-lived one-time code privately into `nuwa-relay-mcp worker pair` on the Windows test machine. Confirm the displayed scope. This code expires in five minutes; do not reuse it or store it in permanent configuration. The long-lived local Gateway credential remains on the device.
4. Run `nuwa-relay-mcp worker serve` in the Studio installation. This is an independent pilot process, not a per-native-thread receiver. Check `worker_provider_status` from Rakazo and refresh its MCP tool catalog once the provider is online.
5. Enable the canonical Session Router Skill from [AI Worker Gateway](https://github.com/company-notes/ai-worker-gateway/blob/main/.agents/skills/session-router/SKILL.md). The pilot uses manual progress checking; it does not expose webhook pairing or notification route capabilities. Ask Rakazo to make a marketing tracking tool, then ask for monthly ROAS in the same Job. Use the real tool results to verify Job identity, output and Git version. The existing Nuwa messaging tools remain available.
6. Revoke the binding using `nuwa-relay-mcp worker revoke` or the approved remote `worker_provider_revoke`. Stop the pilot service. Existing Jobs are unaffected; an already dispatched call may have completed.

## Readiness and remaining work

The pilot requires a real Studio process, dedicated grant, and live Windows/T3 acceptance. The current manual pairing and service command are engineering setup interfaces. Production installation must integrate local owner authorization, windowless user-logon service lifecycle, automated provider detection, upgrade/uninstall handling, safe device selection and independent per-agent/Job authorization. No main merge or production deployment is authorized by this draft.

A missing or stopped Gateway yields no local catalog. Studio retries discovery as part of its own channel lifecycle. Remote MCP only registers approved available schemas, and a cached call while offline returns an error rather than creating a new Job. No remote shell, arbitrary URL or local bearer token is accepted. MCP client catalog refresh may require reconnect on a stateless platform. A lost response is not proof of failure; inspect work state and use the same Gateway requestId for an uncertain retry.

A real Rakazo-to-T3 acceptance remains the release gate, including cross-grant denial, revocation, retry behavior, normal message delivery, and restarting the Studio independently of native coding threads.
