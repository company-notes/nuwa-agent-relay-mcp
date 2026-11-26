"""Expose only the explicitly approved Worker Gateway tools."""

import json
import os
import subprocess
from importlib.resources import files
from pathlib import Path

from .LocalMCPClient import LocalMCPClient, LocalMCPError


class WorkerCredential:
    """Read the Windows user's DPAPI-protected Gateway credential locally."""

    SCRIPT = r"""
$ErrorActionPreference = 'Stop'
$file = Join-Path $env:LOCALAPPDATA 'AIWorkerGateway\client-token.dpapi'
$secret = ConvertTo-SecureString -String ([IO.File]::ReadAllText($file, [Text.Encoding]::ASCII))
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
"""

    @classmethod
    def read(cls) -> str:
        if os.name != "nt":
            raise LocalMCPError("Worker Gateway credentials require Windows.")

        path = Path(os.environ["LOCALAPPDATA"]) / "AIWorkerGateway" / "client-token.dpapi"

        if not path.is_file():
            raise LocalMCPError("Worker Gateway is not installed for this Windows user.")

        powershell = Path(os.environ["SystemRoot"]) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        result = subprocess.run(
            [str(powershell), "-NoProfile", "-NonInteractive", "-Command", cls.SCRIPT],
            capture_output=True, timeout=20, creationflags=subprocess.CREATE_NO_WINDOW,
        )

        if result.returncode != 0:
            raise LocalMCPError("Worker Gateway credential could not be decrypted.")

        token = result.stdout.decode("ascii")

        if not token or len(token) > 4096 or any(char.isspace() for char in token):
            raise LocalMCPError("Worker Gateway credential is invalid.")

        return token


class WorkerProvider:
    ENDPOINT = "http://127.0.0.1:3791/mcp"

    def __init__(self, client=None):
        self.client = client or LocalMCPClient(self.ENDPOINT, WorkerCredential.read)
        config = files("src").joinpath("worker-provider.json")

        if not config.is_file():
            config = Path(__file__).resolve().parents[2] / "worker-provider.json"

        self.allowed = frozenset(json.loads(config.read_text(encoding="utf-8"))["tools"])

    def catalog(self) -> list[dict]:
        tools = []

        for tool in self.client.listTools():
            if not isinstance(tool, dict) or tool.get("name") not in self.allowed:
                continue

            schema = tool.get("inputSchema")
            if not isinstance(schema, dict) or schema.get("type") != "object":
                raise LocalMCPError("Worker tool has an invalid input schema.")

            tools.append({"name": tool["name"], "description": tool.get("description", ""),
                          "inputSchema": schema})

        return tools

    def call(self, name: str, arguments: dict) -> dict:
        if name not in self.allowed:
            raise LocalMCPError("Worker tool is outside the approved provider scope.")

        if not isinstance(arguments, dict) or "notificationRouteId" in arguments:
            raise LocalMCPError("Worker arguments are outside the pilot provider scope.")

        return self.client.call(name, arguments)
