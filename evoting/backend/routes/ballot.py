"""
routes/ballot.py — FR-5: anonymous ballot issuance via RSA blind signature.
"""
from flask import Blueprint, request, jsonify

from models import get_db
from crypto.hashing import new_random_id
from crypto.blind_signature import Voter
import state

ballot_bp = Blueprint("ballot", __name__)


@ballot_bp.post("/ballot/request")
def request_ballot():
    data = request.get_json()
    voter_hash = data.get("voter_id_hash", "")

    db = get_db()
    voter = db.execute(
        "SELECT * FROM voters WHERE voter_id_hash = ?", (voter_hash,)
    ).fetchone()
    if not voter:
        db.close()
        return jsonify({"error": "not_found"}), 404
    if voter["has_voted"]:
        db.close()
        return jsonify({"error": "already_voted", "message": "A ballot was already issued and used."}), 409

    ballot_token = new_random_id().encode()

    # --- Blind signature protocol, executed end to end here for the demo ---
    blinded, r = Voter.blind(ballot_token, state.blind_authority.public_key)
    blind_sig = state.blind_authority.sign_blinded(blinded)   # authority signs BLIND value only
    signature = Voter.unblind(blind_sig, r, state.blind_authority.public_key)
    valid = state.blind_authority.verify(ballot_token, signature)

    ballot_id = new_random_id()
    db.execute(
        "INSERT INTO ballots (ballot_id, voter_id_hash, used) VALUES (?,?,0)",
        (ballot_id, voter_hash),
    )
    db.commit()
    db.close()

    return jsonify({
        "ballot_id": ballot_id,
        "ballot_token": ballot_token.decode(),
        "signature": str(signature),
        "signature_valid": valid,
        "message": "Ballot issued via RSA blind signature — the authority never saw this token unblinded.",
    })
