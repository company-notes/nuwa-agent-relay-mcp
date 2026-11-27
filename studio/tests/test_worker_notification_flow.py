"""Acceptance: real Remote MCP HTTPS, Studio, Gateway browser and HTTP webhook."""

import json
import os
import ssl
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from pathlib import Path
from queue import Queue
from threading import Thread

import httpx
import pytest
from playwright.sync_api import sync_playwright

from src.Client import StaticBearerCredential
from src.Config import LocalConfig
from src.LocalMCPClient import LocalMCPClient
from src.WorkerBridgeClient import WorkerBridgeClient
from src.WorkerBridgeService import WorkerBridgeService
from src.WorkerProvider import WorkerProvider
from src.WorkerPairPage import WorkerPairPage
from test_worker_provider import PairingBrowser, PairingCredentials, PairingStartup


class ScenarioProcess:
    def __init__(self, command, cwd):
        self.command = command
        self.cwd = cwd
        self.lines = Queue()

    def _readOutput(self):
        for line in self.process.stdout:
            self.lines.put(line)

        self.lines.put(None)

    def _read(self):
        line = self.lines.get(timeout=30)
        assert line is not None, "The fixture exited before returning its result."

        return json.loads(line)

    def __enter__(self):
        self.process = subprocess.Popen(
            self.command, cwd=self.cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, encoding="utf-8",
        )
        self.reader = Thread(target=self._readOutput, daemon=True)
        self.reader.start()

        try:
            self.info = self._read()
        except Exception:
            self.__exit__(None, None, None)
            raise

        return self

    def exchange(self, command):
        self.process.stdin.write(json.dumps(command) + "\n")
        self.process.stdin.flush()

        return self._read()

    def __exit__(self, *_):
        self.process.stdin.close()

        try:
            status = self.process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
            raise
        finally:
            self.reader.join(timeout=5)
            self.process.stdout.close()

        assert status == 0, "The scenario fixture must shut down cleanly."


