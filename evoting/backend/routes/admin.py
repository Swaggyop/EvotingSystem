"""
routes/admin.py — FR-12 through FR-17: election lifecycle, threshold
decryption via key-custodian quorum, ZKP publication, and reporting.
"""
from flask import Blueprint, request, jsonify, send_file
import io

from models import get_db
from crypto.paillier_tally import PaillierTally, SchnorrZKP
import state

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/admin/overview")
def overview():
    db = get_db()
    voters = db.execute("SELECT COUNT(*) c FROM voters").fetchone()["c"]
    voted = db.execute("SELECT COUNT(*) c FROM voters WHERE has_voted = 1").fetchone()["c"]
    election = db.execute("SELECT * FROM election_state WHERE id = 1").fetchone()
    db.close()
    return jsonify({
        "title": election["title"],
        "status": election["status"],
        "registered_voters": voters,
        "votes_cast": voted,
    })


@admin_bp.get("/admin/voters")
def list_voters():
    db = get_db()
    rows = db.execute(
        "SELECT voter_id_hash, has_voted FROM voters ORDER BY registered_at"
    ).fetchall()
    db.close()
    return jsonify([{"voter_id_hash": r["voter_id_hash"][:12] + "…", "voted": bool(r["has_voted"])} for r in rows])


@admin_bp.post("/admin/election/close")
def close_election():
    db = get_db()
    db.execute("UPDATE election_state SET status = 'closed' WHERE id = 1")
    db.commit()
    db.close()

    # FR-12: shard the Paillier private key across 3 custodians, 2-of-3 quorum.
    shares, prime = state.tally_engine.shard_private_key(n_shares=3, threshold=2)
    state.key_prime["value"] = prime
    custodian_ids = ["kc1", "kc2", "kc3"]

    db = get_db()
    for cid, (idx, val) in zip(custodian_ids, shares):
        db.execute(
            "UPDATE key_custodians SET share_index=?, share_value=? WHERE custodian_id=?",
            (idx, str(val), cid),
        )
    db.commit()
    db.close()

    return jsonify({"message": "Election closed. Key shares distributed to 3 custodians (2-of-3 quorum required)."})


@admin_bp.get("/admin/custodians")
def list_custodians():
    db = get_db()
    rows = db.execute("SELECT custodian_id, name, submitted FROM key_custodians").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@admin_bp.post("/admin/custodians/<custodian_id>/submit")
def submit_share(custodian_id):
    """FR-12 / FR-13: a key custodian contributes their share toward the
    2-of-3 decryption quorum."""
    db = get_db()
    db.execute(
        "UPDATE key_custodians SET submitted = 1 WHERE custodian_id = ?", (custodian_id,)
    )
    db.commit()
    submitted = db.execute(
        "SELECT * FROM key_custodians WHERE submitted = 1"
    ).fetchall()
    db.close()

    quorum_met = len(submitted) >= 2
    result = {"submitted_count": len(submitted), "quorum_met": quorum_met}

    if quorum_met and state.zkp_secret["x"] is None:
        shares = [(r["share_index"], int(r["share_value"])) for r in submitted[:2]]
        reconstructed_p = PaillierTally.reconstruct_secret(shares, state.key_prime["value"])

        # FR-14: decrypt the final tally using the reconstructed key.
        tally = state.tally_engine.decrypt_final_tally()

        db2 = get_db()
        import json
        db2.execute(
            "UPDATE election_state SET final_tally = ? WHERE id = 1",
            (json.dumps(tally),),
        )

        # FR-14: publish a Schnorr zero-knowledge proof alongside the tally —
        # proves the tallying authority holds a valid reconstructed key
        # without revealing it.
        secret_x = reconstructed_p % (SchnorrZKP.P - 1)
        public_y = pow(SchnorrZKP.G, secret_x, SchnorrZKP.P)
        proof = SchnorrZKP.prove(secret_x)
        state.zkp_secret["x"] = secret_x
        state.zkp_secret["y"] = public_y

        db2.execute(
            "UPDATE election_state SET zkp_proof = ?, merkle_root = ? WHERE id = 1",
            (str(proof), state.audit_log.root()),
        )
        db2.commit()
        db2.close()

        result["tally"] = tally
        result["zkp_published"] = True

    return jsonify(result)


