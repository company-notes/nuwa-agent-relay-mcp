"""Agent Address OAuth browser authorization and refreshable bearer tokens."""

import hashlib
import json
import secrets
import time
import webbrowser
from base64 import urlsafe_b64encode
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from .Config import LocalConfig


class OAuthCredentials:
    def __init__(self, config: LocalConfig):
        self.config = config

    def _read(self) -> dict:
        path = self.config.authPath()

        if not path.exists():
            raise RuntimeError("Not logged in. Run 'nuwa-studio-mcp login'.")

        auth = json.loads(path.read_text(encoding="utf-8"))

        if auth["origin"] != self.config.addressURL:
            raise RuntimeError("Saved OAuth token belongs to another Agent Address server.")

        return auth

    def _tokenRequest(self, payload: dict) -> dict:
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            response = client.post(self.config.addressURL + "/token", data=payload)
            response.raise_for_status()
            result = response.json()

        if not result.get("access_token"):
            raise RuntimeError("Agent Address token response has no access token.")

        return result

    def accessToken(self) -> str:
        override = __import__("os").environ.get("NUWA_ACCESS_TOKEN")

        if override:
            return override

        auth = self._read()

        if not auth.get("expires_at") or time.time() + 60 < auth["expires_at"]:
            return auth["access_token"]

        if not auth.get("refresh_token"):
            raise RuntimeError("OAuth token expired. Run 'nuwa-studio-mcp login' again.")

        tokens = self._tokenRequest({
            "grant_type": "refresh_token",
            "client_id": auth["client_id"],
            "refresh_token": auth["refresh_token"],
        })
        auth.update({
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token", auth["refresh_token"]),
            "expires_at": time.time() + tokens["expires_in"] if tokens.get("expires_in") else None,
        })
        self.config.writePrivate(self.config.authPath(), auth)

        return auth["access_token"]

    def logout(self) -> None:
        self.config.authPath().unlink(missing_ok=True)

    def login(self) -> None:
        verifier = secrets.token_urlsafe(32)
        challenge = urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        state = secrets.token_urlsafe(24)
        callback = self._callbackServer(state)

        try:
            redirectURI = f"http://127.0.0.1:{callback.server_port}/oauth/callback"

            with httpx.Client(timeout=20, follow_redirects=False) as client:
                response = client.post(self.config.addressURL + "/register", json={
                    "client_name": "Nuwa Agent Relay Studio MCP",
                    "redirect_uris": [redirectURI],
                    "grant_types": ["authorization_code"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                })
                response.raise_for_status()
                clientID = response.json()["client_id"]

            authorizeURL = self.config.addressURL + "/authorize?" + urlencode({
                "response_type": "code",
                "client_id": clientID,
                "redirect_uri": redirectURI,
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            })

            print("請在瀏覽器完成 Agent Address 登入：")
            print(authorizeURL)
            webbrowser.open(authorizeURL)

            callback.serve_forever(poll_interval=0.2)

            if not callback.authorizationCode:
                raise RuntimeError("OAuth authorization was not completed.")

            tokens = self._tokenRequest({
                "grant_type": "authorization_code",
                "client_id": clientID,
                "redirect_uri": redirectURI,
                "code": callback.authorizationCode,
                "code_verifier": verifier,
            })
            self.config.writePrivate(self.config.authPath(), {
                "origin": self.config.addressURL,
                "client_id": clientID,
                "access_token": tokens["access_token"],
                "refresh_token": tokens.get("refresh_token"),
                "expires_at": time.time() + tokens["expires_in"] if tokens.get("expires_in") else None,
            })
        finally:
            callback.server_close()

    @classmethod
    def _callbackServer(cls, state: str) -> HTTPServer:
        class CallbackServer(HTTPServer):
            authorizationCode: str | None = None

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                parsed = urlparse(self.path)
                params = parse_qs(parsed.query)

                if parsed.path != "/oauth/callback" or params.get("state") != [state]:
                    self.send_error(400, "Invalid OAuth state.")
                    return

                if params.get("error"):
                    self.send_error(400, "OAuth authorization refused.")
                    self.server.shutdown()
                    return

                code = params.get("code")

                if not code or len(code) != 1:
                    self.send_error(400, "Missing OAuth authorization code.")
                    return

                self.server.authorizationCode = code[0]
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write("Nuwa Studio MCP login complete. Return to terminal.".encode())
                Thread(target=self.server.shutdown, daemon=True).start()

            def log_message(self, formatString: str, *args) -> None:
                # OAuth callback URLs contain one-time authorization codes.
                return

        return CallbackServer(("127.0.0.1", 0), CallbackHandler)
