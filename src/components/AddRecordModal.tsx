// File: src/components/AddRecordModal.tsx
// FIX: uses ADMIN_ASSIGNMENT_ID constant from useValidation instead of inline string.
// All other logic unchanged.

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useValidation, ADMIN_ASSIGNMENT_ID } from "../hooks/useValidation";

const STATUS_OPTIONS = ["Pending", "Active", "Blocked", "Expired", "Verified"];

interface AddRecordModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
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
        background:    copied ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
        border:        `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
        borderRadius:  6,
        color:         copied ? "#10b981" : "#8892b0",
        fontSize:      10,
        fontWeight:    600,
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
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
          e.currentTarget.style.color = "#eef0f8";
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
          e.currentTarget.style.color = "#8892b0";
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
    const id = setInterval(() => { const n = calc(); setT(n); if (n.expired) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (t.expired) return <span style={{ color: "#10b981", fontSize: 11, fontWeight: 600 }}>✓ Cooldown expired — safe to reuse.</span>;
  return (
    <div style={{
      background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.15)",
      borderRadius: 8, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ color: "#8892b0", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.8, fontWeight: 600 }}>
        Cooldown Remaining
      </span>
      <span style={{ color: "#f43f5e", fontWeight: 700, fontSize: 18, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        {String(t.h).padStart(2,"0")}h {String(t.m).padStart(2,"0")}m {String(t.s).padStart(2,"0")}s
      </span>
      <span style={{ color: "#4a526e", fontSize: 10, fontWeight: 500 }}>
        Expires: {new Date(endsAt).toLocaleString()}
      </span>
    </div>
  );
}

export default function AddRecordModal({ onClose, onSaved }: AddRecordModalProps) {
  const [address,     setAddress]     = useState("");
  const [uniqueId,    setUniqueId]    = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [status,      setStatus]      = useState("Pending");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [confirmed,   setConfirmed]   = useState(false);
  const [confirming,  setConfirming]  = useState(false);
  const [confirmMsg,  setConfirmMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const confirmingRef = useRef(false);
  const validation    = useValidation();

  useEffect(() => {
    if (validation.result.known_fingerprint && !fingerprint) {
      setFingerprint(validation.result.known_fingerprint);
    }
  }, [validation.result.known_fingerprint, fingerprint]);

  function handleUidChange(val: string) {
    setUniqueId(val);
    setConfirmed(false);
    setConfirmMsg(null);
    if (val.trim()) {
      validation.validate(val, fingerprint, ADMIN_ASSIGNMENT_ID);
    } else {
      validation.reset();
    }
  }

  function handleFpChange(val: string) {
    setFingerprint(val);
    setConfirmed(false);
    setConfirmMsg(null);
    if (uniqueId.trim()) {
      validation.validate(uniqueId, val, ADMIN_ASSIGNMENT_ID);
    } else {
      validation.reset();
    }
  }

  async function handleConfirm() {
    if (confirmingRef.current) return;
    if (!uniqueId.trim() || !fingerprint.trim()) {
      setConfirmMsg({ ok: false, text: "Enter Unique ID and Fingerprint before confirming." });
      return;
    }

    const st = validation.result.status;

    // Debounce still running — ask user to wait
    if (st === "checking") {
      setConfirmMsg({ ok: false, text: "Validation still in progress — please wait a moment and try again." });
      return;
    }

    // Not yet validated (idle / error) — kick off a fresh check
    if (st === "idle" || st === "error") {
      validation.validate(uniqueId, fingerprint, ADMIN_ASSIGNMENT_ID);
      setConfirmMsg({ ok: false, text: "Running live check — please wait, then click Confirm again." });
      return;
    }

    if (st === "blocked") {
      setConfirmMsg({ ok: false, text: validation.result.message ?? "This identity is in a cooldown period — cannot confirm." });
      return;
    }

    if (st === "mismatch") {
      setConfirmMsg({ ok: false, text: validation.result.message ?? "Fingerprint does not match the recorded binding." });
      return;
    }

    // st === "valid" — safe to confirm in admin context.
    // We deliberately do NOT call validation.confirm() (p_confirm: true) here because
    // that RPC tries to INSERT into `records` using address from the assignment join,
    // which fails with null for the admin nil-UUID sentinel. The admin modal's
    // handleSave() performs the actual records INSERT with the address typed in the form.
    confirmingRef.current = true;
    setConfirming(true);
    setConfirmMsg(null);

    // Brief visual pause so the button state is visible
    await new Promise<void>((r) => setTimeout(r, 350));

    confirmingRef.current = false;
    setConfirming(false);
    setConfirmed(true);
    setConfirmMsg({ ok: true, text: "Verified — identity is clear. You may now save the record." });
  }

  async function handleSave() {
    if (!address.trim() || !uniqueId.trim() || !fingerprint.trim()) {
      setError("Address, Unique ID, and Fingerprint are all required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: recErr } = await supabase.from("records").insert({
        address:      address.trim(),
        unique_id:    uniqueId.trim(),
        fingerprint:  fingerprint.trim(),
        status,
        check_status: confirmed ? "valid" : null,
        check_result: null,
      });
      if (recErr) throw recErr;
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !saving && confirmed) handleSave();
  }

  const vStatus    = validation.result.status;
  const isBlocked  = vStatus === "blocked";
  const isMismatch = vStatus === "mismatch";
  const isValid    = vStatus === "valid";
  const isChecking = vStatus === "checking";

  const showConfirmBtn = uniqueId.trim() && fingerprint.trim() && !isBlocked && !confirmed;

  return (
    <div style={M.overlay}>
      <div style={M.modal}>

        <div style={M.header}>
          <span style={M.headerTitle}>Add IP Address</span>
          <button style={M.closeBtn} onClick={onClose}
            onMouseEnter={(e) => e.currentTarget.style.color = "#eef0f8"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#8892b0"}
          >✕</button>
        </div>

        <div style={M.body}>

          <div style={M.row}>
            <div style={M.field}>
              <label style={M.label}>Address Target</label>
              <div style={M.inputRow}>
                <input
                  style={M.input}
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setError(""); }}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 123 Main St"
                  autoFocus
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                    e.currentTarget.style.boxShadow = "0 0 8px rgba(124,108,248,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <CopyButton value={address} label="address" />
              </div>
            </div>
            <div style={M.field}>
              <label style={M.label}>Bootstrap Status</label>
              <select
                style={{ ...M.input, paddingRight: 32 }}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                  e.currentTarget.style.boxShadow = "0 0 8px rgba(124,108,248,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={M.row}>
            <div style={M.field}>
              <label style={M.label}>Unique ID / IP</label>
              <div style={M.inputRow}>
                <input
                  style={{
                    ...M.input,
                    borderColor:
                      isBlocked   ? "rgba(244,63,94,0.4)" :
                      isMismatch  ? "rgba(245,158,11,0.4)" :
                      isValid     ? "rgba(16,185,129,0.4)" :
                      isChecking  ? "rgba(124,108,248,0.4)" : "rgba(255,255,255,0.08)",
                  }}
                  value={uniqueId}
                  onChange={(e) => handleUidChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 192.168.1.1 or UID-00123"
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
                <CopyButton value={uniqueId} label="IP/ID" />
              </div>
            </div>
            <div style={M.field}>
              <label style={M.label}>
                Device Fingerprint
                {validation.result.known_fingerprint && !confirmed && (
                  <span style={{ color: "#7c6cf8", marginLeft: 6, fontSize: 9, fontWeight: 700 }}>
                    AUTO-FILLED
                  </span>
                )}
              </label>
              <div style={M.inputRow}>
                <input
                  style={{
                    ...M.input,
                    borderColor: validation.result.known_fingerprint
                      ? "rgba(124,108,248,0.3)"
                      : isMismatch ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)",
                    background: validation.result.known_fingerprint && !confirmed
                      ? "rgba(124,108,248,0.03)"
                      : "rgba(8,10,20,0.5)",
                  }}
                  value={fingerprint}
                  onChange={(e) => handleFpChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. FP-A4B2C"
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

          {/* Live validation result */}
          {vStatus !== "idle" && (
            <div style={{
              background:
                isBlocked   ? "rgba(244,63,94,0.06)" :
                isMismatch  ? "rgba(245,158,11,0.06)" :
                isValid     ? "rgba(16,185,129,0.06)" :
                isChecking  ? "rgba(124,108,248,0.06)" : "rgba(13,16,34,0.55)",
              border: `1px solid ${
                isBlocked   ? "rgba(244,63,94,0.2)" :
                isMismatch  ? "rgba(245,158,11,0.2)" :
                isValid     ? "rgba(16,185,129,0.2)" :
                isChecking  ? "rgba(124,108,248,0.2)" : "rgba(255,255,255,0.06)"
              }`,
              borderRadius: 10, padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 10,
              animation: "fadeIn 0.2s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: isChecking ? "#9d91ff" : isValid ? "#10b981" : isBlocked ? "#f43f5e" : "#f59e0b", fontSize: 14, display: "flex", alignItems: "center" }}>
                  {isChecking ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                    </svg>
                  ) : isValid ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                    </svg>
                  )}
                </span>
                <span style={{
                  fontWeight: 700, fontSize: 12.5,
                  color:
                    isChecking  ? "#9d91ff" :
                    isValid     ? "#10b981" :
                    isBlocked   ? "#f43f5e" :
                    isMismatch  ? "#f59e0b" : "#f43f5e",
                }}>
                  {isChecking  ? "Checking bindings…"            :
                   isValid     ? "Valid — ready to confirm" :
                   isBlocked   ? "Blocked — in cooldown"    :
                   isMismatch  ? "Fingerprint Conflict"     : "Validation Error"}
                </span>
              </div>

              {validation.result.message && !isChecking && (
                <span style={{ color: "#8892b0", fontSize: 11.5, lineHeight: 1.5 }}>
                  {validation.result.message}
                </span>
              )}

              {isBlocked && validation.result.cooldown_ends_at && (
                <CooldownTimer endsAt={validation.result.cooldown_ends_at} />
              )}

              {isMismatch && validation.result.expected_fingerprint && (
                <div style={{
                  background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)",
                  borderRadius: 8, padding: "8px 12px",
                  display: "flex", flexDirection: "column" as const, gap: 3,
                }}>
                  <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Bound fingerprint: </span>
                  <code style={{ color: "#f59e0b", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace" }}>
                    {validation.result.expected_fingerprint}
                  </code>
                </div>
              )}

              {isValid && validation.result.known_fingerprint && (
                <div style={{
                  background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)",
                  borderRadius: 8, padding: "8px 12px",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Recalled fingerprint: </span>
                    <code style={{ color: "#10b981", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace" }}>
                      {validation.result.known_fingerprint}
                    </code>
                  </div>
                  <CopyButton value={validation.result.known_fingerprint} label="fingerprint" />
                </div>
              )}
            </div>
          )}

          {showConfirmBtn && (
            <button
              disabled={confirming || isChecking || isBlocked}
              onClick={handleConfirm}
              style={{
                background:     confirming ? "rgba(124,108,248,0.35)" : "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
                border:         "none",
                borderRadius:   8,
                color:          "#fff",
                fontSize:       12.5,
                fontWeight:     600,
                padding:        "10px 0",
                cursor:         confirming || isChecking || isBlocked ? "not-allowed" : "pointer",
                fontFamily:     "inherit",
                width:          "100%",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            6,
                letterSpacing:  0.2,
                boxShadow:      confirming ? "none" : "0 4px 15px rgba(124,108,248,0.3)",
                transition:     "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!confirming) e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                if (!confirming) e.currentTarget.style.opacity = "1";
              }}
            >
              {confirming ? "⟳ Verifying..." : "✓ OK — Verify Identity"}
            </button>
          )}

          {confirmed && (
            <div style={{
              background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 8, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 8,
              color: "#10b981", fontSize: 12, fontWeight: 600,
              animation: "fadeIn 0.2s ease",
            }}>
              ✓ Identity verified — you may now save this record.
            </div>
          )}

          {confirmMsg && (
            <div style={{
              background: confirmMsg.ok ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
              border: `1px solid ${confirmMsg.ok ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}`,
              borderRadius: 8, padding: "10px 14px",
              color: confirmMsg.ok ? "#10b981" : "#f43f5e",
              fontSize: 12, fontWeight: 500,
              animation: "fadeIn 0.2s ease",
            }}>
              <span style={{ marginRight: 6 }}>{confirmMsg.ok ? "✓" : "⚠"}</span>
              {confirmMsg.text}
            </div>
          )}

          <div style={M.infoBox}>
            💡 Type Unique ID/IP to run a live binding audit. Press <strong>Verify</strong> to confirm
            the identity is clear, then save.
            Press <kbd style={M.kbd}>Enter</kbd> to save immediately after confirming.
          </div>

          {error && <div style={M.errorBox}>{error}</div>}
        </div>

        <div style={M.footer}>
          <button style={M.btnCancel} onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.color = "#eef0f8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "#8892b0";
            }}
          >Cancel</button>
          <button
            style={saving ? M.btnSaveDisabled : M.btnSave}
            onClick={handleSave}
            disabled={saving}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.opacity = "1";
            }}
          >
            {saving ? "Saving…" : "Save Record"}
          </button>
        </div>
      </div>
    </div>
  );
}

const M: Record<string, React.CSSProperties> = {
  overlay: {
    position:       "fixed",
    inset:          0,
    background:     "rgba(3, 4, 9, 0.75)",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    zIndex:         1000,
    fontFamily:     "'Inter', sans-serif",
    backdropFilter: "blur(8px)",
    animation:      "fadeIn 0.2s ease",
  },
  modal: {
    background:    "rgba(13, 16, 34, 0.85)",
    border:        "1px solid rgba(255,255,255,0.08)",
    borderRadius:  20,
    width:         "100%",
    maxWidth:      640,
    boxShadow:     "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
    display:       "flex",
    flexDirection: "column",
    maxHeight:     "90vh",
    overflowY:     "auto",
    backdropFilter: "blur(20px)",
  },
  header: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    padding:        "16px 24px",
    borderBottom:   "1px solid rgba(255,255,255,0.06)",
  },
  headerTitle: { color: "#eef0f8", fontWeight: 700, fontSize: 16, letterSpacing: -0.2 },
  closeBtn: {
    background: "none", border: "none", color: "#8892b0",
    cursor: "pointer", fontSize: 16, transition: "color 0.2s ease",
  },
  body: {
    padding:       "20px 24px",
    display:       "flex",
    flexDirection: "column",
    gap:           12,
  },
  row:   { display: "flex", gap: 12, flexWrap: "wrap" as const },
  field: { display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 200 },
  inputRow: { display: "flex", alignItems: "center", gap: 6 },
  label: {
    color:         "#8892b0",
    fontSize:      10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    display:       "flex",
    alignItems:    "center",
    gap:           4,
    fontWeight:    600,
  },
  input: {
    background:   "rgba(8,10,20,0.5)",
    border:       "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color:        "#eef0f8",
    padding:      "9px 12px",
    fontSize:     13,
    fontFamily:   "inherit",
    outline:      "none",
    flex:         1,
    width:        "100%",
    transition:   "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  kbd: {
    background:   "rgba(255,255,255,0.05)",
    border:       "1px solid rgba(255,255,255,0.1)",
    borderRadius: 5,
    padding:      "1px 5px",
    fontSize:     11,
    color:        "#8892b0",
    fontFamily:   "'JetBrains Mono', monospace",
  },
  infoBox: {
    background:   "rgba(124,108,248,0.05)",
    border:       "1px solid rgba(124,108,248,0.15)",
    color:        "#a5a8ff",
    borderRadius: 8,
    padding:      "12px",
    fontSize:     12,
    lineHeight:   1.6,
  },
  errorBox: {
    background:   "rgba(244,63,94,0.06)",
    border:       "1px solid rgba(244,63,94,0.2)",
    color:        "#f43f5e",
    borderRadius: 8,
    padding:      "10px 12px",
    fontSize:     12,
  },
  footer: {
    display:        "flex",
    justifyContent: "flex-end",
    gap:            10,
    padding:        "16px 24px",
    borderTop:      "1px solid rgba(255,255,255,0.06)",
  },
  btnCancel: {
    background:   "none",
    border:       "1px solid rgba(255,255,255,0.06)",
    color:        "#8892b0",
    borderRadius: 8,
    padding:      "9px 18px",
    fontSize:     13,
    cursor:       "pointer",
    fontFamily:   "inherit",
    transition:   "all 0.2s ease",
  },
  btnSave: {
    background:   "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
    border:       "none",
    color:        "#fff",
    borderRadius: 8,
    padding:      "9px 22px",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
    fontFamily:   "inherit",
    boxShadow:    "0 4px 15px rgba(124,108,248,0.3)",
    transition:   "all 0.2s ease",
  },
  btnSaveDisabled: {
    background:   "rgba(255,255,255,0.02)",
    border:       "1px solid rgba(255,255,255,0.06)",
    color:        "#4a526e",
    borderRadius: 8,
    padding:      "9px 22px",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "not-allowed",
    fontFamily:   "inherit",
    boxShadow:    "none",
  },
};