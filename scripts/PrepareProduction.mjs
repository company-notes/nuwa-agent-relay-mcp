#!/usr/bin/env node
// Canonical production deployment: use the existing GitHub Cloudflare Secrets,
// resolve the one MCP D1 by its original resource name, and emit a temporary
// Wrangler config. Never commit resource IDs or encryption keys.
import { appendFile, readFile, writeFile } from 'node:fs/promises';

class ProductionConfiguration {
  static ACCOUNT_ID = 'b471fa2c14470c664eec0a37616accd6';
  static D1_NAME = 'nuwa-agent-relay-mcp';

  static require(name) {
    const value = (process.env[name] || '').trim();

    if (!value) {
      throw new Error(name + ' is required for production deployment.');
    }

    return value;
  }

  static async resolveDatabase(accountID, token) {
    const path = '/accounts/' + accountID + '/d1/database';
    const request = new URL('https://api.cloudflare.com/client/v4' + path);
    request.searchParams.set('per_page', '1000');
    request.searchParams.set('page', '1');
    request.searchParams.set('name', this.D1_NAME);

    const response = await fetch(request, {
      headers: { authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error('Cloudflare D1 discovery returned HTTP ' + response.status);
    }

    const result = await response.json();

    if (result.success !== true || !Array.isArray(result.result) ||
        (result.result_info?.total_count ?? result.result.length) > result.result.length) {
      throw new Error('Incomplete or paginated Cloudflare D1 result.');
    }

    const matches = result.result.filter((item) =>
      item.name === this.D1_NAME &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.uuid),
    );

    if (matches.length !== 1) {
      throw new Error('Expected exactly one canonical nuwa-agent-relay-mcp D1.');
    }

    return matches[0].uuid;
  }

  static async prepare() {
    const accountID = this.require('CLOUDFLARE_ACCOUNT_ID');

    if (accountID !== this.ACCOUNT_ID) {
      throw new Error('Unexpected Cloudflare account: refusing MCP deployment.');
    }

    const token = this.require('CLOUDFLARE_API_TOKEN');
    const d1ID = await this.resolveDatabase(accountID, token);
    const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
    const db = config.d1_databases?.find((item) => item.binding === 'BINDINGS_DB');

    if (config.name !== 'nuwa-agent-relay-mcp' || !db ||
        config.d1_databases.length !== 1 ||
        db.database_name !== this.D1_NAME ||
        config.routes?.length !== 1 ||
        config.routes[0]?.pattern !== 'mcp.agent-relay.company-notes.com' ||
        config.routes[0]?.custom_domain !== true ||
        config.services?.find((service) => service.binding === 'ADDRESS_WORKER')?.service !==
          'agent-address' ||
        config.services?.find((service) => service.binding === 'RELAY_WORKER')?.service !==
          'nuwa-agent-relay-api' ||
        config.vars?.ADDRESS_API_URL !== 'https://address.company-notes.com' ||
        config.vars?.RELAY_API_URL !== 'https://agent-relay.company-notes.com') {
      throw new Error('MCP Worker, D1, service binding or custom domain mismatch.');
    }

    db.database_id = d1ID;
    await writeFile('.wrangler.deploy.jsonc',
      JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });

    if (process.env.GITHUB_ENV) {
      await appendFile(process.env.GITHUB_ENV,
        'CLOUDFLARE_BINDINGS_D1_ID=' + d1ID + '\n');
    }

    console.log('Prepared canonical MCP Worker with verified named production D1.');
  }
}

await ProductionConfiguration.prepare();
