import { readFileSync, writeFileSync } from 'node:fs';

const skill = readFileSync(new URL('../skills/nuwa-agent-relay/SKILL.md', import.meta.url), 'utf8');
const output = '// Generated from skills/nuwa-agent-relay/SKILL.md. Run node scripts/GenerateSkill.mjs to regenerate.\\n'
  .replace('\\n', '\n') + 'export const AGENT_SKILL_MD = ' + JSON.stringify(skill) + ';\\n'.replace('\\n', '\n');
writeFileSync(new URL('../server/src/SkillDocument.ts', import.meta.url), output);
