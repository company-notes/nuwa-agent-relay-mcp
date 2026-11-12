"""HTTP adapters for Agent Address V2 identity and Session-scoped Relay operations."""

from typing import Protocol
from urllib.parse import quote, urlparse

import httpx

from .Config import LocalConfig


class CredentialSource(Protocol):
    def accessToken(self) -> str: ...


class StaticBearerCredential:
    def __init__(self, token: str):
        if not token or len(token) > 4096 or any(char.isspace() for char in token):
            raise ValueError("A private MCP OAuth access token is required.")

        self.token = token

    def accessToken(self) -> str:
        return self.token


class HTTPAPIClient:
    def __init__(self, apiURL: str, credentials: CredentialSource, transport=None):
        self.apiURL = LocalConfig.validateOrigin(apiURL)
        self.credentials = credentials
        self.transport = transport

    def request(
        self, method: str, path: str, body: dict | None = None,
        sessionID: str | None = None, runtimeToken: str | None = None,
        query: dict | None = None,
    ):
        if not path.startswith("/") or path.startswith("//") or urlparse(path).scheme:
            raise ValueError("REST path must remain within its service origin.")

        parameters = dict(query or {})
        headers = {"Authorization": f"Bearer {self.credentials.accessToken()}"}

        if sessionID:
            parameters["session_id"] = sessionID

        if runtimeToken:
            headers["x-nuwa-runtime-token"] = runtimeToken

        with httpx.Client(timeout=20, follow_redirects=False, transport=self.transport) as client:
            response = client.request(
                method, self.apiURL + path, headers=headers, params=parameters, json=body,
            )
            response.raise_for_status()
            payload = response.json()

        if not payload["ok"]:
            raise RuntimeError(payload["error"]["message"])

        return payload["data"]


class AddressClient(HTTPAPIClient):
    def status(self):
        return self.request("GET", "/v2/account/status")

    def listAgents(self):
        return self.request("GET", "/v2/account/agents")

    def resolve(self, address: str):
        return self.request("GET", "/v2/account/addresses", query={"address": address})

    def claimAgent(
        self, agentName: str | None = None, sessionName: str | None = None,
    ):
        body = {}

        if agentName:
            body["agentName"] = agentName

        if sessionName:
            body["sessionName"] = sessionName

        return self.request("POST", "/v2/account/agent-runtime-leases", body=body)

    def resumeSession(self, sessionID: str, resumeToken: str):
        return self.request(
            "PUT", "/v2/account/sessions/" + quote(sessionID, safe="") + "/runtime-lease",
            body={"resumeToken": resumeToken},
        )

    def releaseRuntime(self, sessionID: str, runtimeToken: str):
        return self.request(
            "DELETE", "/v2/account/sessions/" + quote(sessionID, safe="") + "/runtime-lease",
            body={"runtimeToken": runtimeToken},
        )


class RelayClient(HTTPAPIClient):
    def __init__(self, config: LocalConfig, credentials: CredentialSource, transport=None):
        super().__init__(config.apiURL, credentials, transport)
        self.config = config

    def call(self, method: str, path: str, body: dict | None = None, query: dict | None = None):
        return self.request(
            method, path, body=body, sessionID=self.config.requireSession(),
            runtimeToken=self.config.requireRuntimeToken(), query=query,
        )

    def inbox(self):
        return self.call("GET", "/v2/inbox")

    def agentInbox(self):
        return self.call("GET", "/v2/agent-inbox")

    def getMessage(self, messageID: str, contextLimit: int | None = None):
        query = {"context_limit": str(contextLimit)} if contextLimit is not None else None

        return self.call("GET", f"/v2/messages/{quote(messageID, safe='')}", query=query)

    def threadHistory(self, threadID: str):
        return self.call("GET", f"/v2/threads/{quote(threadID, safe='')}")

    def sendMessage(self, to: str, body: str, subject: str | None = None,
                    artifactLinks: list[str] | None = None):
        payload = {"to": to, "body": body, "artifactLinks": artifactLinks or []}

        if subject:
            payload["subject"] = subject

        return self.call("POST", "/v2/messages", body=payload)

    def sendHandoff(self, to: str, subject: str, body: str,
                    artifactLinks: list[str] | None = None):
        return self.call("POST", "/v2/handoffs", body={
            "to": to, "subject": subject, "body": body,
            "artifactLinks": artifactLinks or [],
        })

    def acceptHandoff(self, messageID: str):
        return self.call("PUT", f"/v2/handoffs/{quote(messageID, safe='')}/acceptance")

    def replyHandoff(self, messageID: str, body: str, artifactLinks: list[str] | None = None):
        return self.call(
            "POST", f"/v2/handoffs/{quote(messageID, safe='')}/replies",
            body={"body": body, "artifactLinks": artifactLinks or []},
        )

    def replyThread(self, threadID: str, body: str, artifactLinks: list[str] | None = None):
        return self.call(
            "POST", f"/v2/threads/{quote(threadID, safe='')}/messages",
            body={"body": body, "artifactLinks": artifactLinks or []},
        )

    def receipt(self, messageID: str, refreshArchive: bool = False):
        query = {"refresh": "archive"} if refreshArchive else None

        return self.call("GET", f"/v2/messages/{quote(messageID, safe='')}/receipt", query=query)

    def acknowledgeRead(self, messageID: str):
        return self.call("PUT", f"/v2/messages/{quote(messageID, safe='')}/read-receipt")

    def wakeEvents(self):
        return self.call("GET", "/v2/wake-events")

    def registerWake(self, callbackURL: str, authMode: str = "hmac",
                     bearerToken: str | None = None):
        payload = {"callbackUrl": callbackURL, "authMode": authMode}

        if bearerToken:
            payload["bearerToken"] = bearerToken

        return self.call("POST", "/v2/wake-subscription", body=payload)

    def verifyWake(self, verificationID: str, challenge: str):
        return self.call("POST", "/v2/wake-subscription/verification",
                         body={"verificationId": verificationID, "challenge": challenge})

    def wakeSubscription(self):
        return self.call("GET", "/v2/wake-subscription")

    def removeWake(self):
        return self.call("DELETE", "/v2/wake-subscription")

    def provisionAgentMailbox(self):
        return self.call("POST", "/v2/agent-mailboxes")


class RemoteBindingClient(HTTPAPIClient):
    """Manage a Session Runtime through trusted HTTPS, never model tool arguments."""

    def __init__(self, origin: str, oauthToken: str, transport=None):
        super().__init__(origin, StaticBearerCredential(oauthToken), transport)

    def status(self):
        return self.request("GET", "/session-bindings")

    def bind(self, sessionID: str, resumeToken: str):
        return self.request("POST", "/session-bindings", body={
            "sessionID": sessionID, "resumeToken": resumeToken,
        })

    def revoke(self):
        return self.request("DELETE", "/session-bindings")
