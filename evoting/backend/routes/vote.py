"""
routes/vote.py — FR-6 through FR-10: encrypt, reject duplicates, receipt,
append to the Merkle-linked audit log, and homomorphically fold into the
running tally.
"""
from flask import Blueprint, request, jsonify

from models import get_db
from crypto.hashing import new_random_id, generate_receipt_hash
import state

vote_bp = Blueprint("vote", __name__)


@vote_bp.post("/vote/submit")
def submit_vote():
    data = request.get_json()
    voter_hash = data.get("voter_id_hash", "")
    ballot_id = data.get("ballot_id", "")
    candidate_id = data.get("candidate_id", "")

    db = get_db()
    voter = db.execute(
        "SELECT * FROM voters WHERE voter_id_hash = ?", (voter_hash,)
    ).fetchone()
    ballot = db.execute(
        "SELECT * FROM ballots WHERE ballot_id = ?", (ballot_id,)
    ).fetchone()

    if not voter or not ballot:
        db.close()
        return jsonify({"error": "not_found"}), 404

    # FR-7: duplicate-vote rejection — "Already voted?" decision node.
    if voter["has_voted"] or ballot["used"]:
        db.close()
        return jsonify({"error": "duplicate_vote", "message": "This ballot has already been used."}), 409

    candidates = [row["candidate_id"] for row in db.execute("SELECT candidate_id FROM candidates")]
    if candidate_id not in candidates:
        db.close()
        return jsonify({"error": "invalid_candidate"}), 400

    # FR-6: AES-256 / RSA-2048 hybrid encryption of the vote payload.
    plaintext = candidate_id.encode()
    package = state.hybrid_engine.encrypt_vote(plaintext)

    vote_id = new_random_id()
    receipt_hash = generate_receipt_hash(vote_id, package["ciphertext"])
    state.vote_store[vote_id] = package  # kept only for optional per-vote audit tooling

    # FR-11: fold this vote homomorphically into the running encrypted tally.
    # The server NEVER learns candidate_id from this step — it operates on
    # a one-hot Paillier-encrypted vector.
    encrypted_onehot = state.tally_engine.encrypt_vote(candidate_id, candidates)
    state.tally_engine.add_to_tally(encrypted_onehot)

    # FR-10: append to the Merkle-linked, tamper-evident audit log.
    leaf_index = len(state.audit_log.leaves)
    state.audit_log.append(vote_id, package["ciphertext"])

    db.execute("UPDATE voters SET has_voted = 1 WHERE voter_id_hash = ?", (voter_hash,))
    db.execute("UPDATE ballots SET used = 1 WHERE ballot_id = ?", (ballot_id,))
    db.execute(
        "INSERT INTO audit_log (entry_id, vote_id, receipt_hash, leaf_index) VALUES (?,?,?,?)",
        (new_random_id(), vote_id, receipt_hash, leaf_index),
    )
    db.commit()
    db.close()

    return jsonify({
        "vote_id": vote_id,
        "receipt_hash": receipt_hash,
        "leaf_index": leaf_index,
        "message": "Vote encrypted (AES-256/RSA-2048), folded into the homomorphic tally, and logged.",
    })


@vote_bp.get("/vote/verify-receipt/<receipt_hash>")
def verify_receipt(receipt_hash):
    """FR-9 / observer-facing: check a receipt hash's inclusion in the
    Merkle audit log without revealing any other vote."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM audit_log WHERE receipt_hash = ?", (receipt_hash,)
    ).fetchone()
    db.close()

    if not row:
        return jsonify({"included": False}), 404

    leaf_hash = state.audit_log.leaves[row["leaf_index"]][1]
    proof = state.audit_log.inclusion_proof(row["vote_id"])
    root = state.audit_log.root()

    from crypto.merkle import MerkleLog
    valid = MerkleLog.verify_inclusion(leaf_hash, proof, root, row["leaf_index"])

    return jsonify({
        "included": True,
        "leaf_index": row["leaf_index"],
        "merkle_root": root,
        "proof_valid": valid,
    })
