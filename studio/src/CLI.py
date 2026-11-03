"""Studio command-line entrypoint for OAuth, identity, install and stdio."""

import argparse

from .Auth import OAuthCredentials
from .Client import AddressClient
from .Config import LocalConfig
from .Installer import StudioInstaller
from .Server import StudioMCP


class StudioCLI:
    @classmethod
    def createParser(cls) -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(prog="nuwa-studio-mcp")
        parser.add_argument("--version", action="version", version="0.2.0")
        commands = parser.add_subparsers(dest="command", required=True)

        for name in ("login", "logout", "status", "run"):
            commands.add_parser(name)

        identity = commands.add_parser("identity")
        identity.add_argument("--work-id")
        identity.add_argument("--host")
        identity.add_argument("--handle")
        identity.add_argument("--organization")
        identity.add_argument("--create-host", action="store_true")
        identity.add_argument("--create-organization", action="store_true")

        for name in ("install", "uninstall"):
            command = commands.add_parser(name)
            command.add_argument("--overwrite", action="store_true")
            command.add_argument("--print", dest="printOnly", action="store_true")

        return parser

    @classmethod
    def selectIdentity(cls, args, config: LocalConfig, address: AddressClient) -> None:
        if args.work_id:
            if args.host or args.handle or args.organization:
                raise ValueError("--work-id cannot be combined with new Work options.")

            status = address.status(args.work_id)
            work = status.get("work")

            if not work or work["id"] != args.work_id or not work.get("active"):
                raise ValueError("Selected Work is not active or not owned by this account.")

            config.selectWork(args.work_id)
            return

        if not args.host or not args.handle:
            raise ValueError("Supply --work-id or --host and --handle.")

        current = address.status()
        organization = current.get("organization")

        if not organization and (not args.organization or not args.create_organization):
            raise ValueError("New Organizations require --organization and --create-organization.")

        if organization and args.organization and organization["slug"] != args.organization:
            raise ValueError("Requested Organization differs from account Organization.")

        if not any(host["path"] == args.host for host in current.get("hosts", [])) and not args.create_host:
            raise ValueError("New Hosts require explicit --create-host.")

        work = address.claimWork(args.host, args.handle, args.organization)["work"]
        config.selectWork(work["id"])

    @classmethod
    def run(cls) -> None:
        args = cls.createParser().parse_args()

        config = LocalConfig.load()
        credentials = OAuthCredentials(config)

        if args.command == "login":
            credentials.login()
            print("登入成功。")
            return

        if args.command == "logout":
            credentials.logout()
            print("本機憑證已清除。遠端 OAuth Grant 未撤銷。")
            return

        if args.command == "status":
            print(AddressClient(config.addressURL, credentials).status())
            return

        if args.command == "identity":
            cls.selectIdentity(args, config, AddressClient(config.addressURL, credentials))
            print("Work Identity 已保存。")
            return

        if args.command in ("install", "uninstall"):
            StudioInstaller.run(args.command == "uninstall", args.overwrite, args.printOnly)
            return

        StudioMCP(config).run()


def main() -> None:
    StudioCLI.run()
