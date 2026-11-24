"""Install the official Nuwa Skill in supported native coding clients."""

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from urllib.request import urlopen


class StudioSkillInstaller:
    """Own the Nuwa Skill files; MCP registration remains with mcp-install."""

    SOURCE = "https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/"
    FILES = (
        "SKILL.md",
        "references/work-clients.md",
        "references/grokbot.md",
        "references/openmausbot.md",
        "references/rakazo.md",
    )
    MANIFEST = ".nuwa-studio-install.json"
    MAX_BYTES = 262144

    @classmethod
    def paths(cls, targets: list[str], home: Path | None = None) -> list[Path]:
        base = home or Path.home()
        selected = []
        if "all" in targets or "codex" in targets:
            selected.append(base / ".agents" / "skills" / "nuwa-agent-relay")
        if "all" in targets or "claude-code" in targets:
            claudeHome = Path(os.environ.get("CLAUDE_CONFIG_DIR", base / ".claude")).expanduser()
            selected.append(claudeHome / "skills" / "nuwa-agent-relay")
        return selected

    @classmethod
    def _download(cls) -> dict[str, bytes]:
        files = {}

        for fileName in cls.FILES:
            url = cls.SOURCE + fileName
            with urlopen(url, timeout=20) as response:
                if response.geturl() != url or response.status != 200:
                    raise RuntimeError("Nuwa Skill source was redirected or unavailable.")

                payload = response.read(cls.MAX_BYTES + 1)
                if len(payload) > cls.MAX_BYTES:
                    raise RuntimeError("Nuwa Skill exceeded its maximum size.")
                payload.decode("utf-8")
                files[fileName] = payload

        if not files["SKILL.md"].startswith(b"---\n") or b"name: nuwa-agent-relay" not in files["SKILL.md"]:
            raise RuntimeError("Nuwa Skill source has an invalid manifest.")

        return files

    @classmethod
    def _digest(cls, body: bytes) -> str:
        return hashlib.sha256(body).hexdigest()

    @classmethod
    def _validateOwned(cls, destination: Path) -> None:
        if destination.is_symlink():
            raise RuntimeError("Nuwa Skill directory must not be a symlink.")

        marker = destination / cls.MANIFEST
        if not marker.is_file() or marker.is_symlink():
            raise RuntimeError("Existing Nuwa Skill is not owned by Studio.")

        manifest = json.loads(marker.read_text(encoding="utf-8"))
        hashes = manifest["file_hashes"]
        if set(hashes) != set(cls.FILES):
            raise RuntimeError("Nuwa Skill ownership manifest does not match this installer.")

        actual = {
            path.relative_to(destination).as_posix()
            for path in destination.rglob("*") if path.is_file()
        }
        if actual != set(cls.FILES) | {cls.MANIFEST}:
            raise RuntimeError("Nuwa Skill contains additional files; preserve local work.")

        for fileName, digest in hashes.items():
            path = destination / fileName
            if path.is_symlink() or cls._digest(path.read_bytes()) != digest:
                raise RuntimeError("Nuwa Skill was edited locally; preserve local changes.")

    @classmethod
    def _write(cls, target: Path, files: dict[str, bytes], overwrite: bool) -> None:
        if target.exists():
            if not overwrite:
                raise FileExistsError(f"Nuwa Skill already exists: {target}. Use --overwrite to upgrade.")
            cls._validateOwned(target)

        target.parent.mkdir(parents=True, exist_ok=True)
        if target.parent.is_symlink():
            raise RuntimeError("Skill parent directory must not be a symlink.")

        staging = Path(tempfile.mkdtemp(prefix=".nuwa-skill-", dir=target.parent))
        backup = None
        try:
            for fileName, content in files.items():
                path = staging / fileName
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            (staging / cls.MANIFEST).write_text(json.dumps({
                "source": cls.SOURCE,
                "file_hashes": {name: cls._digest(body) for name, body in files.items()},
            }, indent=2) + "\n", encoding="utf-8")

            if target.exists():
                backup = Path(tempfile.mkdtemp(prefix=".nuwa-backup-", dir=target.parent))
                backup.rmdir()
                target.rename(backup)

            staging.rename(target)
        except Exception:
            if backup is not None and backup.exists():
                backup.rename(target)
            raise
        finally:
            if staging.exists():
                shutil.rmtree(staging)
            if backup is not None and backup.exists():
                shutil.rmtree(backup)

    @classmethod
    def install(cls, targets: list[str], overwrite: bool = False,
                printOnly: bool = False, home: Path | None = None) -> list[str]:
        destinations = cls.paths(targets, home)
        if printOnly:
            return [str(path) for path in destinations]

        for destination in destinations:
            if destination.exists() and not overwrite:
                raise FileExistsError(f"Nuwa Skill already exists: {destination}. Use --overwrite to upgrade.")
            if destination.exists():
                cls._validateOwned(destination)

        files = cls._download() if destinations else {}
        for destination in destinations:
            cls._write(destination, files, overwrite)

        return [str(path) for path in destinations]

    @classmethod
    def uninstall(cls, targets: list[str], printOnly: bool = False,
                  home: Path | None = None) -> list[str]:
        destinations = [path for path in cls.paths(targets, home) if path.exists()]
        if printOnly:
            return [str(path) for path in destinations]

        for destination in destinations:
            cls._validateOwned(destination)
        for destination in destinations:
            shutil.rmtree(destination)

        return [str(path) for path in destinations]