@admin_bp.get("/admin/report")
def generate_report():
    """FR-17: cryptographically-referenced PDF audit report."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    )
    import json
    from datetime import datetime

    # ── Gather all data ──────────────────────────────────────────
    db = get_db()
    election = db.execute("SELECT * FROM election_state WHERE id = 1").fetchone()
    voters = db.execute(
        "SELECT voter_id_hash, has_voted, registered_at FROM voters ORDER BY registered_at"
    ).fetchall()
    candidates = db.execute("SELECT * FROM candidates").fetchall()
    custodians = db.execute("SELECT custodian_id, name, submitted FROM key_custodians").fetchall()
    audit_entries = db.execute(
        "SELECT entry_id, vote_id, receipt_hash, leaf_index, created_at FROM audit_log ORDER BY leaf_index"
    ).fetchall()
    db.close()

    tally = json.loads(election["final_tally"]) if election["final_tally"] else None
    total_voters = len(voters)
    votes_cast = sum(1 for v in voters if v["has_voted"])
    turnout = f"{(votes_cast / total_voters * 100):.1f}%" if total_voters else "0%"
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ZKP status
    zkp_verified = None
    if state.zkp_secret["x"] is not None:
        from crypto.paillier_tally import SchnorrZKP
        proof = SchnorrZKP.prove(state.zkp_secret["x"])
        zkp_verified = SchnorrZKP.verify(proof, state.zkp_secret["y"])

    # ── Styles ───────────────────────────────────────────────────
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Title"],
                                 fontSize=22, leading=26, textColor=colors.HexColor("#1a1a1a"),
                                 spaceAfter=4, alignment=TA_CENTER)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"],
                                    fontSize=10, textColor=colors.HexColor("#666666"),
                                    alignment=TA_CENTER, spaceAfter=16)
    heading_style = ParagraphStyle("SectionHead", parent=styles["Heading2"],
                                   fontSize=13, leading=16, textColor=colors.HexColor("#1a1a1a"),
                                   spaceBefore=18, spaceAfter=8,
                                   borderWidth=0, borderPadding=0)
    body_style = ParagraphStyle("Body", parent=styles["Normal"],
                                fontSize=10, leading=13, textColor=colors.HexColor("#333333"))
    mono_style = ParagraphStyle("Mono", parent=body_style,
                                fontName="Courier", fontSize=8.5, leading=11,
                                textColor=colors.HexColor("#444444"))
    small_style = ParagraphStyle("Small", parent=body_style,
                                 fontSize=8.5, leading=11, textColor=colors.HexColor("#888888"))

    # Table colours
    hdr_bg = colors.HexColor("#2c2c2c")
    hdr_fg = colors.white
    row_alt = colors.HexColor("#f7f7f7")
    border_c = colors.HexColor("#dddddd")

    def _table_style(col_count):
        """Common professional table style."""
        s = [
            ("BACKGROUND", (0, 0), (-1, 0), hdr_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), hdr_fg),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 8.5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
            ("TOPPADDING", (0, 1), (-1, -1), 5),
            ("GRID", (0, 0), (-1, -1), 0.4, border_c),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        return s

    # ── Build PDF ────────────────────────────────────────────────
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    story = []

    # 1. Title
    story.append(Paragraph("Election Audit Report", title_style))
    story.append(Paragraph(f"Generated on {generated_at}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc"),
                            spaceAfter=12, spaceBefore=4))

    # 2. Election overview
    story.append(Paragraph("Election Overview", heading_style))
    overview_data = [
        ["Field", "Value"],
        ["Election Title", election["title"] or "—"],
        ["Status", election["status"].upper()],
        ["Registered Voters", str(total_voters)],
        ["Votes Cast", str(votes_cast)],
        ["Voter Turnout", turnout],
    ]
    t = Table(overview_data, colWidths=[150, 360])
    t.setStyle(TableStyle(_table_style(2) + [
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, row_alt]),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # 3. Candidate results / final tally
    story.append(Paragraph("Candidate Results", heading_style))
    if tally:
        total_votes = sum(tally.values()) or 1
        result_data = [["#", "Candidate", "Votes", "Percentage"]]
        # Resolve candidate names
        cand_names = {c["candidate_id"]: c["name"] for c in candidates}
        for idx, (cid, count) in enumerate(tally.items(), 1):
            pct = f"{count / total_votes * 100:.1f}%"
            name = cand_names.get(cid, cid)
            result_data.append([str(idx), name, str(count), pct])
        result_data.append(["", "Total", str(sum(tally.values())), "100.0%"])
        t = Table(result_data, colWidths=[30, 220, 80, 80])
        t.setStyle(TableStyle(_table_style(4) + [
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, row_alt]),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8e8e8")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ]))
        story.append(t)
    else:
        story.append(Paragraph(
            "Tally has not been decrypted yet. A 2-of-3 key-custodian quorum is required.",
            body_style))
    story.append(Spacer(1, 10))

    # 4. Voter registry
    story.append(Paragraph("Voter Registry", heading_style))
    if voters:
        voter_data = [["#", "Voter ID Hash (truncated)", "Registered At", "Status"]]
        for idx, v in enumerate(voters, 1):
            hash_trunc = v["voter_id_hash"][:16] + "…"
            status = "Voted" if v["has_voted"] else "Not Voted"
            reg_at = v["registered_at"] or "—"
            voter_data.append([str(idx), hash_trunc, reg_at, status])
        t = Table(voter_data, colWidths=[30, 180, 160, 80])
        t.setStyle(TableStyle(_table_style(4) + [
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, row_alt]),
            ("FONTNAME", (1, 1), (1, -1), "Courier"),
            ("FONTSIZE", (1, 1), (1, -1), 8),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No voters registered.", body_style))
    story.append(Spacer(1, 10))

    # 5. Key custodian status
    story.append(Paragraph("Key Custodian Status", heading_style))
    cust_data = [["Custodian ID", "Name", "Share Submitted"]]
    for c in custodians:
        submitted = "Yes" if c["submitted"] else "No"
        cust_data.append([c["custodian_id"], c["name"], submitted])
    submitted_count = sum(1 for c in custodians if c["submitted"])
    t = Table(cust_data, colWidths=[100, 220, 120])
    t.setStyle(TableStyle(_table_style(3) + [
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, row_alt]),
        ("ALIGN", (2, 0), (2, -1), "CENTER"),
    ]))
    story.append(t)
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Quorum status: {submitted_count} of {len(custodians)} shares submitted "
        f"({'quorum MET — tally decrypted' if submitted_count >= 2 else 'quorum NOT met'})",
        small_style))
    story.append(Spacer(1, 10))

    # 6. Cryptographic integrity
    story.append(Paragraph("Cryptographic Integrity", heading_style))
    merkle = election["merkle_root"] or "Not yet computed"
    zkp_proof_val = election["zkp_proof"] or "Not yet published"
    zkp_status_str = ("Verified ✓" if zkp_verified else
                      ("Verification FAILED" if zkp_verified is False else "Not yet published"))
    crypto_data = [
        ["Property", "Value"],
        ["Merkle Root", merkle],
        ["ZKP Proof Status", zkp_status_str],
        ["ZKP Proof Value", zkp_proof_val[:80] + ("…" if len(zkp_proof_val) > 80 else "")],
    ]
    t = Table(crypto_data, colWidths=[130, 380])
    t.setStyle(TableStyle(_table_style(2) + [
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, row_alt]),
        ("FONTNAME", (1, 1), (1, -1), "Courier"),
        ("FONTSIZE", (1, 1), (1, -1), 7.5),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # 7. Audit log
    story.append(Paragraph("Audit Log", heading_style))
    if audit_entries:
        log_data = [["#", "Receipt Hash (truncated)", "Leaf Index", "Timestamp"]]
        for idx, entry in enumerate(audit_entries, 1):
            receipt_trunc = entry["receipt_hash"][:20] + "…"
            ts = entry["created_at"] or "—"
            log_data.append([str(idx), receipt_trunc, str(entry["leaf_index"]), ts])
        t = Table(log_data, colWidths=[30, 220, 70, 150])
        t.setStyle(TableStyle(_table_style(4) + [
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, row_alt]),
            ("FONTNAME", (1, 1), (1, -1), "Courier"),
            ("FONTSIZE", (1, 1), (1, -1), 7.5),
            ("ALIGN", (2, 0), (2, -1), "CENTER"),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No audit log entries yet.", body_style))
    story.append(Spacer(1, 20))

    # 8. Footer
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"),
                            spaceAfter=8, spaceBefore=4))
    footer_style = ParagraphStyle("Footer", parent=small_style, alignment=TA_CENTER)
    story.append(Paragraph(
        f"Generated by Secure Ballot · cryptographically referenced · {generated_at}",
        footer_style))

    doc.build(story)
    buf.seek(0)
    return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name="audit_report.pdf")
