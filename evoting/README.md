# E-Voting System with Multi-Layer Security

A working full-stack prototype demonstrating cryptographically verifiable
electronic voting: RSA blind signatures for anonymity, AES-256/RSA-2048
hybrid encryption for confidentiality, Paillier homomorphic encryption for
private tallying, Shamir-threshold decryption for a no-single-point-of-trust
key custodian quorum, a Schnorr zero-knowledge proof for public
verifiability, and a SHA-256 Merkle tree for a tamper-evident audit log.

This is not a UI mockup wired to fake timeouts — every cryptographic
operation described in the project's SRS and flowchart actually executes,
backed by real libraries (PyCryptodome, `phe`, `pyotp`).

## Project structure

```
backend/
  app.py                  Flask entry point — run this
  models.py                SQLite schema (voters, ballots, audit log, ...)
  state.py                 In-memory singletons: RSA/Paillier keys, Merkle log
  requirements.txt
  crypto/
    hashing.py              SHA-256 voter-ID hashing, receipt generation
    blind_signature.py      RSA blind signatures (Chaum, 1983)
    hybrid_encryption.py    AES-256 + RSA-2048 hybrid encryption
    merkle.py                Merkle tree audit log + inclusion proofs
    paillier_tally.py       Homomorphic tally, Shamir threshold decrypt, Schnorr ZKP
  routes/
    auth.py                  /register, /otp/send, /login
    ballot.py                /ballot/request  (blind signature issuance)
    vote.py                   /vote/submit, /vote/verify-receipt
    admin.py                  /admin/*  (election lifecycle, custodians, report)
    results.py                /results  (public bulletin board)
  run_e2e_test.sh           Scripted end-to-end test via curl (see below)

frontend/
  src/App.jsx               React frontend — same file as the design mockup,
                             now wired to call the real backend endpoints
```

## Running it

**Backend** (Python 3.10+):
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Serves on `http://localhost:5000`. The SQLite database is recreated fresh
each time you start the server (`evoting.db`), so every run starts from a
clean election.

**Frontend**: `src/App.jsx` is a self-contained React component. Drop it
into any React + Vite project (or open it as a Claude artifact) with
`lucide-react` available. It expects the backend at `http://localhost:5000/api`
— change `API_BASE` at the top of the file if you deploy elsewhere.

## Verifying it actually works

Run `bash backend/run_e2e_test.sh` — it starts the server, registers three
voters, logs in with real computed TOTP codes, requests blind-signed
ballots, casts three votes, verifies duplicate-vote rejection, checks Merkle
inclusion, closes the election, submits two of three key-custodian shares
(triggering real Shamir reconstruction + Paillier decryption + Schnorr proof
generation), and downloads a generated PDF report — all via `curl` against
the real running server.

## What's genuinely real vs. simplified for a semester scope

**Real, unmodified cryptography:**
- RSA blind signatures — actual blinding/signing/unblinding math, verified with RSA signature verification
- AES-256-GCM + RSA-2048-OAEP hybrid encryption
- Paillier homomorphic addition — votes are summed as ciphertexts; no individual vote is ever decrypted
- SHA-256 Merkle tree with real inclusion proofs
- Schnorr's zero-knowledge proof of knowledge (Fiat-Shamir non-interactive variant), over a real 2048-bit safe-prime group

**Documented, intentional simplifications** (called out in code comments,
not hidden):
- Threshold decryption reconstructs the Paillier key transiently in memory
  via Shamir's Secret Sharing, rather than using a full cooperative
  threshold-Paillier protocol that never reconstructs the key on one
  machine. The quorum guarantee (2-of-3 required) is real; the "never
  reconstruct" property of production threshold cryptography is
  simplified for tractability in a semester project.
- RSA key sizes are 1024 bits in the demo (`state.py: RSA_KEY_SIZE`) for
  interactive responsiveness; change to 2048 for anything beyond a demo.
- OTP delivery is simulated — the code is returned in the API response
  instead of actually being emailed/texted, so the demo works without
  external SMTP/SMS credentials. Swap in a real provider call in
  `routes/auth.py: send_otp()` for production use.
- JWT secret is a hardcoded demo string; move to an environment variable
  before any real deployment.

## Mapping to the SRS

Every route is commented with the Functional Requirement ID (FR-1 through
FR-17) it satisfies, so cross-referencing against the SRS document is
direct. The Section 3 flowchart's decision nodes (duplicate registration,
invalid 2FA, duplicate vote, quorum not met) all have a corresponding
HTTP error path in the routes, not just a UI-only mock state.
