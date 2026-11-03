import base64
import hashlib
import hmac
import secrets
import time
import webbrowser
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from .Config import LocalConfig


class OAuthLogin:
    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(timeout=20, follow_redirects=False)

    def post(self, origin: str, path: str, payload: dict, asJSON: bool = False) -> dict:
        response = self.client.post(
            origin + path, json=payload if asJSON else None,
            data=None if asJSON else payload,
        )
        if not response.is_success:
            raise RuntimeError('Agent Address OAuth ' + path + ' failed: HTTP ' + str(response.status_code))

        result = response.json()
        if not isinstance(result, dict):
            raise RuntimeError('Agent Address OAuth returned invalid JSON.')
        return result

    def login(self) -> LocalConfig:
        config = LocalConfig.load()
        verifier = secrets.token_urlsafe(32)
        state = secrets.token_urlsafe(24)
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode('ascii')).digest()
        ).decode('ascii').rstrip('=')
        codeResult: dict[str, str] = {}

        class Callback(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                params = parse_qs(parsed.query, keep_blank_values=True)
                valid = (
                    parsed.path == '/oauth/callback' and
                    self.headers.get('Host') == '127.0.0.1:' + str(server.server_port) and
                    len(params.get('state', [])) == 1 and
                    hmac.compare_digest(params['state'][0], state) and
                    len(params.get('code', [])) == 1 and bool(params['code'][0])
                )
                if valid:
                    codeResult['code'] = params['code'][0]
                self.send_response(200 if valid else 400)
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Security-Policy', "default-src 'none'")
                self.end_headers()
                self.wfile.write(b'Nuwa MCP login completed.' if valid else b'Invalid OAuth callback.')

            def log_message(self, _format, *_args):
                # Never print the callback URL: it contains an OAuth authorization code.
                return

        server = HTTPServer(('127.0.0.1', 0), Callback)
        server.timeout = 2
        redirectURI = 'http://127.0.0.1:' + str(server.server_port) + '/oauth/callback'
        try:
            registration = self.post(config.addressURL, '/register', {
                'client_name': 'Nuwa Agent Relay Studio MCP',
                'redirect_uris': [redirectURI],
                'grant_types': ['authorization_code'],
                'response_types': ['code'],
                'token_endpoint_auth_method': 'none',
            }, asJSON=True)
            clientId = registration.get('client_id')
            if not isinstance(clientId, str) or not clientId:
                raise RuntimeError('OAuth registration returned no client_id.')

            authorizationURL = config.addressURL + '/authorize?' + urlencode({
                'response_type': 'code',
                'client_id': clientId,
                'redirect_uri': redirectURI,
                'state': state,
                'code_challenge': challenge,
                'code_challenge_method': 'S256',
            })
            print('Open Agent Address login URL in your browser:\n' + authorizationURL)
            webbrowser.open(authorizationURL)
            deadline = time.monotonic() + 180
            while 'code' not in codeResult and time.monotonic() < deadline:
                server.handle_request()
            if 'code' not in codeResult:
                raise TimeoutError('Agent Address login timed out.')

            token = self.post(config.addressURL, '/token', {
                'grant_type': 'authorization_code',
                'client_id': clientId,
                'redirect_uri': redirectURI,
                'code': codeResult['code'],
                'code_verifier': verifier,
            })
            if not token.get('access_token') or token.get('token_type', 'Bearer').lower() != 'bearer':
                raise RuntimeError('OAuth did not return a valid bearer access token.')

            updated = replace(
                config, accessToken=token['access_token'], refreshToken=token.get('refresh_token'),
                expiresAt=time.time() + token['expires_in'] if token.get('expires_in') else None,
                clientId=clientId, workAddressId=None,
            )
            updated.save()
            return updated
        finally:
            server.server_close()
