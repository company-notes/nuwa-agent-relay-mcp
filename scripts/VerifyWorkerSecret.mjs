#!/usr/bin/env node
// Verify Worker Secret metadata without retrieving or exposing the key value.
const accountID = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();

if (accountID !== 'b471fa2c14470c664eec0a37616accd6' || !token) {
  throw new Error('Cloudflare production account or credential missing.');
}

const url = 'https://api.cloudflare.com/client/v4/accounts/' +
  accountID + '/workers/scripts/nuwa-agent-relay-mcp/secrets';
const response = await fetch(url, {
  headers: { authorization: 'Bearer ' + token },
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  throw new Error('Worker Secret metadata request failed: HTTP ' + response.status);
}

const data = await response.json();

if (data.success !== true || !Array.isArray(data.result) ||
    !data.result.some((secret) =>
      secret.name === 'SESSION_BINDING_KEY' && secret.type === 'secret_text')) {
  throw new Error('SESSION_BINDING_KEY Worker Secret missing or unexpectedly configured.');
}

console.log('PASS: permanent MCP encryption Worker Secret is present.');
