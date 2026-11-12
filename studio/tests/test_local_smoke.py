"""The A-side local smoke runner must validate both Webhook receipt and Echo reply."""

import pytest

from src.LocalSmoke import LocalEchoRoundTrip


class FakeRelay:
    def __init__(self, delivered=True):
        self.delivered = delivered
        self.messages = []
        self.sent = []

    def sendMessage(self, to, body, subject):
        self.sent.append((to, body, subject))
        return {"id": "message-123", "threadId": "thread-456"}

    def receipt(self, messageID):
        assert messageID == "message-123"
        return {
            "submissionStatus": "sent",
            "arrivedInMailTrigger": self.delivered,
            "receiptSource": "webhook" if self.delivered else None,
            "receivedAt": "2026-11-09T10:00:00Z" if self.delivered else None,
        }

    def threadHistory(self, threadID):
        assert threadID == "thread-456"
        return [{
            "id": "echo-789",
            "senderSessionID": "session-b",
            "body": "Nuwa local echo receipt for message-123",
        }]


def test_realistic_local_smoke_only_passes_with_confirmed_webhook_and_reply():
    backend = FakeRelay()
    result = LocalEchoRoundTrip(backend, "session-a").run("nuwa/reviewer/main", timeout=1)

    assert result == {
        "ok": True,
        "messageID": "message-123",
        "threadID": "thread-456",
        "receivedAt": "2026-11-09T10:00:00Z",
        "receiptSource": "webhook",
        "echoReplyID": "echo-789",
    }
    assert len(backend.sent) == 1
    assert backend.sent[0][0] == "nuwa/reviewer/main"


def test_local_smoke_rejects_echo_without_independent_mailtrigger_receipt():
    backend = FakeRelay(delivered=False)

    with pytest.raises(TimeoutError, match="receiptSource=None"):
        LocalEchoRoundTrip(backend, "session-a").run("nuwa/reviewer/main", timeout=0.01)

    assert len(backend.sent) == 1, "Timeout must not resend the same message"
