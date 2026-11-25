"""Build the Relay MCP wheel, standalone executable and Windows Setup."""

import os
import shutil
import subprocess
import tomllib
from pathlib import Path


class BuildApplication:
    def __init__(self):
        self.root = Path(__file__).resolve().parent
        self.dist = self.root / "dist"
        self.build = self.root / ".build"
        project = tomllib.loads((self.root / "pyproject.toml").read_text(encoding="utf-8"))["project"]
        self.name = project["name"]
        self.version = project["version"]

    def runCommand(self, command: list[str]) -> None:
        subprocess.run(command, cwd=self.root, check=True)

    def _buildWheel(self) -> Path:
        self.dist.mkdir(exist_ok=True)
        self.runCommand(["uv", "build", "--wheel", "--out-dir", str(self.dist)])
        wheel = next(self.dist.glob(f"{self.name.replace('-', '_')}-{self.version}-*.whl"), None)

        if wheel is None:
            raise RuntimeError("Relay MCP wheel was not generated.")

        return wheel

    def _buildExecutable(self, wheel: Path) -> None:
        venv = self.build / "venv"
        self.runCommand(["uv", "venv", str(venv), "--python", "3.12", "--clear"])
        python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

        self.runCommand([
            "uv", "pip", "install", "--python", str(python),
            "--reinstall", "pyinstaller>=6,<7", str(wheel),
        ])

        self.runCommand([
            str(python), "-m", "PyInstaller", "--noconfirm", "--clean",
            "--onefile", "--console", "--name", self.name,
            "--collect-all", "fastmcp", "--collect-data", "mcp",
            "--collect-all", "mcp_install", "--recursive-copy-metadata", "fastmcp",
            "--copy-metadata", self.name, "--copy-metadata", "session-peer",
            "--hidden-import", "session_peer",
            "--add-data", f'{self.root.parent / "install.config.json"}{os.pathsep}src',
            "--add-data", f'{self.root.parent / "skills" / "nuwa-agent-relay"}{os.pathsep}src/skills/nuwa-agent-relay',
            str(self.root / "RunMCP.py"),
        ])

    def run(self) -> None:
        if not shutil.which("uv"):
            raise RuntimeError("Install uv: https://docs.astral.sh/uv/")

        wheel = self._buildWheel()
        self._buildExecutable(wheel)

        if os.name == "nt":
            self._buildWindowsInstaller()

    def _buildWindowsInstaller(self) -> None:
        executable = self.dist / f"{self.name}.exe"
        if not executable.is_file():
            raise RuntimeError("Relay MCP executable was not generated.")

        candidates = [
            shutil.which("makensis.exe"),
            str(Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "NSIS" / "makensis.exe"),
        ]
        makensis = next((str(item) for item in candidates if item and Path(item).is_file()), None)
        if not makensis:
            raise RuntimeError("NSIS is required to build the Relay MCP Windows Setup.")

        self.runCommand([
            makensis, f"/DAPP_VERSION={self.version}", f"/DEXE_PATH={executable.resolve()}",
            f"/DOUTPUT_PATH={(self.dist / (self.name + '-setup.exe')).resolve()}",
            str(self.root / "scripts" / "Installer.nsi"),
        ])


if __name__ == "__main__":
    BuildApplication().run()
