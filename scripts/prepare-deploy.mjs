import { readFile, writeFile } from 'node:fs/promises';

export class DeploymentConfig {
  static validateOrigin(value, label) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' ||
        url.username || url.password || url.search || url.hash) {
      throw new Error(label + ' must be a bare HTTPS origin.');
    }
    return url.origin;
  }

  static validateDomain(value) {
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ||
        value.includes('..') || !value.endsWith('.company-notes.com')) {
      throw new Error('CLOUDFLARE_CUSTOM_DOMAIN must be under company-notes.com.');
    }
    return value;
  }

  static async prepare() {
    const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
    const name = process.env.CLOUDFLARE_WORKER_NAME;
    if (name) {
      if (!/^[a-z0-9-]+$/.test(name)) {
        throw new Error('Invalid CLOUDFLARE_WORKER_NAME.');
      }
      config.name = name;
    }

    for (const [key, label] of [['ADDRESS_API_URL', 'Agent Address'],
                                ['RELAY_API_URL', 'Nuwa Relay']]) {
      if (process.env[key]) {
        config.vars[key] = DeploymentConfig.validateOrigin(process.env[key], label);
      }
    }

    const domain = process.env.CLOUDFLARE_CUSTOM_DOMAIN;
    if (domain) {
      config.routes = [{ pattern: DeploymentConfig.validateDomain(domain), custom_domain: true }];
    }

    await writeFile('.wrangler.deploy.jsonc', JSON.stringify(config, null, 2) + '\n', {
      flag: 'w', mode: 0o600,
    });
    console.log('Prepared Cloudflare deployment without storing credentials.');
  }
}

await DeploymentConfig.prepare();
