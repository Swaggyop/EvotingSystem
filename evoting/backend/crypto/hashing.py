"""
hashing.py — SHA-256 based identity hashing and receipt generation.

Voter IDs are never stored in plaintext. We hash on arrival so even a full
database compromise reveals nothing reversible about who registered.
"""
import hashlib
import secrets


def hash_voter_id(voter_id: str) -> str:
    """One-way hash of a Voter ID. Deterministic so we can look it up again,
    but not reversible."""
    normalized = voter_id.strip().upper()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def generate_receipt_hash(vote_id: str, ciphertext: bytes) -> str:
    """Receipt given to the voter — proves inclusion later without revealing
    the vote itself."""
    payload = vote_id.encode("utf-8") + ciphertext
    return hashlib.sha256(payload).hexdigest()


def new_random_id(nbytes: int = 16) -> str:
    """Collision-resistant random ID generator for ballots, votes, entries."""
    return secrets.token_hex(nbytes)
