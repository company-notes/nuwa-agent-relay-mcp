import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

import { addressOrigin } from './settings.mjs';
import { authPath, readAuth, saveAuth } from './storage.mjs';

const TIMEOUT_MS = 180_000;
const EXPIRY_MARGIN_MS = 60_000;

export function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function authorizeURL(origin, clientId, redirectURI, verifier, state) {
  const url = new URL('/authorize', origin);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectURI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

export function verifyCallback(raw, expectedState) {
  const url = new URL(raw, 'http://127.0.0.1');
  const stateValues = url.searchParams.getAll('state');
  const received = Buffer.from(stateValues[0] || '');
  const expected = Buffer.from(expectedState);

  if (url.pathname !== '/oauth/callback' || stateValues.length !== 1 ||
      received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('OAuth callback State mismatch or unexpected URL.');
  }

  if (url.searchParams.has('error')) {
    throw new Error('OAuth authorization was refused.');
  }

  const codes = url.searchParams.getAll('code');

  if (codes.length !== 1 || !codes[0]) {
    throw new Error('OAuth callback must contain exactly one authorization code.');
  }

  return codes[0];
}

export async function callbackListener(state, timeoutMs = TIMEOUT_MS) {
  let done = false;
  let resolveCode;
  let rejectCode;

  const received = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Prevent aborted registration from producing an unhandled rejection.
  received.catch(() => {});

  const server = createServer((request, response) => {
    const address = server.address();

    if (request.method !== 'GET' ||
        request.headers.host !== '127.0.0.1:' + address.port) {
      response.writeHead(404);
      response.end('Not found.');
      return;
    }

    try {
      const code = verifyCallback(request.url, state);
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'",
      });
      response.end('<meta charset="utf-8"><h2>Nuwa Agent Relay MCP 已登入</h2><p>可以返回終端機。</p>');

      if (!done) {
        done = true;
        resolveCode(code);
      }
    } catch (error) {
      response.writeHead(400, { 'cache-control': 'no-store' });
      response.end('Authorization response rejected.');

      if (error.message === 'OAuth authorization was refused.' && !done) {
        done = true;
        rejectCode(error);
      }
    }
  });

  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const timer = setTimeout(() => {
    if (!done) {
      done = true;
      rejectCode(new Error('OAuth browser login timed out. Run npm run login again.'));
    }
  }, timeoutMs);

  return {
    redirectURI: 'http://127.0.0.1:' + server.address().port + '/oauth/callback',
    received,
    async close() {
      clearTimeout(timer);

      if (!done) {
        done = true;
        rejectCode(new Error('OAuth browser login cancelled.'));
      }

      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function oauthPost(origin, path, payload, format = 'form') {
  const json = format === 'json';
  const response = await fetch(new URL(path, origin), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': json
        ? 'application/json'
        : 'application/x-www-form-urlencoded',
    },
    body: json ? JSON.stringify(payload) : new URLSearchParams(payload).toString(),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('Agent Address OAuth server returned invalid JSON.');
  }

  if (!response.ok) {
    // Never print raw request or response, which might include credentials.
    const code = typeof data.error === 'string' ? data.error : 'oauth_error';
    throw new Error('Agent Address OAuth ' + path + ' failed: HTTP ' +
      response.status + ' (' + code + ').');
  }

  return data;
}

function tokenPayload(payload) {
  if (!payload || typeof payload.access_token !== 'string' || !payload.access_token ||
      (payload.token_type && String(payload.token_type).toLowerCase() !== 'bearer')) {
    throw new Error('Agent Address returned an invalid OAuth bearer token.');
  }

  return payload;
}

function expiresAt(payload) {
  return Number.isFinite(payload.expires_in)
    ? Date.now() + payload.expires_in * 1000
    : null;
}

function maybeOpenBrowser(url) {
  if (process.env.NUWA_MCP_NO_BROWSER === '1') {
    return;
  }

  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'linux'
      ? 'xdg-open'
      : null; // Windows: use printed URL; never put OAuth query through cmd.exe.

  if (command) {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  }
}

export async function login() {
  const origin = addressOrigin();
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const listener = await callbackListener(state);

  try {
    const registration = await oauthPost(origin, '/register', {
      client_name: 'Nuwa Agent Relay MCP (local stdio)',
      redirect_uris: [listener.redirectURI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }, 'json');

    if (typeof registration.client_id !== 'string' || !registration.client_id) {
      throw new Error('Agent Address dynamic OAuth registration returned no client_id.');
    }

    const url = authorizeURL(origin, registration.client_id, listener.redirectURI, verifier, state);
    // This is a one-time CLI operation; never log the authorization URL from the MCP server.
    process.stdout.write('請使用瀏覽器登入 Agent Address：\n' + url + '\n\n');
    maybeOpenBrowser(url);

    const code = await listener.received;
    const tokens = tokenPayload(await oauthPost(origin, '/token', {
      grant_type: 'authorization_code',
      client_id: registration.client_id,
      redirect_uri: listener.redirectURI,
      code,
      code_verifier: verifier,
    }));

    await saveAuth({
      version: 1,
      origin,
      clientId: registration.client_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt: expiresAt(tokens),
    });

    return authPath();
  } finally {
    await listener.close();
  }
}

export async function accessToken(forceRefresh = false) {
  if (process.env.NUWA_ACCESS_TOKEN) {
    return process.env.NUWA_ACCESS_TOKEN;
  }

  const auth = await readAuth();

  if (!auth) {
    throw new Error('尚未登入。請在終端機執行 npm run login，或由 MCP Client 設定 NUWA_ACCESS_TOKEN。');
  }

  if (auth.version !== 1 || auth.origin !== addressOrigin() ||
      typeof auth.clientId !== 'string' || typeof auth.accessToken !== 'string') {
    throw new Error('Local OAuth credentials do not match Agent Address; run npm run login again.');
  }

  if (!forceRefresh &&
      (auth.expiresAt === null || Date.now() + EXPIRY_MARGIN_MS < auth.expiresAt)) {
    return auth.accessToken;
  }

  if (!auth.refreshToken) {
    throw new Error('OAuth access token expired or was refused. Run npm run login again.');
  }

  const tokens = tokenPayload(await oauthPost(auth.origin, '/token', {
    grant_type: 'refresh_token',
    client_id: auth.clientId,
    refresh_token: auth.refreshToken,
  }));

  await saveAuth({
    ...auth,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || auth.refreshToken,
    expiresAt: expiresAt(tokens),
  });

  return tokens.access_token;
}
