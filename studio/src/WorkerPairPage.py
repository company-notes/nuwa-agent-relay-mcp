"""Short-lived loopback browser page for explicit local owner authorization."""

import logging
import secrets
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

import httpx
from filelock import FileLock

from .LocalMCPClient import LocalMCPError


logger = logging.getLogger(__name__)


class WorkerPairPage:
    TITLE = "Nuwa Studio — device authorization"
    INTRO = """<h1>Connect your assistant to this computer</h1>
<p>Authorize Worker access and automatic work completion notifications together.
This assistant can use the approved Gateway tools and view the Jobs visible to this Windows Worker.</p>
<p>Use an OAuth connection dedicated to this assistant alone. Assistants sharing one OAuth grant cannot be distinguished.
If your connection is shared, stop here and use a dedicated assistant connection.</p>
<form method="post" autocomplete="off">"""
    EXISTING = """<p>This Worker is already paired. This page configures notifications for the existing authorized connection only, not for a different assistant.</p>"""
    CODE = """<p>Enter the one-time pairing code from your assistant yourself. Nuwa may open its normal sign-in page.</p>
<label for="pairing-code">One-time pairing code</label>
<input id="pairing-code" name="code" type="password" required maxlength="129" autocomplete="off" spellcheck="false">"""
    WEBHOOK = """<h2>Automatic completion notifications</h2>
<p>Copy the URL and key from the webhook receiver your assistant created. The key is sent only to the local Gateway.</p>
<label for="webhook-url">Webhook URL</label>
<input id="webhook-url" name="url" type="url" required maxlength="2048" autocomplete="off" spellcheck="false">
<label for="webhook-secret">Webhook key (or complete Authorization: Bearer header)</label>
<input id="webhook-secret" name="secret" type="password" required maxlength="4096" autocomplete="off" spellcheck="false">
<label class="consent"><input type="checkbox" name="consent" value="yes" required>
I confirm this OAuth connection is dedicated to this assistant, and authorize Worker access and automatic notifications.</label>
<button type="submit">Authorize and connect</button></form>"""
    CANCEL = '<form method="post"><button name="cancel" value="yes">Cancel</button></form>'
    PAIRED = """<h1>This Studio already has an authorized Worker and notification receiver</h1>
<p>Reconnect this dedicated assistant. Its notification settings are retained locally.</p>
<form method="post"><button name="resume" value="yes">Reconnect authorized Worker</button></form>"""
    STYLE = """body{font:16px system-ui,sans-serif;max-width:620px;margin:60px auto;padding:24px;color:#222}
h1{font-size:26px}p{line-height:1.6}label{display:block;margin:18px 0 8px}
input[type=password],input[type=url]{width:100%;box-sizing:border-box;padding:12px;border:1px solid #777;border-radius:6px}
button{margin-top:16px;padding:12px 20px;border:1px solid #777;border-radius:6px;background:#fff;cursor:pointer}
.notice{padding:12px;border-left:3px solid #777}"""

    def __init__(self, service, credentials, manager):
        self.service = service
        self.credentials = credentials
        self.manager = manager
        self.path = "/" + secrets.token_urlsafe(32)
        self.finished = False

    def _form(self) -> str:
        paired = self.service.config.workerBridgePath().is_file()

        if paired:
            try:
                if self.service.notificationsReady():
                    return self.PAIRED + self.CANCEL
            except (LocalMCPError, httpx.HTTPError, OSError, ValueError) as error:
                logger.warning("Worker notification status unavailable (errorType=%s)", type(error).__name__)

        return self.INTRO + (self.EXISTING if paired else self.CODE) + self.WEBHOOK + self.CANCEL

    def _complete(self, fields: dict) -> str:
        if fields == {"cancel": ["yes"]}:
            self.finished = True

            return "<h1>Authorization cancelled</h1><p>You can close this page. Unfinished notification authorization does not allow new dispatch.</p>"

        paired = self.service.config.workerBridgePath().is_file()

        if fields == {"resume": ["yes"]} and paired and self.service.notificationsReady():
            self.manager.start()
            self.finished = True

            return self._success()

        expected = {"url", "secret", "consent"} if paired else {"code", "url", "secret", "consent"}

        if (set(fields) != expected or fields["consent"] != ["yes"] or
                any(len(values) != 1 for values in fields.values())):
            return '<p class="notice">Complete all fields and explicitly confirm authorization.</p>' + self._form()

        settings = {"url": fields["url"][0].strip(), "secret": fields["secret"][0].strip(),
                    "header": "Authorization"}

        if not all(settings.values()):
            return '<p class="notice">Enter the webhook URL and key.</p>' + self._form()

        if not paired:
            code = fields["code"][0].strip()
            self.service.bridge.routeFromCode(code)

            if not self.service.provider.catalog():
                raise LocalMCPError("Worker tool catalog is empty.")

            self.credentials.ensureAccessToken()
            self.service.pair(code)

        self.service.authorizeNotifications(settings)
        self.manager.start()
        self.finished = True

        return self._success()

    def _success(self) -> str:
        return ("<h1>Studio connection authorized</h1>"
                "<p>Worker access and automatic notifications are authorized. "
                "The Gateway verified the webhook receiver and saved its settings. "
                "Return to your assistant to verify the live connection. You can close this page.</p>")

    def createServer(self) -> HTTPServer:
        page = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, formatString, *args) -> None:
                return

            def _valid(self) -> bool:
                return self.path == page.path and self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

            def _respond(self, body: str, status: int = 200) -> None:
                document = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
                            '<meta name="viewport" content="width=device-width,initial-scale=1">'
                            f'<title>{page.TITLE}</title><style>{page.STYLE}</style></head><body>{body}</body></html>')
                data = document.encode("utf-8")

                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Referrer-Policy", "same-origin")
                self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self) -> None:
                if not self._valid():
                    self.send_error(404)
                    return

                self._respond(page._form())

            def do_POST(self) -> None:
                origin = f"http://127.0.0.1:{self.server.server_port}"
                length = self.headers.get("Content-Length", "")

                if not self._valid() or self.headers.get("Origin") != origin:
                    self.send_error(403)
                    return

                if (not length.isdecimal() or not 0 < int(length) <= 16384 or
                        self.headers.get_content_type() != "application/x-www-form-urlencoded"):
                    self.send_error(400)
                    return

                self.connection.settimeout(5)
                raw = self.rfile.read(int(length))

                try:
                    fields = parse_qs(raw.decode("utf-8"), strict_parsing=True, max_num_fields=5)
                    body = page._complete(fields)
                except (httpx.HTTPError, RuntimeError, ValueError, OSError) as error:
                    logger.warning("Worker authorization failed (errorType=%s)", type(error).__name__)
                    body = '<p class="notice">Authorization could not be completed. Check the webhook URL and key, Gateway version, sign-in and code expiry. If Worker access was authorized, retry the notification fields without another code.</p>' + page._form()

                self._respond(body)

        return HTTPServer(("127.0.0.1", 0), Handler)

    def run(self) -> None:
        directory = self.service.config.configDir()
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        lock = FileLock(str(directory / "worker-pair.lock"), timeout=0)

        with lock, self.createServer() as server:
            url = f"http://127.0.0.1:{server.server_port}{self.path}"

            if not webbrowser.open(url):
                raise RuntimeError("Could not open the Studio authorization page.")

            server.timeout = 1
            deadline = time.monotonic() + 300

            while not self.finished and time.monotonic() < deadline:
                server.handle_request()
