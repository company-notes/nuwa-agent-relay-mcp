import time
from dataclasses import replace
from urllib.parse import urlsplit

import httpx

from .Config import LocalConfig
from .OAuth import OAuthLogin


class APIError(RuntimeError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__('HTTP ' + str(status) + ' (' + code + '): ' + message)
        self.status = status
        self.code = code


class RelayClient:
    def __init__(self, config: LocalConfig | None = None, transport: httpx.BaseTransport | None = None):
        self.config = config or LocalConfig.load()
        self.http = httpx.Client(timeout=30, follow_redirects=False, transport=transport)

    def requireWorkId(self) -> str:
        workId = self.config.workAddressId
        if not workId:
            raise RuntimeError('No Work selected. Run nuwa-agent-relay-mcp identity.')
        return workId

    def refreshAccessToken(self) -> str:
        if not self.config.clientId or not self.config.refreshToken:
            raise RuntimeError('OAuth token expired. Run nuwa-agent-relay-mcp login again.')

        token = OAuthLogin(self.http).post(self.config.addressURL, '/token', {
            'grant_type': 'refresh_token',
            'client_id': self.config.clientId,
            'refresh_token': self.config.refreshToken,
        })
        accessToken = token.get('access_token')
        if not accessToken:
            raise RuntimeError('OAuth refresh returned no access token.')

        self.config = replace(
            self.config, accessToken=accessToken,
            refreshToken=token.get('refresh_token') or self.config.refreshToken,
            expiresAt=time.time() + token['expires_in'] if token.get('expires_in') else None,
        )
        self.config.save()
        return accessToken

    def call(self, service: str, path: str, method: str = 'GET',
             body: dict | None = None, query: dict | None = None):
        if path.startswith('//') or not path.startswith('/') or urlsplit(path).netloc:
            raise ValueError('Only relative API paths are permitted.')

        if service not in ('address', 'relay'):
            raise ValueError('Unsupported API service.')

        base = self.config.addressURL if service == 'address' else self.config.apiURL
        parsed = urlsplit(base)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or (
            parsed.path not in ('', '/') or parsed.query or parsed.fragment
        ):
            raise ValueError('API origin must be HTTPS without path or credentials.')

        params = dict(query or {})
        if service == 'relay':
            params['work_address_id'] = self.requireWorkId()

        if not self.config.accessToken:
            raise RuntimeError('Not signed in. Run nuwa-agent-relay-mcp login.')

        if self.config.expiresAt and time.time() + 60 >= self.config.expiresAt:
            self.refreshAccessToken()

        response = self.send(base + path, method, params, body)
        if response.status_code == 401 and self.config.refreshToken:
            self.refreshAccessToken()
            response = self.send(base + path, method, params, body)

        try:
            payload = response.json()
        except ValueError:
            raise APIError(response.status_code, 'invalid_json', 'API returned invalid JSON.')

        if not isinstance(payload, dict):
            raise APIError(response.status_code, 'invalid_json', 'API returned an invalid response.')
        if not response.is_success or payload.get('ok') is not True:
            error = payload.get('error') or {}
            raise APIError(response.status_code, str(error.get('code', 'upstream_error')),
                           str(error.get('message', 'API request failed.'))[:300])

        return payload['data']

    def send(self, url: str, method: str, params: dict, body: dict | None) -> httpx.Response:
        return self.http.request(
            method, url, params=params,
            headers={'Authorization': 'Bearer ' + self.config.accessToken,
                     'Accept': 'application/json'},
            json=body,
        )

    def address(self, path: str, method: str = 'GET',
                body: dict | None = None, query: dict | None = None):
        return self.call('address', path, method, body, query)

    def relay(self, path: str, method: str = 'GET',
              body: dict | None = None, query: dict | None = None):
        return self.call('relay', path, method, body, query)

    def updateWork(self, workId: str) -> dict:
        status = self.address('/v1/account/status', query={'work_address_id': workId})
        work = status.get('work')
        if not work or work.get('id') != workId or work.get('active') is not True:
            raise RuntimeError('Work is not an active identity owned by this account.')

        hosts = status.get('hosts') or []
        if not any(host['id'] == work.get('parentAddressId') for host in hosts):
            raise RuntimeError('Work has no active Host owned by this account.')

        self.config = replace(self.config, workAddressId=workId)
        self.config.save()
        return work

    def close(self) -> None:
        self.http.close()
