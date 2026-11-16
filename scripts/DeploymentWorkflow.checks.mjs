import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

class DeploymentWorkflow {
  static readonly path = new URL('../.github/workflows/verify.yml', import.meta.url);

  static job(name) {
    const source = readFileSync(this.path, 'utf8');
    const section = source.split('\n  ' + name + ':\n')[1];

    assert.ok(section, 'Workflow must define the ' + name + ' job');

    return section.split(/\n  [a-z][a-z-]*:\n/)[0];
  }
}

test('a merged PR runs verification but cannot automatically migrate or deploy production', () => {
  const source = readFileSync(DeploymentWorkflow.path, 'utf8');

  assert.match(source, /push:\s*\n\s+branches: \[main\]/);

  for (const name of ['deploy', 'smoke']) {
    const job = DeploymentWorkflow.job(name);

    assert.match(job, /github\.event_name == 'workflow_dispatch'/);
    assert.match(job, /github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(job, /github\.event_name != 'pull_request'/);
  }
});
