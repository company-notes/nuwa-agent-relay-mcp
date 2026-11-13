import assert from 'node:assert/strict';
import test from 'node:test';

import { AddressAPIClient, APIError } from '../src/APIClients';
import { ColleagueDirectory } from '../src/ColleagueDirectory';

test('a displayed Bot name never resolves to an identity outside the authorized Organization', async () => {
  const address = {
    listAgents: async () => [{
      handle: 'bear', displayName: '大熊', defaultSessionHandle: 'main',
    }],
    status: async () => ({ organization: { slug: 'company' } }),
    resolve: async () => ({ canonical: 'another-company/bear/main' }),
  } as unknown as AddressAPIClient;

  await assert.rejects(
    new ColleagueDirectory(address).find('大熊'),
    (error: unknown) => error instanceof APIError &&
      error.code === 'invalid_recipient_identity',
  );
});

test('an invalid directory response cannot be treated as a unique coworker', async () => {
  const address = {
    listAgents: async () => [{
      handle: 'bear', displayName: 123, defaultSessionHandle: 'main',
    }],
  } as unknown as AddressAPIClient;

  await assert.rejects(
    new ColleagueDirectory(address).find('大熊'),
    (error: unknown) => error instanceof APIError &&
      error.code === 'invalid_agent_directory',
  );
});
