"""Build the wheel, standalone executable and Windows Studio installer."""
import os
import shutil
import subprocess
from pathlib import Path


class BuildApplication:
    def __init__(self):
        self.root = Path(__file__).resolve().parent
        self.dist = self.root / 'dist'
        self.build = self.root / '.build'

    def runCommand(self, command: list[str]) -> None:
        print('$', ' '.join(command))
        subprocess.run(command, cwd=self.root, check=True)

    def run(self) -> None:
        if not shutil.which('uv'):
            raise RuntimeError('uv is required: https://docs.astral.sh/uv/')

        self.dist.mkdir(exist_ok=True)
        self.runCommand(['uv', 'build', '--wheel', '--out-dir', str(self.dist)])
        wheel = next(self.dist.glob('nuwa_agent_relay_studio_mcp-*.whl'), None)
        if not wheel:
            raise RuntimeError('Studio wheel was not created.')

        venv = self.build / 'venv'
        self.runCommand(['uv', 'venv', str(venv), '--python', '3.12', '--clear'])
        python = venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        self.runCommand([
            'uv', 'pip', 'install', '--python', str(python), '--reinstall',
            'pyinstaller>=6,<7', str(wheel),
        ])
        self.runCommand([
            str(python), '-m', 'PyInstaller', '--noconfirm', '--clean',
            '--onefile', '--console', '--name', 'nuwa-agent-relay-mcp',
            '--collect-all', 'fastmcp', '--collect-all', 'mcp',
            '--collect-all', 'mcp_install',
            '--add-data', str(self.root / 'scripts' / 'install.config.json') +
            os.pathsep + 'scripts',
            str(self.root / 'RunMCP.py'),
        ])

        executable = self.dist / ('nuwa-agent-relay-mcp.exe' if os.name == 'nt' else 'nuwa-agent-relay-mcp')
        if not executable.exists():
            raise RuntimeError('Studio executable was not created.')

        if os.name != 'nt':
            return

        candidates = [shutil.which('makensis.exe'), r'C:\Program Files (x86)\NSIS\makensis.exe']
        makeNSIS = next((value for value in candidates if value and Path(value).is_file()), None)
        if not makeNSIS:
            raise RuntimeError('NSIS is required to build NuwaAgentRelayStudioSetup.exe.')

        self.runCommand([
            makeNSIS, '/DEXE_PATH=' + str(executable.resolve()),
            '/DOUTPUT_PATH=' + str((self.dist / 'NuwaAgentRelayStudioSetup.exe').resolve()),
            str(self.root / 'scripts' / 'Installer.nsi'),
        ])


if __name__ == '__main__':
    BuildApplication().run()
