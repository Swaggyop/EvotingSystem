import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ShieldCheck, Lock, KeyRound, QrCode, CheckCircle2, AlertTriangle,
  Users, FileText, Download, ChevronRight, Loader2, BarChart3,
  Link2, Copy, Mail, Vote, Settings, Square, Hash,
  UserPlus, LogIn, ClipboardCheck, RadioTower
} from "lucide-react";

/* ============================================================
   API — connects to the Flask backend in /backend. Every call
   below hits a real endpoint backed by real cryptography (RSA
   blind signatures, AES/RSA hybrid encryption, Paillier
   homomorphic tally, Shamir threshold decryption, Schnorr ZKP).
   ============================================================ */
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || "Request failed");
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ============================================================
   DESIGN TOKENS
   Warm charcoal + gold/ember, no purple. Serif display / sans
   body / mono for cryptographic output (hashes, receipts, IDs).
   ============================================================ */
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    .ev-root {
      --bg: #0A0B0D;
      --bg-elev: #15140F;
      --bg-card: #1B1914;
      --border: #2E2A22;
      --border-soft: #232019;
      --gold: #E4A853;
      --gold-dim: #B8863C;
      --ember: #C4623A;
      --text: #F3EFE6;
      --text-soft: #A79E8E;
      --text-mute: #6E6858;
      --success: #86A87F;
      --error: #C4623A;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }
    .ev-serif { font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif; }
    .ev-mono { font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace; }

    .ev-glow {
      position: fixed;
      top: -20%;
      right: -10%;
      width: 900px;
      height: 900px;
      background: radial-gradient(circle, rgba(228,168,83,0.10) 0%, rgba(196,98,58,0.05) 40%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .ev-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
    }
    .ev-input {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 9px;
      padding: 11px 14px;
      font-size: 14px;
      width: 100%;
      outline: none;
      transition: border-color .15s ease;
    }
    .ev-input:focus { border-color: var(--gold-dim); }
    .ev-input::placeholder { color: var(--text-mute); }

    .ev-btn-primary {
      background: linear-gradient(180deg, #EAB868 0%, #D6963F 100%);
      color: #201705;
      font-weight: 600;
      border: none;
      border-radius: 9px;
      padding: 11px 20px;
      font-size: 14px;
      cursor: pointer;
      transition: filter .15s ease, transform .1s ease;
    }
    .ev-btn-primary:hover { filter: brightness(1.08); }
    .ev-btn-primary:active { transform: scale(0.98); }
    .ev-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .ev-btn-ghost {
      background: transparent;
      color: var(--text-soft);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 10px 18px;
      font-size: 14px;
      cursor: pointer;
      transition: border-color .15s ease, color .15s ease;
    }
    .ev-btn-ghost:hover { border-color: var(--gold-dim); color: var(--text); }

    .ev-tab {
      padding: 7px 14px;
      border-radius: 20px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      color: var(--text-mute);
      white-space: nowrap;
      transition: all .15s ease;
    }
    .ev-tab.active {
      background: rgba(228,168,83,0.10);
      border-color: rgba(228,168,83,0.35);
      color: var(--gold);
    }
    .ev-tab:not(.active):hover { color: var(--text-soft); }

    .ev-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11.5px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 20px;
      letter-spacing: 0.02em;
    }
    .ev-badge-gold { background: rgba(228,168,83,0.12); color: var(--gold); border: 1px solid rgba(228,168,83,0.3); }
    .ev-badge-success { background: rgba(134,168,127,0.12); color: var(--success); border: 1px solid rgba(134,168,127,0.3); }
    .ev-badge-mute { background: rgba(255,255,255,0.04); color: var(--text-mute); border: 1px solid var(--border); }

    .ev-divider { height: 1px; background: var(--border-soft); border: none; }

    .ev-candidate {
      border: 1px solid var(--border);
      background: var(--bg-elev);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease;
    }
    .ev-candidate:hover { border-color: var(--border); background: #191712; }
    .ev-candidate.selected { border-color: var(--gold-dim); background: rgba(228,168,83,0.06); }

    .ev-scrollbar::-webkit-scrollbar { width: 6px; }
    .ev-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    @keyframes ev-spin { to { transform: rotate(360deg); } }
    .ev-spin { animation: ev-spin 1.2s linear infinite; transform-origin: center; }

    @media (max-width: 640px) {
      .ev-hide-mobile { display: none; }
    }
  `}</style>
);

/* ============================================================
   SIGNATURE ELEMENT: Verification Ring
   A glowing partial arc — reused as seal / quorum / proof badge
   ============================================================ */
function VerificationRing({ size = 96, progress = 100, label, sublabel, icon: Icon = ShieldCheck, tone = "gold" }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const dash = (progress / 100) * c;
  const stroke = tone === "gold" ? "#E4A853" : tone === "success" ? "#86A87F" : "#C4623A";
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2E2A22" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={stroke} strokeWidth="4" fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${stroke}66)`, transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <Icon size={size * 0.28} color={stroke} strokeWidth={1.6} />
      </div>
      {label && (
        <div style={{ position: "absolute", top: size + 8, left: "50%", transform: "translateX(-50%)", textAlign: "center", width: 160 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</div>
          {sublabel && <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SHARED: Top navigation (screen switcher — demo/mockup only)
   ============================================================ */
function TopNav({ screen, setScreen }) {
  const tabs = [
    { id: "auth", label: "Sign in / Register" },
    { id: "verify", label: "Verify identity" },
    { id: "ballot", label: "Cast vote" },
    { id: "receipt", label: "Receipt" },
    { id: "admin", label: "Admin console" },
    { id: "results", label: "Results" },
    { id: "observer", label: "Observer check" },
  ];
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(10,11,13,0.85)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <ShieldCheck size={19} color="#E4A853" strokeWidth={1.8} />
          <span className="ev-serif" style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "0.01em" }}>Secure&nbsp;Ballot</span>
          <span className="ev-badge ev-badge-mute ev-hide-mobile" style={{ marginLeft: 4 }}>multi-layer verified</span>
        </div>
        <div className="ev-scrollbar" style={{ display: "flex", gap: 4, overflowX: "auto", maxWidth: "100%" }}>
          {tabs.map(t => (
            <div key={t.id} className={`ev-tab ${screen === t.id ? "active" : ""}`} onClick={() => setScreen(t.id)}>
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "56px 24px 80px" }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }) {
  return <div className="ev-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;
}

/* ============================================================
   SCREEN 1 — AUTH (Register / Login)
   Maps to flowchart: Registration form, duplicate-ID check,
   SHA-256 hash storage messaging
   ============================================================ */
function AuthScreen({ goNext, setVoterData }) {
  const [mode, setMode] = useState("login");
  const [voterId, setVoterId] = useState("");
  const [email, setEmail] = useState("");
  const [dupError, setDupError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setDupError(false);
    setError("");
    if (!voterId.trim()) {
      setError("Voter ID is required.");
      return;
    }
    if (mode === "register" && !email.trim()) {
      setError("Voter ID and email are required.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const data = await api("/register", {
          method: "POST",
          body: JSON.stringify({ voter_id: voterId, email }),
        });
        setVoterData({ voterIdHash: data.voter_id_hash, totpSecret: data.totp_secret, provisioningUri: data.provisioning_uri, isNewRegistration: true });
        goNext();
      } else {
        // Sign in — look up existing voter
        const data = await api("/lookup", {
          method: "POST",
          body: JSON.stringify({ voter_id: voterId }),
        });
        setVoterData({ voterIdHash: data.voter_id_hash, totpSecret: data.totp_secret, provisioningUri: data.provisioning_uri, isNewRegistration: false });
        goNext();
      }
    } catch (e) {
      if (e.status === 409) setDupError(true);
      else if (e.status === 404 && mode === "login") setError("No voter found with this ID. Please register first.");
      else setError(e.message || "Could not reach the backend — is it running on :5000?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <Eyebrow>Step 1 of 4 — Identity</Eyebrow>
      <h1 className="ev-serif" style={{ fontSize: 34, fontWeight: 500, lineHeight: 1.15, marginBottom: 10 }}>
        {mode === "login" ? "Welcome back." : "Register to vote."}
      </h1>
      <p style={{ color: "var(--text-soft)", fontSize: 14.5, marginBottom: 32, maxWidth: 440 }}>
        Your Voter ID is never stored as-is — it's hashed with SHA-256 the moment you submit it, so no one, including us, can recover it later.
      </p>

      <div className="ev-card" style={{ padding: 28 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "var(--bg-elev)", padding: 4, borderRadius: 10 }}>
          <div onClick={() => setMode("login")} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 7, fontSize: 13.5, fontWeight: 500, cursor: "pointer", background: mode === "login" ? "var(--bg-card)" : "transparent", color: mode === "login" ? "var(--text)" : "var(--text-mute)" }}>
            <LogIn size={13} style={{ marginRight: 6, verticalAlign: -2 }} />Sign in
          </div>
          <div onClick={() => setMode("register")} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 7, fontSize: 13.5, fontWeight: 500, cursor: "pointer", background: mode === "register" ? "var(--bg-card)" : "transparent", color: mode === "register" ? "var(--text)" : "var(--text-mute)" }}>
            <UserPlus size={13} style={{ marginRight: 6, verticalAlign: -2 }} />Register
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 6, display: "block" }}>Voter ID</label>
          <input
            className="ev-input"
            placeholder="e.g. VID0001"
            value={voterId}
            onChange={(e) => { setVoterId(e.target.value); setDupError(false); }}
          />
          {dupError && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, color: "var(--error)", fontSize: 12.5 }}>
              <AlertTriangle size={13} /> This Voter ID is already registered. Try signing in instead.
            </div>
          )}
        </div>

        {mode === "register" && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 6, display: "block" }}>Email</label>
          <input className="ev-input" placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        )}

        {error && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, color: "var(--error)", fontSize: 12.5 }}>
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        <button className="ev-btn-primary" style={{ width: "100%" }} onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 size={14} className="ev-spin" style={{ verticalAlign: -2 }} /> : (mode === "login" ? "Continue" : "Create account")}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16, justifyContent: "center", color: "var(--text-mute)", fontSize: 11.5 }}>
          <Lock size={11} /> Hashed with SHA-256 · never stored in plaintext
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-mute)" }}>
        Register with any Voter ID, then try registering the same ID again to see the duplicate-ID rejection path.
      </div>
    </Shell>
  );
}

