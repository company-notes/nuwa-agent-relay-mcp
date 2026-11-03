export function originFor(envName, fallback) {
  const value = process.env[envName] || fallback;
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(envName + ' must be an HTTPS origin.');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(envName + ' must be an HTTPS origin without path, query or credentials.');
  }

  return parsed.origin;
}

export function addressOrigin() {
  return originFor('NUWA_ADDRESS_URL', 'https://address.company-notes.com');
}

export function relayOrigin() {
  return originFor('NUWA_RELAY_URL', 'https://agent-relay.company-notes.com');
}

export function activeWorkId(identity) {
  const id = process.env.NUWA_WORK_ID || identity?.workId;

  if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error(
      'No valid Work ID selected. Run npm run status, then ' +
      'npm run identity -- --work-id <ownedWorkUUID>, ' +
      'or set NUWA_WORK_ID in the MCP client environment.',
    );
  }

  return id;
}
