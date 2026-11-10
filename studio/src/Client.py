"""One HTTP request path for all Agent Address and Relay operations."""

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
            raise ValueError("REST path must stay within the configured service.")

        parameters = dict(query or {})

        if workAddressID:
            parameters["work_address_id"] = workAddressID

        with httpx.Client(timeout=20, follow_redirects=False, transport=self.transport) as client:
            response = client.request(
                method,
                self.apiURL + path,
                headers={"Authorization": f"Bearer {self.credentials.accessToken()}"},
                params=parameters,
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
        body = {"host": host, "handle": handle}

        if organization:
            body["organization"] = organization

        return self.request("POST", "/v1/account/work", body=body)


class RelayClient(HTTPAPIClient):
    def __init__(self, config: LocalConfig, credentials: OAuthCredentials, transport=None):
        super().__init__(config.apiURL, credentials, transport)
        self.config = config

    def call(self, method: str, path: str, body: dict | None = None, query: dict | None = None):
        return self.request(method, path, body=body, workAddressID=self.config.requireWork(), query=query)

    def inbox(self):
        return self.call("GET", "/v1/inbox")

    def hostInbox(self):
        return self.call("GET", "/v1/host-inbox")

    def getMessage(self, messageID: str):
        return self.call("GET", f"/v1/messages/{quote(messageID, safe='')}")

    def threadHistory(self, threadID: str):
        return self.call("GET", f"/v1/threads/{quote(threadID, safe='')}")

    def sendMessage(self, to: str, body: str, subject: str | None = None,
                    artifactLinks: list[str] | None = None):
        payload = {"to": to, "body": body, "artifactLinks": artifactLinks or []}

        if subject:
            payload["subject"] = subject

        return self.call("POST", "/v1/messages", body=payload)

    def sendHandoff(
        self,
        to: str,
        subject: str,
        body: str,
        artifactLinks: list[str] | None = None,
    ):
        payload = {
            "to": to,
            "subject": subject,
            "body": body,
            "artifactLinks": artifactLinks or [],
        }

        return self.call("POST", "/v1/handoffs", body=payload)

    def acceptHandoff(self, messageID: str):
        return self.call("POST", f"/v1/handoffs/{quote(messageID, safe='')}/accept")

    def replyHandoff(self, messageID: str, body: str, artifactLinks: list[str] | None = None):
        return self.call(
            "POST",
            f"/v1/handoffs/{quote(messageID, safe='')}/reply",
            body={"body": body, "artifactLinks": artifactLinks or []},
        )

    def replyThread(self, threadID: str, body: str, artifactLinks: list[str] | None = None):
        return self.call(
            "POST",
            f"/v1/threads/{quote(threadID, safe='')}/messages",
            body={"body": body, "artifactLinks": artifactLinks or []},
        )

    def receipt(self, messageID: str, refreshArchive: bool = False):
        query = {"refresh": "archive"} if refreshArchive else None

        return self.call("GET", f"/v1/messages/{quote(messageID, safe='')}/receipt", query=query)

    def acknowledgeRead(self, messageID: str):
        return self.call("POST", f"/v1/messages/{quote(messageID, safe='')}/read")

    def wakeEvents(self):
        return self.call("GET", "/v1/wake-events")

    def registerWake(self, callbackURL: str, authMode: str = "hmac",
                     bearerToken: str | None = None):
        payload = {"callbackUrl": callbackURL, "authMode": authMode}

        if bearerToken:
            payload["bearerToken"] = bearerToken

        return self.call("POST", "/v1/wake-subscription", body=payload)

    def verifyWake(self, verificationID: str, challenge: str):
        return self.call("POST", "/v1/wake-subscription/verification",
                         body={"verificationId": verificationID, "challenge": challenge})

    def wakeSubscription(self):
        return self.call("GET", "/v1/wake-subscription")

    def removeWake(self):
        return self.call("DELETE", "/v1/wake-subscription")

    def provisionHostMailbox(self):
        return self.call("POST", "/v1/hosts/provision")
