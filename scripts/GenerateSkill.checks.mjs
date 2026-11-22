import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const generator = new URL('./GenerateSkill.mjs', import.meta.url);
const source = new URL('../skills/nuwa-agent-relay/SKILL.md', import.meta.url);
const destination = new URL('../server/src/SkillDocument.ts', import.meta.url);
const referenceDestination = new URL('../server/src/SkillReferences.ts', import.meta.url);
const referenceNames = ['grokbot.md', 'openmausbot.md', 'rakazo.md', 'work-clients.md'];

for (const [label, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`published Skill regenerates byte-for-byte from ${label} checkout`, (context) => {
    const root = mkdtempSync(join(tmpdir(), 'nuwa-skill-'));
    context.after(() => rmSync(root, { recursive: true, force: true }));

    const scripts = join(root, 'scripts');
    const skills = join(root, 'skills', 'nuwa-agent-relay');
    const server = join(root, 'server', 'src');
    for (const directory of [scripts, skills, server]) {
      mkdirSync(directory, { recursive: true });
    }

    const entry = join(scripts, 'GenerateSkill.mjs');
    const skill = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
    const expected = readFileSync(destination);
    const expectedReferences = readFileSync(referenceDestination);
    copyFileSync(generator, entry);
    writeFileSync(join(skills, 'SKILL.md'), skill.replace(/\n/g, newline));
    mkdirSync(join(skills, 'references'), { recursive: true });
    for (const name of referenceNames) {
      const sourceText = readFileSync(new URL('../skills/nuwa-agent-relay/references/' + name, import.meta.url), 'utf8');
      writeFileSync(join(skills, 'references', name), sourceText.replace(/\r\n/g, '\n').replace(/\n/g, newline));
    }

    execFileSync(process.execPath, [entry]);

    assert.deepEqual(readFileSync(join(server, 'SkillDocument.ts')), expected);
    assert.deepEqual(readFileSync(join(server, 'SkillReferences.ts')), expectedReferences);
  });
}
