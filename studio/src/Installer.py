"""mcp_install desktop registration adapter."""

import os
import sys
from pathlib import Path

from mcp_install.Install import main as installMain

from .SkillInstaller import StudioSkillInstaller


class StudioInstaller:
    @classmethod
    def manifestPath(cls) -> Path:
        return Path(__file__).resolve().parent.parent / "scripts" / "install.config.json"

    @classmethod
    def run(cls, uninstall: bool, overwrite: bool, printOnly: bool,
            targets: list[str] | None = None) -> None:
        selected = targets or ["all"]
        arguments = ["--app-config", str(cls.manifestPath()), "--target", ",".join(selected)]

        if uninstall:
            arguments.append("--uninstall")

        if overwrite:
            arguments.append("--overwrite")

        if printOnly:
            arguments.append("--print")

        paths = StudioSkillInstaller.paths(selected)
        if printOnly:
            print("Nuwa Skill installation targets:")
            for path in paths:
                print("  " + str(path))
        elif uninstall:
            StudioSkillInstaller.uninstall(selected)
        else:
            StudioSkillInstaller.install(selected, overwrite=overwrite)

        originalArguments = sys.argv

        try:
            if getattr(sys, "frozen", False):
                os.environ["NUWA_STUDIO_MCP_BINARY"] = sys.executable

            sys.argv = [originalArguments[0], *arguments]
            installMain()
        finally:
            sys.argv = originalArguments
