import asyncio
import unittest

import httpx
from fastmcp import Client

from src.Client import RelayClient
from src.Config import LocalConfig
from src.Server import StudioMCP


class CoreFlowTest(unittest.TestCase):
    def testRealFastMCPFlowDelegatesToRelayAPI(self):
        """Run the actual FastMCP in-process client over a fake external REST backend."""
        calls = []

        def handle(request):
            calls.append(request)
            if request.url.path == '/v1/messages' and request.method == 'POST':
                return httpx.Response(201, json={'ok': True, 'data': {'id': 'sent'}})
            if request.url.path == '/v1/inbox':
                return httpx.Response(200, json={'ok': True, 'data': [{'id': 'sent'}]})
            return httpx.Response(200, json={'ok': True, 'data': {}})

        async def flow():
            relay = RelayClient(
                LocalConfig(accessToken='test-token', workAddressId='work-id'),
                transport=httpx.MockTransport(handle),
            )
            try:
                server = StudioMCP(relay).createServer()
                async with Client(server) as session:
                    tools = await session.list_tools()
                    names = [tool.name for tool in tools]
                    self.assertIn('relay_send_message', names)
                    self.assertIn('relay_inbox', names)
                    sent = await session.call_tool(
                        'relay_send_message', {'to': '@peer/work', 'body': 'Hello'})
                    self.assertFalse(sent.is_error)
                    inbox = await session.call_tool('relay_inbox', {})
                    self.assertFalse(inbox.is_error)
            finally:
                relay.close()

        asyncio.run(flow())
        self.assertEqual(calls[0].url.params['work_address_id'], 'work-id')
        self.assertEqual(calls[0].method, 'POST')
        self.assertEqual(calls[1].url.path, '/v1/inbox')


if __name__ == '__main__':
    unittest.main()