/* ============================================================
   SCREEN 2 — VERIFY (TOTP + OTP)
   Maps to flowchart: TOTP 2FA enrollment, email/SMS OTP gateway,
   valid?/block decision
   ============================================================ */
function VerifyScreen({ goNext, voterData }) {
  const [totp, setTotp] = useState(["", "", "", "", "", ""]);
  const [otpCode, setOtpCode] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refs = useRef([]);

  const hasSent = useRef(false);

  useEffect(() => {
    if (!voterData?.voterIdHash || hasSent.current) return;
    hasSent.current = true;
    api("/otp/send", { method: "POST", body: JSON.stringify({ voter_id_hash: voterData.voterIdHash }) })
      .then((d) => { setDemoOtp(d.demo_code); if (d.demo_code) setOtpCode(d.demo_code); setOtpSent(true); })
      .catch(() => setError("Could not reach the backend."));
  }, [voterData]);

  const handleDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...totp]; next[i] = val; setTotp(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const verify = async () => {
    setError("");
    const code = totp.join("");
    if (code.length < 6 || otpCode.length < 6) {
      setError("Enter both the 6-digit authenticator code and the OTP.");
      return;
    }
    setLoading(true);
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ voter_id_hash: voterData.voterIdHash, totp_code: code, otp_code: otpCode }),
      });
      goNext();
    } catch (e) {
      setError(e.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <Eyebrow>Step 2 of 4 — Verification</Eyebrow>
      <h1 className="ev-serif" style={{ fontSize: 34, fontWeight: 500, marginBottom: 10 }}>Confirm it's you.</h1>
      <p style={{ color: "var(--text-soft)", fontSize: 14.5, marginBottom: 32, maxWidth: 460 }}>
        Two independent channels, so a single stolen password or phone can't cast a vote on your behalf.
      </p>

      <div className="ev-card" style={{ padding: 28, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <QrCode size={16} color="var(--gold)" />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Authenticator code</span>
          <span className="ev-badge ev-badge-gold" style={{ marginLeft: "auto" }}>TOTP · 30s</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-mute)", marginBottom: 18 }}>
          {voterData?.isNewRegistration
            ? "Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code it generates."
            : "Enter the 6-digit code from your authenticator app."}
        </p>

        {/* QR Code for TOTP enrollment */}
        {voterData?.provisioningUri && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18, padding: 16, background: "#fff", borderRadius: 10, width: "fit-content", marginLeft: "auto", marginRight: "auto" }}>
            <QRCodeSVG value={voterData.provisioningUri} size={180} level="M" />
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {totp.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="ev-input ev-mono"
              style={{ width: 42, height: 48, textAlign: "center", fontSize: 18, padding: 0 }}
              maxLength={1}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
            />
          ))}
        </div>
        {voterData?.totpSecret && (
          <div style={{ marginTop: 14, padding: 12, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginBottom: 6 }}>Manual entry secret (if you can't scan the QR code):</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code className="ev-mono" style={{ fontSize: 13, color: "var(--gold)", wordBreak: "break-all", flex: 1, userSelect: "all" }}>{voterData.totpSecret}</code>
              <button
                onClick={() => { navigator.clipboard?.writeText(voterData.totpSecret); }}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "var(--text-soft)", fontSize: 11, flexShrink: 0 }}
              >
                <Copy size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ev-card" style={{ padding: 28, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Mail size={16} color="var(--gold)" />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Email / SMS one-time code</span>
          <span className="ev-badge ev-badge-mute" style={{ marginLeft: "auto" }}>external gateway</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-mute)", marginBottom: 14 }}>
          {otpSent ? "Sent to your registered email/phone. Expires in 5 minutes." : "Sending..."}
        </p>
        <input className="ev-input ev-mono" placeholder="Enter 6-digit OTP" style={{ maxWidth: 200 }} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} />
        {demoOtp && <div style={{ fontSize: 10.5, color: "var(--text-mute)", marginTop: 8 }}>Demo code (would normally be emailed, not shown): <span className="ev-mono">{demoOtp}</span></div>}
      </div>

      {error && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, color: "var(--error)", fontSize: 12.5 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <button className="ev-btn-primary" style={{ width: "100%" }} onClick={verify} disabled={loading}>
        {loading ? <Loader2 size={14} className="ev-spin" style={{ verticalAlign: -2 }} /> : <>Verify &amp; continue <ChevronRight size={14} style={{ verticalAlign: -2, marginLeft: 2 }} /></>}
      </button>
    </Shell>
  );
}

