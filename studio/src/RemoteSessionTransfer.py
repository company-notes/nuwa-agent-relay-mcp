"""Explicit Runtime ownership transfer from local Studio to a trusted Remote MCP."""

from .Client import AddressClient, RemoteBindingClient
from .Config import LocalConfig


class RemoteSessionTransfer:
    def __init__(
        self, config: LocalConfig, address: AddressClient,
        remote: RemoteBindingClient,
    ):
        self.config = config
        self.address = address
        self.remote = remote

    def transfer(self) -> dict:
        sessionID = self.config.requireSession()
        runtimeToken = self.config.requireRuntimeToken()
        resumeToken = self.config.requireResumeToken(sessionID)

        if self.config.wakePath().exists():
            raise ValueError("Unregister the local Session Wake before transferring Runtime ownership.")

        state = self.remote.status()

        if state["bound"]:
            raise ValueError("The selected Remote MCP OAuth grant already has a bound Session.")

        # The Session Runtime lease cannot be shared. Release this local holder
        # first; Agent Address will then atomically grant Remote MCP its own lease.
        self.address.releaseRuntime(sessionID, runtimeToken)
        self.config.runtimePath().unlink(missing_ok=True)

        result = self.remote.bind(sessionID, resumeToken)

        if result.get("bound") is not True or result.get("sessionID") != sessionID:
            raise RuntimeError("Remote MCP did not confirm the selected Session binding.")

        return {"bound": True, "sessionID": sessionID}

    def revoke(self) -> dict:
        return self.remote.revoke()