class WorkerNotificationFlow:
    REPO = Path(__file__).resolve().parents[2]
    RECEIVER_KEY = "disposable-notification-test-key"

    def __init__(self, directory, gatewayRoot, connect=True):
        self.directory = directory
        self.gatewayRoot = Path(gatewayRoot).resolve()
        self.stack = ExitStack()
        self.connect = connect

    def _tlsContext(self):
        key = self.directory / "test-key.pem"
        cert = self.directory / "test-cert.pem"
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(key), "-out", str(cert), "-days", "1",
            "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
        ], check=True, capture_output=True)

        return key, cert, ssl.create_default_context(cafile=str(cert))

    def __enter__(self):
        try:
            key, cert, context = self._tlsContext()
            self.gateway = self.stack.enter_context(ScenarioProcess(
                ["node", "tests/RunNotificationScenario.js"], self.gatewayRoot,
            ))
            self.cloud = self.stack.enter_context(ScenarioProcess(
                ["node", "--import", "tsx", "server/test/RunWorkerChannelScenario.ts", str(key), str(cert)],
                self.REPO,
            ))
            origin = self.cloud.info["origin"]
            self.client = self.stack.enter_context(httpx.Client(
                base_url=origin, verify=context, trust_env=False, timeout=60,
                headers={"Authorization": "Bearer oauth-a", "Accept": "application/json, text/event-stream",
                         "MCP-Protocol-Version": "2025-06-18"},
            ))
            self.executor = self.stack.enter_context(ThreadPoolExecutor(max_workers=1))
            bridge = WorkerBridgeClient(
                StaticBearerCredential("oauth-b"), origin=origin,
                transport=httpx.HTTPTransport(verify=context, trust_env=False),
            )
            local = LocalMCPClient(self.gateway.info["address"] + "/mcp", lambda: self.gateway.info["clientToken"])
            self.service = WorkerBridgeService(LocalConfig(), bridge, WorkerProvider(local))

            if self.connect:
                self.service.pair(self._tool("worker_provider_pair", {})["pairingCode"], notificationsRequired=False)
        except Exception:
            self.stack.close()
            raise

        return self

    def __exit__(self, *args):
        return self.stack.__exit__(*args)

    def _rpc(self, method, params):
        response = self.client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        assert response.status_code == 200, method

        result = response.json()["result"]
        assert result.get("isError") is not True, method

        return result

    def _tool(self, name, arguments):
        result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        return result.get("structuredContent") or json.loads(result["content"][0]["text"])

    def _exchange(self, name, arguments):
        pending = self.executor.submit(self.service.exchange, self.service.route())
        result = self._tool(name, arguments)
        pending.result(timeout=60)

        return result

    def _discover(self, identity=None):
        # A real Studio poll publishes the Gateway catalog. Wait for the cloud
        # to observe it before the first tool call, without dispatching work.
        pending = self.executor.submit(self.service.exchange, self.service.route())
        deadline = time.monotonic() + 10

        while time.monotonic() < deadline:
            status = self._tool("worker_provider_status", {})
            if status["online"]:
                break
            if pending.done():
                pending.result()
                pytest.fail("Studio poll finished without publishing its catalog.")

            time.sleep(0.05)
        else:
            pytest.fail("The paired Studio did not publish its catalog.")

        tools = self._rpc("tools/list", {})["tools"]
        names = {tool["name"] for tool in tools}
        assert {"worker_notification_status", "work_start", "work_continue"} <= names

        manualTools = {"worker_notification_setup", "worker_notification_pairing_status", "worker_notification_decline"}

        if self.service.notificationsRequired():
            assert not manualTools & names
            assert all("notificationRouteId" not in tool["inputSchema"].get("properties", {})
                       for tool in tools if tool["name"] in {"work_start", "work_continue", "worker_task_start"})
        else:
            assert manualTools <= names

        status = self._tool("worker_notification_status", {"assistantIdentity": identity} if identity else {})
        pending.result(timeout=60)

        return status

    def _authorize(self, url):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                page = browser.new_page()
                page.goto(url)
                assert page.locator('[name="name"]').count() == 0
                page.locator('[name="url"]').fill(self.gateway.info["webhookURL"])
                page.locator('[name="secret"]').fill(self.RECEIVER_KEY)

                with page.expect_navigation() as navigation:
                    page.get_by_role("button", name="測試並儲存通知").click()

                assert navigation.value.status == 200, "Owner's real browser authorization must succeed."
                assert "Webhook 配對成功" in page.locator("body").inner_text()
            finally:
                browser.close()

    def _verifyCallbacks(self, snapshot, jobID, completedTurns):
        callbacks = snapshot["callbacks"]
        assert len(callbacks) == completedTurns + 1
        assert callbacks[0]["event"]["event"] == "work.webhook_test"
        assert all(item["authorization"] == "Bearer " + self.RECEIVER_KEY for item in callbacks)
        assert all(item["event"]["jobId"] == jobID and item["event"]["event"] == "work.turn_finished"
                   for item in callbacks[1:])
        assert len({item["event"]["deliveryId"] for item in callbacks}) == len(callbacks)
        assert all("notificationRouteId" not in item["args"] for item in snapshot["dispatches"])

    def run(self):
        assert self._discover()["preference"] == "unset"
        started = self._exchange("work_start", {
            "task": "Build a reading list", "requestId": "notification-acceptance-start",
        })
        jobID = started["job"]["jobId"]
        token = started["notificationSetupToken"]

        assert started["notificationBound"] is False

        beforeConsent = self.gateway.exchange({})
        assert len(beforeConsent["dispatches"]) == 1
        assert beforeConsent["callbacks"] == []

        setup = self._exchange("worker_notification_setup", {"notificationSetupToken": token})
        setupID = setup["setupId"]

        assert setup["jobId"] == jobID
        assert setupID != setup["url"].rsplit("/", 1)[1]
        assert self._exchange("worker_notification_pairing_status", {"setupId": setupID})["paired"] is False

        self._authorize(setup["url"])

        paired = self._exchange("worker_notification_pairing_status", {"setupId": setupID})
        assert paired["paired"] is True
        assert paired["jobId"] == jobID
        assert paired["notificationBound"] is True

        route = {"notificationRouteId": paired["notificationRouteId"]}
        assert self._exchange("worker_notification_status", route)["enabled"] is True

        recovered = self._exchange("worker_notification_pairing_status", {"setupId": setupID})
        assert recovered["notificationRouteId"] == route["notificationRouteId"]

        self._verifyCallbacks(self.gateway.exchange({"jobId": jobID}), jobID, 1)

        continued = self._exchange("work_continue", {
            "jobId": jobID, "message": "Add expense splitting", "requestId": "notification-acceptance-continue",
        })
        assert continued["job"]["jobId"] == jobID
        assert continued["notificationBound"] is True

        self._verifyCallbacks(self.gateway.exchange({"jobId": jobID}), jobID, 2)

        assert self._exchange("worker_notification_decline", route)["preference"] == "off"

        silent = self._exchange("work_start", {
            "task": "Another travel plan", "requestId": "notification-acceptance-silent",
        })
        assert silent["job"]["jobId"] != jobID
        self._verifyCallbacks(self.gateway.exchange({"jobId": silent["job"]["jobId"]}), jobID, 2)


@pytest.mark.skipif(not os.environ.get("NUWA_TEST_GATEWAY_ROOT"), reason="Requires pinned Gateway fixture and Node dependencies")
def test_owner_pairs_and_receives_new_and_continued_job_notifications(tmp_path, monkeypatch):
    """Actual HTTP/TLS/browser chain; only external OAuth, D1 and Fleet/T3 are test substitutes."""
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path / "studio"))

    with WorkerNotificationFlow(tmp_path, os.environ["NUWA_TEST_GATEWAY_ROOT"]) as scenario:
        scenario.run()


