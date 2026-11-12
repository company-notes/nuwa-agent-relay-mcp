CREATE TABLE remote_session_bindings (
  grant_fingerprint TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  canonical_address TEXT NOT NULL,
  encrypted_runtime_token TEXT NOT NULL,
  encrypted_resume_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX remote_session_bindings_expires_at
  ON remote_session_bindings(expires_at);
