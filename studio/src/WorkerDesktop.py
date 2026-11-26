"""Windowless desktop entrypoint for the optional local Worker Provider."""

import argparse
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .Auth import OAuthCredentials
from .Config import LocalConfig
from .WorkerBridgeClient import WorkerBridgeClient
from .WorkerBridgeService import WorkerBridgeService
from .WorkerPairPage import WorkerPairPage
from .WorkerProvider import WorkerProvider
from .WorkerServiceManager import WindowsWorkerService


class WorkerDesktop:
    @classmethod
    def run(cls) -> None:
        parser = argparse.ArgumentParser(prog="nuwa-studio-worker")
        parser.add_argument("command", choices=("pair", "serve"))
        parser.add_argument("--home", type=Path)
        args = parser.parse_args()

        if args.home is not None:
            if not args.home.is_absolute():
                raise ValueError("Studio home must be absolute.")

            os.environ["NUWA_MCP_HOME"] = str(args.home)

        config = LocalConfig.load()
        directory = config.configDir()
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                            handlers=[RotatingFileHandler(directory / ("worker-" + args.command + ".log"),
                                                          maxBytes=1_048_576, backupCount=2, encoding="utf-8")])
        # HTTP client URLs and exception details are not part of the operational log.
        logging.getLogger("httpx").setLevel(logging.WARNING)
        credentials = OAuthCredentials(config)
        service = WorkerBridgeService(config, WorkerBridgeClient(credentials), WorkerProvider())

        if args.command == "serve":
            service.serve()
            return

        manager = WindowsWorkerService(config, Path(sys.executable))
        WorkerPairPage(service, credentials, manager).run()


def main() -> None:
    try:
        WorkerDesktop.run()
    except Exception as error:
        logging.getLogger(__name__).error("Worker desktop failed (errorType=%s)", type(error).__name__)

        raise SystemExit(1) from None
