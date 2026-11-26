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
    FORM = """<h1>Connect your assistant to this computer</h1>
<p>The selected assistant will be able to use the approved AI Worker Gateway tools and view all Jobs visible to this Windows test Worker. Use a dedicated assistant connection and a dedicated test Worker.</p>
<p>Enter the one-time pairing code from your assistant yourself. Nuwa may open its normal sign-in page when you confirm.</p>
<form method="post" autocomplete="off">
<label for="pairing-code">One-time pairing code</label>
<input id="pairing-code" name="code" type="password" required maxlength="129" autocomplete="off" spellcheck="false">
<label class="consent"><input type="checkbox" name="consent" value="yes" required> I authorize this assistant to use the local Worker.</label>
<button type="submit">Authorize and connect</button></form>
<form method="post"><button name="cancel" value="yes">Cancel</button></form>"""
    PAIRED = """<h1>This Studio already has a paired Worker</h1>
<p>Start the previously authorized connection. To connect a different assistant, revoke the current pairing first.</p>
<form method="post"><button name="resume" value="yes">Reconnect authorized Worker</button></form>
<form method="post"><button name="cancel" value="yes">Cancel</button></form>"""
    STYLE = """body{font:16px system-ui,sans-serif;max-width:620px;margin:60px auto;padding:24px;color:#222}
h1{font-size:26px}p{line-height:1.6}label{display:block;margin:18px 0 8px}
input[type=password]{width:100%;box-sizing:border-box;padding:12px;border:1px solid #777;border-radius:6px}
button{margin-top:16px;padding:12px 20px;border:1px solid #777;border-radius:6px;background:#fff;cursor:pointer}
.notice{padding:12px;border-left:3px solid #777}"""

    def __init__(self, service, credentials, manager):
        self.service = service
        self.credentials = credentials
        self.manager = manager
        self.path = "/" + secrets.token_urlsafe(32)
        self.finished = False

    def _form(self) -> str:
        if self.service.config.workerBridgePath().is_file():
            return self.PAIRED

        return self.FORM

    def _complete(self, fields: dict) -> str:
        if fields == {"cancel": ["yes"]}:
            self.finished = True

            return "<h1>Authorization cancelled</h1><p>No new access was granted. You can close this page.</p>"

        paired = self.service.config.workerBridgePath().is_file()

        if not paired:
            if set(fields) != {"code", "consent"} or fields["consent"] != ["yes"] or len(fields["code"]) != 1:
                return '<p class="notice">Enter the code and explicitly confirm authorization.</p>' + self.FORM

            code = fields["code"][0].strip()

            try:
                self.service.bridge.routeFromCode(code)

                if not self.service.provider.catalog():
                    raise LocalMCPError("Worker tool catalog is empty.")
            except (LocalMCPError, httpx.HTTPError, OSError, ValueError) as error:
                logger.warning("Worker pairing prerequisite failed (errorType=%s)", type(error).__name__)

                return '<p class="notice">Check the code and ensure AI Worker Gateway is installed and running.</p>' + self.FORM

            self.credentials.ensureAccessToken()
            self.service.pair(code)
        elif fields != {"resume": ["yes"]}:
            return self.PAIRED

        self.manager.start()
        self.finished = True

        return "<h1>Studio connection authorized</h1><p>The background Worker service has been requested. Return to your assistant to verify its live tools. You can close this page.</p>"

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
                self.send_header("Referrer-Policy", "no-referrer")
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

                if (not length.isdecimal() or not 0 < int(length) <= 2048 or
                        self.headers.get_content_type() != "application/x-www-form-urlencoded"):
                    self.send_error(400)
                    return

                self.connection.settimeout(5)
                raw = self.rfile.read(int(length))

                try:
                    fields = parse_qs(raw.decode("utf-8"), strict_parsing=True, max_num_fields=3)
                    body = page._complete(fields)
                except (httpx.HTTPError, RuntimeError, ValueError, OSError) as error:
                    logger.warning("Worker authorization failed (errorType=%s)", type(error).__name__)
                    body = '<p class="notice">Authorization could not be completed. Check your sign-in, code expiry and Studio installation.</p>' + page._form()

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
