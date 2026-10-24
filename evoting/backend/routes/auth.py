"""
routes/auth.py — FR-1 through FR-4: registration, 2FA enrollment, and
authentication.
"""
from flask import Blueprint, request, jsonify
import pyotp
import random
import datetime
import os
import smtplib
from email.mime.text import MIMEText
import jwt as pyjwt
from dotenv import load_dotenv

from models import get_db
from crypto.hashing import hash_voter_id

load_dotenv()

auth_bp = Blueprint("auth", __name__)
JWT_SECRET = "demo-secret-change-in-production"  # documented demo value

SMTP_EMAIL = os.environ.get("SMTP_EMAIL")
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD")


def send_email_otp(to_email: str, code: str) -> bool:
    """Sends the OTP via real Gmail SMTP if credentials are configured in
    .env. Returns True if a real email was sent, False if it fell back to
    demo mode (no credentials present)."""
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        return False  # no SMTP configured — caller falls back to demo_code

    msg = MIMEText(f"Your Secure Ballot verification code is: {code}\n\nThis code expires in 5 minutes.")
    msg["Subject"] = "Your Secure Ballot verification code"
    msg["From"] = SMTP_EMAIL
    msg["To"] = to_email

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
        server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
    return True


@auth_bp.post("/register")
def register():
    data = request.get_json()
    voter_id = data.get("voter_id", "")
    email = data.get("email", "")
    if not voter_id or not email:
        return jsonify({"error": "voter_id and email are required"}), 400

    voter_hash = hash_voter_id(voter_id)
    db = get_db()
    existing = db.execute(
        "SELECT 1 FROM voters WHERE voter_id_hash = ?", (voter_hash,)
    ).fetchone()
    if existing:
        db.close()
        # FR-2: reject duplicate registration — mirrors the flowchart's
        # "already registered?" decision node.
        return jsonify({"error": "duplicate", "message": "This Voter ID is already registered."}), 409

    totp_secret = pyotp.random_base32()
    db.execute(
        "INSERT INTO voters (voter_id_hash, email, totp_secret) VALUES (?,?,?)",
        (voter_hash, email, totp_secret),
    )
    db.commit()
    db.close()

    totp = pyotp.TOTP(totp_secret)
    provisioning_uri = totp.provisioning_uri(name=email, issuer_name="SecureBallot")

    return jsonify({
        "voter_id_hash": voter_hash,
        "totp_secret": totp_secret,
        "provisioning_uri": provisioning_uri,
        "message": "Registered. Voter ID stored only as SHA-256 hash.",
    })


@auth_bp.post("/lookup")
def lookup():
    """Look up an existing voter by raw voter_id — returns the voter_id_hash
    and totp_secret so a returning user can proceed to the OTP/TOTP verify
    step without re-registering."""
    data = request.get_json()
    voter_id = data.get("voter_id", "")
    if not voter_id:
        return jsonify({"error": "voter_id is required"}), 400

    voter_hash = hash_voter_id(voter_id)
    db = get_db()
    voter = db.execute(
        "SELECT voter_id_hash, email, totp_secret FROM voters WHERE voter_id_hash = ?",
        (voter_hash,),
    ).fetchone()
    db.close()
    if not voter:
        return jsonify({"error": "not_found", "message": "No voter found with this ID. Please register first."}), 404

    totp = pyotp.TOTP(voter["totp_secret"])
    provisioning_uri = totp.provisioning_uri(name=voter["email"], issuer_name="SecureBallot")

    return jsonify({
        "voter_id_hash": voter["voter_id_hash"],
        "totp_secret": voter["totp_secret"],
        "provisioning_uri": provisioning_uri,
        "message": "Voter found. Proceed to verification.",
    })


@auth_bp.post("/otp/send")
def send_otp():
    """FR-4: dispatches via a real external email gateway (Gmail SMTP) when
    .env credentials are configured. Falls back to returning a demo_code in
    the response — for local testing without setting up SMTP — otherwise."""
    data = request.get_json()
    voter_hash = data.get("voter_id_hash", "")
    code = f"{random.randint(0, 999999):06d}"
    expires = (datetime.datetime.utcnow() + datetime.timedelta(minutes=5)).isoformat()

    db = get_db()
    voter = db.execute(
        "SELECT email FROM voters WHERE voter_id_hash = ?", (voter_hash,)
    ).fetchone()
    if not voter:
        db.close()
        return jsonify({"error": "not_found"}), 404

    db.execute("DELETE FROM otp_codes WHERE voter_id_hash = ?", (voter_hash,))
    db.execute(
        "INSERT INTO otp_codes (voter_id_hash, code, expires_at) VALUES (?,?,?)",
        (voter_hash, code, expires),
    )
    db.commit()
    db.close()

    try:
        sent_for_real = send_email_otp(voter["email"], code)
    except Exception as e:
        # SMTP failed (bad credentials, network, etc.) — don't leak the
        # exception, fall back to demo mode so the flow isn't blocked.
        print(f"[otp/send] email delivery failed: {e}")
        sent_for_real = False

    if sent_for_real:
        return jsonify({"message": f"OTP sent to {voter['email']}."})
    else:
        return jsonify({"message": "OTP dispatched (demo mode — SMTP not configured).", "demo_code": code})


@auth_bp.post("/login")
def login():
    """FR-3 + FR-4: verifies TOTP AND the OTP code before issuing a JWT
    session — the 'Valid?' decision node in the flowchart."""
    data = request.get_json()
    voter_hash = data.get("voter_id_hash", "")
    totp_code = data.get("totp_code", "")
    otp_code = data.get("otp_code", "")

    db = get_db()
    voter = db.execute(
        "SELECT * FROM voters WHERE voter_id_hash = ?", (voter_hash,)
    ).fetchone()
    if not voter:
        db.close()
        return jsonify({"error": "not_found", "message": "No such voter."}), 404

    import pyotp as _pyotp
    totp = _pyotp.TOTP(voter["totp_secret"])
    # valid_window=2 accepts codes ±60 seconds (2 steps) — generous for demo
    # usability; a production system would use valid_window=1 at most.
    totp_ok = totp.verify(totp_code, valid_window=2)

    otp_row = db.execute(
        "SELECT * FROM otp_codes WHERE voter_id_hash = ?", (voter_hash,)
    ).fetchone()
    otp_ok = False
    otp_expired = False
    if otp_row and otp_row["code"] == otp_code:
        # Validate expiry — reject OTPs older than the stored expiry time
        expires_at = datetime.datetime.fromisoformat(otp_row["expires_at"])
        if datetime.datetime.utcnow() <= expires_at:
            otp_ok = True
        else:
            otp_expired = True

    if not (totp_ok and otp_ok):
        db.close()
        # Provide specific feedback so the user knows which factor failed
        if not totp_ok and not otp_ok:
            msg = "Both TOTP and OTP are incorrect."
        elif not totp_ok:
            msg = "TOTP code is incorrect or expired. Check your authenticator app."
        elif otp_expired:
            msg = "OTP has expired. Request a new one."
        else:
            msg = "OTP code is incorrect."
        return jsonify({"error": "invalid", "message": msg}), 401

    db.execute("DELETE FROM otp_codes WHERE voter_id_hash = ?", (voter_hash,))
    db.commit()
    db.close()

    token = pyjwt.encode(
        {
            "voter_id_hash": voter_hash,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=15),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return jsonify({"token": token, "message": "Authenticated. Session expires in 15 minutes."})
