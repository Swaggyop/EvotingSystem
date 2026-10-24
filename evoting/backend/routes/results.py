"""
routes/results.py — public bulletin board: results, Merkle root, and
zero-knowledge proof status, all accessible without authentication.
"""
from flask import Blueprint, jsonify
import json

from models import get_db
from crypto.paillier_tally import SchnorrZKP
import state

results_bp = Blueprint("results", __name__)


@results_bp.get("/results")
def get_results():
    db = get_db()
    election = db.execute("SELECT * FROM election_state WHERE id = 1").fetchone()
    candidates = db.execute("SELECT * FROM candidates").fetchall()
    db.close()

    tally = json.loads(election["final_tally"]) if election["final_tally"] else None
    zkp_verified = None
    if state.zkp_secret["x"] is not None:
        proof = SchnorrZKP.prove(state.zkp_secret["x"])
        zkp_verified = SchnorrZKP.verify(proof, state.zkp_secret["y"])

    return jsonify({
        "title": election["title"],
        "status": election["status"],
        "merkle_root": election["merkle_root"],
        "tally": [
            {"candidate_id": c["candidate_id"], "name": c["name"], "votes": (tally or {}).get(c["candidate_id"], 0)}
            for c in candidates
        ] if tally else None,
        "zkp_verified": zkp_verified,
    })
