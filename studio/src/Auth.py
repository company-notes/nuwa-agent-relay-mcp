"""Browser OAuth PKCE login and refresh for the local Studio client."""

import hashlib
import json
import os
import secrets
import time
import webbrowser
from base64 import urlsafe_b64encode
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread, Timer
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from .Config import LocalConfig


class OAuthCredentials:
    def __init__(self, config: LocalConfig):
        self.config = config

    def _read(self) -> dict:
        path = self.config.authPath()

        if not path.exists():
            raise RuntimeError("Not logged in. Run nuwa-studio-mcp login.")

        auth = json.loads(path.read_text(encoding="utf-8"))

        if auth["origin"] != self.config.addressURL:
            raise RuntimeError("OAuth credentials belong to another Agent Address origin.")

        return auth

    def _tokenRequest(self, payload: dict) -> dict:
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            response = client.post(self.config.addressURL + "/token", data=payload)
            response.raise_for_status()
            data = response.json()

        if not data.get("access_token"):
            raise RuntimeError("OAuth response did not contain an access token.")

        return data

    def accessToken(self) -> str:
        override = os.environ.get("NUWA_ACCESS_TOKEN")

        if override:
            return override

        auth = self._read()

        if not auth.get("expires_at") or time.time() + 60 < auth["expires_at"]:
            return auth["access_token"]

        if not auth.get("refresh_token"):
            raise RuntimeError("OAuth token expired. Run nuwa-studio-mcp login.")

        refreshed = self._tokenRequest({
            "grant_type": "refresh_token",
            "client_id": auth["client_id"],
            "refresh_token": auth["refresh_token"],
        })
        auth.update({
            "access_token": refreshed["access_token"],
            "refresh_token": refreshed.get("refresh_token", auth["refresh_token"]),
            "expires_at": time.time() + refreshed["expires_in"] if refreshed.get("expires_in") else None,
        })
        self.config.writePrivate(self.config.authPath(), auth)

        return auth["access_token"]

    def logout(self) -> None:
        self.config.authPath().unlink(missing_ok=True)
        self.config.runtimePath().unlink(missing_ok=True)
        self.config.wakePath().unlink(missing_ok=True)

    @classmethod
    def _callbackServer(cls, state: str) -> HTTPServer:
        class CallbackServer(HTTPServer):
            authorizationCode: str | None = None

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                parsed = urlparse(self.path)
                fields = parse_qs(parsed.query)

                if parsed.path != "/oauth/callback" or fields.get("state") != [state]:
                    self.send_error(400, "Invalid OAuth State.")
                    return

                if fields.get("error"):
                    self.send_error(400, "Authorization refused.")
                    Thread(target=self.server.shutdown, daemon=True).start()
                    return

                codes = fields.get("code")

                if not codes or len(codes) != 1:
                    self.send_error(400, "Missing authorization code.")
                    return

                self.server.authorizationCode = codes[0]
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(b"Nuwa Studio MCP login complete. Return to terminal.")
                Thread(target=self.server.shutdown, daemon=True).start()

            def log_message(self, formatString: str, *args) -> None:
                # Do not log OAuth authorization codes embedded in callback URLs.
                return

        return CallbackServer(("127.0.0.1", 0), CallbackHandler)

    def login(self) -> None:
        verifier = secrets.token_urlsafe(32)
        challenge = urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()
        ).decode().rstrip("=")
        state = secrets.token_urlsafe(24)

        callback = self._callbackServer(state)
        timer = Timer(180, callback.shutdown)

        try:
            redirectURI = f"http://127.0.0.1:{callback.server_port}/oauth/callback"

            with httpx.Client(timeout=20, follow_redirects=False) as client:
                response = client.post(self.config.addressURL + "/register", json={
                    "client_name": "Nuwa Agent Relay Studio",
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

            print("Sign in to Agent Address using your browser:")
            print(authorizeURL)
            webbrowser.open(authorizeURL)

            timer.start()
            callback.serve_forever(poll_interval=0.2)

            if not callback.authorizationCode:
                raise RuntimeError("OAuth authorization cancelled or timed out.")

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
            # A new OAuth login must never inherit a previous principal's
            # Session Runtime or locally stored callback credential.
            self.config.runtimePath().unlink(missing_ok=True)
            self.config.wakePath().unlink(missing_ok=True)
        finally:
            timer.cancel()
            callback.server_close()
