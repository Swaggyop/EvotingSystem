"""
state.py — process-wide runtime objects that can't live in SQLite: the RSA
blind-signature authority, the hybrid-encryption keypair, the Paillier
tally accumulator, and the Merkle audit log.

This mirrors a real deployment's key-management service; for this academic
prototype it's a single in-memory singleton, documented as such.
"""
from crypto.blind_signature import BlindSignatureAuthority
from crypto.hybrid_encryption import HybridEncryption
from crypto.paillier_tally import PaillierTally
from crypto.merkle import MerkleLog

RSA_KEY_SIZE = 1024  # reduced from 2048 for demo responsiveness; see README

blind_authority = BlindSignatureAuthority(key_size=RSA_KEY_SIZE)
hybrid_engine = HybridEncryption(rsa_key_size=RSA_KEY_SIZE)
tally_engine = PaillierTally()
audit_log = MerkleLog()

# populated once threshold decryption completes
threshold_shares = {}  # custodian_id -> (index, value)
key_prime = {"value": None}
zkp_secret = {"x": None, "y": None}

# vote_id -> encrypted vote package (for potential per-vote audit/debug only;
# NEVER used for tallying — tallying only ever touches the homomorphic sum)
vote_store = {}
