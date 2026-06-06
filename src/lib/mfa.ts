// src/lib/mfa.ts
// Centralised MFA helpers built on top of Supabase's TOTP MFA API + our
// recovery-code SQL layer. Used by LoginPage, SecuritySettings, PasswordReset,
// EmergencyRecovery flows.

import { supabase } from "./supabase";

// ── Recovery code utilities ────────────────────────────────────────────────

// Generate a single human-friendly recovery code, e.g. "A7K9-X2P4"
function makeRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const out: string[] = [];
  for (let i = 0; i < 8; i++) out.push(alphabet[buf[i] % alphabet.length]);
  return `${out.slice(0, 4).join("")}-${out.slice(4).join("")}`;
}

// Hash a code with SHA-256 (matches the SQL side which receives the hex hash)
export async function hashRecoveryCode(code: string): Promise<string> {
  const enc = new TextEncoder().encode(code.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate 10 new recovery codes, store hashed versions server-side, return
// plaintext codes ONCE so the UI can show them to the user. They are never
// retrievable again.
export async function generateAndStoreRecoveryCodes(): Promise<string[]> {
  const plaintext = Array.from({ length: 10 }, makeRecoveryCode);
  const hashes = await Promise.all(plaintext.map(hashRecoveryCode));
  const { data, error } = await supabase.rpc("store_recovery_codes", { p_code_hashes: hashes });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string };
  if (!result.ok) throw new Error(result.error || "Could not store recovery codes");
  return plaintext;
}

// ── MFA factor lifecycle (uses Supabase's built-in TOTP) ───────────────────

export interface EnrollmentResult {
  factorId:  string;
  qrCode:    string;   // data:image/svg+xml;base64,...
  secret:    string;   // manual entry key
  uri:       string;   // otpauth:// URI (optional, for advanced clients)
}

// Begin TOTP enrollment. Returns QR/secret to display.
// User must then call verifyEnrollment() with the 6-digit code from their app.
export async function startMfaEnrollment(friendlyName = "DoT Authenticator"): Promise<EnrollmentResult> {
  // Remove any existing unverified factor first to keep things clean
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType:   "totp",
    friendlyName: `${friendlyName} ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrCode:   data.totp.qr_code,
    secret:   data.totp.secret,
    uri:      data.totp.uri,
  };
}

// Verify the 6-digit code to activate the factor and mark MFA enabled in our table.
export async function verifyEnrollment(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyErr) throw verifyErr;

  // Mark MFA enabled in our settings table
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    await supabase.from("user_security_settings").upsert({
      user_id:       userData.user.id,
      mfa_enabled:   true,
      mfa_factor_id: factorId,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "user_id" });
  }
}

// Used at login OR before a sensitive action — challenges the verified factor
// and verifies the 6-digit code. Elevates session to AAL2.
export async function challengeAndVerify(code: string): Promise<void> {
  const { data: factors, error: lErr } = await supabase.auth.mfa.listFactors();
  if (lErr) throw lErr;
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) throw new Error("No verified authenticator factor found.");

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (chErr) throw chErr;

  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId:    totp.id,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
}

// Remove the user's MFA factor entirely.
// Caller is responsible for verifying current code first (handled in UI).
export async function unenrollMfa(): Promise<void> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    await supabase.from("user_security_settings").upsert({
      user_id:       userData.user.id,
      mfa_enabled:   false,
      mfa_factor_id: null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "user_id" });
    await supabase.from("recovery_codes").delete().eq("user_id", userData.user.id);
  }
}

// ── Session assurance level helpers ────────────────────────────────────────

export async function getAal(): Promise<{ current: string; next: string }> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { current: data?.currentLevel ?? "aal1", next: data?.nextLevel ?? "aal1" };
}

export async function hasVerifiedMfaFactor(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return false;
  return (data?.totp ?? []).some((f) => f.status === "verified");
}

// ── Audit log helpers ──────────────────────────────────────────────────────

export async function logLoginEvent(email: string, event: string, details?: Record<string, unknown>) {
  try {
    await supabase.rpc("log_security_event", {
      p_table: "login_audit_logs",
      p_email: email.toLowerCase(),
      p_event_type: event,
      p_details: details ? (details as never) : null,
    });
  } catch { /* never let logging break the flow */ }
}

export async function logResetEvent(email: string, event: string, details?: Record<string, unknown>) {
  try {
    await supabase.rpc("log_security_event", {
      p_table: "password_reset_audit_logs",
      p_email: email.toLowerCase(),
      p_event_type: event,
      p_details: details ? (details as never) : null,
    });
  } catch { /* silent */ }
}

export async function checkLoginRateLimit(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data } = await supabase.rpc("check_login_rate_limit", { p_email: email.toLowerCase() });
    const r = data as { ok: boolean; error?: string };
    return r ?? { ok: true };
  } catch {
    return { ok: true };
  }
}

// ── Forgotten-password flow (recovery code) ────────────────────────────────

export async function verifyRecoveryCode(email: string, plaintextCode: string): Promise<boolean> {
  const hash = await hashRecoveryCode(plaintextCode);
  const { data, error } = await supabase.rpc("verify_and_consume_recovery_code", {
    p_email:     email.toLowerCase(),
    p_code_hash: hash,
  });
  if (error) return false;
  const r = data as { ok: boolean };
  return !!r?.ok;
}
