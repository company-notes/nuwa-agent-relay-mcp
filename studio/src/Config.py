import json
import os
import re
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path


@dataclass(frozen=True)
class LocalConfig:
    addressURL: str = 'https://address.company-notes.com'
    apiURL: str = 'https://agent-relay.company-notes.com'
    accessToken: str | None = None
    refreshToken: str | None = None
    clientId: str | None = None
    expiresAt: float | None = None
    workAddressId: str | None = None

    @classmethod
    def home(cls) -> Path:
        explicit = os.environ.get('NUWA_MCP_HOME')
        if explicit:
            path = Path(explicit)
            if not path.is_absolute():
                raise ValueError('NUWA_MCP_HOME must be an absolute path.')
            return path

        if os.name == 'nt':
            return Path(os.environ.get('APPDATA', str(Path.home() / 'AppData' / 'Roaming'))) / 'nuwa-agent-relay-mcp'
        return Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'nuwa-agent-relay-mcp'

    @classmethod
    def profile(cls) -> str:
        profile = os.environ.get('NUWA_MCP_PROFILE', 'default')
        if not re.fullmatch(r'[A-Za-z0-9-]{1,64}', profile):
            raise ValueError('NUWA_MCP_PROFILE must use letters, digits or hyphens.')
        return profile

    @classmethod
    def path(cls) -> Path:
        return cls.home() / 'profiles' / (cls.profile() + '.json')

    @classmethod
    def load(cls) -> 'LocalConfig':
        path = cls.path()
        if path.exists():
            data = json.loads(path.read_text(encoding='utf-8'))
            config = cls(
                addressURL=data.get('address_url', cls.addressURL),
                apiURL=data.get('api_url', cls.apiURL),
                accessToken=data.get('access_token'),
                refreshToken=data.get('refresh_token'),
                clientId=data.get('client_id'),
                expiresAt=data.get('expires_at'),
                workAddressId=data.get('work_address_id'),
            )
        else:
            config = cls()

        return replace(
            config,
            accessToken=os.environ.get('NUWA_ACCESS_TOKEN') or config.accessToken,
            workAddressId=os.environ.get('NUWA_WORK_ID') or config.workAddressId,
        )

    def save(self) -> None:
        path = self.path()
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != 'nt':
            path.parent.chmod(0o700)

        data = {
            'address_url': self.addressURL, 'api_url': self.apiURL,
            'access_token': self.accessToken, 'refresh_token': self.refreshToken,
            'client_id': self.clientId, 'expires_at': self.expiresAt,
            'work_address_id': self.workAddressId,
        }
        fd, tempName = tempfile.mkstemp(prefix='config-', dir=path.parent)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                json.dump(data, stream, indent=2)
                stream.write('\n')
            os.replace(tempName, path)
            if os.name != 'nt':
                path.chmod(0o600)
        finally:
            if os.path.exists(tempName):
                os.unlink(tempName)

    @classmethod
    def logout(cls) -> None:
        cls.path().unlink(missing_ok=True)
