CREATE TABLE remote_session_bindings (
  oauth_token_hash TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  encrypted_runtime_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX remote_session_bindings_expires_at
  ON remote_session_bindings(expires_at);
