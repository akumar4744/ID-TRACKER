// File: src/pages/LoginPage.tsx

import { useState } from "react";
import { signIn, signOut } from "../lib/auth";
import {
  challengeAndVerify, hasVerifiedMfaFactor, getAal,
  logLoginEvent, checkLoginRateLimit,
} from "../lib/mfa";

interface LoginPageProps {
  onLogin?:               () => void;
  onForgotPassword?:      () => void;
  onEmergencyRecovery?:   () => void;
}

type Stage = "credentials" | "mfa";

export default function LoginPage({ onLogin, onForgotPassword, onEmergencyRecovery }: LoginPageProps) {
  const [stage,    setStage]    = useState<Stage>("credentials");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [code,     setCode]     = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState<"email" | "password" | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Rate-limit check
    const rl = await checkLoginRateLimit(email);
    if (!rl.ok) {
      setError(rl.error || "Too many failed attempts. Try again later.");
      setLoading(false);
      return;
    }

    try {
      await signIn(email, password);
      await logLoginEvent(email, "password_success");

      // Check AAL — if next level is aal2, we need MFA challenge before completing login
      const aal = await getAal();
      const hasFactor = await hasVerifiedMfaFactor();
      if (aal.next === "aal2" || hasFactor) {
        setStage("mfa");
        setLoading(false);
        return;
      }

      // No MFA enrolled yet — let user in (they should enroll in Security Settings)
      onLogin?.();
    } catch (err: unknown) {
      await logLoginEvent(email, "password_fail");
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) { setError("Enter the 6-digit code from your authenticator."); return; }
    setError("");
    setLoading(true);
    try {
      await challengeAndVerify(code.trim());
      await logLoginEvent(email, "mfa_success");
      onLogin?.();
    } catch (err: unknown) {
      await logLoginEvent(email, "mfa_fail");
      setError(err instanceof Error ? err.message : "Invalid code. Try again.");
      setLoading(false);
    }
  }

  async function handleBack() {
    // User wants to start over — sign out the partial aal1 session
    await signOut();
    setStage("credentials");
    setCode(""); setError("");
  }

  return (
    <div style={S.page}>
      {/* ── Ambient background ── */}
      <div style={S.ambientTop} />
      <div style={S.ambientBottom} />

      {/* ── Floating geometric shapes ── */}
      <div style={{ ...S.geoShape, top: "15%", right: "12%", width: 180, height: 180,
        animationDelay: "0s", opacity: 0.025 }} />
      <div style={{ ...S.geoShape, bottom: "20%", left: "8%", width: 120, height: 120,
        animationDelay: "2s", opacity: 0.02 }} />
      <div style={{ ...S.geoShape, top: "55%", right: "5%", width: 80, height: 80,
        animationDelay: "1s", opacity: 0.03 }} />

      {/* ── Grid texture ── */}
      <div style={S.gridOverlay} />

      {/* ── Main card — id used by OverlayGuide spotlight targeting ── */}
      <div id="main-panel" style={S.card}>
        {/* Logo */}
        <div style={S.logoArea}>
          <svg width="64" height="48" viewBox="0 0 48 36" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="14" cy="20" r="12" fill="#8B1A1A" />
            <circle cx="33" cy="10" r="7.5" fill="#8B1A1A" />
            <circle cx="40" cy="25" r="4.5" fill="#8B1A1A" />
          </svg>
          <div style={{ ...S.logoName, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
            Do<span style={{ color: "#8B1A1A" }}>T</span>
          </div>
        </div>

        {/* Divider */}
        <div style={S.divider} />

        {/* Heading */}
        <div style={S.headingGroup}>
          <h1 style={S.heading}>{stage === "mfa" ? "Verify it's you" : "Welcome back"}</h1>
          <p style={S.subheading}>
            {stage === "mfa"
              ? "Enter the 6-digit code from your authenticator app"
              : "Sign in to access your workspace"}
          </p>
        </div>

        {/* Form — credentials stage */}
        {stage === "credentials" && (
        <form onSubmit={handleSubmit} style={S.form}>

          {/* Email */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Email address</label>
            <div style={{
              ...S.inputWrapper,
              ...(focused === "email" ? S.inputWrapperFocused : {}),
            }}>
              <span style={S.inputIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                    stroke="currentColor" strokeWidth="1.5" />
                  <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" />
                </svg>
              </span>
              <input
                style={S.input}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
              />
            </div>
          </div>

          {/* Password */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Password</label>
            <div style={{
              ...S.inputWrapper,
              ...(focused === "password" ? S.inputWrapperFocused : {}),
            }}>
              <span style={S.inputIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                    stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <input
                style={S.input}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={S.errorBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" />
                <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={loading ? S.btnLoading : S.btn}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <span style={{
                  width: 14, height: 14,
                  border: "2px solid rgba(255,255,255,0.2)",
                  borderTopColor: "rgba(255,255,255,0.8)",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }} />
                Signing in…
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center" }}>
                Sign In
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>

          {/* Help links — credentials stage */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => onForgotPassword?.()}
              style={{
                background: "none", border: "none",
                color: "rgba(165,168,255,0.85)", fontSize: 12,
                cursor: "pointer", fontFamily: "inherit", padding: 4,
                textAlign: "center",
              }}
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => onEmergencyRecovery?.()}
              style={{
                background: "none", border: "none",
                color: "rgba(245,158,11,0.8)", fontSize: 11.5,
                cursor: "pointer", fontFamily: "inherit", padding: 4,
                textAlign: "center",
              }}
            >
              I lost my authenticator device
            </button>
          </div>
        </form>
        )}

        {/* Form — MFA stage */}
        {stage === "mfa" && (
        <form onSubmit={handleMfa} style={S.form}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Authenticator code</label>
            <div style={S.inputWrapper}>
              <span style={S.inputIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <input
                style={{ ...S.input, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 6, textAlign: "center", fontSize: 16 }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
              />
            </div>
          </div>

          {error && (
            <div style={S.errorBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading || code.length !== 6}
            style={loading || code.length !== 6 ? S.btnLoading : S.btn}>
            {loading ? "Verifying…" : "Verify & Continue"}
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            <button type="button" onClick={handleBack}
              style={{
                background: "none", border: "none",
                color: "rgba(136,146,176,0.7)", fontSize: 11.5,
                cursor: "pointer", fontFamily: "inherit", padding: 4,
                textAlign: "center",
              }}>
              ← Use a different account
            </button>
            <button type="button" onClick={() => onForgotPassword?.()}
              style={{
                background: "none", border: "none",
                color: "rgba(245,158,11,0.8)", fontSize: 11.5,
                cursor: "pointer", fontFamily: "inherit", padding: 4,
                textAlign: "center",
              }}>
              Use a recovery code instead
            </button>
          </div>
        </form>
        )}

        {/* Footer */}
        <div style={S.footer}>
          <div style={S.footerDot} />
          <span>{stage === "mfa" ? "Two-factor authentication required" : "Secure enterprise login"}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#05060d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    padding: "24px 16px",
  },
  ambientTop: {
    position: "absolute",
    top: -200, left: "50%",
    transform: "translateX(-50%)",
    width: 700, height: 500,
    background: "radial-gradient(ellipse, rgba(124,108,248,0.07) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  ambientBottom: {
    position: "absolute",
    bottom: -100, right: "10%",
    width: 400, height: 400,
    background: "radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  gridOverlay: {
    position: "absolute", inset: 0,
    backgroundImage: `
      linear-gradient(rgba(124,108,248,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(124,108,248,0.03) 1px, transparent 1px)
    `,
    backgroundSize: "48px 48px",
    pointerEvents: "none",
  },
  geoShape: {
    position: "absolute",
    border: "1px solid rgba(124,108,248,0.8)",
    borderRadius: 8,
    transform: "rotate(20deg)",
    animation: "ambientFloat 8s ease-in-out infinite",
  },
  card: {
    background: "rgba(13,16,34,0.75)",
    backdropFilter: "blur(24px) saturate(1.5)",
    WebkitBackdropFilter: "blur(24px) saturate(1.5)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 20,
    padding: "36px 32px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 8px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
    animation: "fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both",
    position: "relative",
    zIndex: 1,
  },
  logoArea: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 0,
  },
  logoIcon: {
    width: 40, height: 40, borderRadius: 11,
    background: "linear-gradient(135deg, rgba(124,108,248,0.2), rgba(124,108,248,0.05))",
    border: "1px solid rgba(124,108,248,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 0 20px rgba(124,108,248,0.15)",
    flexShrink: 0,
  },
  logoName: {
    color: "#eef0f8", fontWeight: 700, fontSize: 15, letterSpacing: -0.2,
  },
  logoSub: {
    color: "rgba(124,108,248,0.8)", fontSize: 10, fontWeight: 500,
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  divider: {
    height: 1,
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
    margin: "20px 0",
  },
  headingGroup: { marginBottom: 24 },
  heading: {
    color: "#eef0f8", fontSize: 22, fontWeight: 700,
    letterSpacing: -0.5, marginBottom: 6,
  },
  subheading: {
    color: "#4a526e", fontSize: 13,
  },
  form: {
    display: "flex", flexDirection: "column", gap: 14,
  },
  fieldGroup: {
    display: "flex", flexDirection: "column", gap: 6,
  },
  label: {
    color: "#8892b0", fontSize: 11, fontWeight: 500,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    display: "flex", alignItems: "center",
    background: "rgba(8,10,20,0.6)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  inputWrapperFocused: {
    borderColor: "rgba(124,108,248,0.5)",
    boxShadow: "0 0 0 3px rgba(124,108,248,0.08), 0 0 16px rgba(124,108,248,0.06)",
  },
  inputIcon: {
    padding: "0 12px",
    color: "#4a526e",
    display: "flex", alignItems: "center",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#eef0f8",
    padding: "11px 12px 11px 0",
    fontSize: 14,
    outline: "none",
  },
  errorBox: {
    display: "flex", alignItems: "flex-start", gap: 9,
    background: "rgba(244,63,94,0.06)",
    border: "1px solid rgba(244,63,94,0.2)",
    borderRadius: 9,
    padding: "10px 13px",
    color: "rgba(244,63,94,0.9)",
    fontSize: 13,
    lineHeight: 1.5,
    animation: "fadeIn 0.2s ease",
  },
  btn: {
    background: "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    padding: "13px 0",
    fontSize: 14, fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(124,108,248,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
    transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
    letterSpacing: 0.2,
    marginTop: 4,
  },
  btnLoading: {
    background: "rgba(124,108,248,0.2)",
    border: "1px solid rgba(124,108,248,0.2)",
    borderRadius: 10,
    color: "rgba(165,168,255,0.6)",
    padding: "13px 0",
    fontSize: 14, fontWeight: 600,
    cursor: "not-allowed",
    marginTop: 4,
  },
  footer: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    marginTop: 20,
    color: "#2d3450", fontSize: 11,
  },
  footerDot: {
    width: 5, height: 5, borderRadius: "50%",
    background: "rgba(16,185,129,0.6)",
    boxShadow: "0 0 6px rgba(16,185,129,0.5)",
  },
};