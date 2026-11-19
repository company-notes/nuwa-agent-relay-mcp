-- Keep fixed-session identities and their ciphertext unchanged.
CREATE TABLE remote_work_agents (
  grant_fingerprint TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  mailbox_ready INTEGER NOT NULL DEFAULT 0 CHECK (mailbox_ready IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE remote_work_session_bindings (
  binding_key TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  canonical_address TEXT NOT NULL,
  encrypted_runtime_token TEXT NOT NULL,
  encrypted_resume_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
