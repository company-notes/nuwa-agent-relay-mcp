import httpx
import pytest

from src.Client import AddressClient, RelayClient
from src.Config import LocalConfig


class FakeCredentials:
    def accessToken(self) -> str:
        return "test-secret-oauth"


def test_relay_client_reuses_one_work_scoped_http_path():
    recorded = []

    def backend(request):
        recorded.append(request)
        return httpx.Response(200, json={"ok": True, "data": {"ready": True}})

    config = LocalConfig(workAddressID="work-owned")
    client = RelayClient(config, FakeCredentials(), httpx.MockTransport(backend))

    assert client.inbox() == {"ready": True}
    assert client.sendMessage("org/host/work", "hello") == {"ready": True}
    assert client.receipt("msg-1", refreshArchive=True) == {"ready": True}
    assert client.acceptHandoff("handoff/1") == {"ready": True}

    assert all(request.url.params["work_address_id"] == "work-owned" for request in recorded)
    assert all(request.headers["authorization"] == "Bearer test-secret-oauth" for request in recorded)

    assert recorded[2].url.params["refresh"] == "archive"
    assert "/handoff%2F1/accept" in str(recorded[3].url)


def test_address_client_does_not_add_work_query():
    def backend(request):
        assert "work_address_id" not in request.url.params
        return httpx.Response(200, json={"ok": True, "data": {"organization": None}})

    address = AddressClient("https://address.company-notes.com", FakeCredentials(),
                            transport=httpx.MockTransport(backend))
    assert address.status()["organization"] is None


def test_missing_work_fails_before_any_network_request():
    def backend(request):
        pytest.fail("No HTTP request should occur without a Work identity.")

    client = RelayClient(LocalConfig(), FakeCredentials(), httpx.MockTransport(backend))

    with pytest.raises(ValueError, match="No Work"):
        client.inbox()
