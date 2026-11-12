import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export class LocalBindingsD1Scenario {
  static execute(sql) {
    const output = execFileSync('npx', [
      'wrangler', 'd1', 'execute', 'BINDINGS_DB', '--local',
      '--command', sql, '--json',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const records = JSON.parse(output);

    assert.ok(Array.isArray(records) && records.length === 1 &&
      records[0].success === true && Array.isArray(records[0].results));

    return records[0].results;
  }

  static verify() {
    const columns = this.execute('PRAGMA table_info(remote_session_bindings)')
      .map((value) => value.name);

    assert.deepEqual(columns, [
      'oauth_token_hash',
      'organization_id',
      'session_id',
      'encrypted_runtime_token',
      'expires_at',
      'created_at',
    ]);

    const key = crypto.randomUUID().replaceAll('-', '');
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + 15 * 60_000).toISOString();
    const nextExpiry = new Date(Date.now() + 20 * 60_000).toISOString();

    this.execute(`INSERT INTO remote_session_bindings
      (oauth_token_hash, organization_id, session_id,
       encrypted_runtime_token, expires_at, created_at)
      VALUES ('${key}', 'org-a', 'session-a', 'ciphertext-only', '${expiry}', '${now}')`);

    const saved = this.execute(`SELECT organization_id, session_id, encrypted_runtime_token
      FROM remote_session_bindings WHERE oauth_token_hash = '${key}'`);

    assert.deepEqual(saved, [{
      organization_id: 'org-a',
      session_id: 'session-a',
      encrypted_runtime_token: 'ciphertext-only',
    }]);

    this.execute(`UPDATE remote_session_bindings SET expires_at = '${nextExpiry}'
      WHERE oauth_token_hash = '${key}' AND session_id = 'session-a'
        AND encrypted_runtime_token = 'ciphertext-only'`);

    const updated = this.execute(`SELECT expires_at
      FROM remote_session_bindings WHERE oauth_token_hash = '${key}'`);

    assert.equal(updated[0].expires_at, nextExpiry);

    this.execute(`DELETE FROM remote_session_bindings
      WHERE oauth_token_hash = '${key}'`);

    assert.deepEqual(this.execute(`SELECT session_id FROM remote_session_bindings
      WHERE oauth_token_hash = '${key}'`), []);

    process.stdout.write('PASS: isolated local MCP binding D1 schema and lifecycle.\n');
  }
}

LocalBindingsD1Scenario.verify();
