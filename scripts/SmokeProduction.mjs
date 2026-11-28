#!/usr/bin/env node
// No credentials are sent and no Agent or Session is created by this smoke.
import assert from 'node:assert/strict';

const origin = 'https://mcp.agent-relay.company-notes.com';
const website = 'https://agent-relay.company-notes.com';

async function request(path, options = {}, targetOrigin = origin) {
  const response = await fetch(targetOrigin + path, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });

  console.log(path + ': HTTP ' + response.status);

  return response;
}

const health = await request('/health');
assert.equal(health.status, 200, 'MCP health should be available.');
const healthy = await health.json();
assert.equal(healthy.data?.service, 'nuwa-agent-relay-mcp');

for (const path of ['/', '/start']) {
  const legacy = await request(path);
  assert.equal(legacy.status, 308, 'Old onboarding bookmarks must redirect.');
  assert.equal(legacy.headers.get('location'), website + path);
}

const landing = await request('/', {}, website);
assert.equal(landing.status, 200, 'Public onboarding homepage must be reachable.');
const landingPage = await landing.text();
assert.match(landingPage, /GrokBot/);
assert.match(landingPage, /OpenMausBot/);
assert.match(landingPage, /href="\/manage"/);
assert.ok(landingPage.includes(origin + '/skills/nuwa-agent-relay/SKILL.md'));
assert.ok(landingPage.includes('src="/start.js"'), 'Onboarding script must be referenced.');
assert.match(landingPage, /助理 A 的名稱/);
assert.match(landingPage, /助理 B 的名稱/);
assert.doesNotMatch(landingPage, /助理 A 的 Nuwa 地址|助理 B 的 Nuwa 地址/);
assert.match(landing.headers.get('content-security-policy') || '', /script-src 'self'/);

const guide = await request('/start', {}, website);
assert.equal(guide.status, 200, 'The guide should have a direct shareable URL.');

const prompts = await request('/start.js', {}, website);
assert.equal(prompts.status, 200, 'Onboarding copyable prompts must load.');
const promptText = await prompts.text();
assert.match(promptText, /function gatewaySetup/);
assert.match(promptText, /function directSetup/);