/* ============================================================
   SCREEN 3 — BALLOT (candidate select + live crypto pipeline)
   Maps to flowchart: ballot display, candidate select, blind
   signature request, unblind, AES/RSA encrypt, submit, duplicate
   vote check
   ============================================================ */
const CANDIDATES = [
  { id: "c1", name: "A. Mehta", note: "Final-year, Computer Science" },
  { id: "c2", name: "R. Iyer", note: "Third-year, Data Science" },
  { id: "c3", name: "S. Fernandes", note: "Final-year, Cybersecurity" },
];

const PIPELINE_STEPS = [
  { key: "sign", label: "Requesting anonymous ballot", detail: "RSA blind signature" },
  { key: "unblind", label: "Unblinding signed ballot", detail: "Voter identity separated from vote" },
  { key: "encrypt", label: "Encrypting your vote", detail: "AES-256 + RSA-2048" },
  { key: "submit", label: "Submitting to audit log", detail: "Merkle-linked, tamper-evident" },
];

function BallotScreen({ goNext, voterData, setVoteData }) {
  const [selected, setSelected] = useState(null);
  const [stage, setStage] = useState("select"); // select | pipeline
  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState("");

  const runPipeline = async () => {
    setStage("pipeline");
    setError("");
    try {
      setStepIndex(0); // requesting ballot
      const ballot = await api("/ballot/request", {
        method: "POST",
        body: JSON.stringify({ voter_id_hash: voterData.voterIdHash }),
      });

      setStepIndex(1); // unblinding (already done server-side; visual pacing)
      await new Promise((r) => setTimeout(r, 500));

      setStepIndex(2); // encrypting + submitting (single real call does both)
      const vote = await api("/vote/submit", {
        method: "POST",
        body: JSON.stringify({
          voter_id_hash: voterData.voterIdHash,
          ballot_id: ballot.ballot_id,
          candidate_id: selected,
        }),
      });

      setStepIndex(3); // logged
      await new Promise((r) => setTimeout(r, 400));

      setVoteData({ receiptHash: vote.receipt_hash, leafIndex: vote.leaf_index });
      goNext();
    } catch (e) {
      setError(e.message || "Something went wrong while casting your vote.");
      setStage("select");
    }
  };

  if (stage === "pipeline") {
    return (
      <Shell>
        <Eyebrow>Step 3 of 4 — Casting your vote</Eyebrow>
        <h1 className="ev-serif" style={{ fontSize: 30, fontWeight: 500, marginBottom: 34 }}>Securing your ballot…</h1>
        <div className="ev-card" style={{ padding: 28 }}>
          {PIPELINE_STEPS.map((step, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: i < PIPELINE_STEPS.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? "rgba(134,168,127,0.15)" : active ? "rgba(228,168,83,0.15)" : "var(--bg-elev)", border: `1px solid ${done ? "var(--success)" : active ? "var(--gold-dim)" : "var(--border)"}` }}>
                  {done ? <CheckCircle2 size={14} color="var(--success)" /> : active ? <Loader2 size={13} color="var(--gold)" className="ev-spin" /> : <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-mute)" }} />}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: done || active ? "var(--text)" : "var(--text-mute)" }}>{step.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-mute)" }}>{step.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Eyebrow>Step 3 of 4 — Ballot</Eyebrow>
      <h1 className="ev-serif" style={{ fontSize: 34, fontWeight: 500, marginBottom: 10 }}>Student Council President</h1>
      <p style={{ color: "var(--text-soft)", fontSize: 14.5, marginBottom: 28 }}>Select one candidate. Your choice is encrypted (AES-256/RSA-2048) and issued an anonymous ballot via RSA blind signature before it's recorded.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {CANDIDATES.map((c) => (
          <div key={c.id} className={`ev-candidate ${selected === c.id ? "selected" : ""}`} onClick={() => setSelected(c.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selected === c.id ? "var(--gold)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {selected === c.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold)" }} />}
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-mute)" }}>{c.note}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, color: "var(--error)", fontSize: 12.5 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <button className="ev-btn-primary" style={{ width: "100%" }} disabled={!selected} onClick={runPipeline}>
        <Vote size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Cast encrypted vote
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, justifyContent: "center", color: "var(--text-mute)", fontSize: 11.5 }}>
        <Lock size={11} /> One vote per voter · duplicate submissions are rejected automatically
      </div>
    </Shell>
  );
}

