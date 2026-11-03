import os
import sys
from pathlib import Path

from mcp_install.Install import main as installMain


class StudioInstaller:
    @classmethod
    def configPath(cls) -> Path:
        root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
        return root / 'scripts' / 'install.config.json'

    @classmethod
    def run(cls, uninstall: bool = False, overwrite: bool = False,
            printOnly: bool = False) -> None:
        if getattr(sys, 'frozen', False):
            os.environ['NUWA_MCP_BINARY'] = sys.executable

        arguments = ['--app-config', str(cls.configPath())]
        if uninstall:
            arguments.append('--uninstall')
        if overwrite:
            arguments.append('--overwrite')
        if printOnly:
            arguments.append('--print')

        original = sys.argv
        sys.argv = [original[0], *arguments]
        try:
            installMain()
        finally:
            sys.argv = original
