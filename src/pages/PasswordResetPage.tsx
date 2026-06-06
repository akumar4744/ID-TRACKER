// src/pages/PasswordResetPage.tsx
// Forgotten-password flow gated by an unused recovery code.
// Steps: email → recovery code → new password.
// Server RPC verifies the code AND updates the password atomically.

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { hashRecoveryCode, logResetEvent, checkLoginRateLimit } from "../lib/mfa";

interface Props {
  onBack: () => void;
  onDone: () => void;
}

type Step = "email" | "code" | "newpwd" | "done";

export default function PasswordResetPage({ onBack, onDone }: Props) {
  const [step,     setStep]     = useState<Step>("email");
  const [email,    setEmail]    = useState("");
  const [code,     setCode]     = useState("");
  const [pwd,      setPwd]      = useState("");
  const [pwd2,     setPwd2]     = useState("");
  const [err,      setErr]      = useState("");
  const [loading,  setLoading]  = useState(false);

  async function nextFromEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setErr("Enter your email."); return; }
    const rl = await checkLoginRateLimit(email);
    if (!rl.ok) { setErr(rl.error || "Too many attempts. Wait and try again."); return; }
    setErr("");
    setStep("code");
  }

  async function nextFromCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) { setErr("Enter a recovery code."); return; }
    setErr("");
    setStep("newpwd");
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pwd !== pwd2)   { setErr("Passwords do not match."); return; }
    setLoading(true);
    try {
      const hash = await hashRecoveryCode(code);
      const { data, error } = await supabase.rpc("reset_password_via_recovery_code", {
        p_email:        email.trim(),
        p_code_hash:    hash,
        p_new_password: pwd,
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) throw new Error(r.error || "Reset failed.");
      await logResetEvent(email, "reset_success");
      setStep("done");
    } catch (e2: unknown) {
      await logResetEvent(email, "reset_fail");
      setErr(e2 instanceof Error ? e2.message : "Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <Brand />
        <h1 style={S.heading}>Reset your password</h1>
        <p style={S.sub}>
          {step === "email"  && "Enter your registered email."}
          {step === "code"   && "Enter one of your recovery codes."}
          {step === "newpwd" && "Choose a new password."}
          {step === "done"   && "Password reset — sign in again."}
        </p>

        {step === "email" && (
          <form onSubmit={nextFromEmail} style={S.form}>
            <input style={S.input} type="email" required autoFocus autoComplete="email"
              placeholder="you@company.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {err && <Err msg={err} />}
            <button type="submit" style={S.btn}>Continue</button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={nextFromCode} style={S.form}>
            <input style={{ ...S.input, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}
              placeholder="A7K9-X2P4" autoFocus
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            {err && <Err msg={err} />}
            <button type="submit" style={S.btn}>Continue</button>
          </form>
        )}

        {step === "newpwd" && (
          <form onSubmit={submitNew} style={S.form}>
            <input style={S.input} type="password" required autoFocus autoComplete="new-password"
              placeholder="New password (min 8 chars)"
              value={pwd} onChange={(e) => setPwd(e.target.value)} />
            <input style={S.input} type="password" required autoComplete="new-password"
              placeholder="Confirm new password"
              value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            {err && <Err msg={err} />}
            <button type="submit" disabled={loading} style={loading ? S.btnLoading : S.btn}>
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={S.ok}>✓ Your password has been reset.</div>
            <button onClick={onDone} style={S.btn}>Sign in</button>
          </div>
        )}

        <button onClick={onBack} style={S.linkBtn}>← Back to sign in</button>
      </div>
    </div>
  );
}

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
function Err({ msg }: { msg: string }) {
  return <div style={S.err}>⚠ {msg}</div>;
}

const S: Record<string, React.CSSProperties> = {
  page:     { minHeight: "100vh", background: "#05060d", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card:     { background: "rgba(13,16,34,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 32,
              width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14, backdropFilter: "blur(16px)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)" },
  heading:  { color: "#eef0f8", fontSize: 20, fontWeight: 700, margin: 0 },
  sub:      { color: "#8892b0", fontSize: 13, margin: 0 },
  form:     { display: "flex", flexDirection: "column", gap: 10 },
  input:    { background: "rgba(8,10,20,0.5)", border: "1px solid rgba(255,255,255,0.08)", color: "#eef0f8",
              borderRadius: 8, padding: "12px 14px", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn:      { background: "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)", border: "none", color: "#fff",
              borderRadius: 9, padding: "11px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 16px rgba(124,108,248,0.3)" },
  btnLoading:{ background: "rgba(124,108,248,0.3)", border: "none", color: "rgba(255,255,255,0.7)",
               borderRadius: 9, padding: "11px 18px", fontSize: 13, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" },
  err:      { background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", color: "#f43f5e",
              borderRadius: 8, padding: "10px 14px", fontSize: 12 },
  ok:       { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981",
              borderRadius: 8, padding: "12px 14px", fontSize: 13, textAlign: "center" },
  linkBtn:  { background: "none", border: "none", color: "rgba(136,146,176,0.7)", fontSize: 12,
              cursor: "pointer", fontFamily: "inherit", padding: 4, marginTop: 6, textAlign: "center" },
};
