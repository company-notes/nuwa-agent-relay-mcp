import { readFileSync, writeFileSync } from 'node:fs';

class SessionRouterPublication {
  static sourceCommit = 'dccda5d5b750249f67c2ad22ab18c29c7838ae44';
  static sourcePath = '.agents/skills/session-router/SKILL.md';
  static destination = new URL('../server/src/SessionRouterSkillDocument.ts', import.meta.url);

  static async run(check) {
    const repository = 'company-notes/ai-worker-gateway';
    const source = 'https://raw.githubusercontent.com/' + repository + '/' + this.sourceCommit + '/' + this.sourcePath;
    const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(30_000) });

    if (!response.ok) {
      throw new Error('Canonical Session Router Skill download failed: HTTP ' + response.status);
    }

    const skill = (await response.text()).replace(/\r\n/g, '\n');
    const document = [
      '// Generated from ai-worker-gateway@' + this.sourceCommit + '/' + this.sourcePath + '. Run node scripts/ImportSessionRouterSkill.mjs to regenerate.',
      'export const SESSION_ROUTER_SKILL_MD = ' + JSON.stringify(skill) + ';',
      '',
    ].join('\n');

    if (check) {
      if (readFileSync(this.destination, 'utf8').replace(/\r\n/g, '\n') !== document) {
        throw new Error('Published Session Router Skill differs from its pinned canonical source.');
      }

      return;
    }

    writeFileSync(this.destination, document);
  }
}

await SessionRouterPublication.run(process.argv.includes('--check'));