// The homepage supplies short instructions; full native details live in each reference.
assert.match(promptText, /references\//);
for (const filename of ['grokbot.md', 'openmausbot.md', 'rakazo.md']) {
  assert.ok(promptText.includes(filename), 'The homepage must select the ' + filename + ' guide.');
}

assert.match(promptText, /verifyPrompt: replyPrompt/);
assert.match(promptText, /gatewaySetup/);
assert.match(promptText, /七個階段/);
assert.match(promptText, /sendPrompt\('colleagueB', '星河', false, platform\)/);
assert.match(promptText, /sendPrompt\('colleagueA', '月光', true, platform\)/);
assert.match(promptText, /colleagueA/);
assert.match(promptText, /colleagueB/);
assert.doesNotMatch(promptText, /relayProvisionAgentMailbox/,
  'Public user prompts should not expose mailbox implementation internals.');

const references = [
  {
    file: 'grokbot.md',
    markers: [/WakeParent/, /Send to Agent/, /zero additional Nuwa MCP/],
  },
  {
    file: 'openmausbot.md',
    markers: [/coordinate_bots/, /relayGatewayConfirmFirstContact/, /recipientPlatformThreadID/],
  },
  {
    file: 'rakazo.md',
    markers: [/schedule_create/, /on: \{ webhook: true \}/, /relayGatewayOfficeCoworkers/],
  },
];

for (const reference of references) {
  const path = '/skills/nuwa-agent-relay/references/' + reference.file;
  const response = await request(path);
  assert.equal(response.status, 200, path + ' should be publicly available.');
  assert.match(response.headers.get('content-type') || '', /text\/markdown/);

  const content = await response.text();
  assert.match(content, /### 1\./);
  assert.match(content, /### 7\./);
  assert.match(content, /Completion evidence:/);

  for (const marker of reference.markers) {
    assert.match(content, marker, path + ' must preserve its verified platform procedure.');
  }
  assert.doesNotMatch(content, /[\u3400-\u9fff]/, 'The platform reference must remain English-only.');
}

const styles = await request('/start.css', {}, website);
assert.equal(styles.status, 200, 'The guide stylesheet must load.');

const workerPairing = await request('/worker-pairing');
assert.equal(workerPairing.status, 200, 'The owner authorization URL must be publicly reachable.');
assert.match(await workerPairing.text(), /href="nuwa-studio-worker:pair"/);

const sessionRouter = await request('/skills/session-router/SKILL.md');
assert.equal(sessionRouter.status, 200, 'The official Session Router Skill must be served without a GitHub redirect.');
assert.match(sessionRouter.headers.get('content-type') || '', /text\/markdown/);
const sessionRouterText = await sessionRouter.text();
assert.match(sessionRouterText, /name: session-router/);
assert.match(sessionRouterText, /首次連接 Worker 與自動完成通知一併授權/);
assert.match(sessionRouterText, /registered=true/);
assert.match(sessionRouterText, /assistantIdentity/);
assert.match(sessionRouterText, /notificationBound=true/);
assert.match(sessionRouterText, /不同 Bot 可以共享 Worker/);
assert.match(sessionRouterText, /不需要另外安裝 Nuwa Agent Relay Skill/);

const skill = await request('/skills/nuwa-agent-relay/SKILL.md');
assert.equal(skill.status, 200, 'Skill installation entrypoint must remain reachable.');
const skillText = await skill.text();
assert.match(skillText, /authorized together on\s+the local Studio page/);
assert.match(skillText, /All starts and continuations require assistantIdentity/);
assert.match(skillText, /agentAddressEnsureIdentity/);
assert.match(skillText, /Independent client/);
assert.match(skillText, /WakeParent once with the/);
assert.match(skillText, /Existing Wake URL relocation/);
assert.match(skillText, /agent-relay\.company-notes\.com\/manage/);
assert.match(skillText, /relayInbox/);
assert.match(skillText, /sendToAgent/);
assert.match(skillText, /No preliminary directory lookup/);
assert.match(skillText, /Zero MCP calls for ordinary office Wake dispatch/);
assert.match(skillText, /agentAddressSelectSession/);
assert.match(skillText, /relayReplyThread/);
assert.match(skillText, /Forward a ready-to-use reply call/);
assert.match(skillText, /<actual recipientBotID>/);
assert.match(skillText, /Call the tool directly when its schema is available/);
assert.doesNotMatch(skillText, /agentAddressFindByName/,
  'Name resolution must not add a second MCP tool call.');
assert.doesNotMatch(skillText, /human provides the Session ID|access token and loses the binding/i);

// The Relay-owned management UI must already be live before onboarding links to it.
const relayManagementOrigin = 'https://agent-relay.company-notes.com';
const relayManagement = await fetch(relayManagementOrigin + '/manage', {
  redirect: 'manual',
  signal: AbortSignal.timeout(20_000),
});
console.log('Relay /manage: HTTP ' + relayManagement.status);
assert.equal(relayManagement.status, 200, 'Relay Wake management page must be reachable.');
assert.match(await relayManagement.text(), /使用 Agent Address 登入/);

const relayManagementScript = await fetch(relayManagementOrigin + '/manage.js', {
  redirect: 'manual',
  signal: AbortSignal.timeout(20_000),
});
console.log('Relay /manage.js: HTTP ' + relayManagementScript.status);
assert.equal(relayManagementScript.status, 200, 'Relay Wake management script must load.');
assert.match(await relayManagementScript.text(), /\/manage\/session\?/);

const managementLogin = await fetch(relayManagementOrigin + '/manage/session?section=wake', {
  redirect: 'manual',
  signal: AbortSignal.timeout(20_000),
});
console.log('Relay /manage/session: HTTP ' + managementLogin.status);
assert.equal(managementLogin.status, 302, 'The management login must redirect to Agent Address.');

const authorization = new URL(managementLogin.headers.get('location'));
assert.equal(authorization.origin, 'https://address.company-notes.com');
assert.equal(authorization.pathname, '/authorize');
assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
assert.equal(authorization.searchParams.get('redirect_uri'), relayManagementOrigin + '/manage/callback');
assert.ok(authorization.searchParams.get('state'), 'The browser authorization must carry state.');
assert.ok(authorization.searchParams.get('code_challenge'), 'The browser authorization must carry a PKCE challenge.');

assert.ok(managementLogin.headers.get('set-cookie')?.includes('HttpOnly'),
  'The browser login state must remain in its protected cookie.');

const metadata = await request('/.well-known/oauth-protected-resource/mcp');
assert.equal(metadata.status, 200, 'OAuth resource discovery must be published.');
const oauth = await metadata.json();
assert.equal(oauth.resource, origin + '/mcp');
assert.deepEqual(oauth.authorization_servers, ['https://address.company-notes.com']);

const unauthenticated = await request('/mcp', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
assert.equal(unauthenticated.status, 401, 'MCP must require a valid OAuth token.');
assert.match(unauthenticated.headers.get('www-authenticate') || '', /resource_metadata/);

const dedicated = '/mcp/smoke-test/nonexistent/main';
const dedicatedMetadata = await request('/.well-known/oauth-protected-resource' + dedicated);
assert.equal(dedicatedMetadata.status, 200);
assert.equal((await dedicatedMetadata.json()).resource, origin + dedicated);

const dedicatedDenied = await request(dedicated, { method: 'POST' });
assert.equal(dedicatedDenied.status, 401);
assert.ok(dedicatedDenied.headers.get('www-authenticate')?.includes(
  origin + '/.well-known/oauth-protected-resource' + dedicated,
), 'The dedicated challenge must identify the exact OAuth resource.');

const privateBinding = await request('/session-bindings');
assert.equal(privateBinding.status, 401, 'Private Session transfer must require OAuth.');

const invalid = await request('/mcp', {
  method: 'POST',
  headers: {
    authorization: 'Bearer intentionally-invalid-oauth-token',
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
});
assert.equal(invalid.status, 401,
  'An invalid token must be rejected by the live Agent Address authorization service.');

// Both native receive routes must exist and reject unauthenticated access.
// This detects an old Remote MCP deployment even when ordinary MCP works.
for (const path of ['/work-inbox/events', '/work-inbox/events/stream']) {
  const denied = await request(path);
  assert.equal(denied.status, 401, path + ' must exist and require OAuth.');
  assert.match(denied.headers.get('www-authenticate') || '', /resource_metadata/);
}

const workClients = await request('/skills/nuwa-agent-relay/references/work-clients.md');
assert.equal(workClients.status, 200);
assert.match(await workClients.text(), /WebSocket/);

const unknown = await request('/missing');
assert.equal(unknown.status, 404, 'Unrecognized public endpoint should be denied.');

console.log('PASS: public onboarding, official Skill, OAuth discovery, private binding protection, native Inbox routes and live identity denial.');
