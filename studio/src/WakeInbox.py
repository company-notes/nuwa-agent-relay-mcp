"""Durable, idempotent local Wake delivery queue."""

import hashlib
import os
import sqlite3
import time
from contextlib import closing


class WakeInbox:
    """Persist notifications before HTTP ACK, and deduplicate across restarts."""

    def __init__(self, path, binding: tuple[str, str] | None = None):
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
                        completed_at REAL,
                        uncertain_at REAL
                    )
                """)

                columns = {row[1] for row in db.execute("PRAGMA table_info(incoming_wake)")}
                if "uncertain_at" not in columns:
                    db.execute("ALTER TABLE incoming_wake ADD COLUMN uncertain_at REAL")

                if binding is not None:
                    self._bind(db, binding)

        if os.name != "nt":
            self.path.chmod(0o600)

    @classmethod
    def forNative(cls, config, sessionID: str, target: str):
        digest = hashlib.sha256(sessionID.encode("utf-8")).hexdigest()
        path = config.wakeInboxPath().with_name(f"wake-native-{digest}.sqlite3")

        return cls(path, (sessionID, target))

    def initializePolling(self, messageIDs: list[str], existingWork: bool) -> None:
        """Do not replay pre-existing conversation history on first local adoption."""
        now = time.time()

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("CREATE TABLE IF NOT EXISTS native_poll_started (id INTEGER PRIMARY KEY)")
                started = db.execute("INSERT OR IGNORE INTO native_poll_started VALUES (1)")

                if started.rowcount and existingWork:
                    db.executemany("""
                        INSERT OR IGNORE INTO incoming_wake
                            (message_id, received_at, next_attempt_at, completed_at)
                        VALUES (?, ?, ?, ?)
                    """, [(messageID, now, now, now) for messageID in messageIDs])

    def eventCursor(self) -> int | None:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("CREATE TABLE IF NOT EXISTS native_event_cursor (id INTEGER PRIMARY KEY, cursor INTEGER NOT NULL)")
                row = db.execute("SELECT cursor FROM native_event_cursor WHERE id = 1").fetchone()

        return row[0] if row else None

    def initializeEvents(self, cursor: int) -> None:
        if type(cursor) is not int or cursor < 0:
            raise ValueError("Invalid native Inbox cursor.")

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                legacy = db.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'native_poll_started'",
                ).fetchone()
                existing = db.execute("SELECT cursor FROM native_event_cursor WHERE id = 1").fetchone()

                if legacy and not existing:
                    raise RuntimeError("Legacy polling Inbox requires explicit migration before event adoption.")

                db.execute("INSERT OR IGNORE INTO native_event_cursor VALUES (1, ?)", (cursor,))

    def ingestEvents(self, previous: int, cursor: int, messageIDs: list[str]) -> None:
        now = time.time()

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                updated = db.execute(
                    "UPDATE native_event_cursor SET cursor = ? WHERE id = 1 AND cursor = ?",
                    (cursor, previous),
                )

                if updated.rowcount != 1:
                    raise RuntimeError("Concurrent Inbox cursor update.")

                db.executemany("""
                    INSERT OR IGNORE INTO incoming_wake
                        (message_id, received_at, next_attempt_at) VALUES (?, ?, ?)
                    """, [(messageID, now, now) for messageID in messageIDs])

    @classmethod
    def _bind(cls, db, binding: tuple[str, str]) -> None:
        db.execute("""
            CREATE TABLE IF NOT EXISTS native_binding (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                session_id TEXT NOT NULL,
                target TEXT NOT NULL
            )
        """)
        db.execute("""
            INSERT OR IGNORE INTO native_binding VALUES (1, ?, ?)
        """, binding)
        selected = db.execute("SELECT session_id, target FROM native_binding").fetchone()

        if selected != binding:
            raise ValueError("Wake inbox belongs to a different native thread.")

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
                WHERE completed_at IS NULL AND uncertain_at IS NULL AND next_attempt_at <= ?
                ORDER BY received_at LIMIT 25
            """, (time.time(),)).fetchall()

    def claim(self, messageID: str) -> bool:
        """Persist the uncertain state before any external submission."""
        now = time.time()

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                result = db.execute("""
                    UPDATE incoming_wake SET uncertain_at = ?
                    WHERE message_id = ? AND completed_at IS NULL
                        AND uncertain_at IS NULL AND next_attempt_at <= ?
                """, (now, messageID, now))

                return result.rowcount == 1

    def complete(self, messageID: str) -> None:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    UPDATE incoming_wake SET completed_at = ?, uncertain_at = NULL
                    WHERE message_id = ? AND completed_at IS NULL
                """, (time.time(), messageID))

    def uncertain(self) -> list[str]:
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            return [row[0] for row in db.execute("""
                SELECT message_id FROM incoming_wake
                WHERE uncertain_at IS NOT NULL AND completed_at IS NULL
                ORDER BY received_at
            """).fetchall()]

    def retryLater(self, messageID: str, attempts: int) -> None:
        delay = min(60, 2 ** min(attempts + 1, 6))

        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("""
                    UPDATE incoming_wake
                    SET attempts = ?, next_attempt_at = ?, uncertain_at = NULL
                    WHERE message_id = ? AND completed_at IS NULL
                """, (attempts + 1, time.time() + delay, messageID))
