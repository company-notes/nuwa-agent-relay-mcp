import { login } from './auth.mjs';
import { RelayClient } from './relay-client.mjs';
import { logout, readIdentity, saveIdentity } from './storage.mjs';

function flagValue(args, name) {
  const index = args.indexOf(name);

  if (index < 0) { return null; }
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(name + ' needs a value.');
  }

  return value;
}

function usage() {
  return [
    'Usage:',
    '  npm run login',
    '  npm run status',
    '  npm run identity -- --work-id <owned Work UUID>',
    '  npm run identity -- --host <existing Host> --handle <new Work name>',
    '  npm run identity -- --host <new Host> --handle <new Work> --create-host',
    '  npm run identity -- --host <Host> --handle <Work> --organization <slug> --create-organization',
    '  npm run logout',
    '',
    'Identity creation uses real Agent Address resources. No automatic MailTrigger provisioning.',
  ].join('\n');
}

async function setIdentity(client, args) {
  const existingWork = flagValue(args, '--work-id');
  const hostName = flagValue(args, '--host');
  const handle = flagValue(args, '--handle');
  const orgName = flagValue(args, '--organization');

  if (existingWork && (hostName || handle || orgName)) {
    throw new Error('--work-id cannot be combined with --host, --handle or --organization.');
  }

  let result;

  if (existingWork) {
    const status = await client.identityStatus(existingWork);

    if (!status?.organization?.id || status.work?.id !== existingWork ||
        status.work?.active !== true ||
        !status.hosts?.some((host) => host.id === status.work.parentAddressId)) {
      throw new Error('Work is not an active identity owned by this OAuth account.');
    }

    result = { work: status.work, host: status.hosts.find(
      (host) => host.id === status.work.parentAddressId,
    ), organization: status.organization };
  } else {
    if (!hostName || !handle || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hostName) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
      throw new Error('Provide --host and --handle (lowercase letters, digits, hyphens).');
    }

    const status = await client.identityStatus();

    if (!status?.organization?.id && (!orgName || !args.includes('--create-organization'))) {
      throw new Error('No Organization exists. Explicitly specify ' +
        '--organization <slug> --create-organization to create a persistent Organization.');
    }

    if (status?.organization && orgName && orgName !== status.organization.slug) {
      throw new Error('Your account already belongs to Organization ' + status.organization.slug);
    }

    const hasHost = status?.hosts?.some((host) => host.path === hostName);

    if (!hasHost && !args.includes('--create-host')) {
      throw new Error('Host does not exist. Specify --create-host to explicitly allow creating ' +
        'the permanent Host ' + hostName);
    }

    result = await client.claimWork({
      host: hostName,
      handle,
      ...(orgName ? { organization: orgName } : {}),
    });
  }

  if (!result?.work?.id || !result?.host?.id || !result?.organization?.id) {
    throw new Error('Agent Address did not return a complete Work/Host/Organization.');
  }

  await saveIdentity({
    version: 1,
    workId: result.work.id,
    canonical: result.work.canonical,
    hostId: result.host.id,
    organizationId: result.organization.id,
  });

  process.stdout.write('Work selected: ' + result.work.canonical +
    '\nWork ID: ' + result.work.id + '\n');
  process.stdout.write('Identity selection saved privately on this computer. ' +
    'The MCP server will use only this Work.\n');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'login') {
    const file = await login();
    process.stdout.write('登入完成。OAuth 憑證儲存在本機：' + file +
      '\n下一步：npm run status；npm run identity -- --work-id <ownedWorkUUID>\n');
    return;
  }

  if (command === 'logout') {
    await logout();
    process.stdout.write('已刪除本機 OAuth 檔案；未撤銷遠端 OAuth Grant。\n');
    return;
  }

  if (command === 'status') {
    const client = new RelayClient();
    const status = await client.identityStatus();
    const selected = await readIdentity();

    process.stdout.write(JSON.stringify({
      organization: status.organization,
      hosts: status.hosts,
      selectedWorkId: process.env.NUWA_WORK_ID || selected?.workId || null,
    }, null, 2) + '\n');
    return;
  }

  if (command === 'identity') {
    await setIdentity(new RelayClient(), args);
    return;
  }

  throw new Error(usage());
}

main().catch((error) => {
  process.stderr.write('Nuwa MCP setup failed: ' +
    (error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
