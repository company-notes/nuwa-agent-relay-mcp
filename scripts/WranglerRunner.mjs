import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Invoke the locally installed Wrangler JavaScript entry point through Node.
 * Native Windows cannot reliably execFileSync('npx') or invoke .cmd files
 * without a shell. No shell or globally installed Wrangler is needed here.
 */
export class WranglerRunner {
  static packageURL = new URL('../node_modules/wrangler/package.json', import.meta.url);

  static executablePath() {
    const manifest = JSON.parse(readFileSync(this.packageURL, 'utf8'));
    const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.wrangler;

    if (typeof entry !== 'string' || !entry.endsWith('.js')) {
      throw new Error('The installed Wrangler package has no supported JavaScript CLI entry.');
    }

    const packageDirectory = dirname(fileURLToPath(this.packageURL));
    const executable = resolve(packageDirectory, entry);
    const relativePath = relative(packageDirectory, executable);

    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Refusing a Wrangler CLI entry outside its installed package.');
    }

    return executable;
  }

  static execute(args, options) {
    return execFileSync(process.execPath, [this.executablePath(), ...args], options);
  }
}
