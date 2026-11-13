import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import test from 'node:test';

import { WranglerRunner } from './WranglerRunner.mjs';

test('installed Wrangler CLI runs through Windows or Linux Node without a shell', () => {
  const executable = WranglerRunner.executablePath();
  assert.ok(isAbsolute(executable));

  const version = WranglerRunner.execute(['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  assert.match(version, /\d+\.\d+\.\d+/);
});
