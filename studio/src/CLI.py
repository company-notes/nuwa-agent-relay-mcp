"""Studio command-line entrypoint for OAuth, identity, install and stdio."""

import argparse
import json
import logging
import getpass
import os

from .Auth import OAuthCredentials
from .Client import AddressClient, RelayClient, RemoteBindingClient
from .Config import LocalConfig
from .Installer import StudioInstaller
from .LocalSmoke import LocalEchoRoundTrip
from .RemoteSessionTransfer import RemoteSessionTransfer
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
        identity.add_argument("--create", action="store_true")
        identity.add_argument("--agent-name")
        identity.add_argument("--session-name")
        identity.add_argument("--resume-session-id")
        identity.add_argument("--resume-token-env")

        remoteBind = commands.add_parser("remote-bind",
                                         help="Transfer the selected Session Runtime to trusted Remote MCP.")
        remoteBind.add_argument("--mcp-origin", required=True)
        remoteBind.add_argument("--mcp-oauth-token-env", required=True)
        remoteBind.add_argument("--authorize-runtime-transfer", action="store_true")

        remoteRevoke = commands.add_parser("remote-revoke",
                                           help="Revoke a private Remote MCP Session binding.")
        remoteRevoke.add_argument("--mcp-origin", required=True)
        remoteRevoke.add_argument("--mcp-oauth-token-env", required=True)

        for name in ("install", "uninstall"):
            command = commands.add_parser(name)
            command.add_argument("--overwrite", action="store_true")
            command.add_argument("--print", dest="printOnly", action="store_true")

        send = commands.add_parser("send-to-agent",
                                   help="Send a real message as the selected Session.")
        send.add_argument("--to", required=True)
        send.add_argument("--message", required=True)
        send.add_argument("--subject")
        send.add_argument("--artifact-url", action="append", dest="artifactLinks")

        thread = commands.add_parser("thread", help="Read an authorized conversation.")
        thread.add_argument("--thread-id", required=True)

        receipt = commands.add_parser("receipt", help="Read one message's delivery evidence.")
        receipt.add_argument("--message-id", required=True)

        commands.add_parser("provision", help="Provision the selected Agent mailbox.")

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
    def selectIdentity(cls, args, config: LocalConfig, address: AddressClient) -> str:
        if args.create == bool(args.resume_session_id):
            raise ValueError("Choose either --create or --resume-session-id.")

        if args.resume_session_id:
            if args.agent_name or args.session_name:
                raise ValueError("Resume cannot create or rename an Agent or Session.")

            resumeToken = (os.environ.get(args.resume_token_env)
                           if args.resume_token_env
                           else config.requireResumeToken(args.resume_session_id))

            if not resumeToken:
                raise ValueError("Resume capability is missing from the selected environment variable.")

            identity = address.resumeSession(args.resume_session_id, resumeToken)
        else:
            if args.resume_token_env:
                raise ValueError("New Agent creation cannot use a Resume capability.")

            identity = address.claimAgent(args.agent_name, args.session_name)
            resumeToken = identity.get("resumeToken")

        session = identity.get("session")
        runtimeToken = identity.get("runtimeToken")

        if not isinstance(session, dict) or not isinstance(session.get("id"), str) or (
            not isinstance(runtimeToken, str) or not runtimeToken or
            not isinstance(resumeToken, str) or not resumeToken
        ):
            raise RuntimeError("Agent Address did not return valid Runtime and Resume capabilities.")

        config.selectSession(session["id"], runtimeToken, resumeToken)
        return session["canonical"]

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
            address = cls.selectIdentity(args, config, AddressClient(config.addressURL, credentials))
            print("Session identity selected: " + address)
            return

        if args.command in ("remote-bind", "remote-revoke"):
            token = os.environ.get(args.mcp_oauth_token_env)

            if not token:
                raise ValueError("Selected Remote MCP OAuth token is missing from the environment.")

            remote = RemoteBindingClient(args.mcp_origin, token)
            transfer = RemoteSessionTransfer(config,
                                             AddressClient(config.addressURL, credentials), remote)

            if args.command == "remote-bind":
                if not args.authorize_runtime_transfer:
                    raise ValueError("Explicit --authorize-runtime-transfer is required.")

                result = transfer.transfer()
            else:
                result = transfer.revoke()

            print(json.dumps(result, indent=2, ensure_ascii=False))
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
            result = relay.provisionAgentMailbox()
        elif args.command == "round-trip":
            result = LocalEchoRoundTrip(relay, config.requireSession()).run(args.to, args.timeout)
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
