// File: src/App.tsx

import { useEffect, useRef, useState } from "react";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import PasswordResetPage from "./pages/PasswordResetPage";
import { EmergencyRecoveryRequest, EmergencyRecoveryClaim } from "./pages/EmergencyRecoveryPages";
import { OverlayGuide } from "./components/OverlayGuide";

import {
  getSession,
  getProfile,
  signOut,
  pingLastActive,
} from "./lib/auth";
import { getAal, hasVerifiedMfaFactor } from "./lib/mfa";

import type { UserProfile } from "./lib/auth";
import { supabase } from "./lib/supabase";

type AppState =
  | "loading"
  | "login"
  | "admin"
  | "employee"
  | "revoked"
  | "password_reset"
  | "emergency_request"
  | "emergency_claim";

const OVERLAY_CONFIG = {
  targetSelector: "#main-panel",
  branding: "7dotitsolutions",
  padding: 22,
  borderRadius: 20,
  overlayOpacity: 0.84,
  overlayBlur: 4,
  fallbackRect: { top: 0, left: 0, width: 420, height: 490 },
} as const;

// ── Detect ?recovery_token=... from URL ────────────────────────────────────
function readRecoveryToken(): string | null {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("recovery_token");
    return t && t.length >= 32 ? t : null;
  } catch { return null; }
}

