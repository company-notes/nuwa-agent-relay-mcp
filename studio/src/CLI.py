import argparse
import os
import sys

from .Client import RelayClient
from .Config import LocalConfig
from .Install import StudioInstaller
from .OAuth import OAuthLogin
from .Server import StudioMCP


class StudioCLI:
    @classmethod
    def parser(cls) -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(prog='nuwa-agent-relay-mcp')
        parser.add_argument('--version', action='version', version='0.2.0')
        parser.add_argument('--profile', help='Isolated Studio client identity (default: default)')
        commands = parser.add_subparsers(dest='command', required=True)
        commands.add_parser('login')
        commands.add_parser('logout')
        commands.add_parser('status')
        identity = commands.add_parser('identity')
        identity.add_argument('--work-id', dest='workId')
        identity.add_argument('--host')
        identity.add_argument('--handle')
        identity.add_argument('--organization')
        identity.add_argument('--create-host', dest='createHost', action='store_true')
        identity.add_argument('--create-organization', dest='createOrganization', action='store_true')
        install = commands.add_parser('install')
        install.add_argument('--overwrite', action='store_true')
        install.add_argument('--print', dest='printOnly', action='store_true')
        commands.add_parser('uninstall')
        commands.add_parser('run')
        return parser

    @classmethod
    def selectIdentity(cls, client: RelayClient, args: argparse.Namespace) -> None:
        if args.workId:
            if args.host or args.handle or args.organization or args.createHost or args.createOrganization:
                raise ValueError('--work-id cannot be combined with creation arguments.')

            work = client.updateWork(args.workId)
            print('Selected Work: ' + work['canonical'])
            return

        if not args.host or not args.handle:
            raise ValueError('Provide --work-id, or --host and --handle to create a Work.')

        status = client.address('/v1/account/status')
        organization = status.get('organization')
        if not organization and (not args.organization or not args.createOrganization):
            raise ValueError('Creating an Organization requires --organization and --create-organization.')

        if organization and args.organization and organization['slug'] != args.organization:
            raise ValueError('OAuth account already belongs to a different Organization.')

        hosts = status.get('hosts') or []
        if not any(host['path'] == args.host for host in hosts) and not args.createHost:
            raise ValueError('Host is new. Specify --create-host to permit permanent creation.')

        payload = {'host': args.host, 'handle': args.handle}
        if args.organization:
            payload['organization'] = args.organization

        created = client.address('/v1/account/work', 'POST', payload)
        work = client.updateWork(created['work']['id'])
        print('Selected Work: ' + work['canonical'])

    @classmethod
    def run(cls, argv: list[str] | None = None) -> None:
        args = cls.parser().parse_args(argv)
        if args.profile is not None:
            os.environ['NUWA_MCP_PROFILE'] = args.profile
        LocalConfig.profile()

        if args.command == 'install':
            StudioInstaller.run(overwrite=args.overwrite, printOnly=args.printOnly)
            return
        if args.command == 'uninstall':
            StudioInstaller.run(uninstall=True)
            return
        if args.command == 'logout':
            LocalConfig.logout()
            print('Local credentials deleted. Remote OAuth grants and Work resources remain.')
            return
        if args.command == 'login':
            OAuthLogin().login()
            print('Signed in. Run nuwa-agent-relay-mcp identity --work-id <owned Work UUID>.')
            return

        client = RelayClient()
        try:
            if args.command == 'status':
                status = client.address('/v1/account/status')
                print('Organization: ' + str((status.get('organization') or {}).get('slug')))
                print('Selected Work ID: ' + str(client.config.workAddressId))
                print('Hosts: ' + ', '.join(host['path'] for host in (status.get('hosts') or [])))
                return
            if args.command == 'identity':
                cls.selectIdentity(client, args)
                return
            if args.command == 'run':
                StudioMCP(client).createServer().run()
                return
        finally:
            client.close()


def main() -> None:
    try:
        StudioCLI.run()
    except (RuntimeError, ValueError, OSError) as error:
        print('Nuwa Studio MCP: ' + str(error), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
