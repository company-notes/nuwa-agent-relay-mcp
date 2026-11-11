"""Durable, idempotent local Wake delivery queue."""

import os
import sqlite3
import time
from contextlib import closing


class WakeInbox:
    """Persist notifications before HTTP ACK, and deduplicate across restarts."""

    def __init__(self, path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

        if os.name != "nt":
            self.path.parent.chmod(0o700)

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    CREATE TABLE IF NOT EXISTS incoming_wake (
                        message_id TEXT PRIMARY KEY,
                        received_at REAL NOT NULL,
                        next_attempt_at REAL NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        completed_at REAL
                    )
                """)

        if os.name != "nt":
            self.path.chmod(0o600)

    def enqueue(self, messageID: str) -> bool:
        now = time.time()

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                result = db.execute("""
                    INSERT OR IGNORE INTO incoming_wake
                        (message_id, received_at, next_attempt_at)
                    VALUES (?, ?, ?)
                """, (messageID, now, now))
                return result.rowcount == 1

    def due(self) -> list[tuple[str, int]]:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            return db.execute("""
                SELECT message_id, attempts
                FROM incoming_wake
                WHERE completed_at IS NULL AND next_attempt_at <= ?
                ORDER BY received_at LIMIT 25
            """, (time.time(),)).fetchall()

    def complete(self, messageID: str) -> None:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    UPDATE incoming_wake SET completed_at = ?
                    WHERE message_id = ? AND completed_at IS NULL
                """, (time.time(), messageID))

    def retryLater(self, messageID: str, attempts: int) -> None:
        delay = min(60, 2 ** min(attempts + 1, 6))

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    UPDATE incoming_wake
                    SET attempts = ?, next_attempt_at = ?
                    WHERE message_id = ? AND completed_at IS NULL
                """, (attempts + 1, time.time() + delay, messageID))
