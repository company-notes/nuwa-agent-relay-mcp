"""Optional wheel, standalone Studio executable, and Windows NSIS installer."""

import os
import shutil
import subprocess
from pathlib import Path


class BuildApplication:
    def __init__(self):
        self.root = Path(__file__).resolve().parent
        self.dist = self.root / "dist"
        self.build = self.root / ".build"

    def runCommand(self, command: list[str]) -> None:
        subprocess.run(command, cwd=self.root, check=True)

    def run(self) -> None:
        if not shutil.which("uv"):
            raise RuntimeError("Install uv: https://docs.astral.sh/uv/")

        self.dist.mkdir(exist_ok=True)
        self.runCommand(["uv", "build", "--wheel", "--out-dir", str(self.dist)])
        wheel = next(self.dist.glob("nuwa_agent_relay_studio_mcp-*.whl"), None)

        if wheel is None:
            raise RuntimeError("Studio MCP wheel was not generated.")

        venv = self.build / "venv"
        self.runCommand(["uv", "venv", str(venv), "--python", "3.12", "--clear"])
        python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

        self.runCommand([
            "uv", "pip", "install", "--python", str(python),
            "--reinstall", "pyinstaller>=6,<7", str(wheel),
        ])

        self.runCommand([
            str(python), "-m", "PyInstaller", "--noconfirm", "--clean",
            "--onefile", "--console", "--name", "nuwa-studio-mcp",
            "--collect-all", "fastmcp", "--collect-all", "mcp",
            "--collect-all", "mcp_install",
            "--add-data", f'{self.root.parent / "install.config.json"}{os.pathsep}src',
            "--add-data", f'{self.root.parent / "skills" / "nuwa-agent-relay"}{os.pathsep}src/skills/nuwa-agent-relay',
            str(self.root / "RunMCP.py"),
        ])

        if os.name == "nt":
            self._buildWindowsInstaller()

    def _buildWindowsInstaller(self) -> None:
        executable = self.dist / "nuwa-studio-mcp.exe"

        if not executable.is_file():
            raise RuntimeError("Studio executable was not generated.")

        candidates = [
            shutil.which("makensis.exe"),
            r"C:\Program Files (x86)\NSIS\makensis.exe",
        ]
        makensis = next(
            (str(item) for item in candidates if item and Path(item).is_file()),
            None,
        )

        if not makensis:
            raise RuntimeError("NSIS is required to build NuwaStudioMCPSetup.exe.")

        self.runCommand([
            makensis, f"/DEXE_PATH={executable.resolve()}",
            f"/DOUTPUT_PATH={(self.dist / 'NuwaStudioMCPSetup.exe').resolve()}",
            str(self.root / "scripts" / "Installer.nsi"),
        ])


if __name__ == "__main__":
    BuildApplication().run()
