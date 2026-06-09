// src/pages/RecoveryRequestsInbox.tsx
// Admin/owner inbox of pending emergency recovery requests.
// Approve  → generates one-time 15-min recovery token + URL to share with the user
// Reject   → marks request rejected

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

interface Request {
  id:          string;
  user_id:     string;
  email:       string;
  reason:      string;
  status:      string;
  created_at:  string;
  approved_at: string | null;
  rejected_at: string | null;
  used_at:     string | null;
  recovery_token:   string | null;
  token_expires_at: string | null;
}

export default function RecoveryRequestsInbox() {
  const { T } = useTheme();
  const [items,    setItems]    = useState<Request[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"pending" | "all">("pending");
  const [busy,     setBusy]     = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { url: string; expires: string }>>({});
  const [err,      setErr]      = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("emergency_recovery_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    if (data) setItems(data as Request[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function approve(req: Request) {
    setBusy(req.id); setErr("");
    try {
      const { data, error } = await supabase.rpc("approve_emergency_recovery", { p_request_id: req.id });
      if (error) throw error;
      const r = data as { ok: boolean; token?: string; expires_at?: string; error?: string };
      if (!r.ok) throw new Error(r.error || "Approval failed");

      // Build the recovery URL the user will visit
      const base = window.location.origin + window.location.pathname;
      const url = `${base}?recovery_token=${encodeURIComponent(r.token!)}`;
      setRevealed((prev) => ({ ...prev, [req.id]: { url, expires: r.expires_at! } }));
      await fetchItems();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(null);
    }
  }

  async function reject(req: Request) {
    if (!confirm(`Reject recovery request from ${req.email}?`)) return;
    setBusy(req.id); setErr("");
    try {
      const { error } = await supabase.rpc("reject_emergency_recovery", { p_request_id: req.id });
      if (error) throw error;
      await fetchItems();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setBusy(null);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard?.writeText(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: T.textPrimary }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
            Emergency Recovery Requests
          </h2>
          <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
            Review requests from users who lost both password and authenticator. Verify identity externally before approving.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["pending", "all"] as const).map((f) => (
            <button key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "rgba(142,22,22,0.14)" : T.bgBtn,
                border: `1px solid ${filter === f ? "rgba(142,22,22,0.28)" : T.borderBtn}`,
                color:  filter === f ? "#8e1616" : T.textSecondary,
                borderRadius: 7, padding: "7px 14px",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
              {f === "pending" ? "Pending" : "All"}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{
        background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
        color: "#f43f5e", borderRadius: 8, padding: "10px 14px", fontSize: 13,
      }}>⚠ {err}</div>}

      {loading ? (
        <div style={{ color: T.textMuted, padding: 30, textAlign: "center" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{
          background: T.bgInput, border: `1px solid ${T.borderInput}`,
          borderRadius: 10, padding: 40, textAlign: "center" as const,
          color: T.textMuted, fontSize: 13,
        }}>
          {filter === "pending" ? "No pending recovery requests." : "No recovery requests on record."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((req) => {
            const sc =
              req.status === "pending"  ? { c: "#f59e0b", bg: "rgba(245,158,11,0.08)", b: "rgba(245,158,11,0.22)" } :
              req.status === "approved" ? { c: "#10b981", bg: "rgba(16,185,129,0.08)", b: "rgba(16,185,129,0.22)" } :
              req.status === "rejected" ? { c: "#f43f5e", bg: "rgba(244,63,94,0.08)",  b: "rgba(244,63,94,0.22)"  } :
              req.status === "used"     ? { c: "#60a5fa", bg: "rgba(96,165,250,0.08)", b: "rgba(96,165,250,0.22)" } :
                                          { c: T.textMuted, bg: T.bgBtn, b: T.borderBtn };
            const reveal = revealed[req.id];
            return (
              <div key={req.id} style={{
                background: T.bgCard, border: `1px solid ${T.borderCard}`,
                borderRadius: 12, padding: "14px 18px",
                display: "flex", flexDirection: "column", gap: 10,
                boxShadow: T.shadowCard,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{req.email}</span>
                    <span style={{
                      background: sc.bg, color: sc.c, border: `1px solid ${sc.b}`,
                      borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                    }}>{req.status}</span>
                    <span style={{ color: T.textMuted, fontSize: 10 }}>
                      {new Date(req.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div style={{
                  background: T.bgInput, border: `1px solid ${T.borderInput}`,
                  borderRadius: 8, padding: "10px 12px", fontSize: 12,
                  color: T.textSecondary, lineHeight: 1.5,
                }}>
                  <span style={{ color: T.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}>
                    Reason
                  </span>
                  <div style={{ marginTop: 4 }}>{req.reason || "—"}</div>
                </div>

                {req.status === "pending" && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => reject(req)} disabled={busy === req.id}
                      style={{
                        background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
                        color: "#f43f5e", borderRadius: 7, padding: "7px 14px",
                        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}>
                      Reject
                    </button>
                    <button onClick={() => approve(req)} disabled={busy === req.id}
                      style={{
                        background: "linear-gradient(135deg, #10b981 0%, #047857 100%)", border: "none",
                        color: "#fff", borderRadius: 7, padding: "7px 16px",
                        fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}>
                      {busy === req.id ? "…" : "✓ Approve & Generate Link"}
                    </button>
                  </div>
                )}

                {reveal && (
                  <div style={{
                    background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.3)",
                    borderRadius: 10, padding: "12px 14px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ color: "#10b981", fontSize: 12, fontWeight: 700 }}>
                      ✓ One-time recovery link generated — expires {new Date(reveal.expires).toLocaleString()}
                    </div>
                    <div style={{ color: T.textMuted, fontSize: 11, lineHeight: 1.5 }}>
                      Share this link with the user through a verified out-of-band channel. The link is valid for 15 minutes,
                      can be used once, and will reset their MFA.
                    </div>
                    <code style={{
                      background: T.bgInput, border: `1px solid ${T.borderInput}`,
                      color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      padding: "8px 10px", borderRadius: 6, wordBreak: "break-all",
                    }}>{reveal.url}</code>
                    <button onClick={() => copyUrl(reveal.url)}
                      style={{
                        background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
                        color: T.textSecondary, borderRadius: 6, padding: "5px 10px",
                        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        alignSelf: "flex-start",
                      }}>
                      📋 Copy Link
                    </button>
                  </div>
                )}

                {req.status === "approved" && !reveal && (
                  <div style={{ color: T.textMuted, fontSize: 11, fontStyle: "italic" }}>
                    Recovery link previously issued. Token is one-time and not retrievable.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
