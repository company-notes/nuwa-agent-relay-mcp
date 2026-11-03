import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.Config import LocalConfig


class ConfigTest(unittest.TestCase):
    def testPrivateProfilesRemainIsolated(self):
        """A Studio profile must never silently select another session's Work."""
        with tempfile.TemporaryDirectory() as home:
            with patch.dict(os.environ, {'NUWA_MCP_HOME': home, 'NUWA_MCP_PROFILE': 'alice'}, clear=False):
                LocalConfig(accessToken='alice-token', workAddressId='alice-work').save()
                self.assertEqual(LocalConfig.load().workAddressId, 'alice-work')
                if os.name != 'nt':
                    self.assertEqual(LocalConfig.path().stat().st_mode & 0o777, 0o600)

            with patch.dict(os.environ, {'NUWA_MCP_HOME': home, 'NUWA_MCP_PROFILE': 'bob'}, clear=False):
                self.assertIsNone(LocalConfig.load().workAddressId)
                LocalConfig(accessToken='bob-token', workAddressId='bob-work').save()
                self.assertEqual(LocalConfig.load().workAddressId, 'bob-work')

            with patch.dict(os.environ, {'NUWA_MCP_HOME': home, 'NUWA_MCP_PROFILE': 'alice'}, clear=False):
                self.assertEqual(LocalConfig.load().accessToken, 'alice-token')

    def testRejectsProfileTraversal(self):
        with patch.dict(os.environ, {'NUWA_MCP_PROFILE': '../wrong'}, clear=False):
            with self.assertRaises(ValueError):
                LocalConfig.profile()


if __name__ == '__main__':
    unittest.main()
