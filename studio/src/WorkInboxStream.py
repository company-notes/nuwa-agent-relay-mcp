"""Authenticated event-only WebSocket transport for native work."""

import json
from urllib.parse import urlsplit, urlunsplit

from websockets.sync.client import connect


class WorkInboxStream:
    """The connection carries notifications, never Runtime secrets or message bodies."""

    def __init__(self, origin: str, headers: dict, connector=connect):
        parsed = urlsplit(origin)
        self.url = urlunsplit(("wss", parsed.netloc, "/work-inbox/events/stream", "", ""))
        self.headers = headers
        self.connector = connector

    def open(self):
        return self.connector(self.url, additional_headers=self.headers, open_timeout=15,
                              close_timeout=2, ping_interval=30, max_size=1024)

    @staticmethod
    def validateSignal(message) -> None:
        if not isinstance(message, str) or json.loads(message) != {"inboxChanged": True}:
            raise ValueError("Invalid work Inbox event.")
