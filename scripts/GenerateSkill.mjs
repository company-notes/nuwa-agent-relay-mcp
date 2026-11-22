import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../skills/nuwa-agent-relay/', import.meta.url);
const skill = readFileSync(new URL('SKILL.md', root), 'utf8').replace(/\r\n/g, '\n');
const references = ['grokbot.md', 'openmausbot.md', 'rakazo.md', 'work-clients.md'];

writeFileSync(new URL('../server/src/SkillDocument.ts', import.meta.url), [
  '// Generated from skills/nuwa-agent-relay/SKILL.md. Run node scripts/GenerateSkill.mjs to regenerate.',
  'export const AGENT_SKILL_MD = ' + JSON.stringify(skill) + ';',
  '',
].join('\n'));

const entries = references.map((name) => {
  const content = readFileSync(new URL('references/' + name, root), 'utf8').replace(/\r\n/g, '\n');
  return '  ' + JSON.stringify(name) + ': ' + JSON.stringify(content) + ',';
});

writeFileSync(new URL('../server/src/SkillReferences.ts', import.meta.url), [
  '// Generated from skills/nuwa-agent-relay/references/*.md. Run node scripts/GenerateSkill.mjs.',
  'export const AGENT_SKILL_REFERENCES: Readonly<Record<string, string>> = {',
  ...entries,
  '};',
  '',
].join('\n'));
