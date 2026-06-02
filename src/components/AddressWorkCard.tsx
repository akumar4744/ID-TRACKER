// File: src/components/AddressWorkCard.tsx
// MERGED: Doc3 fixes (TruncatedField, auto-fill fingerprint, 48h copy) + Doc4 design & logic improvements

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useValidation } from "../hooks/useValidation";

interface AddressWorkCardProps {
  assignmentId:   string;
  addressText:    string;
  category:       string | null;
  status:         string;
  assignedAt:     string;
  employeeName:   string | null;
  onHide:         (id: string) => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
  updatingId:     string | null;
  animDelay?:     number;
}

// ── Truncated text with full-value copy (from Doc3) ───────────────────────────

function TruncatedField({
  value,
  maxWidth = 260,
  style,
}: {
  value: string;
  maxWidth?: number;
  style?: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, ...style }}>
      <span
        title={value}
        style={{
          maxWidth,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          display:      "block",
          fontSize:     "inherit",
          color:        "inherit",
          fontWeight:   "inherit",
        }}
      >
        {value}
      </span>
      <button
        onClick={handleCopy}
        style={{
          background:   copied ? "rgba(16,185,129,0.12)"  : "rgba(255,255,255,0.03)",
          border:       `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 6,
          color:        copied ? "#10b981" : "#8892b0",
          fontSize:     10,
          padding:      "3px 8px",
          cursor:       "pointer",
          fontFamily:   "inherit",
          flexShrink:   0,
          transition:   "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          whiteSpace:   "nowrap",
          display:      "inline-flex",
          alignItems:   "center",
          gap:          4,
        }}
      >
        {copied ? "✓ Copied" : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span style={{ fontSize: 9 }}>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

// ── Standalone copy button for inputs ────────────────────────────────────────

function CopyBtn({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity  = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* silent */ }
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy: ${value}`}
      style={{
        background:   copied ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
        border:       `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 6,
        color:        copied ? "#10b981" : "#8892b0",
        fontSize:     10,
        padding:      "3px 8px",
        cursor:       "pointer",
        fontFamily:   "inherit",
        flexShrink:   0,
        transition:   "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        whiteSpace:   "nowrap" as const,
        display:      "inline-flex",
        alignItems:   "center",
        gap:          4,
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.background   = "rgba(255,255,255,0.06)";
          e.currentTarget.style.borderColor  = "rgba(255,255,255,0.15)";
          e.currentTarget.style.color        = "#eef0f8";
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background   = "rgba(255,255,255,0.03)";
          e.currentTarget.style.borderColor  = "rgba(255,255,255,0.08)";
          e.currentTarget.style.color        = "#8892b0";
        }
      }}
    >
      {copied ? "✓ Copied" : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span style={{ fontSize: 9 }}>{label}</span>
        </>
      )}
    </button>
  );
}

// ── Validation result box ─────────────────────────────────────────────────────

function ValidationResultBox({
  result,
}: {
  result: ReturnType<typeof useValidation>["result"];
}) {
  if (result.status === "idle") return null;

  const config: Record<string, { bg: string; border: string; color: string; label: string }> = {
    checking: { bg: "rgba(124,108,248,0.06)",  border: "rgba(124,108,248,0.2)",  color: "#9d91ff", label: "Checking system bindings…" },
    valid:    { bg: "rgba(16,185,129,0.06)",   border: "rgba(16,185,129,0.2)",   color: "#10b981", label: "Valid IP & Fingerprint combination — Ready to confirm" },
    blocked:  { bg: "rgba(244,63,94,0.06)",    border: "rgba(244,63,94,0.2)",    color: "#f43f5e", label: "IP in Active Cooldown" },
    mismatch: { bg: "rgba(245,158,11,0.06)",   border: "rgba(245,158,11,0.2)",   color: "#f59e0b", label: "Fingerprint Conflict" },
    error:    { bg: "rgba(244,63,94,0.04)",    border: "rgba(244,63,94,0.15)",   color: "#f43f5e", label: "Verification System Error" },
  };
  const c = config[result.status] ?? config.error;

  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 10, padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 10,
      animation: "fadeIn 0.2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: c.color, fontSize: 14, display: "flex", alignItems: "center" }}>
          {result.status === "checking" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
            </svg>
          ) : result.status === "valid" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : result.status === "blocked" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
            </svg>
          ) : result.status === "mismatch" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
            </svg>
          )}
        </span>
        <span style={{ color: c.color, fontSize: 12.5, fontWeight: 700 }}>{c.label}</span>
      </div>

      {result.message && result.status !== "checking" && (
        <span style={{ color: "#8892b0", fontSize: 11.5, lineHeight: 1.5 }}>{result.message}</span>
      )}

      {/* Blocked: countdown */}
      {result.status === "blocked" && result.remaining && (
        <div style={{
          background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.15)",
          borderRadius: 8, padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <span style={{ color: "#8892b0", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.8, fontWeight: 600 }}>
            Can be used after (48h cooldown)
          </span>
          <span style={{ color: "#f43f5e", fontSize: 18, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            {result.remaining.hours}h {result.remaining.minutes}m {result.remaining.seconds}s
          </span>
          {result.cooldown_ends_at && (
            <span style={{ color: "#4a526e", fontSize: 10, fontWeight: 500 }}>
              Unlocks: {new Date(result.cooldown_ends_at).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Blocked: show known fingerprint for auto-fill reference */}
      {result.status === "blocked" && result.known_fingerprint && (
        <div style={{
          background: "rgba(244,63,94,0.04)", border: "1px solid rgba(244,63,94,0.12)",
          borderRadius: 8, padding: "8px 12px",
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Bound fingerprint:</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
            <code
              title={result.known_fingerprint}
              style={{
                color: "#f43f5e", fontSize: 11.5,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0, flex: 1,
              }}
            >
              {result.known_fingerprint}
            </code>
            <CopyBtn value={result.known_fingerprint} />
          </div>
        </div>
      )}

      {/* Mismatch: expected fingerprint */}
      {result.status === "mismatch" && result.expected_fingerprint && (
        <div style={{
          background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)",
          borderRadius: 8, padding: "8px 12px",
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Bound fingerprint:</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
            <code
              title={result.expected_fingerprint}
              style={{
                color: "#f59e0b", fontSize: 11.5,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0, flex: 1,
              }}
            >
              {result.expected_fingerprint}
            </code>
            <CopyBtn value={result.expected_fingerprint} />
          </div>
        </div>
      )}

      {/* Valid: recalled fingerprint */}
      {result.status === "valid" && result.known_fingerprint && (
        <div style={{
          background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)",
          borderRadius: 8, padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Recalled fingerprint:</span>
            <code
              title={result.known_fingerprint}
              style={{
                color: "#10b981", fontSize: 11.5,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {result.known_fingerprint}
            </code>
          </div>
          <CopyBtn value={result.known_fingerprint} />
        </div>
      )}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function AddressWorkCard({
  assignmentId,
  addressText,
  category,
  status,
  assignedAt,
  employeeName,
  onHide,
  onStatusChange,
  updatingId,
  animDelay = 0,
}: AddressWorkCardProps) {
  const [expanded,    setExpanded]    = useState(false);
  const [uniqueId,    setUniqueId]    = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [confirming,  setConfirming]  = useState(false);
  const [confirmMsg,  setConfirmMsg]  = useState("");
  const [confirmErr,  setConfirmErr]  = useState("");

  // Prevent double-confirm
  const confirmingRef = useRef(false);

  const validation = useValidation();

  // Reset validation when card collapses
  useEffect(() => {
    if (!expanded) {
      validation.reset();
      setUniqueId("");
      setFingerprint("");
      setConfirmMsg("");
      setConfirmErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Auto-fill fingerprint from known_fingerprint — works for ALL statuses
  // including blocked (key fix). Omitting `fingerprint` from deps intentionally
  // so a stale closure never blocks the one-time fill.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const kfp = validation.result.known_fingerprint;
    if (kfp && !fingerprint) {
      setFingerprint(kfp);
    }
  }, [validation.result.known_fingerprint]);

  // ── Input handlers ────────────────────────────────────────────────────────

  // FIX: validate whenever uniqueId has a value, regardless of fingerprint
  function handleUidChange(val: string) {
    setUniqueId(val);
    setConfirmMsg(""); setConfirmErr("");
    if (val.trim()) {
      validation.validate(val, fingerprint, assignmentId);
    } else {
      validation.reset();
    }
  }

  // FIX: validate whenever uniqueId already has a value
  function handleFpChange(val: string) {
    setFingerprint(val);
    setConfirmMsg(""); setConfirmErr("");
    if (uniqueId.trim()) {
      validation.validate(uniqueId, val, assignmentId);
    } else {
      validation.reset();
    }
  }

  // ── Confirm / OK — writes ALL data in one atomic RPC call ───────────────
  async function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmingRef.current || validation.result.status !== "valid") return;
    if (!uniqueId.trim() || !fingerprint.trim()) {
      setConfirmErr("Enter both Unique ID and fingerprint before confirming.");
      return;
    }
    confirmingRef.current = true;
    setConfirming(true); setConfirmMsg(""); setConfirmErr("");

    try {
      // Single call: saves unique_id + fingerprint + address + cooldown timestamp
      // into records (keyed by assignmentId) and fingerprint_bindings atomically.
      const { data, error: rpcErr } = await supabase.rpc("confirm_identity_submission", {
        p_unique_id:     uniqueId.trim(),
        p_fingerprint:   fingerprint.trim(),
        p_assignment_id: assignmentId,
      });
      if (rpcErr) throw rpcErr;

      const result = data as { ok: boolean; error?: string; address?: string };
      if (!result.ok) throw new Error(result.error ?? "Submission failed");

      setConfirmMsg("✓ Saved — IP, fingerprint & address linked. 48-hour cooldown started.");
      setUniqueId("");
      setFingerprint("");
      validation.reset();
    } catch (err: unknown) {
      setConfirmErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setConfirming(false);
      confirmingRef.current = false;
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const statusStyle: Record<string, { bg: string; text: string; border: string }> = {
    Pending:   { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b", border: "rgba(245,158,11,0.22)" },
    Completed: { bg: "rgba(16,185,129,0.1)",  text: "#10b981", border: "rgba(16,185,129,0.22)" },
    Failed:    { bg: "rgba(244,63,94,0.1)",   text: "#f43f5e", border: "rgba(244,63,94,0.22)"  },
  };
  const sc = statusStyle[status] ?? {
    bg: "rgba(255,255,255,0.03)", text: "#8892b0", border: "rgba(255,255,255,0.08)",
  };

  const isUpdating = updatingId === assignmentId;
  const canConfirm = validation.result.status === "valid" && uniqueId.trim() && fingerprint.trim();

  return (
    <div style={{
      background:     expanded ? "rgba(124,108,248,0.02)" : "rgba(13,16,34,0.65)",
      border:         `1px solid ${expanded ? "rgba(124,108,248,0.3)" : "rgba(255,255,255,0.06)"}`,
      borderLeft:     `3px solid ${sc.border.replace("rgba", "rgb")}`,
      borderRadius:   14,
      overflow:       "hidden",
      animation:      `fadeUp 0.3s ease ${animDelay}s both`,
      transition:     "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      backdropFilter: "blur(16px) saturate(1.5)",
      boxShadow:      expanded ? "0 4px 20px rgba(124,108,248,0.08)" : "0 4px 12px rgba(0,0,0,0.15)",
    }}>

      {/* ── Header (collapsed) ── */}
      <div
        style={{
          display: "flex", alignItems: "center",
          padding: "16px 20px", cursor: "pointer", gap: 12,
          userSelect: "none" as const,
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          {/* TruncatedField for address — handles long addresses gracefully */}
          <div onClick={(e) => e.stopPropagation()}>
            <TruncatedField
              value={addressText}
              maxWidth={380}
              style={{ color: "#eef0f8", fontSize: 13.5, fontWeight: 600, letterSpacing: 0.1 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            {employeeName && (
              <span style={{ color: "#7c6cf8", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {employeeName}
              </span>
            )}
            {category && (
              <span style={{ color: "#8892b0", fontSize: 11 }}>
                <span style={{ color: "#4a526e", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginRight: 4 }}>Category:</span>
                {category}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{
            background: sc.bg, color: sc.text,
            border: `1px solid ${sc.border}`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
          }}>
            {status}
          </span>

          {/* Validation quick-dot (collapsed only) */}
          {validation.result.status !== "idle" && !expanded && (
            <span style={{
              width: 7, height: 7, borderRadius: "50%", display: "inline-block",
              background:
                validation.result.status === "valid"    ? "#10b981" :
                validation.result.status === "blocked"  ? "#f43f5e" :
                validation.result.status === "mismatch" ? "#f59e0b" : "#7c6cf8",
              boxShadow: `0 0 8px ${
                validation.result.status === "valid"    ? "#10b981" :
                validation.result.status === "blocked"  ? "#f43f5e" :
                validation.result.status === "mismatch" ? "#f59e0b" : "#7c6cf8"
              }`,
              animation: "pulseDot 1.4s infinite ease-in-out",
            }} />
          )}

          {/* Frontend-only hide (does NOT delete) */}
          <button
            onClick={(e) => { e.stopPropagation(); onHide(assignmentId); }}
            title="Hide from view (does not delete)"
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 6, color: "#8892b0",
              fontSize: 10, padding: "4px 8px",
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(244,63,94,0.3)";
              e.currentTarget.style.color       = "#f43f5e";
              e.currentTarget.style.background  = "rgba(244,63,94,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color       = "#8892b0";
              e.currentTarget.style.background  = "none";
            }}
          >
            ✕
          </button>

          <span style={{
            color: "#4a526e", fontSize: 14, display: "inline-flex",
            transform:  expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{
          padding: "0 20px 20px",
          display: "flex", flexDirection: "column", gap: 16,
          animation: "slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -20px" }} />

          {/* Validation inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{
              color: "#7c6cf8", fontSize: 10, fontWeight: 600,
              letterSpacing: 1, textTransform: "uppercase" as const,
            }}>
              Identity Verification System
            </span>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px" }}>
                <label style={inputLabel}>Unique ID / IP Address</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    style={taskInput}
                    value={uniqueId}
                    onChange={(e) => handleUidChange(e.target.value)}
                    placeholder="e.g. 192.168.1.1"
                    autoComplete="off"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                      e.currentTarget.style.boxShadow   = "0 0 8px rgba(124,108,248,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.boxShadow   = "none";
                    }}
                  />
                  {uniqueId && <CopyBtn value={uniqueId} label="IP" />}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px" }}>
                <label style={inputLabel}>Device Fingerprint</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    style={{
                      ...taskInput,
                      borderColor: validation.result.known_fingerprint
                        ? "rgba(124,108,248,0.3)"
                        : "rgba(255,255,255,0.08)",
                    }}
                    value={fingerprint}
                    onChange={(e) => handleFpChange(e.target.value)}
                    placeholder="e.g. FP-A4B2C"
                    autoComplete="off"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                      e.currentTarget.style.boxShadow   = "0 0 8px rgba(124,108,248,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = validation.result.known_fingerprint
                        ? "rgba(124,108,248,0.3)"
                        : "rgba(255,255,255,0.08)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  {fingerprint && <CopyBtn value={fingerprint} label="fingerprint" />}
                </div>
              </div>
            </div>

            <ValidationResultBox result={validation.result} />

            {/* OK button — only shown when valid */}
            {validation.result.status === "valid" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  disabled={!canConfirm || confirming}
                  onClick={handleConfirm}
                  style={{
                    background: !canConfirm || confirming
                      ? "rgba(16,185,129,0.15)"
                      : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    border:     "none",
                    color:      canConfirm && !confirming ? "#fff" : "#4a526e",
                    borderRadius: 8, padding: "9px 18px",
                    fontSize: 12.5, fontWeight: 600,
                    cursor:   canConfirm && !confirming ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    transition: "all 0.2s ease",
                    boxShadow:  canConfirm && !confirming ? "0 4px 15px rgba(16,185,129,0.3)" : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (canConfirm && !confirming) e.currentTarget.style.opacity = "0.9";
                  }}
                  onMouseLeave={(e) => {
                    if (canConfirm && !confirming) e.currentTarget.style.opacity = "1";
                  }}
                >
                  {confirming ? "Saving Record..." : "✓ OK — Save & Start 48h Cooldown"}
                </button>
                {confirmMsg && (
                  <span style={{ color: "#10b981", fontSize: 12, fontWeight: 500, animation: "fadeIn 0.2s ease" }}>
                    {confirmMsg}
                  </span>
                )}
                {confirmErr && (
                  <span style={{ color: "#f43f5e", fontSize: 12, fontWeight: 500, animation: "fadeIn 0.2s ease" }}>
                    ⚠ {confirmErr}
                  </span>
                )}
              </div>
            )}

            {/* Show errors/success when not in valid state */}
            {validation.result.status !== "valid" && (confirmMsg || confirmErr) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "fadeIn 0.2s ease" }}>
                {confirmMsg && (
                  <span style={{ color: "#10b981", fontSize: 12, fontWeight: 500 }}>{confirmMsg}</span>
                )}
                {confirmErr && (
                  <span style={{ color: "#f43f5e", fontSize: 12, fontWeight: 500 }}>⚠ {confirmErr}</span>
                )}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -20px" }} />

          {/* Meta */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            <MetaPill label="Assigned Date" value={new Date(assignedAt).toLocaleString()} />
            {employeeName && <MetaPill label="Employee assigned" value={employeeName} />}
          </div>

          {/* Status update */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const, marginTop: 4 }}>
            <span style={{ color: "#8892b0", fontSize: 11, fontWeight: 500, letterSpacing: 0.3 }}>
              Override Status:
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {["Pending", "Completed", "Failed"]
                .filter((s) => s !== status)
                .map((s) => {
                  const c = statusStyle[s] ?? statusStyle.Pending;
                  return (
                    <button
                      key={s}
                      disabled={isUpdating}
                      onClick={() => onStatusChange(assignmentId, s)}
                      style={
                        isUpdating
                          ? {
                              background: "rgba(255,255,255,0.02)",
                              border:     "1px solid rgba(255,255,255,0.06)",
                              color:      "#2d3450",
                              borderRadius: 6, padding: "5px 12px",
                              fontSize: 11, cursor: "not-allowed",
                              fontFamily: "inherit", fontWeight: 500,
                            }
                          : {
                              background: c.bg,
                              border:     `1px solid ${c.border}`,
                              color:      c.text,
                              borderRadius: 6, padding: "5px 12px",
                              fontSize: 11, fontWeight: 600,
                              cursor: "pointer", fontFamily: "inherit",
                              transition: "all 0.15s ease",
                            }
                      }
                      onMouseEnter={(e) => {
                        if (!isUpdating)
                          e.currentTarget.style.background = c.border.replace("0.22", "0.15").replace("0.2", "0.15");
                      }}
                      onMouseLeave={(e) => {
                        if (!isUpdating)
                          e.currentTarget.style.background = c.bg;
                      }}
                    >
                      {isUpdating ? "…" : s}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 6, padding: "6px 12px",
    }}>
      <span style={{ color: "#4a526e", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ color: "#8892b0", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

const inputLabel: React.CSSProperties = {
  color:         "#8892b0",
  fontSize:      10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  fontWeight:    600,
};

const taskInput: React.CSSProperties = {
  flex:       1,
  background: "rgba(8,10,20,0.6)",
  border:     "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, color: "#eef0f8", fontSize: 12.5,
  padding:    "9px 12px", outline: "none",
  fontFamily: "inherit", minWidth: 0,
  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
};