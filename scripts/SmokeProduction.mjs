#!/usr/bin/env node
// No credentials are sent and no Agent or Session is created by this smoke.
import assert from 'node:assert/strict';

const origin = 'https://mcp.agent-relay.company-notes.com';

async function request(path, options = {}) {
  const response = await fetch(origin + path, {
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

const landing = await request('/');
assert.equal(landing.status, 200, 'Public onboarding homepage must be reachable.');
const landingPage = await landing.text();
assert.match(landingPage, /GrokBot/);
assert.match(landingPage, /OpenMausBot/);
assert.ok(landingPage.includes('src="/start.js"'), 'Onboarding script must be referenced.');
assert.match(landingPage, /助理 A 的名稱/);
assert.match(landingPage, /助理 B 的名稱/);
assert.doesNotMatch(landingPage, /助理 A 的 Nuwa 地址|助理 B 的 Nuwa 地址/);
assert.match(landing.headers.get('content-security-policy') || '', /script-src 'self'/);

const guide = await request('/start');
assert.equal(guide.status, 200, 'The guide should have a direct shareable URL.');

const prompts = await request('/start.js');
assert.equal(prompts.status, 200, 'Onboarding copyable prompts must load.');
const promptText = await prompts.text();
assert.match(promptText, /function gatewaySetup/);
assert.match(promptText, /function directSetup/);
assert.match(promptText, /無須 Gateway/);
assert.match(promptText, /WakeParent，僅交接完整原始事件 JSON/);
assert.match(promptText, /verifyPrompt: replyPrompt/);
assert.match(promptText, /依最新版 Skill/);
assert.match(promptText, /從平台可信 Bot 名錄取得真實同事的名稱與 Bot ID/);
assert.match(promptText, /sendPrompt\('colleagueB', '星河', false, platform\)/);
assert.match(promptText, /sendPrompt\('colleagueA', '月光', true, platform\)/);
assert.match(promptText, /安裝或更新 Skill 與 MCP/);
assert.match(promptText, /唯一的 Wake 接收例行任務並完成驗證/);
assert.match(promptText, /只變更 Webhook 接收網址時/);
assert.match(promptText, /agent-relay\.company-notes\.com\/manage/);
assert.match(promptText, /只有首次設定或更新 Bearer key 才使用配對流程/);
assert.match(promptText, /recipientBotID 使用平台原生工具轉交一次/);
assert.match(promptText, /零 MCP 查詢，提交後結束/);
assert.match(promptText, /relayReplyThread\(\{from, threadID, body\}\)/);
assert.match(promptText, /from 直接填 recipientBotID/);
assert.match(promptText, /獨立連線省略 from/);
assert.doesNotMatch(promptText, /MailTrigger|Default Session|agentAddressSelectSession/);
assert.match(promptText, /colleagueA/);
assert.match(promptText, /colleagueB/);
assert.doesNotMatch(promptText, /addressA|addressB|先填入這位助理真正的 Nuwa 地址/);
assert.doesNotMatch(promptText, /relayProvisionAgentMailbox/,
  'Public user prompts should not expose internal tool implementation details.');

const styles = await request('/start.css');
assert.equal(styles.status, 200, 'The guide stylesheet must load.');

const skill = await request('/skills/nuwa-agent-relay/SKILL.md');
assert.equal(skill.status, 200, 'Skill installation entrypoint must remain reachable.');
const skillText = await skill.text();
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
assert.match(await relayManagementScript.text(), /code_challenge_method/);

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

const unknown = await request('/missing');
assert.equal(unknown.status, 404, 'Unrecognized public endpoint should be denied.');

console.log('PASS: public onboarding, official Skill, OAuth discovery, private binding protection and live identity denial.');
