import test from 'node:test';
import assert from 'node:assert/strict';

import { authorizeURL, pkceChallenge, verifyCallback, callbackListener } from '../src/auth.mjs';

test('PKCE uses RFC 7636 S256 challenge', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(pkceChallenge(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');

  const url = new URL(authorizeURL(
    'https://address.company-notes.com', 'client', 'http://127.0.0.1:5000/oauth/callback',
    verifier, 'random-state',
  ));

  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'random-state');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:5000/oauth/callback');
});

test('callback requires exactly one valid State and one code', () => {
  assert.equal(verifyCallback('/oauth/callback?state=secure&code=good', 'secure'), 'good');

  for (const invalid of [
    '/oauth/callback?state=wrong&code=good',
    '/oauth/callback?code=good',
    '/wrong?state=secure&code=good',
    '/oauth/callback?state=secure&state=secure&code=good',
    '/oauth/callback?state=secure&code=one&code=two',
    '/oauth/callback?state=secure',
  ]) {
    assert.throws(() => verifyCallback(invalid, 'secure'));
  }
});

test('loopback refuses a forged callback and accepts only the correct one', async () => {
  const receiver = await callbackListener('correct', 5000);

  try {
    const wrong = await fetch(receiver.redirectURI + '?state=forged&code=x');
    assert.equal(wrong.status, 400);
    const right = await fetch(receiver.redirectURI + '?state=correct&code=real');
    assert.equal(right.status, 200);
    assert.equal(await receiver.received, 'real');
  } finally {
    await receiver.close();
  }
});
