"""Delegate Studio's MCP and Skill installation to mcp-install."""

import os
import sys
import sysconfig
from pathlib import Path

from mcp_install.Install import InstallCommand, loadAppConfig


class StudioInstaller:
    @classmethod
    def manifestPath(cls) -> Path:
        module = Path(__file__).resolve()
        packaged = module.parent / "install.config.json"

        if packaged.is_file():
            return packaged

        return module.parents[2] / "install.config.json"

    @classmethod
    def _launcherPath(cls) -> Path:
        if getattr(sys, "frozen", False):
            return Path(sys.executable)

        name = "nuwa-studio-mcp.exe" if os.name == "nt" else "nuwa-studio-mcp"
        return Path(sysconfig.get_path("scripts")) / name

    @classmethod
    def run(cls, uninstall: bool, overwrite: bool, printOnly: bool,
            target: str = "all", component: str = "auto") -> None:
        manifest = cls.manifestPath()
        arguments = ["--app-config", str(manifest), "--target", target,
                     "--component", component]

        if uninstall:
            arguments.append("--uninstall")
        if overwrite:
            arguments.append("--overwrite")
        if printOnly:
            arguments.append("--print")

        # Register the installed launcher, not an unpublished PyPI distribution.
        if component != "skill" and not uninstall:
            launcher = cls._launcherPath()
            if not launcher.is_file():
                raise RuntimeError("Install the Studio package before registering its MCP server.")

            os.environ.setdefault("NUWA_STUDIO_MCP_BINARY", str(launcher))

        args = InstallCommand.createParser().parse_args(arguments)
        InstallCommand(args, loadAppConfig(str(manifest)), manifest).run()
