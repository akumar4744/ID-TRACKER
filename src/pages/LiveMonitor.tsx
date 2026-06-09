// File: src/pages/LiveMonitor.tsx
// UI REDESIGN ONLY — all logic, RPC calls, and WebRTC flows preserved exactly.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAdminViewer } from "../hooks/useAdminViewer";
import { useTheme } from "../lib/theme";

interface ActiveSession {
  session_id:     string;
  employee_id:    string;
  employee_name:  string;
  employee_email: string;
  display_type:   string | null;
  started_at:     string;
  viewer_id:      string | null;
  webrtc_offer:   string | null;
}

export default function LiveMonitor() {
  const [sessions,   setSessions]   = useState<ActiveSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const videoRef                    = useRef<HTMLVideoElement>(null);
  const viewer                      = useAdminViewer();
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const { T, theme }                = useTheme();
  const isLight                     = theme === "light";

  // ── Fetch active sessions via server-side RPC ──────────────────────────
  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_active_sessions");
    if (!error && data) setSessions(data as ActiveSession[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
    pollRef.current = setInterval(fetchSessions, 10_000);
    const ch = supabase.channel("admin-sessions-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "screen_share_sessions" }, fetchSessions)
      .subscribe();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      supabase.removeChannel(ch);
    };
  }, [fetchSessions]);

  // ── Attach stream ──────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && viewer.stream) {
      videoRef.current.srcObject = viewer.stream;
      videoRef.current.play().catch(console.error);
    }
    if (videoRef.current && !viewer.stream) videoRef.current.srcObject = null;
  }, [viewer.stream]);

  async function handleConnect(sessionId: string) {
    setSelectedId(sessionId);
    await viewer.connectToSession(sessionId);
  }
  async function handleDisconnect() {
    await viewer.disconnectFromSession();
    setSelectedId(null);
  }
  async function handleReconnect() {
    if (!selectedId) return;
    await viewer.connectToSession(selectedId);
  }

  function duration(startedAt: string): string {
    const diff = Date.now() - new Date(startedAt).getTime();
    const m    = Math.floor(diff / 60000);
    const s    = Math.floor((diff % 60000) / 1000);
    if (m < 60) return `${m}m ${s}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  const isConnected = viewer.status === "connected" || viewer.status === "connecting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
            Live Monitor
          </h2>
          <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
            Active employee screen-share sessions. Click Watch to connect.
          </p>
        </div>
        <button style={{ ...S.refreshBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textMuted }} onClick={fetchSessions}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Layout ── */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minHeight: 0 }}>

        {/* ── Left: session list ── */}
        <div style={{ ...S.sessionList, background: T.bgCard, border: `1px solid ${T.borderCard}`, boxShadow: T.shadowCard }}>
          <div style={{ ...S.listHeader, borderBottom: `1px solid ${T.dividerSolid}`, color: T.textSecondary }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={S.livePulse} />
              Active Sessions
            </span>
            <span style={S.sessionCount}>{sessions.length}</span>
          </div>

          {loading ? (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {[0,1].map((i) => (
                <div key={i} style={{
                  height: 80, borderRadius: 8,
                  background: isLight
                    ? `linear-gradient(90deg, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0.03) 75%)`
                    : `linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 75%)`,
                  backgroundSize: "400% 100%", animation: `shimmer 1.6s ease infinite ${i * 0.15}s`,
                }} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 12, padding: "36px 20px", textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: T.bgBtn,
                border: `1px solid ${T.borderBtn}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              }}>📭</div>
              <span style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                No employees are currently sharing their screen.
              </span>
            </div>
          ) : (
            sessions.map((sess) => {
              const isSelected    = selectedId === sess.session_id;
              const isBeingWatched = !!sess.viewer_id;

              return (
                <div key={sess.session_id} style={{
                  padding: "12px 14px",
                  borderBottom: `1px solid ${T.borderTableRow}`,
                  display: "flex", flexDirection: "column", gap: 10,
                  background: isSelected
                    ? (isLight
                        ? "linear-gradient(90deg, rgba(142,22,22,0.06), rgba(142,22,22,0.03))"
                        : "linear-gradient(90deg, rgba(142,22,22,0.08), rgba(142,22,22,0.04))")
                    : "transparent",
                  borderLeft: isSelected ? "2px solid rgba(142,22,22,0.55)" : "2px solid transparent",
                  transition: "all 0.18s ease",
                }}>
                  {/* Top row */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    {/* Live dot */}
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%", background: "#10b981",
                      flexShrink: 0, marginTop: 5, boxShadow: "0 0 8px rgba(16,185,129,0.6)",
                      animation: "pulseDot 2s ease-in-out infinite",
                    }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ color: T.textPrimary, fontSize: 12, fontWeight: 600,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {sess.employee_name}
                      </span>
                      <span style={{ color: T.textMuted, fontSize: 10,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {sess.employee_email}
                      </span>
                    </div>
                    {isBeingWatched && !isSelected && (
                      <span style={{
                        color: "#f59e0b", fontSize: 9,
                        background: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.25)",
                        borderRadius: 4, padding: "2px 6px", flexShrink: 0, fontWeight: 600,
                      }}>
                        👁 Watched
                      </span>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <MetaChip label="Display"  value={sess.display_type ?? "unknown"} />
                    <MetaChip label="Duration" value={duration(sess.started_at)}      />
                    <MetaChip label="Offer"    value={sess.webrtc_offer ? "✓ Ready" : "Pending"}
                      highlight={!!sess.webrtc_offer} />
                  </div>

                  {/* Action */}
                  <div>
                    {!isSelected ? (
                      <button style={S.watchBtn} onClick={() => handleConnect(sess.session_id)}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                            stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        Watch
                      </button>
                    ) : (
                      <button style={S.disconnectBtn} onClick={handleDisconnect}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right: viewer panel ── */}
        <div style={{ ...S.viewerPanel, background: T.bgCardAlt, border: `1px solid ${T.borderCard}`, boxShadow: T.shadowCard }}>
          {/* Idle */}
          {!isConnected && viewer.status === "idle" && (
            <div style={S.viewerEmpty}>
              <div style={{
                width: 64, height: 64, borderRadius: 18,
                background: "rgba(142,22,22,0.05)",
                border: "1px solid rgba(142,22,22,0.14)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
              }}>🖥️</div>
              <span style={{ color: T.textMuted, fontSize: 13, maxWidth: 280, lineHeight: 1.7, textAlign: "center" }}>
                Select an active session from the list to start watching.
              </span>
            </div>
          )}

          {/* Connecting */}
          {viewer.status === "connecting" && (
            <div style={S.viewerEmpty}>
              <div style={{
                width: 48, height: 48,
                border: "2px solid rgba(142,22,22,0.14)",
                borderTopColor: "rgba(142,22,22,0.75)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ color: T.textSecondary, fontSize: 13 }}>Connecting to employee stream…</span>
            </div>
          )}

          {/* Error / Disconnected */}
          {(viewer.status === "disconnected" || viewer.status === "error" || viewer.status === "unauthorized") && (
            <div style={S.viewerEmpty}>
              <div style={{
                width: 54, height: 54, borderRadius: 16,
                background: "rgba(244,63,94,0.08)",
                border: "1px solid rgba(244,63,94,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
              }}>
                {viewer.status === "unauthorized" ? "🚫" : "⚠️"}
              </div>
              <span style={{ color: "rgba(244,63,94,0.8)", fontSize: 13, maxWidth: 280,
                lineHeight: 1.7, textAlign: "center" }}>
                {viewer.errorMsg ?? "Stream ended."}
              </span>
              {selectedId && viewer.status !== "unauthorized" && (
                <button style={S.reconnectBtn} onClick={handleReconnect}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Reconnect
                </button>
              )}
            </div>
          )}

          {/* Connected: video */}
          {viewer.status === "connected" && (
            <>
              <video ref={videoRef} autoPlay muted playsInline style={S.video} />
              {selectedId && (() => {
                const sess = sessions.find((s) => s.session_id === selectedId);
                return sess ? (
                  <div style={{ ...S.metaBar, background: T.bgCardAlt, borderTop: `1px solid ${T.dividerSolid}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%", background: "#10b981",
                        boxShadow: "0 0 8px rgba(16,185,129,0.6)",
                        animation: "pulseDot 2s ease-in-out infinite",
                      }} />
                      <span style={{ color: "#10b981", fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>LIVE</span>
                    </div>
                    <span style={{ ...S.metaBarChip, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      {sess.employee_name}
                    </span>
                    <span style={{ ...S.metaBarChip, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}>🖥 {sess.display_type ?? "unknown"}</span>
                    <span style={{ ...S.metaBarChip, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}>⏱ {duration(sess.started_at)}</span>
                    <button style={S.stopBtn} onClick={handleDisconnect}>
                      ✕ Stop
                    </button>
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function MetaChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { T } = useTheme();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: T.bgBtn,
      border: `1px solid ${highlight ? "rgba(16,185,129,0.2)" : T.borderBtn}`,
      borderRadius: 5, padding: "2px 8px",
    }}>
      <span style={{ color: T.textTertiary, fontSize: 9, textTransform: "uppercase" }}>{label}</span>
      <span style={{ color: highlight ? "#10b981" : T.textSecondary, fontSize: 10, fontWeight: 500 }}>{value}</span>
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  refreshBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#4a526e", borderRadius: 8, padding: "7px 14px",
    fontSize: 12, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  sessionList: {
    width: 290, flexShrink: 0,
    background: "rgba(13,16,34,0.7)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12, overflow: "hidden",
    display: "flex", flexDirection: "column",
    backdropFilter: "blur(12px)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
  },
  listHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)",
    color: "#8892b0", fontSize: 10, fontWeight: 700,
    letterSpacing: 1, textTransform: "uppercase",
  },
  livePulse: {
    width: 7, height: 7, borderRadius: "50%", background: "#10b981",
    boxShadow: "0 0 8px rgba(16,185,129,0.5)",
    animation: "pulseDot 2s ease-in-out infinite",
    display: "inline-block",
  },
  sessionCount: {
    background: "rgba(142,22,22,0.10)", color: "#8e1616",
    border: "1px solid rgba(142,22,22,0.22)",
    borderRadius: 99, padding: "1px 8px", fontSize: 11,
  },
  watchBtn: {
    display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
    background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)",
    color: "#22d3ee", borderRadius: 7, padding: "6px 0",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease", width: "100%",
  },
  disconnectBtn: {
    display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
    background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.22)",
    color: "#f43f5e", borderRadius: 7, padding: "6px 0",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    width: "100%",
  },
  viewerPanel: {
    flex: 1,
    background: "rgba(8,10,20,0.8)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12, overflow: "hidden",
    display: "flex", flexDirection: "column",
    minHeight: 520, position: "relative",
    boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
    backdropFilter: "blur(12px)",
  },
  viewerEmpty: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: 16, padding: "2rem",
  },
  video: {
    width: "100%", flex: 1,
    background: "#000", display: "block",
    objectFit: "contain",
  },
  metaBar: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(8,10,20,0.9)",
  },
  metaBarChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 5, padding: "3px 9px",
    color: "#8892b0", fontSize: 10,
  },
  reconnectBtn: {
    display: "flex", alignItems: "center", gap: 7,
    background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.28)",
    color: "#8e1616", borderRadius: 8, padding: "8px 18px",
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  stopBtn: {
    background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)",
    color: "#f43f5e", borderRadius: 6, padding: "4px 12px",
    fontSize: 10, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto",
  },
};