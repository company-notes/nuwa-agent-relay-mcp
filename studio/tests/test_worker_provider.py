"""A local worker catalog and dispatch through the real HTTP protocol."""

import json
import os
import subprocess
from base64 import b64encode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from uuid import uuid4

import httpx
import pytest
from playwright.sync_api import sync_playwright

from src.Client import StaticBearerCredential
from src.Config import LocalConfig
from src.WorkerBridgeClient import WorkerBridgeClient, WorkerBridgeRejected
from src.WorkerBridgeService import WorkerBridgeService
from src.LocalMCPClient import LocalMCPClient, LocalMCPError
from src.WorkerCredential import WorkerCredential
from src.WorkerProvider import WorkerProvider
from src.WorkerPairPage import WorkerPairPage


class WorkerScenario:
    TOKEN = "local-test-credential"

    def __init__(self):
        self.calls = []
        self.jobs = {}
        self.started = {}
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
            requestID = args["requestId"]
            created = requestID not in self.started

            if created:
                jobID = "job-" + str(len(self.jobs) + 1)
                self.started[requestID] = jobID
                self.jobs[jobID] = [args["task"]]

            data = {"job": {"jobId": self.started[requestID]}, "created": created}
        elif name == "work_continue":
            self.jobs[args["jobId"]].append(args["message"])
            data = {"job": {"jobId": args["jobId"]}, "replayed": False}
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

        started = provider.call("work_start", {
            "task": "Build a marketing tracker.", "requestId": "marketing-start", "target": {"host": "my-pc"},
        })
        jobID = started["structuredContent"]["job"]["jobId"]
        provider.call("work_continue", {
            "jobId": jobID, "message": "Add monthly ROAS.", "requestId": "marketing-continue",
        })
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
    environment = {key: value for key, value in os.environ.items() if key.upper() != "PSMODULEPATH"}
    powershell = os.path.join(os.environ["SystemRoot"], "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    result = subprocess.run([powershell, "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                            capture_output=True, env=environment)
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert WorkerCredential.read() == WorkerScenario.TOKEN


class RemoteWorkerScenario:
    ROUTE = "a" * 64
    CODE = ROUTE + "." + "b" * 64
    OAUTH = "studio-oauth-test"

    def __init__(self):
        self.requests = []
        self.results = []
        self.rejectResult = False
        self.catalog = []
        self.client = WorkerBridgeClient(StaticBearerCredential(self.OAUTH),
                                         transport=httpx.MockTransport(self.handle))

    def handle(self, request):
        assert request.headers["Authorization"] == "Bearer " + self.OAUTH
        assert WorkerScenario.TOKEN not in request.content.decode()
        assert request.url.host == "mcp.agent-relay.company-notes.com"
        data = json.loads(request.content)
        assert data["route"] == self.ROUTE
        operation = request.url.path.rsplit("/", 1)[-1]

        if operation == "pair":
            assert data["secret"] == "b" * 64
            return httpx.Response(200, json={"paired": True})

        if operation == "poll":
            self.catalog = data["tools"]
            pending = self.requests.pop(0) if self.requests else None
            return httpx.Response(200, json={"request": pending})

        if operation == "result":
            self.results.append(data)

            if self.rejectResult:
                return httpx.Response(503)

            return httpx.Response(200, json={"accepted": True})

        assert operation == "revoke"
        return httpx.Response(200, json={"revoked": True})

    def send(self, name, args):
        self.requests.append({"requestID": str(uuid4()), "name": name, "arguments": args})


