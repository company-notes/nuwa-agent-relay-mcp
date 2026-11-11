"""Studio command-line entrypoint for OAuth, identity, install and stdio."""

import argparse
import json
import logging
import getpass
import os

from .Auth import OAuthCredentials
from .Client import AddressClient, RelayClient
from .Config import LocalConfig
from .Installer import StudioInstaller
from .LocalSmoke import LocalEchoRoundTrip
from .Server import StudioMCP
from .WakeReceiver import WakeReceiver
from .WakeSubscription import WakeSubscription


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

        send = commands.add_parser("send-to-agent",
                                   help="Send a real message as the selected Work.")
        send.add_argument("--to", required=True)
        send.add_argument("--message", required=True)
        send.add_argument("--subject")
        send.add_argument("--artifact-url", action="append", dest="artifactLinks")

        thread = commands.add_parser("thread", help="Read an authorized conversation.")
        thread.add_argument("--thread-id", required=True)

        receipt = commands.add_parser("receipt", help="Read one message's delivery evidence.")
        receipt.add_argument("--message-id", required=True)

        commands.add_parser("provision", help="Provision the selected Host mailbox.")

        roundTrip = commands.add_parser("round-trip",
                                        help="Send once and verify B's signed Wake Echo reply.")
        roundTrip.add_argument("--to", required=True)
        roundTrip.add_argument("--timeout", type=float, default=45.0)

        wake = commands.add_parser("wake", help="Manage and run an Agent Wake receiver.")
        wakeCommands = wake.add_subparsers(dest="wakeCommand", required=True)

        wakeRegister = wakeCommands.add_parser("register")
        wakeRegister.add_argument("callbackURL", nargs="?",
                                  help="Public HTTPS webhook; omit to enter privately.")
        wakeRegister.add_argument("--auth-mode", choices=("hmac", "bearer", "capability"),
                                  default="hmac")
        wakeRegister.add_argument("--bearer-env",
                                  help="Environment variable holding a private Bearer token.")
        wakeVerify = wakeCommands.add_parser("verify")
        wakeVerify.add_argument("--verification-id", required=True)
        wakeVerify.add_argument("--challenge-env",
                                help="Environment variable holding one-time challenge; "
                                     "otherwise enter privately.")
        wakeCommands.add_parser("status")
        wakeCommands.add_parser("unregister")
        wakeListen = wakeCommands.add_parser("listen")
        wakeListen.add_argument("--port", type=int, default=8765)

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
            print("Signed in successfully.")
            return

        if args.command == "logout":
            credentials.logout()
            print("Local credentials removed. Remote OAuth grants remain active.")
            return

        if args.command == "status":
            print(AddressClient(config.addressURL, credentials).status())
            return

        if args.command == "identity":
            cls.selectIdentity(args, config, AddressClient(config.addressURL, credentials))
            print("Work identity saved.")
            return

        if args.command in ("install", "uninstall"):
            StudioInstaller.run(args.command == "uninstall", args.overwrite, args.printOnly)
            return

        if args.command == "run":
            StudioMCP(config).run()
            return

        relay = RelayClient(config, credentials)

        if args.command == "send-to-agent":
            result = relay.sendMessage(args.to, args.message, args.subject, args.artifactLinks)
        elif args.command == "thread":
            result = relay.threadHistory(args.thread_id)
        elif args.command == "receipt":
            result = relay.receipt(args.message_id)
        elif args.command == "provision":
            result = relay.provisionHostMailbox()
        elif args.command == "round-trip":
            result = LocalEchoRoundTrip(relay, config.requireWork()).run(args.to, args.timeout)
        elif args.command == "wake":
            subscription = WakeSubscription(config, relay)

            if args.wakeCommand == "register":
                callbackURL = args.callbackURL or getpass.getpass("Webhook HTTPS URL: ")
                bearerToken = None

                if args.auth_mode == "bearer":
                    bearerToken = (os.environ.get(args.bearer_env) if args.bearer_env else
                                   getpass.getpass("Webhook Bearer token: "))

                result = subscription.register(callbackURL, args.auth_mode, bearerToken)
            elif args.wakeCommand == "verify":
                challenge = (os.environ.get(args.challenge_env) if args.challenge_env else
                             getpass.getpass("Challenge from Agent's Wake webhook: "))
                if not challenge:
                    raise ValueError("Wake verification challenge is required.")
                result = subscription.verify(args.verification_id, challenge)
            elif args.wakeCommand == "status":
                result = subscription.status()
            elif args.wakeCommand == "unregister":
                result = subscription.remove()
            elif args.wakeCommand == "listen":
                logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
                WakeReceiver(config, relay).serve(args.port)
                return
            else:
                raise ValueError("Unsupported Wake command.")
        else:
            raise ValueError("Unsupported Studio command.")

        print(json.dumps(result, indent=2, ensure_ascii=False))


def main() -> None:
    StudioCLI.run()
