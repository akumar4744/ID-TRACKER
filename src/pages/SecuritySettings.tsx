// src/pages/SecuritySettings.tsx
// User-facing security panel: enable/disable 2FA, view enrollment QR code,
// generate and display recovery codes (one-time view).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import {
  startMfaEnrollment,
  verifyEnrollment,
  unenrollMfa,
  challengeAndVerify,
  hasVerifiedMfaFactor,
  generateAndStoreRecoveryCodes,
} from "../lib/mfa";

type Stage =
  | "loading"
  | "overview"
  | "enrolling"       // showing QR + verify field
  | "verifying"
  | "showing_codes"
  | "disabling";

interface EnrollmentData {
  factorId: string;
  qrCode:   string;
  secret:   string;
}

interface CodeUsage {
  total:     number;
  remaining: number;
  generated: string | null;
}

export default function SecuritySettings() {
  const { T } = useTheme();
  const [stage, setStage]         = useState<Stage>("loading");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [usage, setUsage]         = useState<CodeUsage>({ total: 0, remaining: 0, generated: null });
  const [enroll, setEnroll]       = useState<EnrollmentData | null>(null);
  const [code, setCode]           = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [err, setErr]             = useState("");
  const [msg, setMsg]             = useState("");

  const refresh = useCallback(async () => {
    setStage("loading");
    const hasFactor = await hasVerifiedMfaFactor();
    setMfaEnabled(hasFactor);

    const { data: user } = await supabase.auth.getUser();
    if (user?.user) {
      const { data: codes } = await supabase
        .from("recovery_codes")
        .select("id, used_at")
        .eq("user_id", user.user.id);
      const total = codes?.length ?? 0;
      const remaining = (codes ?? []).filter((c) => !c.used_at).length;
      const { data: settings } = await supabase
        .from("user_security_settings")
        .select("recovery_codes_generated_at")
        .eq("user_id", user.user.id)
        .maybeSingle();
      setUsage({ total, remaining, generated: settings?.recovery_codes_generated_at ?? null });
    }
    setStage("overview");
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleStartEnroll() {
    setErr(""); setMsg("");
    try {
      const data = await startMfaEnrollment();
      setEnroll(data);
      setCode("");
      setStage("enrolling");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Enrollment failed");
    }
  }

  async function handleVerifyEnroll() {
    if (!enroll) return;
    if (code.trim().length !== 6) { setErr("Enter the 6-digit code from your authenticator."); return; }
    setStage("verifying"); setErr("");
    try {
      await verifyEnrollment(enroll.factorId, code.trim());
      // Generate recovery codes
      const codes = await generateAndStoreRecoveryCodes();
      setRecoveryCodes(codes);
      setStage("showing_codes");
      setMsg("Two-factor authentication enabled successfully.");
    } catch (e: unknown) {
      setStage("enrolling");
      setErr(e instanceof Error ? e.message : "Invalid code. Try again.");
    }
  }

  async function handleRegenerateCodes() {
    setErr(""); setMsg("");
    if (!confirm("Generate new recovery codes? Your old codes will stop working immediately.")) return;
    if (code.trim().length !== 6) { setErr("Enter your current 6-digit authenticator code first."); return; }
    try {
      await challengeAndVerify(code.trim());
      const codes = await generateAndStoreRecoveryCodes();
      setRecoveryCodes(codes);
      setStage("showing_codes");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Verification failed.");
    }
  }

  async function handleDisable() {
    setErr(""); setMsg("");
    if (code.trim().length !== 6) { setErr("Enter your current 6-digit code to confirm disabling."); return; }
    setStage("disabling");
    try {
      await challengeAndVerify(code.trim());
      await unenrollMfa();
      setMsg("Two-factor authentication disabled.");
      setCode("");
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Verification failed.");
      setStage("overview");
    }
  }

  function copyCodes() {
    const text = recoveryCodes.join("\n");
    navigator.clipboard?.writeText(text);
  }

  function downloadCodes() {
    const blob = new Blob(
      ["DoT Recovery Codes — store these somewhere safe.\nEach code can be used only once.\n\n" + recoveryCodes.join("\n")],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dot-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (stage === "loading") {
    return <div style={{ color: T.textMuted, padding: 30, textAlign: "center" }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: T.textPrimary, maxWidth: 680 }}>
      <div>
        <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
          Security Settings
        </h2>
        <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
          Protect your account with an authenticator app. Required for sensitive actions.
        </p>
      </div>

      {err && <Banner type="error"   message={err} />}
      {msg && <Banner type="success" message={msg} />}

      {/* ── Status card ── */}
      <div style={{
        background: T.bgCard, border: `1px solid ${mfaEnabled ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
        boxShadow: T.shadowCard, borderRadius: 12, padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: mfaEnabled ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
            border: `1px solid ${mfaEnabled ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>
            {mfaEnabled ? "🔒" : "⚠"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.textPrimary, fontWeight: 600, fontSize: 14 }}>
              Two-Factor Authentication: {mfaEnabled ? "Enabled" : "Disabled"}
            </div>
            <div style={{ color: T.textMuted, fontSize: 11.5, marginTop: 2 }}>
              {mfaEnabled
                ? "You'll be prompted for a 6-digit code at each sign-in."
                : "Enable to add a second layer of security to your account."}
            </div>
          </div>
        </div>

        {/* When MFA off → Enable button */}
        {!mfaEnabled && stage === "overview" && (
          <button onClick={handleStartEnroll} style={primaryBtn}>
            🔐 Enable Two-Factor Authentication
          </button>
        )}

        {/* Enrollment QR */}
        {stage === "enrolling" && enroll && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ background: "#fff", padding: 8, borderRadius: 10 }}>
                <img src={enroll.qrCode} alt="QR" width={160} height={160} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 220 }}>
                <span style={metaLabel(T)}>Scan with Google Authenticator / Authy / 1Password</span>
                <span style={{ color: T.textSecondary, fontSize: 11 }}>Or enter this key manually:</span>
                <code style={{
                  background: T.bgInput, border: `1px solid ${T.borderInput}`,
                  color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, padding: "8px 10px", borderRadius: 6,
                  wordBreak: "break-all",
                }}>{enroll.secret}</code>
              </div>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              style={{ ...inputStyle(T), fontFamily: "'JetBrains Mono', monospace", letterSpacing: 6, textAlign: "center", fontSize: 18 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={refresh} style={secondaryBtn(T)}>Cancel</button>
              <button onClick={handleVerifyEnroll} style={primaryBtn} disabled={code.length !== 6}>
                Verify & Enable
              </button>
            </div>
          </div>
        )}

        {/* Showing recovery codes (only displayed once) */}
        {stage === "showing_codes" && recoveryCodes.length > 0 && (
          <div style={{
            background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 10, padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div>
              <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>★ Your Recovery Codes</div>
              <div style={{ color: T.textMuted, fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                Save these in a safe place. Each code can be used <strong>only once</strong> to log in if you lose your authenticator device. You will <strong>not see them again</strong>.
              </div>
            </div>
            <div style={{
              background: "rgba(8,10,20,0.5)", border: `1px solid ${T.borderInput}`,
              borderRadius: 8, padding: 14,
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13, color: T.textPrimary, letterSpacing: 0.8,
            }}>
              {recoveryCodes.map((rc) => <div key={rc}>{rc}</div>)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copyCodes}     style={secondaryBtn(T)}>📋 Copy</button>
              <button onClick={downloadCodes} style={secondaryBtn(T)}>💾 Download .txt</button>
              <button onClick={refresh}       style={primaryBtn}>I've saved them, done</button>
            </div>
          </div>
        )}

        {/* MFA on → controls */}
        {mfaEnabled && stage === "overview" && (
          <div style={{
            background: T.bgInput, border: `1px solid ${T.borderInput}`,
            borderRadius: 10, padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Stat label="Recovery codes left"   value={`${usage.remaining}/${usage.total}`} T={T} />
              <Stat label="Codes generated"       value={usage.generated ? new Date(usage.generated).toLocaleDateString() : "—"} T={T} />
            </div>
            <span style={{ color: T.textSecondary, fontSize: 11.5 }}>
              Enter your current 6-digit code to disable MFA or regenerate recovery codes:
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              style={{ ...inputStyle(T), fontFamily: "'JetBrains Mono', monospace", letterSpacing: 6, textAlign: "center", fontSize: 16 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={handleRegenerateCodes} disabled={code.length !== 6} style={secondaryBtn(T)}>
                🔄 Regenerate Recovery Codes
              </button>
              <button onClick={handleDisable} disabled={code.length !== 6} style={dangerBtn}>
                Disable 2FA
              </button>
            </div>
          </div>
        )}

        {stage === "verifying" && <div style={{ color: T.textMuted, fontSize: 12 }}>Verifying…</div>}
        {stage === "disabling" && <div style={{ color: T.textMuted, fontSize: 12 }}>Disabling…</div>}
      </div>
    </div>
  );
}

// ── styles / atoms ─────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
  border: "none", color: "#fff", borderRadius: 8, padding: "10px 18px",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 4px 16px rgba(142,22,22,0.28)",
};
function secondaryBtn(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
    color: T.textSecondary, borderRadius: 8, padding: "10px 16px",
    fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  };
}
const dangerBtn: React.CSSProperties = {
  background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.3)",
  color: "#f43f5e", borderRadius: 8, padding: "10px 16px",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
function inputStyle(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    background: T.bgInput, border: `1px solid ${T.borderInput}`,
    color: T.textPrimary, borderRadius: 8, padding: "10px 12px",
    fontSize: 12, fontFamily: "inherit", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
}
function metaLabel(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return { color: T.textMuted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600 };
}
function Stat({ label, value, T }: { label: string; value: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={metaLabel(T)}>{label}</span>
      <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
function Banner({ type, message }: { type: "success" | "error"; message: string }) {
  const isSuccess = type === "success";
  return (
    <div style={{
      background: isSuccess ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
      border: `1px solid ${isSuccess ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}`,
      borderRadius: 8, padding: "10px 14px",
      color: isSuccess ? "#10b981" : "#f43f5e", fontSize: 13,
    }}>{isSuccess ? "✓" : "⚠"} {message}</div>
  );
}
