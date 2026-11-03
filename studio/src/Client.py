"""HTTP clients for Agent Address and Relay using one authenticated REST path."""

from urllib.parse import quote, urlparse

import httpx

from .Auth import OAuthCredentials
from .Config import LocalConfig


class HTTPAPIClient:
    def __init__(self, apiURL: str, credentials: OAuthCredentials, transport=None):
        self.apiURL = LocalConfig.validateOrigin(apiURL)
        self.credentials = credentials
        self.transport = transport

    def request(
        self, method: str, path: str, body: dict | None = None,
        workAddressID: str | None = None, query: dict | None = None,
    ):
        if not path.startswith("/") or path.startswith("//") or urlparse(path).scheme:
            raise ValueError("REST path must stay within the configured service origin.")

        params = dict(query or {})

        if workAddressID:
            params["work_address_id"] = workAddressID

        with httpx.Client(timeout=20, follow_redirects=False, transport=self.transport) as client:
            response = client.request(
                method,
                self.apiURL + path,
                headers={"Authorization": f"Bearer {self.credentials.accessToken()}"},
                params=params,
                json=body,
            )
            response.raise_for_status()
            payload = response.json()

        if not payload["ok"]:
            raise RuntimeError(payload["error"]["message"])

        return payload["data"]


class AddressClient(HTTPAPIClient):
    def status(self, workAddressID: str | None = None):
        return self.request("GET", "/v1/account/status", workAddressID=workAddressID)

    def claimWork(self, host: str, handle: str, organization: str | None = None):
        payload = {"host": host, "handle": handle}

        if organization:
            payload["organization"] = organization

        return self.request("POST", "/v1/account/work", body=payload)


class RelayClient(HTTPAPIClient):
    def __init__(self, config: LocalConfig, credentials: OAuthCredentials, transport=None):
        super().__init__(config.apiURL, credentials, transport=transport)
        self.config = config

    def call(self, method: str, path: str, body: dict | None = None, query: dict | None = None):
        return self.request(method, path, body=body, workAddressID=self.config.requireWork(), query=query)

    def inbox(self):
        return self.call("GET", "/v1/inbox")

    def hostInbox(self):
        return self.call("GET", "/v1/host-inbox")

    def sendMessage(self, to: str, body: str, subject: str | None = None,
                    artifactLinks: list[str] | None = None):
        return self.call("POST", "/v1/messages", body={
            "to": to, "body": body, "subject": subject, "artifactLinks": artifactLinks or [],
        })

    def sendHandoff(self, to: str, subject: str, body: str,
                    artifactLinks: list[str] | None = None):
        return self.call("POST", "/v1/handoffs", body={
            "to": to, "subject": subject, "body": body, "artifactLinks": artifactLinks or [],
        })

    def acceptHandoff(self, messageID: str):
        return self.call("POST", f"/v1/handoffs/{quote(messageID, safe='')}/accept")

    def replyHandoff(self, messageID: str, body: str, artifactLinks: list[str] | None = None):
        return self.call("POST", f"/v1/handoffs/{quote(messageID, safe='')}/reply",
                         body={"body": body, "artifactLinks": artifactLinks or []})

    def threadHistory(self, threadID: str):
        return self.call("GET", f"/v1/threads/{quote(threadID, safe='')}")

    def replyThread(self, threadID: str, body: str, artifactLinks: list[str] | None = None):
        return self.call("POST", f"/v1/threads/{quote(threadID, safe='')}/messages",
                         body={"body": body, "artifactLinks": artifactLinks or []})

    def getMessage(self, messageID: str):
        return self.call("GET", f"/v1/messages/{quote(messageID, safe='')}")

    def receipt(self, messageID: str, refreshArchive: bool = False):
        return self.call("GET", f"/v1/messages/{quote(messageID, safe='')}/receipt",
                         query={"refresh": "archive"} if refreshArchive else None)

    def acknowledgeRead(self, messageID: str):
        return self.call("POST", f"/v1/messages/{quote(messageID, safe='')}/read")

    def wakeEvents(self):
        return self.call("GET", "/v1/wake-events")

    def provisionHostMailbox(self):
        return self.call("POST", "/v1/hosts/provision")
