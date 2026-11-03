"""mcp_install desktop registration adapter."""

import os
import sys
from pathlib import Path

from mcp_install.Install import main as installMain


class StudioInstaller:
    @classmethod
    def manifestPath(cls) -> Path:
        return Path(__file__).resolve().parent.parent / "scripts" / "install.config.json"

    @classmethod
    def run(cls, uninstall: bool, overwrite: bool, printOnly: bool) -> None:
        arguments = ["--app-config", str(cls.manifestPath())]

        if uninstall:
            arguments.append("--uninstall")

        if overwrite:
            arguments.append("--overwrite")

        if printOnly:
            arguments.append("--print")

        originalArguments = sys.argv

        try:
            if getattr(sys, "frozen", False):
                os.environ["NUWA_STUDIO_MCP_BINARY"] = sys.executable

            sys.argv = [originalArguments[0], *arguments]
            installMain()
        finally:
            sys.argv = originalArguments
