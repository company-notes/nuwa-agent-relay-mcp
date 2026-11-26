"""A local worker catalog and dispatch through the real HTTP protocol."""

import json
import os
import subprocess
from base64 import b64encode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest

from src.LocalMCPClient import LocalMCPClient, LocalMCPError
from src.WorkerProvider import WorkerCredential, WorkerProvider


class WorkerScenario:
    TOKEN = "local-test-credential"

    def __init__(self):
        self.calls = []
        self.jobs = {}
        scenario = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                if self.headers.get("Authorization") != "Bearer " + scenario.TOKEN:
                    self.send_error(401)
                    return

                request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                method = request["method"]
                scenario.calls.append(method)

                if method == "notifications/initialized":
                    self.send_response(202)
                    self.end_headers()
                    return

                result = scenario.handle(request)
                data = json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        endpoint = f"http://127.0.0.1:{self.server.server_port}/mcp"
        self.provider = WorkerProvider(LocalMCPClient(endpoint, lambda: self.TOKEN))
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def handle(self, request):
        method = request["method"]

        if method == "initialize":
            return {"protocolVersion": "2025-06-18"}

        if method == "tools/list":
            return {"tools": [
                {"name": name, "description": name, "inputSchema": {"type": "object"}}
                for name in ("fleet_status", "work_list", "work_start", "work_status",
                             "work_continue", "worker_notification_setup", "arbitrary_shell")
            ]}

        name = request["params"]["name"]
        args = request["params"]["arguments"]

        if name == "work_start":
            self.jobs["job-a"] = [args["task"]]
            data = {"jobId": "job-a"}
        elif name == "work_continue":
            self.jobs[args["jobId"]].append(args["prompt"])
            data = {"jobId": args["jobId"]}
        elif name == "work_list":
            data = {"jobs": list(self.jobs)}
        elif name == "work_status":
            data = {"jobId": args["jobId"], "messages": self.jobs[args["jobId"]]}
        else:
            data = {"reachable": True}

        return {"content": [{"type": "text", "text": json.dumps(data)}], "structuredContent": data}


def test_assistant_discovers_starts_and_continues_one_local_job():
    with WorkerScenario() as scenario:
        provider = scenario.provider
        catalog = provider.catalog()
        assert {tool["name"] for tool in catalog} == {
            "fleet_status", "work_list", "work_start", "work_status", "work_continue",
        }
        assert provider.call("fleet_status", {})["structuredContent"]["reachable"]
        assert provider.call("work_list", {})["structuredContent"]["jobs"] == []

        started = provider.call("work_start", {"task": "Build a marketing tracker.", "requestId": "marketing-start", "target": {"host": "my-pc"}})
        jobID = started["structuredContent"]["jobId"]
        provider.call("work_continue", {"jobId": jobID, "message": "Add monthly ROAS.", "requestId": "marketing-continue"})
        status = provider.call("work_status", {"jobId": jobID})["structuredContent"]

        assert status["messages"] == ["Build a marketing tracker.", "Add monthly ROAS."]
        assert list(scenario.jobs) == [jobID]
        before = len(scenario.calls)

        with pytest.raises(LocalMCPError, match="approved provider scope"):
            provider.call("arbitrary_shell", {})

        with pytest.raises(LocalMCPError, match="pilot provider scope"):
            provider.call("work_start", {"notificationRouteId": "private"})

        assert len(scenario.calls) == before


@pytest.mark.skipif(os.name != "nt", reason="Windows DPAPI")
def test_installed_worker_credential_uses_real_windows_secure_string(tmp_path, monkeypatch):
    root = tmp_path / "AIWorkerGateway"
    root.mkdir()
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    script = r"""
$ErrorActionPreference = 'Stop'
$secret = ConvertTo-SecureString -String 'local-test-credential' -AsPlainText -Force
$cipher = ConvertFrom-SecureString -SecureString $secret
$file = Join-Path $env:LOCALAPPDATA 'AIWorkerGateway\client-token.dpapi'
[IO.File]::WriteAllText($file, $cipher, [Text.Encoding]::ASCII)
"""
    encoded = b64encode(script.encode("utf-16-le")).decode("ascii")
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                            capture_output=True)
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert WorkerCredential.read() == WorkerScenario.TOKEN
