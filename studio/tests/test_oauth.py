import json
import threading
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlencode, urlparse

import pytest

from src.Auth import OAuthCredentials
from src.Config import LocalConfig


def test_browser_pkce_oauth_saves_private_tokens_and_refreshes(tmp_path, monkeypatch):
    monkeypatch.setenv("NUWA_MCP_HOME", str(tmp_path))
    config = LocalConfig.load()
    callbacks = []
    callbackFinished = threading.Event()
    calls = []

    class OAuthResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    class OAuthClient:
        def __init__(self, **options):
            assert options["follow_redirects"] is False

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def post(self, url, **options):
            calls.append((url, options))

            if url.endswith("/register"):
                registration = options["json"]
                assert registration["token_endpoint_auth_method"] == "none"
                return OAuthResponse({"client_id": "test-public-client"})

            payload = options["data"]

            if payload["grant_type"] == "authorization_code":
                assert payload["code"] == "good-code"
                assert len(payload["code_verifier"]) >= 43
                return OAuthResponse({
                    "access_token": "first-private-token",
                    "refresh_token": "refresh-private-token",
                    "expires_in": 5,
                })

            assert payload["grant_type"] == "refresh_token"
            return OAuthResponse({
                "access_token": "refreshed-private-token",
                "refresh_token": "new-refresh-private-token",
                "expires_in": 3600,
            })

    def browserOpen(authorizationURL):
        params = parse_qs(urlparse(authorizationURL).query)
        assert params["code_challenge_method"] == ["S256"]

        def visitCallback():
            callback = params["redirect_uri"][0]
            forged = callback + "?" + urlencode({"state": "forged", "code": "wrong"})

            try:
                urllib.request.urlopen(forged, timeout=5)
                pytest.fail("Forged OAuth callback unexpectedly passed.")
            except urllib.error.HTTPError as error:
                assert error.code == 400

            valid = callback + "?" + urlencode({
                "state": params["state"][0],
                "code": "good-code",
            })
            with urllib.request.urlopen(valid, timeout=5) as response:
                assert response.status == 200

            callbacks.append("valid")
            callbackFinished.set()

        threading.Thread(target=visitCallback, daemon=True).start()
        return True

    monkeypatch.setattr("src.Auth.httpx.Client", OAuthClient)
    monkeypatch.setattr("src.Auth.webbrowser.open", browserOpen)
    credentials = OAuthCredentials(config)
    credentials.login()

    # Regression: the OAuth server can stop before the browser callback
    # thread records completion. Never race its asynchronous assertions.
    assert callbackFinished.wait(timeout=5), "OAuth browser callback did not complete"
    assert callbacks == ["valid"]

    saved = json.loads(config.authPath().read_text(encoding="utf-8"))
    assert saved["access_token"] == "first-private-token"
    assert saved["refresh_token"] == "refresh-private-token"

    assert credentials.accessToken() == "refreshed-private-token"
    refreshed = json.loads(config.authPath().read_text(encoding="utf-8"))
    assert refreshed["refresh_token"] == "new-refresh-private-token"

    credentials.logout()
    assert not config.authPath().exists()
