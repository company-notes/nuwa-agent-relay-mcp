import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export function configHome() {
  const explicit = process.env.NUWA_MCP_HOME;

  if (explicit) {
    if (!isAbsolute(explicit)) {
      throw new Error('NUWA_MCP_HOME must be an absolute path.');
    }

    return resolve(explicit);
  }

  const parent = process.platform === 'win32'
    ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');

  return join(parent, 'nuwa-agent-relay-mcp');
}

export function authPath() { return join(configHome(), 'auth.json'); }
export function identityPath() { return join(configHome(), 'identity.json'); }

export async function readRecord(path) {
  let source;

  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') { return null; }

    throw error;
  }

  try {
    const data = JSON.parse(source);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('not an object');
    }

    return data;
  } catch {
    throw new Error('Local MCP configuration is invalid. Inspect or remove: ' + path);
  }
}

export async function writePrivate(path, data) {
  await mkdir(configHome(), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    await chmod(configHome(), 0o700);
  }

  const temp = path + '.' + process.pid + '.' + randomBytes(6).toString('hex') + '.tmp';

  try {
    await writeFile(temp, JSON.stringify(data, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temp, path);
    if (process.platform !== 'win32') {
      await chmod(path, 0o600);
    }
  } finally {
    await rm(temp, { force: true });
  }
}

export async function readAuth() { return readRecord(authPath()); }
export async function saveAuth(data) { return writePrivate(authPath(), data); }
export async function readIdentity() { return readRecord(identityPath()); }
export async function saveIdentity(data) { return writePrivate(identityPath(), data); }
export async function logout() { await rm(authPath(), { force: true }); }
