import { readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../skills/nuwa-agent-relay/SKILL.md', import.meta.url);
const destination = new URL('../server/src/SkillDocument.ts', import.meta.url);
const skill = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');

const generated = [
  '// Generated from skills/nuwa-agent-relay/SKILL.md. Run node scripts/GenerateSkill.mjs to regenerate.',
  'export const AGENT_SKILL_MD = ' + JSON.stringify(skill) + ';',
  '',
].join('\n');

writeFileSync(destination, generated);
