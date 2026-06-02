// File: src/App.tsx

import { useEffect, useRef, useState } from "react";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import { OverlayGuide } from "./components/OverlayGuide";

import {
  getSession,
  getProfile,
  signOut,
  pingLastActive,
} from "./lib/auth";

import type { UserProfile } from "./lib/auth";
import { supabase } from "./lib/supabase";

type AppState =
  | "loading"
  | "login"
  | "admin"
  | "employee"
  | "revoked";

// ─── Overlay config — edit here to fine-tune spotlight ───────────────────────
// If #main-panel is found via selector, live DOM measurement is used.
// Otherwise falls back to FALLBACK_RECT (screenshot-estimated dimensions).
const OVERLAY_CONFIG = {
  targetSelector: "#main-panel",
  branding: "7dotitsolutions",
  padding: 22,
  borderRadius: 20,
  overlayOpacity: 0.84,
  overlayBlur: 4,
  // Fallback rect if #main-panel selector doesn't resolve
  // Based on screenshot: centered card, ~420px wide, ~490px tall
  fallbackRect: {
    top: 0,   // computed dynamically below
    left: 0,  // computed dynamically below
    width: 420,
    height: 490,
  },
} as const;

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ── Overlay visibility: shown on login screen only ────────────────────────
  // Set showOverlay to false to disable globally, or true to always show on login
  const [showOverlay, setShowOverlay] = useState(true);

  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const appStateRef   = useRef<AppState>("loading");

  async function bootstrap() {
    try {
      setAppState("loading");
      const session = await getSession();
      if (!session?.user) { setAppState("login"); return; }

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
        setShowOverlay(true);
      }
      if (event === "SIGNED_IN") {
        // Token refresh also fires SIGNED_IN — skip bootstrap if already authenticated
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
  }, []);

  async function handleLogout() {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    await signOut();
    setProfile(null);
    setAppState("login");
    setShowOverlay(true); // Re-show overlay on logout
  }

  // ── Determine if overlay should render ────────────────────────────────────
  // Only show on login screen, and only if showOverlay is true
  const overlayActive = showOverlay && appState === "login";

  // ── Fallback rect (centered in current viewport) ──────────────────────────
  const fallbackRect = {
    ...OVERLAY_CONFIG.fallbackRect,
    top: (window.innerHeight - OVERLAY_CONFIG.fallbackRect.height) / 2,
    left: (window.innerWidth - OVERLAY_CONFIG.fallbackRect.width) / 2,
  };

  return (
    <>
      {/* ── App screens ─────────────────────────────────────────────── */}
      {appState === "loading" && <Splash />}
      {appState === "revoked" && <RevokedScreen />}
      {appState === "login" && <LoginPage />}
      {appState === "admin" && profile && (
        <Dashboard onLogout={handleLogout} profile={profile} />
      )}
      {appState === "employee" && profile && (
        <EmployeeDashboard onLogout={handleLogout} profile={profile} />
      )}
      {appState !== "loading" && appState !== "login" &&
       appState !== "admin" && appState !== "employee" &&
       appState !== "revoked" && (
        <Splash error="Unexpected state. Please refresh." />
      )}

      {/* ── Global Overlay Guide — mounted above everything via portal ── */}
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

/* ── Cinematic Splash ─────────────────────────────────────────────────────── */
function Splash({ error }: { error?: string }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#05060d",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient orbs */}
      <div style={{
        position: "absolute", top: "30%", left: "50%",
        width: 400, height: 400,
        transform: "translate(-50%, -50%)",
        background: "radial-gradient(circle, rgba(124,108,248,0.08) 0%, transparent 70%)",
        borderRadius: "50%",
        pointerEvents: "none",
      }} />

      {/* Logo mark */}
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
          <span style={{
            color: "rgba(136,146,176,0.6)",
            fontSize: 12, letterSpacing: 0.5,
          }}>
            Authenticating…
          </span>
        </>
      )}

      {error && (
        <div style={{
          background: "rgba(244,63,94,0.06)",
          border: "1px solid rgba(244,63,94,0.2)",
          borderRadius: 10, padding: "12px 20px",
          color: "rgba(244,63,94,0.9)", fontSize: 13,
          textAlign: "center", maxWidth: 380,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Revoked Screen ─────────────────────────────────────────────────────── */
function RevokedScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#05060d",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16,
      position: "relative", overflow: "hidden",
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