def test_studio_reconnects_without_replaying_an_uncertain_dispatch(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    remote = RemoteWorkerScenario()
    args = {"task": "Build a marketing tracker.", "requestId": "marketing-start", "target": {"host": "my-pc"}}

    with WorkerScenario() as local:
        service = WorkerBridgeService(LocalConfig(), remote.client, local.provider)
        service.pair(remote.CODE)
        assert service.route() == remote.ROUTE

        remote.send("work_start", args)
        remote.rejectResult = True

        with pytest.raises(WorkerBridgeRejected, match="503"):
            service.exchange(service.route())

        assert len(local.jobs) == 1
        assert local.calls.count("tools/call") == 1
        assert "work_start" in {tool["name"] for tool in remote.catalog}
        assert "arbitrary_shell" not in {tool["name"] for tool in remote.catalog}

        remote.rejectResult = False
        service = WorkerBridgeService(LocalConfig(), remote.client, local.provider)
        service.exchange(service.route())
        assert local.calls.count("tools/call") == 1

        remote.send("work_list", {})
        service.exchange(service.route())
        assert remote.results[-1]["result"]["structuredContent"]["jobs"] == list(local.jobs)

        remote.send("work_start", args)
        service.exchange(service.route())
        assert remote.results[-1]["result"]["structuredContent"]["created"] is False
        assert len(local.jobs) == 1

        service.revoke()
        assert not LocalConfig.workerBridgePath().exists()


class PairingCredentials(StaticBearerCredential):
    def ensureAccessToken(self):
        return self.accessToken()


class PairingStartup:
    def __init__(self, service):
        self.service = service
        self.started = 0

    def start(self):
        assert self.service.config.workerBridgePath().is_file()
        self.started += 1


class PairingBrowser:
    def __init__(self, page):
        self.page = page
        self.server = page.createServer()
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        self.url = self.origin + page.path

    def __enter__(self):
        self.thread.start()
        self.client = httpx.Client(trust_env=False)
        return self

    def __exit__(self, *args):
        self.client.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def submit(self, fields, origin=None):
        return self.client.post(self.url, data=fields, headers={"Origin": origin or self.origin})


def test_owner_authorizes_through_local_page_and_worker_restarts_without_a_terminal(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    remote = RemoteWorkerScenario()

    with WorkerScenario() as local:
        service = WorkerBridgeService(LocalConfig(), remote.client, local.provider)
        startup = PairingStartup(service)
        credentials = PairingCredentials(remote.OAUTH)
        page = WorkerPairPage(service, credentials, startup)

        with PairingBrowser(page) as browser:
            form = browser.client.get(browser.url)
            assert form.status_code == 200
            assert 'type="password"' in form.text
            assert remote.CODE not in form.text

            denied = browser.submit({"code": remote.CODE, "consent": "yes"}, "https://untrusted.invalid")
            assert denied.status_code == 403
            assert browser.submit({"code": remote.CODE}).status_code == 200
            assert not LocalConfig.workerBridgePath().exists()
            assert startup.started == 0

            authorized = browser.submit({"code": remote.CODE, "consent": "yes"})

            assert "Studio connection authorized" in authorized.text
            assert remote.CODE not in authorized.text
            assert startup.started == 1
            assert service.route() == remote.ROUTE

        resumed = WorkerBridgeService(LocalConfig(), remote.client, local.provider)
        remote.send("work_start", {
            "task": "Build a marketing tracker.", "requestId": "desktop-start", "target": {"host": "my-pc"},
        })
        originalResult = resumed.bridge.result

        def finishExchange(route, requestID, result):
            originalResult(route, requestID, result)
            LocalConfig.workerStopPath().touch()

        monkeypatch.setattr(resumed.bridge, "result", finishExchange)
        resumed.serve()

        assert len(local.jobs) == 1
        assert LocalConfig.workerBridgePath().is_file()
        assert LocalConfig.workerStopPath().is_file()
        before = len(local.calls)
        resumed.serve()

        assert len(local.calls) == before


def test_owner_cancels_pairing_without_starting_worker(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    remote = RemoteWorkerScenario()

    with WorkerScenario() as local:
        service = WorkerBridgeService(LocalConfig(), remote.client, local.provider)
        startup = PairingStartup(service)
        page = WorkerPairPage(service, PairingCredentials(remote.OAUTH), startup)

        with PairingBrowser(page) as browser:
            cancelled = browser.submit({"cancel": "yes"})
            assert "Authorization cancelled" in cancelled.text

        assert page.finished
        assert not LocalConfig.workerBridgePath().exists()
        assert startup.started == 0
        assert local.calls == []


def test_owner_authorizes_through_real_browser(tmp_path, monkeypatch):
    """Regression: a real browser rejected the Studio authorization form with HTTP 403."""
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    remote = RemoteWorkerScenario()

    with WorkerScenario() as local:
        service = WorkerBridgeService(LocalConfig(), remote.client, local.provider)
        startup = PairingStartup(service)
        page = WorkerPairPage(service, PairingCredentials(remote.OAUTH), startup)

        with PairingBrowser(page) as server, sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                tab = browser.new_page()
                tab.goto(server.url)
                tab.locator("#pairing-code").fill(remote.CODE)
                tab.locator('input[name="consent"]').check()

                with tab.expect_navigation() as navigation:
                    tab.get_by_role("button", name="Authorize and connect").click()

                assert navigation.value.status == 200, "A real same-origin form submission must not return HTTP 403."
                assert "Studio connection authorized" in tab.locator("body").inner_text(), "The owner must see a successful authorization."
            finally:
                browser.close()

        assert service.route() == remote.ROUTE, "The authorized pairing must be persisted."
        assert startup.started == 1, "Successful authorization must start the Worker once."
