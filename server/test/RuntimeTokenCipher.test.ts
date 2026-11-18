import assert from 'node:assert/strict';
import test from 'node:test';

import { RuntimeTokenCipher } from '../src/RuntimeTokenCipher';

test('a private binding reuses its imported key without reusing nonce or identity context', async () => {
  const cipher = new RuntimeTokenCipher(Buffer.alloc(32, 7).toString('base64'));
  const [firstKey, secondKey] = await Promise.all([cipher.requireKey(), cipher.requireKey()]);
  assert.equal(firstKey, secondKey);
  assert.equal(firstKey.extractable, false);

  const grant = 'grant-a';
  const sessionID = 'session-a';
  const first = await cipher.encrypt('runtime-test', grant, sessionID);
  const second = await cipher.encrypt('runtime-test', grant, sessionID);
  assert.notEqual(first, second);
  assert.equal(await cipher.decrypt(first, grant, sessionID), 'runtime-test');
  assert.equal(await cipher.decrypt(second, grant, sessionID), 'runtime-test');

  await assert.rejects(cipher.decrypt(first, 'grant-b', sessionID));
  await assert.rejects(cipher.decrypt(first, grant, 'session-b'));

  const changedKey = new RuntimeTokenCipher(Buffer.alloc(32, 8).toString('base64'));
  await assert.rejects(changedKey.decrypt(first, grant, sessionID));
  await assert.rejects(new RuntimeTokenCipher('invalid').requireKey(), /Session encryption key/);
});
