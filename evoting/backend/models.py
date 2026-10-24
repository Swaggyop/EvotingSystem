"""
models.py — SQLite persistence layer.

Tables mirror the ER diagram from the SRS: voters, ballots, votes,
audit_log, key_shares. Voter IDs are stored ONLY as SHA-256 hashes,
never in plaintext, consistent with FR-1 in the SRS.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "evoting.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    fresh = not os.path.exists(DB_PATH)
    conn = get_db()
    c = conn.cursor()
    # CREATE TABLE IF NOT EXISTS — safe to run every time; only seeds data
    # on a truly fresh database so registered voters (and their TOTP secrets)
    # survive server restarts.
    c.executescript("""
        CREATE TABLE IF NOT EXISTS voters (
            voter_id_hash TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            totp_secret TEXT NOT NULL,
            registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
            has_voted INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS otp_codes (
            voter_id_hash TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS candidates (
            candidate_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS ballots (
            ballot_id TEXT PRIMARY KEY,
            voter_id_hash TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            issued_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            entry_id TEXT PRIMARY KEY,
            vote_id TEXT NOT NULL,
            receipt_hash TEXT NOT NULL,
            leaf_index INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS key_custodians (
            custodian_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            share_index INTEGER,
            share_value TEXT,
            submitted INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS election_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            title TEXT,
            status TEXT DEFAULT 'open',
            merkle_root TEXT,
            zkp_proof TEXT,
            final_tally TEXT
        );
    """)
    # Only seed data on a fresh database — don't overwrite existing records.
    if fresh:
        c.execute(
            "INSERT INTO candidates VALUES (?,?,?)",
            ("c1", "A. Mehta", "Final-year, Computer Science"),
        )
        c.execute(
            "INSERT INTO candidates VALUES (?,?,?)",
            ("c2", "R. Iyer", "Third-year, Data Science"),
        )
        c.execute(
            "INSERT INTO candidates VALUES (?,?,?)",
            ("c3", "S. Fernandes", "Final-year, Cybersecurity"),
        )
        c.execute(
            "INSERT INTO key_custodians VALUES (?,?,?,?,?)",
            ("kc1", "Prof. R. Sharma", None, None, 0),
        )
        c.execute(
            "INSERT INTO key_custodians VALUES (?,?,?,?,?)",
            ("kc2", "Dr. K. Naik", None, None, 0),
        )
        c.execute(
            "INSERT INTO key_custodians VALUES (?,?,?,?,?)",
            ("kc3", "Prof. A. Desai", None, None, 0),
        )
        c.execute(
            "INSERT INTO election_state VALUES (1, ?, 'open', NULL, NULL, NULL)",
            ("Student Council President — 2026",),
        )
    conn.commit()
    conn.close()