/* ============================================================
   SCREEN 4 — RECEIPT
   Maps to flowchart: SHA-256 receipt, Merkle-log storage,
   voter-side inclusion verification
   ============================================================ */
function ReceiptScreen({ voteData }) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const receiptHash = voteData?.receiptHash || "";

  const copy = () => {
    navigator.clipboard?.writeText(receiptHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const checkInclusion = async () => {
    setChecking(true);
    try {
      const data = await api(`/vote/verify-receipt/${receiptHash}`);
      setCheckResult(data);
    } catch {
      setCheckResult({ included: false });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Shell>
      <Eyebrow>Step 4 of 4 — Confirmation</Eyebrow>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 56 }}>
        <VerificationRing size={104} progress={100} tone="gold" icon={ShieldCheck} label="Vote sealed" sublabel="Recorded in the audit log" />
      </div>

      <h1 className="ev-serif" style={{ fontSize: 28, fontWeight: 500, textAlign: "center", marginBottom: 8 }}>Your vote has been recorded.</h1>
      <p style={{ color: "var(--text-soft)", fontSize: 14, textAlign: "center", marginBottom: 32, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
        No one — including the election administrators — can see which candidate you selected. Save this receipt to verify your vote was counted once results are published.
      </p>

      <div className="ev-card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-mute)", marginBottom: 8 }}>Receipt hash (SHA-256)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
          <Hash size={13} color="var(--gold)" style={{ flexShrink: 0 }} />
          <span className="ev-mono" style={{ fontSize: 11.5, color: "var(--text-soft)", wordBreak: "break-all", flex: 1 }}>{receiptHash || "no receipt yet — cast a vote first"}</span>
          <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "var(--success)" : "var(--text-mute)", flexShrink: 0 }}>
            {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </div>

      <div className="ev-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Link2 size={15} color="var(--gold)" />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Verify inclusion in the audit log</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-mute)", marginBottom: 14 }}>Checks that your receipt hash appears in the tamper-evident Merkle chain — without revealing your vote.</p>
        {!checkResult ? (
          <button className="ev-btn-ghost" style={{ width: "100%" }} onClick={checkInclusion} disabled={!receiptHash || checking}>
            {checking ? <Loader2 size={13} className="ev-spin" style={{ verticalAlign: -2 }} /> : "Check Merkle inclusion"}
          </button>
        ) : checkResult.included ? (
          <div className="ev-badge ev-badge-success" style={{ width: "100%", justifyContent: "center", padding: "10px 0" }}>
            <CheckCircle2 size={13} /> Confirmed — included at log position #{checkResult.leaf_index}, proof valid: {String(checkResult.proof_valid)}
          </div>
        ) : (
          <div className="ev-badge ev-badge-mute" style={{ width: "100%", justifyContent: "center", padding: "10px 0" }}>
            Not found — cast a vote first
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ============================================================
   SCREEN 5 — ADMIN CONSOLE
   Maps to flowchart: election config, voter eligibility,
   key-custodian threshold, close election, PDF report
   ============================================================ */
function AdminScreen() {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [voters, setVoters] = useState([]);
  const [custodians, setCustodians] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tallyResult, setTallyResult] = useState(null);

  const loadOverview = () => api("/admin/overview").then(setOverview).catch(() => {});
  const loadVoters = () => api("/admin/voters").then(setVoters).catch(() => {});
  const loadCustodians = () => api("/admin/custodians").then(setCustodians).catch(() => {});

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => {
    if (tab === "voters") loadVoters();
    if (tab === "custodians") loadCustodians();
  }, [tab]);

  const closeElection = async () => {
    setBusy(true);
    try {
      await api("/admin/election/close", { method: "POST" });
      await loadOverview();
    } finally {
      setBusy(false);
    }
  };

  const submitShare = async (custodianId) => {
    setBusy(true);
    try {
      const result = await api(`/admin/custodians/${custodianId}/submit`, { method: "POST" });
      if (result.tally) setTallyResult(result.tally);
      await loadCustodians();
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = () => {
    window.open(`${API_BASE}/admin/report`, "_blank");
  };

  const submittedCount = custodians.filter((c) => c.submitted).length;

  return (
    <Shell>
      <Eyebrow>Admin console</Eyebrow>
      <h1 className="ev-serif" style={{ fontSize: 30, fontWeight: 500, marginBottom: 24 }}>{overview?.title || "Loading…"}</h1>

      <div style={{ display: "flex", gap: 6, marginBottom: 26, flexWrap: "wrap" }}>
        {[
          { id: "overview", label: "Overview", icon: Settings },
          { id: "voters", label: "Voters", icon: Users },
          { id: "custodians", label: "Key custodians", icon: KeyRound },
          { id: "reports", label: "Reports", icon: FileText },
        ].map(t => (
          <div key={t.id} className={`ev-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <t.icon size={12} /> {t.label}
          </div>
        ))}
      </div>

      {tab === "overview" && overview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ev-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginBottom: 6 }}>Votes cast</div>
              <div className="ev-serif" style={{ fontSize: 26 }}>{overview.votes_cast}</div>
            </div>
            <div className="ev-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginBottom: 6 }}>Registered voters</div>
              <div className="ev-serif" style={{ fontSize: 26 }}>{overview.registered_voters}</div>
            </div>
          </div>
          <div className="ev-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Election status</span>
              <span className={`ev-badge ${overview.status === "closed" ? "ev-badge-mute" : "ev-badge-success"}`}>{overview.status === "closed" ? "Closed" : "Open · accepting votes"}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-mute)", marginBottom: overview.status === "closed" ? 0 : 14 }}>
              {overview.status === "closed" ? "Tallying requires a 2-of-3 key-custodian quorum. See the Key custodians tab." : "Close voting to distribute threshold key shares to the 3 custodians."}
            </p>
            {overview.status !== "closed" && (
              <button className="ev-btn-ghost" onClick={closeElection} disabled={busy}>
                {busy ? <Loader2 size={12} className="ev-spin" style={{ verticalAlign: -2 }} /> : <><Square size={12} style={{ verticalAlign: -1, marginRight: 6 }} /> Close election now</>}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "voters" && (
        <div className="ev-card" style={{ padding: 0, overflow: "hidden" }}>
          {voters.map((v, i) => (
            <div key={v.voter_id_hash} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: i < voters.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
              <span className="ev-mono" style={{ fontSize: 12 }}>{v.voter_id_hash}</span>
              <span className={`ev-badge ${v.voted ? "ev-badge-success" : "ev-badge-mute"}`}>{v.voted ? "voted" : "not yet voted"}</span>
            </div>
          ))}
          {voters.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: "var(--text-mute)" }}>No voters registered yet.</div>}
        </div>
      )}

      {tab === "custodians" && (
        <div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
            <VerificationRing size={90} progress={(submittedCount / 3) * 100} tone={submittedCount >= 2 ? "success" : "gold"} icon={KeyRound} label={`${submittedCount} of 3 shares submitted`} sublabel="2 required to decrypt" />
          </div>
          <div className="ev-card" style={{ padding: 0, overflow: "hidden", marginBottom: tallyResult ? 16 : 0 }}>
            {custodians.map((c, i) => (
              <div key={c.custodian_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: i < custodians.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                <span style={{ fontSize: 13.5 }}>{c.name}</span>
                {c.submitted ? (
                  <span className="ev-badge ev-badge-success"><CheckCircle2 size={11} /> submitted</span>
                ) : (
                  <button className="ev-btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => submitShare(c.custodian_id)} disabled={busy}>
                    Submit share
                  </button>
                )}
              </div>
            ))}
            {custodians.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: "var(--text-mute)" }}>Close the election first to distribute key shares.</div>}
          </div>
          {tallyResult && (
            <div className="ev-badge ev-badge-success" style={{ width: "100%", justifyContent: "center", padding: "10px 0" }}>
              <CheckCircle2 size={13} /> Quorum met — tally decrypted and ZKP published. See the Results screen.
            </div>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="ev-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <FileText size={16} color="var(--gold)" />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Signed audit report</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-mute)", marginBottom: 16 }}>Includes the Merkle root, ZKP verification status, and final tally, generated live from the backend via ReportLab.</p>
          <button className="ev-btn-primary" onClick={downloadReport}><Download size={13} style={{ verticalAlign: -2, marginRight: 6 }} /> Generate PDF report</button>
        </div>
      )}
    </Shell>
  );
}

/* ============================================================
   SCREEN 6 — RESULTS / PUBLIC BULLETIN BOARD
   Maps to flowchart: homomorphic tally, ZKP publish, results
   dashboard
   ============================================================ */
function ResultsScreen() {
  const [results, setResults] = useState(null);

  useEffect(() => {
    api("/results").then(setResults).catch(() => {});
  }, []);

  if (!results) {
    return (
      <Shell>
        <Eyebrow>Public bulletin board</Eyebrow>
        <p style={{ color: "var(--text-mute)", fontSize: 13.5 }}>Loading results…</p>
      </Shell>
    );
  }

  if (!results.tally) {
    return (
      <Shell>
        <Eyebrow>Public bulletin board</Eyebrow>
        <h1 className="ev-serif" style={{ fontSize: 30, fontWeight: 500, marginBottom: 10 }}>Results not yet published</h1>
        <p style={{ color: "var(--text-soft)", fontSize: 14 }}>
          The election is still {results.status === "closed" ? "awaiting a key-custodian quorum to decrypt the tally" : "open"}. Check the Admin console to close voting and submit custodian shares.
        </p>
      </Shell>
    );
  }

  const total = results.tally.reduce((s, r) => s + r.votes, 0) || 1;
  const max = Math.max(...results.tally.map((r) => r.votes), 1);

  return (
    <Shell>
      <Eyebrow>Public bulletin board</Eyebrow>
      <h1 className="ev-serif" style={{ fontSize: 30, fontWeight: 500, marginBottom: 6 }}>Final results</h1>
      <p style={{ color: "var(--text-soft)", fontSize: 13.5, marginBottom: 28 }}>{results.title} · {total} votes tallied</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 26, flexWrap: "wrap" }}>
        <span className={`ev-badge ${results.zkp_verified ? "ev-badge-success" : "ev-badge-mute"}`}>
          <CheckCircle2 size={12} /> {results.zkp_verified ? "Zero-knowledge proof verified" : "ZKP not yet published"}
        </span>
        <span className="ev-badge ev-badge-gold"><Link2 size={12} /> Merkle root published</span>
      </div>

      <div className="ev-card" style={{ padding: 26, marginBottom: 20 }}>
        {results.tally.map((r, i) => (
          <div key={r.candidate_id} style={{ marginBottom: i < results.tally.length - 1 ? 18 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13.5 }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <span className="ev-mono" style={{ color: "var(--text-soft)" }}>{r.votes} ({((r.votes / total) * 100).toFixed(1)}%)</span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: "var(--bg-elev)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(r.votes / max) * 100}%`, borderRadius: 6, background: r.votes === max ? "linear-gradient(90deg, #D6963F, #E4A853)" : "var(--border)" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="ev-card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <BarChart3 size={20} color="var(--gold)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-mute)" }}>Merkle root</div>
          <div className="ev-mono" style={{ fontSize: 11, color: "var(--text-soft)", wordBreak: "break-all" }}>{results.merkle_root}</div>
        </div>
      </div>
    </Shell>
  );
}

/* ============================================================
   SCREEN 7 — OBSERVER VERIFICATION
   Maps to flowchart: independent public verification, no login
   ============================================================ */
function ObserverScreen() {
  const [hash, setHash] = useState("");
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [zkpStatus, setZkpStatus] = useState(null);

  useEffect(() => {
    api("/results").then((r) => setZkpStatus(r.zkp_verified)).catch(() => {});
  }, []);

  const check = async () => {
    if (!hash.trim()) return;
    setChecking(true);
    try {
      const data = await api(`/vote/verify-receipt/${hash.trim()}`);
      setResult(data);
    } catch {
      setResult({ included: false });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Shell>
      <Eyebrow>Observer access · no login required</Eyebrow>
      <h1 className="ev-serif" style={{ fontSize: 30, fontWeight: 500, marginBottom: 10 }}>Verify the election yourself.</h1>
      <p style={{ color: "var(--text-soft)", fontSize: 14.5, marginBottom: 32, maxWidth: 460 }}>
        Anyone can confirm the result is honest — no special access, no trust in administrators required. Paste a receipt hash to check its inclusion, or review the published proof.
      </p>

      <div className="ev-card" style={{ padding: 26, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Check a receipt hash</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="ev-input ev-mono" placeholder="Paste receipt hash…" value={hash} onChange={(e) => setHash(e.target.value)} />
          <button className="ev-btn-primary" style={{ flexShrink: 0 }} onClick={check} disabled={checking}>
            {checking ? <Loader2 size={13} className="ev-spin" style={{ verticalAlign: -2 }} /> : "Check"}
          </button>
        </div>
        {result && (
          result.included ? (
            <div className="ev-badge ev-badge-success" style={{ marginTop: 14, padding: "9px 14px" }}>
              <CheckCircle2 size={13} /> Included in the audit log at position #{result.leaf_index}
            </div>
          ) : (
            <div className="ev-badge ev-badge-mute" style={{ marginTop: 14, padding: "9px 14px" }}>
              Not found in the audit log
            </div>
          )
        )}
      </div>

      <div className="ev-card" style={{ padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <VerificationRing size={54} progress={100} tone={zkpStatus ? "success" : "gold"} icon={ClipboardCheck} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Tally proof status</div>
            <div style={{ fontSize: 12, color: "var(--text-mute)" }}>
              {zkpStatus === null ? "No proof published yet" : zkpStatus ? "Zero-knowledge proof verified against the Merkle root" : "Proof verification failed"}
            </div>
          </div>
        </div>
        <hr className="ev-divider" style={{ margin: "16px 0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-soft)" }}>
          <RadioTower size={13} color="var(--gold)" />
          Published to the public bulletin board · live from the backend
        </div>
      </div>
    </Shell>
  );
}

/* ============================================================
   ROOT
   ============================================================ */
export default function EVotingApp() {
  const [screen, setScreen] = useState("auth");
  const [voterData, setVoterData] = useState(null); // { voterIdHash, totpSecret }
  const [voteData, setVoteData] = useState(null);   // { receiptHash, leafIndex }

  const advance = { auth: "verify", verify: "ballot", ballot: "receipt" };

  const renderScreen = () => {
    switch (screen) {
      case "auth": return <AuthScreen goNext={() => setScreen(advance.auth)} setVoterData={setVoterData} />;
      case "verify": return <VerifyScreen goNext={() => setScreen(advance.verify)} voterData={voterData} />;
      case "ballot": return <BallotScreen goNext={() => setScreen(advance.ballot)} voterData={voterData} setVoteData={setVoteData} />;
      case "receipt": return <ReceiptScreen voteData={voteData} />;
      case "admin": return <AdminScreen />;
      case "results": return <ResultsScreen />;
      case "observer": return <ObserverScreen />;
      default: return null;
    }
  };

  return (
    <div className="ev-root">
      <GlobalStyle />
      <div className="ev-glow" />
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopNav screen={screen} setScreen={setScreen} />
        {renderScreen()}
      </div>
    </div>
  );
}
