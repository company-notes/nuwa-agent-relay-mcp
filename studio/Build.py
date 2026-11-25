"""Build the Relay MCP wheel, standalone executable and Windows Setup."""

import hashlib
import os
import shutil
import subprocess
import tomllib
import urllib.request
import zipfile
from pathlib import Path


class BuildApplication:
    def __init__(self):
        self.root = Path(__file__).resolve().parent
        self.dist = self.root / "dist"
        self.build = self.root / ".build"
        project = tomllib.loads((self.root / "pyproject.toml").read_text(encoding="utf-8"))["project"]
        self.name = project["name"]
        self.version = project["version"]
        self.peerRequirement = next(item for item in project["dependencies"] if item.startswith("session-peer=="))

    def runCommand(self, command: list[str]) -> None:
        subprocess.run(command, cwd=self.root, check=True)

    def _buildWheel(self) -> Path:
        self.dist.mkdir(exist_ok=True)
        self.runCommand(["uv", "build", "--wheel", "--out-dir", str(self.dist)])
        wheel = next(self.dist.glob(f"{self.name.replace('-', '_')}-{self.version}-*.whl"), None)

        if wheel is None:
            raise RuntimeError("Relay MCP wheel was not generated.")

        return wheel

    def _buildPeerRuntime(self, python: Path) -> Path:
        """Supply a real interpreter for session-peer's native Windows subprocesses."""
        archive = self.build / "python-3.13.17-embed-amd64.zip"
        runtime = self.build / "peer-runtime"
        url = "https://www.python.org/ftp/python/3.13.17/" + archive.name
        checksum = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38"

        if not archive.is_file():
            with urllib.request.urlopen(url, timeout=120) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)

        if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
            archive.unlink()
            raise RuntimeError("Embedded Python archive failed SHA-256 verification.")

        if runtime.exists():
            shutil.rmtree(runtime)

        runtime.mkdir()
        with zipfile.ZipFile(archive) as package:
            package.extractall(runtime)

        with (runtime / "python313._pth").open("a", encoding="utf-8") as paths:
            paths.write("\nsite-packages\n")

        self.runCommand([
            "uv", "pip", "install", "--python", str(python),
            "--target", str(runtime / "site-packages"), "--only-binary", ":all:",
            self.peerRequirement,
        ])

        # Exercise the upstream Windows process inspector with real OS evidence.
        # A frozen executable substituted for sys.executable cannot do this.
        self.runCommand([
            str(runtime / "python.exe"), "-X", "utf8", "-c",
            "import os, session_peer; "
            "rows = session_peer._windows_process_inspect('identity', str(os.getpid())); "
            "assert rows and rows[0]['pid'] == os.getpid(), 'Native process inspection failed'",
        ])
        return runtime

    def _buildExecutable(self, wheel: Path) -> None:
        venv = self.build / "venv"
        self.runCommand(["uv", "venv", str(venv), "--python", "3.12", "--clear"])
        python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

        self.runCommand([
            "uv", "pip", "install", "--python", str(python),
            "--reinstall", "pyinstaller>=6,<7", str(wheel),
        ])

        peerOptions = ["--copy-metadata", "session-peer", "--hidden-import", "session_peer"]
        if os.name == "nt":
            runtime = self._buildPeerRuntime(python)
            peerOptions = ["--add-data", f"{runtime}{os.pathsep}peer-runtime"]

        self.runCommand([
            str(python), "-m", "PyInstaller", "--noconfirm", "--clean",
            "--onefile", "--console", "--name", self.name,
            "--collect-all", "fastmcp", "--collect-data", "mcp",
            "--collect-all", "mcp_install", "--recursive-copy-metadata", "fastmcp",
            "--copy-metadata", self.name, *peerOptions,
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