class CombinedWorkerAuthorizationFlow(WorkerNotificationFlow):
    FIRST = {"type": "bot", "platform": "rakazo", "botId": "bot-a"}
    SECOND = {"type": "bot", "platform": "rakazo", "botId": "bot-b"}
    MANUAL = {"type": "agentAddress", "address": "codex@example.test"}

    def _authorizeAssistant(self, identity, key=None, code=None, retry=False):
        startup = PairingStartup(self.service)
        page = WorkerPairPage(self.service, PairingCredentials("oauth-b"), startup)

        with PairingBrowser(page) as server, sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                tab = browser.new_page()
                tab.goto(server.url)

                assert tab.locator('[name="assistantIdentity"]').count() == 1, "One shared connection needs per-assistant authorization."
                if code:
                    tab.locator("#pairing-code").fill(code)

                def fill(secret):
                    tab.locator('[name="assistantIdentity"]').fill(json.dumps(identity))
                    if secret is not None:
                        tab.locator('[name="url"]').fill(self.gateway.info["webhookURL"])
                        tab.locator('[name="secret"]').fill(secret)
                    tab.locator('[name="consent"]').check()

                if retry:
                    fill("incorrect-test-key")

                    with tab.expect_navigation():
                        tab.get_by_role("button", name="Authorize and connect").click()

                    assert "Authorization could not be completed" in tab.locator("body").inner_text()
                    assert tab.locator("#pairing-code").count() == 0
                    assert startup.started == 0
                    assert self.gateway.exchange({})["callbacks"] == []

                fill(key)
                with tab.expect_navigation() as navigation:
                    tab.get_by_role("button", name="Authorize and connect").click()

                assert navigation.value.status == 200
                assert "Studio connection authorized" in tab.locator("body").inner_text()
                if key:
                    assert key not in tab.content()
            finally:
                browser.close()

        assert startup.started == 1

    def _dispatch(self, identity, requestID):
        result = self._exchange("work_start", {
            "task": "Build a walking tracker", "requestId": requestID, "assistantIdentity": identity,
        })

        assert "notificationSetupToken" not in result
        assert "notificationRouteId" not in result

        return result

    def run(self):
        code = self._tool("worker_provider_pair", {})["pairingCode"]
        self.gateway.exchange({"receiverAuthorization": "Bearer " + self.RECEIVER_KEY})
        self._authorizeAssistant(self.FIRST, "Authorization: Bearer " + self.RECEIVER_KEY, code, retry=True)
        self.gateway.exchange({"receiverAuthorization": None})
        self._authorizeAssistant(self.SECOND, "other-test-key")
        self._authorizeAssistant(self.MANUAL)

        initial = self.gateway.exchange({})
        assert initial["dispatches"] == []
        assert [item["event"]["event"] for item in initial["callbacks"]] == ["work.webhook_test", "work.webhook_test"]

        self.service = WorkerBridgeService(self.service.config, self.service.bridge, self.service.provider)
        status = self._discover(self.FIRST)
        assert status["registered"] is True
        assert status["enabled"] is True

        jobs = []
        for index, identity in enumerate((self.FIRST, self.SECOND, self.MANUAL)):
            started = self._dispatch(identity, "shared-first-" + str(index))
            assert started["notificationBound"] is (index != 2)
            jobID = started["job"]["jobId"]
            jobs.append(jobID)
            self.gateway.exchange({"jobId": jobID})

        continued = self._exchange("work_continue", {
            "jobId": jobs[0], "message": "Add weekly goals", "requestId": "shared-continue",
            "assistantIdentity": self.FIRST,
        })

        assert continued["job"]["jobId"] == jobs[0]
        assert continued["notificationBound"] is True

        snapshot = self.gateway.exchange({"jobId": jobs[0]})
        completed = [item for item in snapshot["callbacks"] if item["event"]["event"] == "work.turn_finished"]
        assert [(item["event"]["jobId"], item["authorization"]) for item in completed] == [
            (jobs[0], "Bearer " + self.RECEIVER_KEY), (jobs[1], "Bearer other-test-key"),
            (jobs[0], "Bearer " + self.RECEIVER_KEY),
        ]
        assert all(not {"notificationRouteId", "assistantIdentity"} & item["args"].keys() for item in snapshot["dispatches"])


@pytest.mark.skipif(not os.environ.get("NUWA_TEST_GATEWAY_ROOT"), reason="Requires pinned Gateway fixture and Node dependencies")
def test_owner_authorizes_worker_and_notifications_once_before_dispatch(tmp_path, monkeypatch):
    """Shared OAuth, distinct Bot IDs and a non-webhook client through the real browser and HTTPS chain."""
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path / "studio"))

    with CombinedWorkerAuthorizationFlow(tmp_path, os.environ["NUWA_TEST_GATEWAY_ROOT"], connect=False) as scenario:
        scenario.run()
