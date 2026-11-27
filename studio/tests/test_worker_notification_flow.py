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

    def __init__(self, directory, gatewayRoot):
        self.directory = directory
        self.gatewayRoot = Path(gatewayRoot).resolve()
        self.stack = ExitStack()

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

            self.service.pair(self._tool("worker_provider_pair", {})["pairingCode"])
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

        if name in {"work_start", "work_continue", "worker_notification_setup",
                    "worker_notification_status", "worker_notification_pairing_status"}:
            first = json.loads(result["content"][0]["text"])
            structured = result["structuredContent"]

            assert all(first.get(key) == value for key, value in structured.items())

            return first

        return result.get("structuredContent") or json.loads(result["content"][0]["text"])

    def _exchange(self, name, arguments):
        pending = self.executor.submit(self.service.exchange, self.service.route())
        result = self._tool(name, arguments)
        pending.result(timeout=60)

        return result

    def _discover(self):
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
        assert {"worker_notification_status", "worker_notification_setup",
                "worker_notification_pairing_status", "worker_notification_decline",
                "work_start", "work_continue"} <= names

        status = self._tool("worker_notification_status", {})
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
