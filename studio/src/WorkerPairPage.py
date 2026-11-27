"""Short-lived loopback browser page for explicit local owner authorization."""

import json
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
<p>Each assistant uses its own Bot ID or Agent Address. A shared OAuth connection may serve multiple assistants.
Confirm the identity and receiver belong to the same assistant before authorizing.</p>
<form method="post" autocomplete="off">"""
    EXISTING = """<p>This Worker is already paired. Register another assistant on the existing connection without entering a new Worker code.</p>"""
    CODE = """<p>Enter the one-time pairing code from your assistant yourself. Nuwa may open its normal sign-in page.</p>
<label for="pairing-code">One-time pairing code</label>
<input id="pairing-code" name="code" type="password" required maxlength="129" autocomplete="off" spellcheck="false">"""
    WEBHOOK = """<h2>Assistant identity and completion notifications</h2>
<label for="assistant-identity">Assistant identity (copy from your assistant)</label>
<textarea id="assistant-identity" name="assistantIdentity" required maxlength="2048" rows="3" spellcheck="false"></textarea>
<p>Copy the URL and key from the webhook receiver your assistant created. The key is sent only to the local Gateway.
For an Agent Address client without a webhook, leave both webhook fields empty to authorize manual status checks.</p>
<label for="webhook-url">Webhook URL</label>
<input id="webhook-url" name="url" type="url" maxlength="2048" autocomplete="off" spellcheck="false">
<label for="webhook-header">Webhook key header</label>
<select id="webhook-header" name="header"><option value="Authorization">Authorization: Bearer</option>
<option value="X-Webhook-Key">X-Webhook-Key</option><option value="X-API-Key">X-API-Key</option>
<option value="X-Webhook-Secret">X-Webhook-Secret</option></select>
<label for="webhook-secret">Webhook key (or complete matching header)</label>
<input id="webhook-secret" name="secret" type="password" maxlength="4096" autocomplete="off" spellcheck="false">
<label class="consent"><input type="checkbox" name="consent" value="yes" required>
I confirm this assistant identity and its receiver, and authorize Worker access and the displayed notification mode.</label>
<button type="submit">Authorize and connect</button></form>"""
    CANCEL = '<form method="post"><button name="cancel" value="yes">Cancel</button></form>'
    STYLE = """body{font:16px system-ui,sans-serif;max-width:620px;margin:60px auto;padding:24px;color:#222}
h1{font-size:26px}p{line-height:1.6}label{display:block;margin:18px 0 8px}
input[type=password],input[type=url],textarea,select{width:100%;box-sizing:border-box;padding:12px;border:1px solid #777;border-radius:6px}
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

        return self.INTRO + (self.EXISTING if paired else self.CODE) + self.WEBHOOK + self.CANCEL

    def _complete(self, fields: dict) -> str:
        if fields == {"cancel": ["yes"]}:
            self.finished = True

            return "<h1>Authorization cancelled</h1><p>You can close this page. Unregistered assistants cannot dispatch.</p>"

        paired = self.service.config.workerBridgePath().is_file()
        expected = {"assistantIdentity", "url", "header", "secret", "consent"}

        if not paired:
            expected.add("code")

        if (set(fields) != expected or fields["consent"] != ["yes"] or
                any(len(values) != 1 for values in fields.values())):
            return '<p class="notice">Complete the identity and explicitly confirm authorization.</p>' + self._form()

        identity = json.loads(fields["assistantIdentity"][0])
        url = fields["url"][0].strip()
        secret = fields["secret"][0].strip()

        if not isinstance(identity, dict) or bool(url) != bool(secret):
            return '<p class="notice">Enter a valid assistant identity and both webhook fields.</p>' + self._form()

        webhook = {"url": url, "secret": secret, "header": fields["header"][0]} if url else None

        if webhook is None and identity.get("type") != "agentAddress":
            return '<p class="notice">Bot identities require a webhook URL and key.</p>' + self._form()

        if not paired:
            code = fields["code"][0].strip()
            self.service.bridge.routeFromCode(code)

            if not self.service.provider.catalog():
                raise LocalMCPError("Worker tool catalog is empty.")

            self.credentials.ensureAccessToken()
            self.service.pair(code)

        self.service.authorizeAssistant(identity, webhook)
        self.manager.start()
        self.finished = True

        mode = "The Gateway verified the webhook receiver." if webhook else "Manual status checks are authorized; no webhook is configured."

        return ("<h1>Studio connection authorized</h1><p>" + mode +
                " Return to your assistant to verify its registration. You can close this page.</p>")

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
                    fields = parse_qs(raw.decode("utf-8"), strict_parsing=True, keep_blank_values=True, max_num_fields=6)
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
