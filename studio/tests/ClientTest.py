import unittest
import httpx

from src.Client import APIError, RelayClient
from src.Config import LocalConfig


class ClientTest(unittest.TestCase):
    def testWorkScopeAndBearerHeader(self):
        requests = []

        def handle(request):
            requests.append(request)
            return httpx.Response(200, json={'ok': True, 'data': {'messages': []}})

        client = RelayClient(
            LocalConfig(accessToken='secret-test', workAddressId='owned-work'),
            transport=httpx.MockTransport(handle),
        )
        try:
            self.assertEqual(client.relay('/v1/inbox'), {'messages': []})
            request = requests[0]
            self.assertEqual(request.url.params['work_address_id'], 'owned-work')
            self.assertEqual(request.headers['Authorization'], 'Bearer secret-test')
            self.assertNotIn('secret-test', str(request.url))
        finally:
            client.close()

    def testNoUnselectedWorkAndNoUntrustedOrigin(self):
        client = RelayClient(LocalConfig(accessToken='test'))
        try:
            with self.assertRaises(RuntimeError):
                client.relay('/v1/inbox')
            with self.assertRaises(ValueError):
                client.address('//evil.example')
        finally:
            client.close()

    def testAPIErrorPreservesStatusAndCode(self):
        def handle(request):
            return httpx.Response(403, json={
                'ok': False, 'error': {'code': 'forbidden', 'message': 'Denied'},
            })

        client = RelayClient(
            LocalConfig(accessToken='test', workAddressId='work'),
            transport=httpx.MockTransport(handle),
        )
        try:
            with self.assertRaises(APIError) as raised:
                client.relay('/v1/inbox')
            self.assertEqual(raised.exception.status, 403)
            self.assertEqual(raised.exception.code, 'forbidden')
        finally:
            client.close()


if __name__ == '__main__':
    unittest.main()
