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
assert.match(landing.headers.get('content-security-policy') || '', /script-src 'self'/);

const guide = await request('/start');
assert.equal(guide.status, 200, 'The guide should have a direct shareable URL.');

const prompts = await request('/start.js');
assert.equal(prompts.status, 200, 'Onboarding copyable prompts must load.');
const promptText = await prompts.text();
assert.match(promptText, /function gatewaySetup/);
assert.match(promptText, /function verifyPrompt/);
assert.match(promptText, /預設希望目前所有符合資格的同事都能接線/);
assert.match(promptText, /密語是星河/);
assert.match(promptText, /密語是月光/);
assert.doesNotMatch(promptText, /relayReplyThread|relayProvisionAgentMailbox/,
  'Public user prompts should not expose internal tool implementation details.');

const styles = await request('/start.css');
assert.equal(styles.status, 200, 'The guide stylesheet must load.');

const skill = await request('/skills/nuwa-agent-relay/SKILL.md');
assert.equal(skill.status, 200, 'Skill installation entrypoint must remain reachable.');
const skillText = await skill.text();
assert.match(skillText, /agentAddressEnsureIdentity/);
assert.doesNotMatch(skillText, /human provides the Session ID|access token and loses the binding/i);

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
