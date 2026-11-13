import assert from 'node:assert/strict';
import { WranglerRunner } from './WranglerRunner.mjs';
import { fileURLToPath } from 'node:url';

export class BindingDatabaseGuard {
  static classify(names, requireMigrated = false) {
    assert.ok(Array.isArray(names) && names.every((name) => typeof name === 'string'),
      'D1 schema inspection returned invalid table names.');

    const tables = names.filter((name) =>
      !['d1_migrations', '_cf_KV', '_cf_METADATA'].includes(name) &&
      !name.startsWith('sqlite_'),
    );

    if (tables.length === 0 && !requireMigrated) {
      return 'empty';
    }

    if (tables.length !== 1 || tables[0] !== 'remote_session_bindings') {
      throw new Error('Refusing non-V2 or partially migrated MCP bindings database.');
    }

    return 'v2';
  }

  static parse(output) {
    const parsed = JSON.parse(output);

    if (!Array.isArray(parsed) || parsed.length !== 1 ||
        parsed[0]?.success !== true || !Array.isArray(parsed[0]?.results)) {
      throw new Error('Unexpected Wrangler D1 schema response.');
    }

    const names = parsed[0].results.map((row) => row?.name);

    if (!names.every((name) => typeof name === 'string')) {
      throw new Error('Incomplete Wrangler D1 schema response.');
    }

    return names;
  }

  static verifyRemote(requireMigrated = false) {
    const output = WranglerRunner.execute([
      'd1', 'execute', 'BINDINGS_DB', '--remote',
      '--config', '.wrangler.deploy.jsonc', '--command', "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      '--json',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

    const kind = this.classify(this.parse(output), requireMigrated);
    process.stdout.write('Verified dedicated MCP Session binding D1: ' + kind + '\n');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);

  if (!args.includes('--remote') ||
      args.some((arg) => !['--remote', '--require-migrated'].includes(arg))) {
    throw new Error('Usage: GuardBindingD1.mjs --remote [--require-migrated]');
  }

  BindingDatabaseGuard.verifyRemote(args.includes('--require-migrated'));
}
