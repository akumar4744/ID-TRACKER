// src/pages/EmergencyRecoveryPages.tsx
// Two-page module:
//   • EmergencyRecoveryRequest — user without password OR authenticator submits
//     a recovery request that goes to the admin inbox.
//   • EmergencyRecoveryClaim   — once an admin approves and shares the recovery
//     URL, the user lands here to set a new password and re-enroll MFA.

import { useState } from "react";
import { supabase } from "../lib/supabase";

// ─── REQUEST ─────────────────────────────────────────────────────────────────

interface RequestProps { onBack: () => void; }

export function EmergencyRecoveryRequest({ onBack }: RequestProps) {
  const [email,   setEmail]   = useState("");
  const [reason,  setReason]  = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setErr("Email is required."); return; }
    if (!reason.trim()) { setErr("Tell us briefly what happened."); return; }
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabase.rpc("request_emergency_recovery", {
        p_email:  email.trim(),
        p_reason: reason.trim(),
      });
      if (error) throw error;
      const r = data as { ok: boolean; message?: string };
      if (!r.ok) throw new Error("Submission failed");
      setSent(true);
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <Brand />
        <h1 style={S.heading}>Emergency Recovery</h1>
        <p style={S.sub}>
          Use this if you've lost both your password and your authenticator device.
          An administrator will review your request and respond.
        </p>

        {!sent && (
          <form onSubmit={submit} style={S.form}>
            <label style={S.label}>Registered email</label>
            <input style={S.input} type="email" required autoFocus
              placeholder="you@company.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <label style={S.label}>What happened?</label>
            <textarea
              style={{ ...S.input, resize: "vertical", minHeight: 90, fontFamily: "inherit" }}
              placeholder="Briefly describe how you lost access — this helps admin verify your identity."
              value={reason} onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
            {err && <div style={S.err}>⚠ {err}</div>}
            <button type="submit" disabled={loading} style={loading ? S.btnLoading : S.btn}>
              {loading ? "Submitting…" : "Submit recovery request"}
            </button>
          </form>
        )}

        {sent && (
          <div style={S.ok}>
            ✓ If your account exists, your request has been submitted for review. An administrator
            will contact you with next steps.
          </div>
        )}

        <button onClick={onBack} style={S.linkBtn}>← Back to sign in</button>
      </div>
    </div>
  );
}

// ─── CLAIM ───────────────────────────────────────────────────────────────────

interface ClaimProps {
  token:  string;
  onDone: () => void;
}

export function EmergencyRecoveryClaim({ token, onDone }: ClaimProps) {
  const [pwd,     setPwd]     = useState("");
  const [pwd2,    setPwd2]    = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");
  const [done,    setDone]    = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pwd !== pwd2)   { setErr("Passwords do not match."); return; }
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabase.rpc("claim_emergency_recovery", {
        p_token:        token,
        p_new_password: pwd,
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) throw new Error(r.error || "Recovery failed.");
      setDone(true);
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : "Recovery failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <Brand />
        <h1 style={S.heading}>Complete Recovery</h1>
        <p style={S.sub}>
          Set a new password. After signing in you'll be required to enroll a new authenticator app
          and generate fresh recovery codes.
        </p>

        {!done && (
          <form onSubmit={submit} style={S.form}>
            <input style={S.input} type="password" required autoFocus autoComplete="new-password"
              placeholder="New password (min 8 chars)"
              value={pwd} onChange={(e) => setPwd(e.target.value)} />
            <input style={S.input} type="password" required autoComplete="new-password"
              placeholder="Confirm new password"
              value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            {err && <div style={S.err}>⚠ {err}</div>}
            <button type="submit" disabled={loading} style={loading ? S.btnLoading : S.btn}>
              {loading ? "Setting password…" : "Set new password"}
            </button>
          </form>
        )}

        {done && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={S.ok}>✓ Recovery complete. Two-factor authentication has been reset.</div>
            <button onClick={onDone} style={S.btn}>Sign in</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared atoms ────────────────────────────────────────────────────────────

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <svg width="48" height="36" viewBox="0 0 48 36" fill="none">
        <circle cx="14" cy="20" r="12" fill="#8B1A1A" />
        <circle cx="33" cy="10" r="7.5" fill="#8B1A1A" />
        <circle cx="40" cy="25" r="4.5" fill="#8B1A1A" />
      </svg>
      <span style={{ color: "#eef0f8", fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>
        Do<span style={{ color: "#8B1A1A" }}>T</span>
      </span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:      { minHeight: "100vh", background: "#05060d", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card:      { background: "rgba(13,16,34,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 32,
               width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 14, backdropFilter: "blur(16px)",
               boxShadow: "0 20px 60px rgba(0,0,0,0.6)" },
  heading:   { color: "#eef0f8", fontSize: 20, fontWeight: 700, margin: 0 },
  sub:       { color: "#8892b0", fontSize: 13, margin: 0, lineHeight: 1.55 },
  form:      { display: "flex", flexDirection: "column", gap: 10 },
  label:     { color: "#8892b0", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 },
  input:     { background: "rgba(8,10,20,0.5)", border: "1px solid rgba(255,255,255,0.08)", color: "#eef0f8",
               borderRadius: 8, padding: "11px 14px", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn:       { background: "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)", border: "none", color: "#fff",
               borderRadius: 9, padding: "11px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
               boxShadow: "0 4px 16px rgba(124,108,248,0.3)" },
  btnLoading:{ background: "rgba(124,108,248,0.3)", border: "none", color: "rgba(255,255,255,0.7)",
               borderRadius: 9, padding: "11px 18px", fontSize: 13, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" },
  err:       { background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", color: "#f43f5e",
               borderRadius: 8, padding: "10px 14px", fontSize: 12 },
  ok:        { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981",
               borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.5 },
  linkBtn:   { background: "none", border: "none", color: "rgba(136,146,176,0.7)", fontSize: 12,
               cursor: "pointer", fontFamily: "inherit", padding: 4, marginTop: 6, textAlign: "center" },
};
