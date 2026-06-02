// File: src/components/RecordsTable.tsx
// FIX: InlineValidationPanel uses ADMIN_ASSIGNMENT_ID constant from useValidation.
// ADDED: Frontend-only hide/restore for record rows. Never touches DB.
// All other logic unchanged.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useValidation, ADMIN_ASSIGNMENT_ID } from "../hooks/useValidation";
import { useTheme } from "../lib/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  allowed:               boolean;
  reason:                string;
  message:               string;
  remaining?:            { hours: number; minutes: number; seconds: number };
  cooldown_ends_at?:     string;
  known_fingerprint?:    string | null;
  expected_fingerprint?: string;
  fingerprint_match?:    boolean;
  used_at?:              string;
}

interface DBRecord {
  id:           string;
  address:      string;
  unique_id:    string;
  fingerprint:  string;
  status:       string;
  created_at:   string;
  last_used_at: string;
  used_at:      string | null;
  check_status: string | null;
  check_result: CheckResult | null;
}

interface RowState {
  checking:   boolean;
  activating: boolean;
  error:      string;
}

interface RecordsTableProps {
  refreshTrigger: number;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const { T } = useTheme();
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!value.trim()) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.opacity  = "0";
        document.body.appendChild(el);
        el.focus(); el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* silent */ }
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy ${label}`}
      style={{
        background:    copied ? "rgba(16,185,129,0.12)" : T.bgBtn,
        border:        `1px solid ${copied ? "rgba(16,185,129,0.3)" : T.borderBtn}`,
        borderRadius:  6,
        color:         copied ? "#10b981" : T.textMuted,
        fontSize:      9,
        fontWeight:    700,
        padding:       "3px 8px",
        cursor:        "pointer",
        fontFamily:    "inherit",
        transition:    "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        flexShrink:    0,
        letterSpacing: 0.3,
        marginLeft:    4,
        display:       "inline-flex",
        alignItems:    "center",
        gap:           4,
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.background = T.bgBtnHover;
          e.currentTarget.style.borderColor = T.borderBtn;
          e.currentTarget.style.color = T.textPrimary;
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background = T.bgBtn;
          e.currentTarget.style.borderColor = T.borderBtn;
          e.currentTarget.style.color = T.textMuted;
        }
      }}
    >
      {copied ? "✓ Copied" : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </>
      )}
    </button>
  );
}

// ── CooldownTimer ─────────────────────────────────────────────────────────────

function CooldownTimer({ endsAt }: { endsAt: string }) {
  function calc() {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return { h: 0, m: 0, s: 0, expired: true };
    const sec = Math.floor(diff / 1000);
    return { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60), s: sec % 60, expired: false };
  }
  const [t, setT] = useState(calc);
  useEffect(() => {
    if (t.expired) return;
    const id = setInterval(() => {
      const n = calc(); setT(n);
      if (n.expired) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (t.expired) {
    return (
      <span style={{ color: "#10b981", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
        ✓ Cooldown expired — safe to reuse.
      </span>
    );
  }
  return (
    <div style={S.timerBox}>
      <span style={S.timerLabel}>⏱ Cooldown Countdown:</span>
      <span style={S.timerValue}>
        {String(t.h).padStart(2,"0")}h&nbsp;
        {String(t.m).padStart(2,"0")}m&nbsp;
        {String(t.s).padStart(2,"0")}s
      </span>
      <span style={S.timerExpiry}>Expires: {new Date(endsAt).toLocaleString()}</span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWithin48Hours(isoTimestamp: string | null | undefined): boolean {
  if (!isoTimestamp) return false;
  return Date.now() - new Date(isoTimestamp).getTime() < 48 * 60 * 60 * 1000;
}

function deriveCheckStatus(result: CheckResult, rowUsedAt: string | null): string {
  const usedAt = result.used_at ?? rowUsedAt;
  if (isWithin48Hours(usedAt)) return "blocked";
  if (!result.allowed) {
    return result.reason === "FINGERPRINT_MISMATCH" ? "mismatch" : "blocked";
  }
  return "valid";
}

function computeRemaining(
  usedAt: string
): { hours: number; minutes: number; seconds: number } | undefined {
  const endsAt = new Date(usedAt).getTime() + 48 * 60 * 60 * 1000;
  const diff   = endsAt - Date.now();
  if (diff <= 0) return undefined;
  const sec = Math.floor(diff / 1000);
  return { hours: Math.floor(sec / 3600), minutes: Math.floor((sec % 3600) / 60), seconds: sec % 60 };
}

function getRowHighlight(checkStatus: string | null, isExpanded: boolean) {
  if (isExpanded) {
    return {
      row: { background: "rgba(124,108,248,0.03)", borderLeft: "3px solid #7c6cf8" },
      resultRow: { background: "rgba(124,108,248,0.03)", borderLeft: "3px solid #7c6cf8" }
    };
  }
  if (!checkStatus) return { row: {}, resultRow: {} };
  if (checkStatus === "valid")
    return { row: { background: "rgba(16,185,129,0.02)", borderLeft: "3px solid #10b981" }, resultRow: { background: "rgba(16,185,129,0.02)", borderLeft: "3px solid #10b981" } };
  if (checkStatus === "blocked")
    return { row: { background: "rgba(244,63,94,0.02)", borderLeft: "3px solid #f43f5e" }, resultRow: { background: "rgba(244,63,94,0.02)", borderLeft: "3px solid #f43f5e" } };
  if (checkStatus === "mismatch")
    return { row: { background: "rgba(245,158,11,0.02)", borderLeft: "3px solid #f59e0b" }, resultRow: { background: "rgba(245,158,11,0.02)", borderLeft: "3px solid #f59e0b" } };
  return { row: {}, resultRow: {} };
}

function statusColor(status: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    Active:   { background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "rgba(16,185,129,0.22)" },
    Blocked:  { background: "rgba(244,63,94,0.1)", color: "#f43f5e", borderColor: "rgba(244,63,94,0.22)" },
    Pending:  { background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.22)" },
    Expired:  { background: "rgba(124,108,248,0.1)", color: "#a5a8ff", borderColor: "rgba(124,108,248,0.22)" },
    Verified: { background: "rgba(34,211,238,0.1)", color: "#22d3ee", borderColor: "rgba(34,211,238,0.22)" },
  };
  return map[status] ?? { background: "rgba(255,255,255,0.03)", color: "#8892b0", borderColor: "rgba(255,255,255,0.08)" };
}

// ── InlineValidationPanel ─────────────────────────────────────────────────────

function InlineValidationPanel({ record }: { record: DBRecord }) {
  const { T } = useTheme();
  const [uniqueId,    setUniqueId]    = useState(record.unique_id || "");
  const [fingerprint, setFingerprint] = useState(record.fingerprint || "");
  const [confirming,  setConfirming]  = useState(false);
  const [confirmMsg,  setConfirmMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const validation = useValidation();

  useEffect(() => {
    if (validation.result.known_fingerprint && !fingerprint) {
      setFingerprint(validation.result.known_fingerprint);
    }
  }, [validation.result.known_fingerprint, fingerprint]);

  useEffect(() => {
    if (uniqueId.trim()) {
      validation.validate(uniqueId, fingerprint, ADMIN_ASSIGNMENT_ID);
    }
    return () => { validation.reset(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUidChange(val: string) {
    setUniqueId(val);
    setConfirmMsg(null);
    if (val.trim()) {
      validation.validate(val, fingerprint, ADMIN_ASSIGNMENT_ID);
    } else {
      validation.reset();
    }
  }

  function handleFpChange(val: string) {
    setFingerprint(val);
    setConfirmMsg(null);
    if (uniqueId.trim()) {
      validation.validate(uniqueId, val, ADMIN_ASSIGNMENT_ID);
    } else {
      validation.reset();
    }
  }

  async function handleConfirm() {
    if (confirming) return;
    if (!uniqueId.trim() || !fingerprint.trim()) {
      setConfirmMsg({ ok: false, text: "Enter both IP and fingerprint before confirming." });
      return;
    }
    setConfirming(true);
    setConfirmMsg(null);
    const ok = await validation.confirm(uniqueId, fingerprint, ADMIN_ASSIGNMENT_ID);
    setConfirming(false);
    if (ok) {
      setConfirmMsg({ ok: true, text: "Confirmed. 48-hour cooldown started." });
    } else {
      setConfirmMsg({
        ok: false,
        text: validation.result.message ?? "Confirmation failed.",
      });
    }
  }

  const vStatus  = validation.result.status;
  const dotColor =
    vStatus === "valid"    ? "#10b981" :
    vStatus === "blocked"  ? "#f43f5e" :
    vStatus === "mismatch" ? "#f59e0b" :
    vStatus === "checking" ? "#7c6cf8" : null;

  const validationConfig: Record<string, { bg: string; border: string; color: string; label: string }> = {
    checking: { bg: "rgba(124,108,248,0.06)", border: "rgba(124,108,248,0.2)", color: "#9d91ff", label: "Checking system bindings…" },
    valid:    { bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.2)", color: "#10b981", label: "Valid IP & Fingerprint combination — Ready to confirm" },
    blocked:  { bg: "rgba(244,63,94,0.06)", border: "rgba(244,63,94,0.2)", color: "#f43f5e", label: "IP in Active Cooldown" },
    mismatch: { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)", color: "#f59e0b", label: "Fingerprint Conflict" },
    error:    { bg: "rgba(244,63,94,0.04)", border: "rgba(244,63,94,0.15)", color: "#f43f5e", label: "Verification System Error" },
  };
  const vc = validationConfig[vStatus] ?? validationConfig.error;

  return (
    <div style={{ ...S.inlinePanel, background: T.bgInput, border: `1px solid ${T.borderInput}` }}>
      <div style={S.inlinePanelTitle}>
        <span style={{ fontSize: 10, color: "#7c6cf8", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const }}>
          Identity Verification System
        </span>
        {dotColor && (
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: dotColor, display: "inline-block",
            boxShadow: `0 0 8px ${dotColor}`,
            animation: "pulseDot 1.4s infinite ease-in-out",
          }} />
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 5, flex: 1, minWidth: 180 }}>
          <label style={{ ...S.inlineLabel, color: T.textSecondary }}>Unique ID / IP Address</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              style={{
                ...S.inlineInput,
                flex: 1,
                background: T.bgInput,
                color: T.textPrimary,
                borderColor:
                  vStatus === "blocked"  ? "rgba(244,63,94,0.4)" :
                  vStatus === "mismatch" ? "rgba(245,158,11,0.4)" :
                  vStatus === "valid"    ? "rgba(16,185,129,0.4)" :
                  vStatus === "checking" ? "rgba(124,108,248,0.4)" : T.borderInput,
              }}
              value={uniqueId}
              onChange={(e) => handleUidChange(e.target.value)}
              placeholder="e.g. 192.168.1.1"
              autoComplete="off"
              onFocus={(e) => {
                if (vStatus === "idle") {
                  e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                  e.currentTarget.style.boxShadow = "0 0 8px rgba(124,108,248,0.15)";
                }
              }}
              onBlur={(e) => {
                if (vStatus === "idle") {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            />
            <CopyButton value={uniqueId} label="IP" />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" as const, gap: 5, flex: 1, minWidth: 180 }}>
          <label style={{ ...S.inlineLabel, color: T.textSecondary }}>
            Device Fingerprint
            {validation.result.known_fingerprint && !fingerprint && (
              <span style={{ color: "#7c6cf8", marginLeft: 6, fontSize: 9, fontWeight: 700 }}>
                (AUTO-FILLED)
              </span>
            )}
            {validation.result.known_fingerprint && fingerprint && (
              <span style={{ color: "#10b981", marginLeft: 6, fontSize: 9 }}>(recalled)</span>
            )}
          </label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              style={{
                ...S.inlineInput,
                flex: 1,
                color: T.textPrimary,
                borderColor: validation.result.known_fingerprint
                  ? "rgba(124,108,248,0.3)"
                  : vStatus === "mismatch" ? "rgba(245,158,11,0.4)" : T.borderInput,
                background: validation.result.known_fingerprint && !fingerprint
                  ? "rgba(124,108,248,0.03)"
                  : T.bgInput,
              }}
              value={fingerprint}
              onChange={(e) => handleFpChange(e.target.value)}
              placeholder="e.g. FP-A4B2C"
              autoComplete="off"
              onFocus={(e) => {
                if (!validation.result.known_fingerprint) {
                  e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                  e.currentTarget.style.boxShadow = "0 0 8px rgba(124,108,248,0.15)";
                }
              }}
              onBlur={(e) => {
                if (!validation.result.known_fingerprint) {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            />
            <CopyButton value={fingerprint} label="fingerprint" />
          </div>
        </div>
      </div>

      {vStatus !== "idle" && (
        <div style={{
          background: vc.bg, border: `1px solid ${vc.border}`,
          borderRadius: 10, padding: "12px 14px",
          display: "flex", flexDirection: "column" as const, gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: vc.color, fontSize: 14, display: "flex", alignItems: "center" }}>
              {vStatus === "checking" ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                </svg>
              ) : vStatus === "valid" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : vStatus === "blocked" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                </svg>
              ) : vStatus === "mismatch" ? (
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
            <span style={{ color: vc.color, fontSize: 12.5, fontWeight: 700 }}>{vc.label}</span>
          </div>

          {validation.result.message && vStatus !== "checking" && (
            <span style={{ color: T.textSecondary, fontSize: 11.5, lineHeight: 1.5 }}>
              {validation.result.message}
            </span>
          )}

          {vStatus === "blocked" && validation.result.cooldown_ends_at && (
            <CooldownTimer endsAt={validation.result.cooldown_ends_at} />
          )}

          {vStatus === "mismatch" && validation.result.expected_fingerprint && (
            <div style={{
              background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)",
              borderRadius: 8, padding: "8px 12px",
              display: "flex", flexDirection: "column" as const, gap: 3,
            }}>
              <span style={{ color: T.textSecondary, fontSize: 10, fontWeight: 500 }}>Expected Fingerprint: </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <code style={{ color: "#f59e0b", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  {validation.result.expected_fingerprint}
                </code>
                <CopyButton value={validation.result.expected_fingerprint} label="fingerprint" />
              </div>
            </div>
          )}

          {vStatus === "valid" && validation.result.known_fingerprint && (
            <div style={{
              background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)",
              borderRadius: 8, padding: "8px 12px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: T.textSecondary, fontSize: 10, fontWeight: 500 }}>Recalled Fingerprint (auto-filled): </span>
                <code style={{ color: "#10b981", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  {validation.result.known_fingerprint}
                </code>
              </div>
              <CopyButton value={validation.result.known_fingerprint} label="fingerprint" />
            </div>
          )}
        </div>
      )}

      {(vStatus === "valid" || vStatus === "idle") &&
        uniqueId.trim() && fingerprint.trim() && (
        <button
          disabled={confirming || vStatus === "checking"}
          onClick={handleConfirm}
          style={{
            background:     confirming ? "rgba(124,108,248,0.35)" : "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
            border:         "none",
            borderRadius:   8,
            color:          "#fff",
            fontSize:       12.5,
            fontWeight:     600,
            padding:        "10px 0",
            cursor:         confirming || vStatus === "checking" ? "not-allowed" : "pointer",
            fontFamily:     "inherit",
            width:          "100%",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            6,
            transition:     "all 0.2s ease",
            boxShadow:      confirming ? "none" : "0 4px 15px rgba(124,108,248,0.3)",
          }}
          onMouseEnter={(e) => {
            if (!confirming) e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            if (!confirming) e.currentTarget.style.opacity = "1";
          }}
        >
          {confirming ? "⟳ Registering..." : "✓ OK — Confirm & Start 48h Cooldown"}
        </button>
      )}

      {confirmMsg && (
        <div style={{
          background:   confirmMsg.ok ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
          border:       `1px solid ${confirmMsg.ok ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}`,
          borderRadius: 8,
          padding:      "10px 14px",
          color:        confirmMsg.ok ? "#10b981" : "#f43f5e",
          fontSize:     12,
          fontWeight:   500,
          animation:    "fadeIn 0.2s ease",
        }}>
          <span style={{ marginRight: 6 }}>{confirmMsg.ok ? "✓" : "⚠"}</span>
          {confirmMsg.text}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecordsTable({ refreshTrigger }: RecordsTableProps) {
  const { T, theme } = useTheme();
  const isLight = theme === "light";
  const [records,    setRecords]    = useState<DBRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [rowState,   setRowState]   = useState<Record<string, RowState>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Persistent delete — saved to localStorage, survives refresh ───────────
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("records_deleted_ids");
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [showDeleted, setShowDeleted] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("records_deleted_ids", JSON.stringify([...deletedIds])); }
    catch { /* silent */ }
  }, [deletedIds]);

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(visibleIds: string[]) {
    setSelectedIds(prev => {
      const allSel = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
      return allSel ? new Set() : new Set(visibleIds);
    });
  }

  function deleteRow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletedIds(prev => new Set([...prev, id]));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (expandedId === id) setExpandedId(null);
  }

  function bulkDelete() {
    const toDelete = new Set(selectedIds);
    setDeletedIds(prev => new Set([...prev, ...toDelete]));
    setSelectedIds(new Set());
    setPendingBulkDelete(false);
    setExpandedId(prev => (prev && toDelete.has(prev)) ? null : prev);
  }

  function restoreAll() {
    setDeletedIds(new Set());
    setShowDeleted(false);
    try { localStorage.removeItem("records_deleted_ids"); } catch { /* silent */ }
  }

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRecords((data as DBRecord[]) ?? []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords, refreshTrigger]);

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  async function handleCheck(e: React.MouseEvent, row: DBRecord) {
    e.stopPropagation();
    setRowState(prev => ({
      ...prev,
      [row.id]: { ...(prev[row.id] ?? { activating: false }), checking: true, error: "" },
    }));
    try {
      const { data, error } = await supabase.rpc("check_unique_id", {
        p_unique_id:   row.unique_id,
        p_fingerprint: row.fingerprint,
        p_record_id:   row.id,
      });
      if (error) throw new Error(error.message);

      const result         = data as CheckResult;
      const newCheckStatus = deriveCheckStatus(result, row.used_at);

      let patchedResult = result;
      if (newCheckStatus === "blocked" && result.allowed) {
        const usedAt    = result.used_at ?? row.used_at;
        const remaining = usedAt ? computeRemaining(usedAt) : undefined;
        patchedResult = {
          ...result,
          allowed:          false,
          reason:           result.reason || "DUPLICATE_48H",
          message:          result.message || "This unique ID was used within the last 48 hours.",
          remaining,
          cooldown_ends_at:
            result.cooldown_ends_at ??
            (usedAt
              ? new Date(new Date(usedAt).getTime() + 48 * 60 * 60 * 1000).toISOString()
              : undefined),
          used_at: usedAt ?? undefined,
        };
      }

      setRecords(prev =>
        prev.map(r =>
          r.id === row.id
            ? { ...r, check_status: newCheckStatus, check_result: patchedResult }
            : r
        )
      );

      if (newCheckStatus !== "valid") setExpandedId(row.id);

      setRowState(prev => ({
        ...prev,
        [row.id]: { ...(prev[row.id] ?? {}), checking: false, error: "" },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Check failed";
      setRowState(prev => ({
        ...prev,
        [row.id]: { ...(prev[row.id] ?? {}), checking: false, error: msg },
      }));
    }
  }

  async function handleMarkActive(e: React.MouseEvent, row: DBRecord) {
    e.stopPropagation();
    if (row.check_status !== "valid") return;

    setRowState(prev => ({
      ...prev,
      [row.id]: { ...(prev[row.id] ?? { checking: false, error: "" }), activating: true },
    }));
    try {
      const { data, error } = await supabase.rpc("mark_record_active", { p_record_id: row.id });
      if (error) throw new Error(error.message);

      const result = data as { ok: boolean; error?: string; used_at?: string };
      if (!result.ok) throw new Error(result.error ?? "Failed to mark active");

      setRecords(prev =>
        prev.map(r =>
          r.id === row.id ? { ...r, status: "Active", used_at: result.used_at ?? null } : r
        )
      );
      setRowState(prev => ({
        ...prev,
        [row.id]: { ...(prev[row.id] ?? {}), activating: false, error: "" },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Activation failed";
      setRowState(prev => ({
        ...prev,
        [row.id]: { ...(prev[row.id] ?? {}), activating: false, error: msg },
      }));
    }
  }

  if (loading)    return <div style={{ ...S.msg, background: T.bgCard, border: `1px solid ${T.borderCard}`, color: T.textSecondary }}>Negotiating data pipeline & fetching IP addresses…</div>;
  if (fetchError) return <div style={{ ...S.errorMsg, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>⚠ Handshake Error: {fetchError}</div>;

  const visibleRecords = records.filter(r =>
    showDeleted ? deletedIds.has(r.id) : !deletedIds.has(r.id)
  );
  const visibleIds        = visibleRecords.map(r => r.id);
  const allSelected       = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someSelected      = selectedIds.size > 0;
  const selCountOnScreen  = visibleIds.filter(id => selectedIds.has(id)).length;

  if (records.length === 0)
    return <div style={{ ...S.msg, background: T.bgCard, border: `1px solid ${T.borderCard}`, color: T.textSecondary }}>No IP addresses found. Create one with the "+ Add IP Address" button.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      {(deletedIds.size > 0 || showDeleted || someSelected) && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          flexWrap:     "wrap",
          gap:          8,
          padding:      "7px 14px",
          borderBottom: `1px solid ${T.dividerSolid}`,
          background:   T.bgCard,
          borderRadius: "16px 16px 0 0",
        }}>
          {someSelected && !showDeleted && (
            <>
              <span style={{ color: "#7c6cf8", fontSize: 11, fontWeight: 700 }}>
                {selCountOnScreen} selected
              </span>
              {pendingBulkDelete ? (
                <>
                  <span style={{ color: "#f43f5e", fontSize: 11, fontWeight: 600 }}>
                    Remove {selCountOnScreen} row{selCountOnScreen !== 1 ? "s" : ""}?
                  </span>
                  <button onClick={bulkDelete} style={S.confirmBtn}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(244,63,94,0.22)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(244,63,94,0.12)"; }}>
                    Yes, delete
                  </button>
                  <button onClick={() => setPendingBulkDelete(false)} style={S.cancelBtn}>
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setPendingBulkDelete(true)} style={S.bulkDeleteBtn}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(244,63,94,0.12)"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.background = "rgba(244,63,94,0.07)"; }}>
                  🗑 Delete selected
                </button>
              )}
              <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)", display: "inline-block" }} />
            </>
          )}
          {deletedIds.size > 0 && (
            <>
              <span style={{ color: T.textSecondary, fontSize: 11 }}>
                <span style={{ color: "#f43f5e", fontWeight: 700 }}>{deletedIds.size}</span> removed
              </span>
              <button onClick={() => setShowDeleted(v => !v)} style={S.toolbarBtn}>
                {showDeleted ? "← Active rows" : "View removed"}
              </button>
              <button onClick={restoreAll} style={S.restoreBtn}>↩ Restore all</button>
            </>
          )}
        </div>
      )}

      {visibleRecords.length === 0 ? (
        <div style={{ ...S.msg, background: T.bgCard, border: `1px solid ${T.borderCard}`, color: T.textSecondary }}>
          {showDeleted
            ? "No removed rows."
            : "All rows removed. Click \"Restore all\" to bring them back."}
        </div>
      ) : (
        <div style={{ ...S.tableWrap, background: T.bgCard, border: `1px solid ${T.borderCard}`, boxShadow: T.shadowCard }}>
          <table style={{ ...S.table, color: T.textPrimary }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...S.th, padding: "10px 6px 10px 12px", background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAll(visibleIds)}
                    title={allSelected ? "Deselect all" : "Select all"}
                    style={{ cursor: "pointer", accentColor: "#7c6cf8", width: 13, height: 13 }}
                  />
                </th>
                {["Proxy", "Unique ID", "Fingerprint", "Status", "Created At", "Actions"].map(
                  h => <th key={h} style={{ ...S.th, background: T.bgTableHeader, color: T.textMuted, borderBottom: `1px solid ${T.dividerSolid}` }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((r, i) => {
                const isExpanded  = expandedId === r.id;
                const hl          = getRowHighlight(r.check_status, isExpanded);
                const rs: RowState = rowState[r.id] ?? { checking: false, activating: false, error: "" };
                const isBlocked   = r.check_status === "blocked";
                const isMismatch  = r.check_status === "mismatch";
                const isValid     = r.check_status === "valid";
                const canActivate = isValid && r.status === "Pending";
                const isSelected  = selectedIds.has(r.id);

                const rowBg = isSelected
                  ? "rgba(124,108,248,0.07)"
                  : (hl.row.background as string | undefined) ?? "transparent";

                return (
                  <tr key={r.id} style={{ display: "contents" }}>
                    <tr
                      style={{
                        ...S.tr,
                        ...hl.row,
                        background:    rowBg,
                        borderBottom:  `1px solid ${T.borderTableRow}`,
                        cursor:        "pointer",
                        animation:     `fadeUp 0.3s ease ${Math.min(i * 0.03, 0.2)}s both`,
                        outline:       isSelected ? "1px solid rgba(124,108,248,0.18)" : "none",
                        outlineOffset: "-1px",
                      }}
                      onClick={() => toggleExpand(r.id)}
                      onMouseEnter={e => {
                        if (!isExpanded && !r.check_status && !isSelected)
                          e.currentTarget.style.background = T.bgTableRowHover;
                      }}
                      onMouseLeave={e => {
                        if (!isExpanded && !r.check_status && !isSelected)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ ...S.td, padding: "10px 6px 10px 12px" }}
                          onClick={e => toggleSelect(r.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: "pointer", accentColor: "#7c6cf8", width: 13, height: 13 }}
                        />
                      </td>

                      {/* Address */}
                      <td style={S.td}>
                        <div style={S.cellFlex}>
                          <span style={{ ...S.truncate, fontWeight: 500 }} title={r.address}>{r.address}</span>
                          <CopyButton value={r.address} label="address" />
                        </div>
                      </td>

                      {/* Unique ID */}
                      <td style={{ ...S.td, ...S.mono, color: T.textPrimary }}>
                        <div style={S.cellFlex}>
                          <span style={S.truncate} title={r.unique_id}>{r.unique_id}</span>
                          <CopyButton value={r.unique_id} label="IP/ID" />
                        </div>
                      </td>

                      {/* Fingerprint */}
                      <td style={{ ...S.td, ...S.mono, color: T.textPrimary }}>
                        <div style={S.cellFlex}>
                          <span style={S.truncate} title={r.fingerprint || ""}>{r.fingerprint || "—"}</span>
                          {r.fingerprint && <CopyButton value={r.fingerprint} label="fingerprint" />}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={S.td}>
                        <div style={S.statusCell}>
                          <span style={{ ...S.badge, ...statusColor(r.status) }}>{r.status}</span>
                          {canActivate && (
                            <button
                              style={rs.activating ? S.activateBtnDisabled : S.activateBtn}
                              onClick={e => handleMarkActive(e, r)}
                              disabled={rs.activating}
                              title="Mark as Active — starts 48h usage block"
                            >
                              {rs.activating ? "…" : "▶ Activate"}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Created At */}
                      <td style={{ ...S.td, ...S.dateCell, color: T.textSecondary }}>
                        {new Date(r.created_at).toLocaleString()}
                      </td>

                      {/* Actions */}
                      <td style={S.td} onClick={e => e.stopPropagation()}>
                        <div style={S.checkCell}>
                          {/* Check + status badges */}
                          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" as const }}>
                            <button
                              style={rs.checking ? S.checkBtnDisabled : S.checkBtn}
                              onClick={e => handleCheck(e, r)}
                              disabled={rs.checking}
                              title="Run duplicate & fingerprint check"
                            >
                              {rs.checking ? "Checking…" : "⚡ Check"}
                            </button>
                            {isBlocked  && <span style={{ ...S.checkBadge, ...S.blockedBadge }}>⛔ Cooldown</span>}
                            {isMismatch && <span style={{ ...S.checkBadge, ...S.mismatchBadge }}>⚠ Conflict</span>}
                            {isValid    && <span style={{ ...S.checkBadge, ...S.validBadge }}>✓ Ready</span>}
                          </div>
                          {/* Expand hint + Delete — same row */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={S.expandHint} onClick={() => toggleExpand(r.id)}>
                              {isExpanded
                                ? <span style={{ color: "#7c6cf8", fontWeight: 600 }}>▲ Collapse</span>
                                : <span>▼ Details</span>}
                            </span>
                            <button
                              onClick={e => deleteRow(r.id, e)}
                              title="Remove from view — persists after refresh"
                              style={S.deleteBtn}
                              onMouseEnter={e => {
                                e.currentTarget.style.opacity = "1";
                                e.currentTarget.style.background = "rgba(244,63,94,0.08)";
                                e.currentTarget.style.borderColor = "rgba(244,63,94,0.4)";
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.opacity = "0.5";
                                e.currentTarget.style.background = "none";
                                e.currentTarget.style.borderColor = "rgba(244,63,94,0.2)";
                              }}
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4h6v2" />
                              </svg>
                              Delete
                            </button>
                          </div>
                          {rs.error && (
                            <span style={S.rowError} title={rs.error}>⚠ {rs.error}</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr style={{ ...hl.resultRow, display: "table-row" }}>
                        <td colSpan={7} style={{ ...S.expandedTd, borderBottom: `1px solid ${T.borderTableRow}` }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 6px" }}>
                            <InlineValidationPanel record={r} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── CheckResultDetail (fully preserved) ──────────────────────────────────────

function CheckResultDetail({ result }: { result: CheckResult }) {
  const { T } = useTheme();
  const isOk           = result.allowed;
  const isBlocked      = result.reason === "DUPLICATE_48H";
  const isMismatch     = result.reason === "FINGERPRINT_MISMATCH";
  const hasExtraFpWarn = isBlocked && result.fingerprint_match === false;

  return (
    <div style={{
      ...S.detailBox,
      borderColor:  isOk ? "rgba(16,185,129,0.25)" : isBlocked ? "rgba(244,63,94,0.25)" : "rgba(245,158,11,0.25)",
      background:   isOk ? "rgba(16,185,129,0.06)" : isBlocked ? "rgba(244,63,94,0.06)" : "rgba(245,158,11,0.06)",
    }}>
      {isBlocked && (
        <div style={S.blockedSection}>
          <div style={S.blockedHeadline}>🚫 BLOCKED — Cooldown Period Active</div>
          <div style={S.blockedMsg}>{result.message}</div>
          {result.cooldown_ends_at ? (
            <CooldownTimer endsAt={result.cooldown_ends_at} />
          ) : result.remaining ? (
            <div style={S.timerBox}>
              <span style={S.timerLabel}>⏱ Cooldown Remaining:</span>
              <span style={S.timerValue}>
                {result.remaining.hours}h&nbsp;
                {result.remaining.minutes}m&nbsp;
                {result.remaining.seconds}s
              </span>
            </div>
          ) : null}
          {result.used_at && (
            <div style={S.usedAtNote}>
              Verified active usage timestamp: <strong style={{ color: T.textPrimary }}>{new Date(result.used_at).toLocaleString()}</strong>
            </div>
          )}
        </div>
      )}

      {(isMismatch || hasExtraFpWarn) && (
        <div style={S.fpSection}>
          <div style={S.fpHeadline}>
            {isMismatch ? "⚠ Fingerprint Conflict Detected" : "⚠ Fingerprint Association"}
          </div>
          <div style={S.fpMsg}>
            {isMismatch
              ? result.message
              : "This Unique ID is currently associated with a different fingerprint."}
          </div>
          {result.expected_fingerprint && (
            <div style={S.fpBound}>
              <span>Bound Fingerprint: </span>
              <code style={S.code}>{result.expected_fingerprint}</code>
              <CopyButton value={result.expected_fingerprint} label="fingerprint" />
            </div>
          )}
          {result.known_fingerprint && !result.expected_fingerprint && (
            <div style={S.fpBound}>
              <span>Associated Fingerprint: </span>
              <code style={S.code}>{result.known_fingerprint}</code>
              <CopyButton value={result.known_fingerprint} label="fingerprint" />
            </div>
          )}
        </div>
      )}

      {isOk && (
        <div style={S.validSection}>
          <span style={S.validHeadline}>✓ Valid IP & Fingerprint</span>
          <span style={S.validMsg}>{result.message}</span>
          {result.known_fingerprint && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={S.recallNote}>
                🔁 Recalled Fingerprint: <code style={S.code}>{result.known_fingerprint}</code>
              </span>
              <CopyButton value={result.known_fingerprint} label="fingerprint" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  tableWrap: {
    width:          "100%",
    overflow:       "hidden",
    background:     "rgba(13,16,34,0.7)",
    borderRadius:   16,
    border:         "1px solid rgba(255,255,255,0.06)",
    backdropFilter: "blur(16px)",
    boxShadow:      "0 8px 32px rgba(0,0,0,0.4)",
  },
  table: {
    width:          "100%",
    tableLayout:    "fixed",
    borderCollapse: "collapse",
    fontFamily:     "'Inter', -apple-system, sans-serif",
    fontSize:       12,
    color:          "#eef0f8",
  },
  th: {
    background:    "rgba(10,12,24,0.5)",
    color:         "#8892b0",
    textAlign:     "left",
    padding:       "10px 10px",
    fontWeight:    600,
    fontSize:      9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    borderBottom:  "1px solid rgba(255,255,255,0.06)",
    whiteSpace:    "nowrap",
    overflow:      "hidden",
  },
  tr:       { borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.2s ease" },
  td:       { padding: "10px 10px", verticalAlign: "middle", overflow: "hidden" },
  mono:     { fontFamily: "'JetBrains Mono', monospace", color: "#eef0f8", fontSize: 11.5 },
  dateCell: { color: "#8892b0", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" },

  truncate: {
    overflow:     "hidden",
    textOverflow: "ellipsis",
    whiteSpace:   "nowrap",
    minWidth:     0,
    flex:         1,
  },
  cellFlex: { display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" },
  cellWithCopy: { display: "flex", alignItems: "center", gap: 4 },

  badge: {
    display:       "inline-block",
    padding:       "3px 10px",
    borderRadius:  6,
    border:        "1px solid",
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: 0.2,
  },
  statusCell: { display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" },

  activateBtn: {
    background:    "rgba(16,185,129,0.12)",
    border:        "1px solid rgba(16,185,129,0.25)",
    color:         "#10b981",
    borderRadius:  6,
    padding:       "3px 10px",
    fontSize:      10.5,
    fontWeight:    700,
    cursor:        "pointer",
    fontFamily:    "inherit",
    letterSpacing: 0.3,
    transition:    "all 0.15s ease",
  },
  activateBtnDisabled: {
    background:   "rgba(255,255,255,0.02)",
    border:       "1px solid rgba(255,255,255,0.06)",
    color:        "#4a526e",
    borderRadius: 6,
    padding:      "3px 10px",
    fontSize:     10.5,
    fontWeight:   700,
    cursor:       "not-allowed",
    fontFamily:   "inherit",
  },

  checkCell: {
    display:       "flex",
    flexDirection: "column",
    gap:           5,
    alignItems:    "flex-start",
  },
  deleteBtn: {
    display:      "flex",
    alignItems:   "center",
    gap:          4,
    background:   "none",
    border:       "1px solid rgba(244,63,94,0.2)",
    borderRadius: 4,
    color:        "#f43f5e",
    fontSize:     9.5,
    fontWeight:   600,
    padding:      "2px 7px",
    cursor:       "pointer",
    fontFamily:   "inherit",
    opacity:      0.5,
    transition:   "all 0.15s ease",
    whiteSpace:   "nowrap",
  },
  bulkDeleteBtn: {
    background:   "rgba(244,63,94,0.07)",
    border:       "1px solid rgba(244,63,94,0.25)",
    borderRadius: 5,
    color:        "#f43f5e",
    fontSize:     11,
    fontWeight:   600,
    padding:      "3px 10px",
    cursor:       "pointer",
    fontFamily:   "inherit",
    opacity:      0.85,
    transition:   "all 0.15s ease",
  },
  confirmBtn: {
    background:   "rgba(244,63,94,0.12)",
    border:       "1px solid rgba(244,63,94,0.35)",
    borderRadius: 5,
    color:        "#f43f5e",
    fontSize:     11,
    fontWeight:   700,
    padding:      "3px 10px",
    cursor:       "pointer",
    fontFamily:   "inherit",
    transition:   "all 0.15s ease",
  },
  cancelBtn: {
    background:   "none",
    border:       "1px solid rgba(255,255,255,0.1)",
    borderRadius: 5,
    color:        "#8892b0",
    fontSize:     11,
    padding:      "3px 10px",
    cursor:       "pointer",
    fontFamily:   "inherit",
  },
  toolbarBtn: {
    background:   "none",
    border:       "1px solid rgba(255,255,255,0.08)",
    borderRadius: 5,
    color:        "#8892b0",
    fontSize:     11,
    padding:      "3px 10px",
    cursor:       "pointer",
    fontFamily:   "inherit",
  },
  restoreBtn: {
    background:   "rgba(16,185,129,0.08)",
    border:       "1px solid rgba(16,185,129,0.2)",
    borderRadius: 5,
    color:        "#10b981",
    fontSize:     11,
    padding:      "3px 10px",
    cursor:       "pointer",
    fontFamily:   "inherit",
  },
  checkBtn: {
    background:   "rgba(124,108,248,0.1)",
    border:       "1px solid rgba(124,108,248,0.22)",
    color:        "#a5a8ff",
    borderRadius: 6,
    padding:      "5px 12px",
    fontSize:     11.5,
    fontWeight:   600,
    cursor:       "pointer",
    fontFamily:   "inherit",
    whiteSpace:   "nowrap",
    transition:   "all 0.15s ease",
  },
  checkBtnDisabled: {
    background:   "rgba(255,255,255,0.02)",
    border:       "1px solid rgba(255,255,255,0.06)",
    color:        "#4a526e",
    borderRadius: 6,
    padding:      "5px 12px",
    fontSize:     11.5,
    fontWeight:   600,
    cursor:       "not-allowed",
    fontFamily:   "inherit",
  },
  checkBadge:    { display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 },
  blockedBadge:  { background: "rgba(244,63,94,0.08)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.2)" },
  mismatchBadge: { background: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" },
  validBadge:    { background: "rgba(16,185,129,0.08)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" },
  expandHint:    { color: "#4a526e", fontSize: 9.5, letterSpacing: 0.5, cursor: "pointer", transition: "color 0.2s ease" },
  rowError:      { color: "#f43f5e", fontSize: 10.5, maxWidth: 180, wordBreak: "break-word", lineHeight: 1.4 },

  expandedTd: { padding: "0 18px 18px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)" },

  inlinePanel: {
    background:    "rgba(8,10,20,0.5)",
    border:        "1px solid rgba(255,255,255,0.05)",
    borderRadius:  12,
    padding:       "16px",
    display:       "flex",
    flexDirection: "column",
    gap:           12,
    marginTop:     0,
  },
  inlinePanelTitle: { display: "flex", alignItems: "center", gap: 8, marginBottom: 2 },
  inlineLabel: {
    color:         "#8892b0",
    fontSize:      10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    display:       "flex",
    alignItems:    "center",
    gap:           4,
    fontWeight:    600,
  },
  inlineInput: {
    background:   "rgba(8,10,20,0.6)",
    border:       "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color:        "#eef0f8",
    padding:      "9px 12px",
    fontSize:     12.5,
    fontFamily:   "inherit",
    outline:      "none",
    transition:   "all 0.2s ease",
  },

  resultTd:  { padding: "0 16px 12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  detailBox: {
    border:        "1px solid",
    borderRadius:  10,
    padding:       "14px",
    display:       "flex",
    flexDirection: "column",
    gap:           10,
    fontFamily:    "'Inter', -apple-system, sans-serif",
    fontSize:      12.5,
  },

  blockedSection:  { display: "flex", flexDirection: "column", gap: 8 },
  blockedHeadline: { color: "#f43f5e", fontWeight: 700, fontSize: 13.5, letterSpacing: 0.3 },
  blockedMsg:      { color: "rgba(244,63,94,0.8)", fontSize: 11.5 },

  timerBox: {
    display:       "flex",
    flexDirection: "column",
    gap:           4,
    background:    "rgba(244,63,94,0.05)",
    border:        "1px solid rgba(244,63,94,0.15)",
    borderRadius:  8,
    padding:       "10px 12px",
  },
  timerLabel:  { color: "#8892b0", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.8, fontWeight: 600 },
  timerValue:  { color: "#f43f5e", fontWeight: 700, fontSize: 18, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" },
  timerExpiry: { color: "#4a526e", fontSize: 10, fontWeight: 500 },
  usedAtNote:  { color: "#8892b0", fontSize: 11, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6, marginTop: 4 },

  fpSection: {
    display:       "flex",
    flexDirection: "column",
    gap:           6,
    background:    "rgba(245,158,11,0.05)",
    border:        "1px solid rgba(245,158,11,0.15)",
    borderRadius:  8,
    padding:       "10px 12px",
  },
  fpHeadline: { color: "#f59e0b", fontWeight: 700, fontSize: 12 },
  fpMsg:      { color: "#8892b0", fontSize: 11.5, lineHeight: 1.5 },
  fpBound:    { color: "#f59e0b", fontSize: 11, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const },

  validSection:  { display: "flex", flexDirection: "column", gap: 6 },
  validHeadline: { color: "#10b981", fontWeight: 700, fontSize: 13 },
  validMsg:      { color: "#8892b0", fontSize: 11.5 },
  recallNote: {
    color:        "#10b981",
    fontSize:     11.5,
    background:   "rgba(16,185,129,0.04)",
    borderRadius: 6,
    padding:      "4px 10px",
    border:       "1px solid rgba(16,185,129,0.15)",
    display:      "inline-block",
    fontWeight:   500,
  },

  code:     { fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "inherit", fontWeight: 600 },

  msg: {
    color:          "#8892b0",
    padding:        "3rem 2rem",
    textAlign:      "center",
    fontFamily:     "'Inter', sans-serif",
    fontSize:       13.5,
    background:     "rgba(13,16,34,0.7)",
    borderRadius:   16,
    border:         "1px solid rgba(255,255,255,0.06)",
    backdropFilter: "blur(16px)",
  },
  errorMsg: {
    color:          "#f43f5e",
    padding:        "3rem 2rem",
    textAlign:      "center",
    fontFamily:     "'Inter', sans-serif",
    fontSize:       13.5,
    background:     "rgba(13,16,34,0.7)",
    borderRadius:   16,
    border:         "1px solid rgba(255,255,255,0.06)",
    backdropFilter: "blur(16px)",
  },
};