function clearRecoveryToken() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("recovery_token");
    window.history.replaceState({}, "", url.toString());
  } catch { /* silent */ }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recoveryToken] = useState<string | null>(readRecoveryToken());
  // Login overlay/blur disabled — user wants a clean direct login screen
  const [showOverlay, setShowOverlay] = useState(false);

  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const appStateRef   = useRef<AppState>("loading");

  async function bootstrap() {
    try {
      setAppState("loading");

      // Recovery token in URL takes priority — show claim page (signed-out flow)
      if (recoveryToken) {
        // Make sure we're signed out before claim
        await signOut();
        setAppState("emergency_claim");
        return;
      }

      const session = await getSession();
      if (!session?.user) { setAppState("login"); return; }

      // CRITICAL: enforce MFA. If user has a verified factor and current AAL is
      // aal1 (not yet elevated this session), force them back to login to verify.
      try {
        const aal = await getAal();
        const hasFactor = await hasVerifiedMfaFactor();
        if (hasFactor && aal.current !== "aal2") {
          // Block dashboard access — re-display login (MFA stage will trigger after re-entry)
          await signOut();
          setAppState("login");
          return;
        }
      } catch { /* if MFA API errors, proceed cautiously to profile load */ }

      let prof = await getProfile();
      if (!prof) {
        await new Promise((r) => setTimeout(r, 300));
        prof = await getProfile();
      }
      if (!prof) { await signOut(); setAppState("login"); return; }
      if (prof.status === "revoked") { await signOut(); setAppState("revoked"); return; }

      setProfile(prof);
      setShowOverlay(false);
      const nextState: AppState = prof.role === "admin" ? "admin" : "employee";
      appStateRef.current = nextState;
      setAppState(nextState);

      pingLastActive();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(pingLastActive, 60000);
      subscribeToProfile(prof.id);

    } catch (err) {
      console.error("BOOTSTRAP ERROR:", err);
      setProfile(null);
      setAppState("login");
    }
  }

  function subscribeToProfile(userId: string) {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    const channel = supabase
      .channel(`profile-${userId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "profiles",
        filter: `id=eq.${userId}`,
      }, async (payload) => {
        const updated = payload.new as UserProfile;
        if (updated.status === "revoked") {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          supabase.removeChannel(channel);
          await signOut();
          setProfile(null);
          setAppState("revoked");
        }
      })
      .subscribe();
    realtimeRef.current = channel;
  }

  useEffect(() => {
    bootstrap();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        appStateRef.current = "login";
        setProfile(null);
        setAppState("login");
        setShowOverlay(false);
      }
      if (event === "SIGNED_IN") {
        // LoginPage drives the multi-step flow (credentials → MFA → onLogin).
        // If we're still on the login screen, do NOT bootstrap — that would
        // race the MFA stage and bounce the user out (the bootstrap MFA guard
        // would see aal1 + factor and sign them straight back to login).
        // LoginPage explicitly calls onLogin() (which triggers bootstrap) after
        // MFA verification is complete.
        if (appStateRef.current === "login") return;
        if (appStateRef.current !== "admin" && appStateRef.current !== "employee") {
          bootstrap();
        }
      }
    });
    return () => {
      subscription.unsubscribe();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    await signOut();
    setProfile(null);
    setAppState("login");
    setShowOverlay(false);
  }

  const overlayActive = showOverlay && appState === "login";
  const fallbackRect = {
    ...OVERLAY_CONFIG.fallbackRect,
    top: (window.innerHeight - OVERLAY_CONFIG.fallbackRect.height) / 2,
    left: (window.innerWidth - OVERLAY_CONFIG.fallbackRect.width) / 2,
  };

  return (
    <>
      {appState === "loading" && <Splash />}
      {appState === "revoked" && <RevokedScreen />}

      {appState === "login" && (
        <LoginPage
          onLogin={() => bootstrap()}
          onForgotPassword={() => setAppState("password_reset")}
          onEmergencyRecovery={() => setAppState("emergency_request")}
        />
      )}

      {appState === "password_reset" && (
        <PasswordResetPage
          onBack={() => setAppState("login")}
          onDone={() => setAppState("login")}
        />
      )}

      {appState === "emergency_request" && (
        <EmergencyRecoveryRequest onBack={() => setAppState("login")} />
      )}

      {appState === "emergency_claim" && recoveryToken && (
        <EmergencyRecoveryClaim
          token={recoveryToken}
          onDone={() => { clearRecoveryToken(); setAppState("login"); }}
        />
      )}

      {appState === "admin" && profile && (
        <Dashboard onLogout={handleLogout} profile={profile} />
      )}
      {appState === "employee" && profile && (
        <EmployeeDashboard onLogout={handleLogout} profile={profile} />
      )}

      <OverlayGuide
        targetSelector={OVERLAY_CONFIG.targetSelector}
        rect={fallbackRect}
        padding={OVERLAY_CONFIG.padding}
        borderRadius={OVERLAY_CONFIG.borderRadius}
        branding={OVERLAY_CONFIG.branding}
        overlayOpacity={OVERLAY_CONFIG.overlayOpacity}
        overlayBlur={OVERLAY_CONFIG.overlayBlur}
        visible={overlayActive}
        disableOutsideClicks={true}
        lockAllInteractions={false}
        dismissible={true}
        escapeKeyDismissible={false}
        onDismiss={() => setShowOverlay(false)}
        instruction={{
          stepLabel: "Step 1 of 1",
          title: "Sign in to your workspace",
          description: "Enter your credentials to access the ID Tracker Control Center. Your session is encrypted and secure.",
          footerHint: "Secure enterprise authentication",
          tooltipPosition: "right",
        }}
      />
    </>
  );
}

function Splash({ error }: { error?: string }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#05060d",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 20, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "30%", left: "50%",
        width: 400, height: 400, transform: "translate(-50%, -50%)",
        background: "radial-gradient(circle, rgba(124,108,248,0.08) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none",
      }} />
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: "linear-gradient(135deg, rgba(124,108,248,0.2) 0%, rgba(124,108,248,0.05) 100%)",
        border: "1px solid rgba(124,108,248,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 32px rgba(124,108,248,0.2)",
        animation: "glowPulse 3s ease-in-out infinite",
        marginBottom: 8,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5 4.5-1.35 8-6.25 8-11.5V6L12 2z"
            fill="rgba(124,108,248,0.3)" stroke="rgba(124,108,248,0.8)" strokeWidth="1.5" />
          <path d="M9 12l2 2 4-4" stroke="rgba(165,168,255,0.9)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!error && (
        <>
          <div style={{
            width: 24, height: 24,
            border: "2px solid rgba(124,108,248,0.15)",
            borderTopColor: "rgba(124,108,248,0.8)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ color: "rgba(136,146,176,0.6)", fontSize: 12, letterSpacing: 0.5 }}>
            Authenticating…
          </span>
        </>
      )}
      {error && (
        <div style={{
          background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)",
          borderRadius: 10, padding: "12px 20px",
          color: "rgba(244,63,94,0.9)", fontSize: 13,
          textAlign: "center", maxWidth: 380,
        }}>{error}</div>
      )}
    </div>
  );
}

function RevokedScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "#05060d",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "30%", left: "50%",
        width: 300, height: 300, transform: "translate(-50%, -50%)",
        background: "radial-gradient(circle, rgba(244,63,94,0.06) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none",
      }} />
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: "rgba(244,63,94,0.08)",
        border: "1px solid rgba(244,63,94,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22,
      }}>🚫</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#eef0f8", fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
          Access Revoked
        </div>
        <div style={{ color: "#8892b0", fontSize: 13, maxWidth: 300, lineHeight: 1.7 }}>
          Your account access has been revoked. Please contact your administrator.
        </div>
      </div>
    </div>
  );
}
