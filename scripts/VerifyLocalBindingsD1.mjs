import assert from 'node:assert/strict';
import { WranglerRunner } from './WranglerRunner.mjs';

export class LocalBindingsD1Scenario {
  static execute(sql) {
    const output = WranglerRunner.execute([
      'd1', 'execute', 'BINDINGS_DB', '--local',
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
      'grant_fingerprint',
      'organization_id',
      'session_id',
      'canonical_address',
      'encrypted_runtime_token',
      'encrypted_resume_token',
      'expires_at',
      'created_at',
    ]);

    assert.deepEqual(this.execute('PRAGMA table_info(remote_work_agents)').map((value) => value.name), [
      'grant_fingerprint', 'organization_id', 'agent_id', 'mailbox_ready', 'created_at',
    ]);
    assert.deepEqual(this.execute('PRAGMA table_info(remote_work_session_bindings)').map((value) => value.name), [
      'binding_key', ...columns.slice(1),
    ]);

    const key = crypto.randomUUID().replaceAll('-', '');
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + 15 * 60_000).toISOString();
    const nextExpiry = new Date(Date.now() + 20 * 60_000).toISOString();

    this.execute(`INSERT INTO remote_session_bindings
      (grant_fingerprint, organization_id, session_id, canonical_address,
       encrypted_runtime_token, encrypted_resume_token, expires_at, created_at)
      VALUES ('${key}', 'org-a', 'session-a', 'nuwa/a/main',
        'runtime-ciphertext-only', 'resume-ciphertext-only', '${expiry}', '${now}')`);

    const saved = this.execute(`SELECT organization_id, session_id, canonical_address,
      encrypted_runtime_token, encrypted_resume_token
      FROM remote_session_bindings WHERE grant_fingerprint = '${key}'`);

    assert.deepEqual(saved, [{
      organization_id: 'org-a',
      session_id: 'session-a',
      canonical_address: 'nuwa/a/main',
      encrypted_runtime_token: 'runtime-ciphertext-only',
      encrypted_resume_token: 'resume-ciphertext-only',
    }]);

    this.execute(`UPDATE remote_session_bindings SET expires_at = '${nextExpiry}'
      WHERE grant_fingerprint = '${key}' AND session_id = 'session-a'
        AND encrypted_runtime_token = 'runtime-ciphertext-only'`);

    const updated = this.execute(`SELECT expires_at
      FROM remote_session_bindings WHERE grant_fingerprint = '${key}'`);

    assert.equal(updated[0].expires_at, nextExpiry);

    this.execute(`DELETE FROM remote_session_bindings
      WHERE grant_fingerprint = '${key}'`);

    assert.deepEqual(this.execute(`SELECT session_id FROM remote_session_bindings
      WHERE grant_fingerprint = '${key}'`), []);

    process.stdout.write('PASS: isolated local MCP binding D1 schema and lifecycle.\n');
  }
}

LocalBindingsD1Scenario.verify();
