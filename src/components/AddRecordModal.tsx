// File: src/components/AddRecordModal.tsx
// Changes:
//  • Category — dropdown only (no custom text input)
//  • IP Type   — Static IP / Dynamic IP mutually-exclusive checkboxes
//  • Theme     — white glassmorphism, crimson #8e1616 accent only

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useValidation, ADMIN_ASSIGNMENT_ID } from "../hooks/useValidation";

const CATEGORY_OPTIONS = [
  "Healthcare",
  "Skincare",
  "Yogafy",
  "Listify",
  "Bizzlists.com",
];

type IpType = "Static IP" | "Dynamic IP" | "";

interface AddRecordModalProps {
  onClose: () => void;
  onSaved: () => void;
}

// ── CopyButton ────────────────────────────────────────────────────────────────
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
        background:    copied ? "rgba(5,150,105,0.10)" : "rgba(0,0,0,0.04)",
        border:        `1px solid ${copied ? "rgba(5,150,105,0.25)" : "rgba(0,0,0,0.09)"}`,
        borderRadius:  6,
        color:         copied ? "#059669" : "#8888aa",
        fontSize:      10,
        fontWeight:    600,
        padding:       "3px 8px",
        cursor:        "pointer",
        fontFamily:    "inherit",
        transition:    "all 0.2s cubic-bezier(0.16,1,0.3,1)",
        flexShrink:    0,
        letterSpacing: 0.3,
        marginLeft:    4,
        display:       "inline-flex",
        alignItems:    "center",
        gap:           4,
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.background   = "rgba(0,0,0,0.07)";
          e.currentTarget.style.borderColor  = "rgba(0,0,0,0.14)";
          e.currentTarget.style.color        = "#444466";
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background   = "rgba(0,0,0,0.04)";
          e.currentTarget.style.borderColor  = "rgba(0,0,0,0.09)";
          e.currentTarget.style.color        = "#8888aa";
        }
      }}
    >
      {copied ? "✓ Copied" : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
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
    const id = setInterval(() => { const n = calc(); setT(n); if (n.expired) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (t.expired) return (
    <span style={{ color: "#059669", fontSize: 11, fontWeight: 600 }}>✓ Cooldown expired — safe to reuse.</span>
  );
  return (
    <div style={{
      background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.14)",
      borderRadius: 8, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ color: "#8888aa", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.8, fontWeight: 600 }}>
        Cooldown Remaining
      </span>
      <span style={{ color: "#f43f5e", fontWeight: 700, fontSize: 18, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        {String(t.h).padStart(2,"0")}h {String(t.m).padStart(2,"0")}m {String(t.s).padStart(2,"0")}s
      </span>
      <span style={{ color: "#aaaacc", fontSize: 10, fontWeight: 500 }}>
        Expires: {new Date(endsAt).toLocaleString()}
      </span>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function AddRecordModal({ onClose, onSaved }: AddRecordModalProps) {
  const [category,    setCategory]   = useState("");
  const [ipType,      setIpType]     = useState<IpType>("");
  const [smartlink,   setSmartlink]  = useState("");
  const [uniqueId,    setUniqueId]   = useState("");
  const [fingerprint, setFingerprint]= useState("");
  const [saving,      setSaving]     = useState(false);
  const [error,       setError]      = useState("");
  const [confirmed,   setConfirmed]  = useState(false);
  const [confirming,  setConfirming] = useState(false);
  const [confirmMsg,  setConfirmMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    if (st === "checking") {
      setConfirmMsg({ ok: false, text: "Validation still in progress — please wait a moment and try again." });
      return;
    }
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
    confirmingRef.current = true;
    setConfirming(true);
    setConfirmMsg(null);
    await new Promise<void>((r) => setTimeout(r, 350));
    confirmingRef.current = false;
    setConfirming(false);
    setConfirmed(true);
    setConfirmMsg({ ok: true, text: "Verified — identity is clear. You may now save the record." });
  }

  async function handleSave() {
    if (!category || !uniqueId.trim() || !fingerprint.trim()) {
      setError("Category, Unique ID, and Fingerprint are all required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: recErr } = await supabase.from("records").insert({
        address:      category,
        category:     category,
        ip_type:      ipType || null,
        smartlink:    smartlink.trim() || null,
        unique_id:    uniqueId.trim(),
        fingerprint:  fingerprint.trim(),
        status:       "Pending",
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

  // ── Input focus helpers ───────────────────────────────────────────────────
  function onFocusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = "rgba(142,22,22,0.40)";
    e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(142,22,22,0.07)";
  }
  function onBlurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = "rgba(0,0,0,0.10)";
    e.currentTarget.style.boxShadow   = "none";
  }

  return (
    <div style={M.overlay}>
      <div style={M.modal}>

        {/* ── Header ── */}
        <div style={M.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 3px 10px rgba(142,22,22,0.28)",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <span style={M.headerTitle}>Add IP Address</span>
          </div>
          <button
            style={M.closeBtn}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.06)"; e.currentTarget.style.color = "#1a1a2e"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent";       e.currentTarget.style.color = "#8888aa"; }}
          >✕</button>
        </div>

        <div style={M.body}>

          {/* ── Row 1: Category dropdown + SmartLink ── */}
          <div style={M.row}>

            {/* Category — dropdown only */}
            <div style={M.field}>
              <label style={M.label}>
                Category
                {category && <span style={{ color: "#059669", marginLeft: 6, fontSize: 9, fontWeight: 700 }}>✓</span>}
              </label>
              <select
                style={{ ...M.input, paddingRight: 32, cursor: "pointer" }}
                value={category}
                onChange={(e) => { setCategory(e.target.value); setError(""); }}
                onFocus={onFocusInput}
                onBlur={onBlurInput}
                autoFocus
              >
                <option value="">— Select a category —</option>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* SmartLink */}
            <div style={M.field}>
              <label style={M.label}>SmartLink</label>
              <div style={M.inputRow}>
                <input
                  style={M.input}
                  value={smartlink}
                  onChange={(e) => { setSmartlink(e.target.value); setError(""); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste the smartlink URL or identifier"
                  onFocus={onFocusInput as React.FocusEventHandler<HTMLInputElement>}
                  onBlur={onBlurInput as React.FocusEventHandler<HTMLInputElement>}
                />
                {smartlink && <CopyButton value={smartlink} label="smartlink" />}
              </div>
            </div>
          </div>

          {/* ── IP Type checkboxes (mutually exclusive) ── */}
          <div style={M.field}>
            <label style={M.label}>IP Type</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              {(["Static IP", "Dynamic IP"] as IpType[]).map((type) => {
                const active = ipType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setIpType(active ? "" : type)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          8,
                      padding:      "9px 16px",
                      borderRadius: 9,
                      border:       `1.5px solid ${active ? "rgba(142,22,22,0.30)" : "rgba(0,0,0,0.10)"}`,
                      background:   active ? "rgba(142,22,22,0.07)" : "rgba(255,255,255,0.60)",
                      color:        active ? "#8e1616" : "#8888aa",
                      cursor:       "pointer",
                      fontFamily:   "inherit",
                      fontSize:     12.5,
                      fontWeight:   active ? 600 : 400,
                      transition:   "all 0.18s cubic-bezier(0.16,1,0.3,1)",
                      boxShadow:    active
                        ? "0 2px 10px rgba(142,22,22,0.12)"
                        : "0 1px 4px rgba(0,0,0,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.borderColor = "rgba(142,22,22,0.20)";
                        e.currentTarget.style.color       = "#8e1616";
                        e.currentTarget.style.background  = "rgba(142,22,22,0.04)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.borderColor = "rgba(0,0,0,0.10)";
                        e.currentTarget.style.color       = "#8888aa";
                        e.currentTarget.style.background  = "rgba(255,255,255,0.60)";
                      }
                    }}
                  >
                    {/* Radio circle */}
                    <span style={{
                      width:        15,
                      height:       15,
                      borderRadius: "50%",
                      border:       `2px solid ${active ? "#8e1616" : "rgba(0,0,0,0.22)"}`,
                      display:      "flex",
                      alignItems:   "center",
                      justifyContent: "center",
                      transition:   "border-color 0.18s ease",
                      flexShrink:   0,
                    }}>
                      {active && (
                        <span style={{
                          width:        7,
                          height:       7,
                          borderRadius: "50%",
                          background:   "#8e1616",
                          animation:    "scaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both",
                        }} />
                      )}
                    </span>
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Row 2: Unique ID + Fingerprint ── */}
          <div style={M.row}>
            <div style={M.field}>
              <label style={M.label}>Unique ID / IP</label>
              <div style={M.inputRow}>
                <input
                  style={{
                    ...M.input,
                    borderColor:
                      isBlocked   ? "rgba(244,63,94,0.45)" :
                      isMismatch  ? "rgba(245,158,11,0.45)" :
                      isValid     ? "rgba(5,150,105,0.45)" :
                      isChecking  ? "rgba(142,22,22,0.35)" : "rgba(0,0,0,0.10)",
                  }}
                  value={uniqueId}
                  onChange={(e) => handleUidChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 192.168.1.1 or UID-00123"
                  onFocus={(e) => {
                    if (vStatus === "idle") {
                      e.currentTarget.style.borderColor = "rgba(142,22,22,0.40)";
                      e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(142,22,22,0.07)";
                    }
                  }}
                  onBlur={(e) => {
                    if (vStatus === "idle") {
                      e.currentTarget.style.borderColor = "rgba(0,0,0,0.10)";
                      e.currentTarget.style.boxShadow   = "none";
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
                  <span style={{ color: "#8e1616", marginLeft: 6, fontSize: 9, fontWeight: 700 }}>AUTO-FILLED</span>
                )}
              </label>
              <div style={M.inputRow}>
                <input
                  style={{
                    ...M.input,
                    borderColor: validation.result.known_fingerprint
                      ? "rgba(142,22,22,0.28)"
                      : isMismatch ? "rgba(245,158,11,0.40)" : "rgba(0,0,0,0.10)",
                    background: validation.result.known_fingerprint && !confirmed
                      ? "rgba(142,22,22,0.04)"
                      : "rgba(255,255,255,0.90)",
                  }}
                  value={fingerprint}
                  onChange={(e) => handleFpChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. FP-A4B2C"
                  onFocus={(e) => {
                    if (!validation.result.known_fingerprint) {
                      e.currentTarget.style.borderColor = "rgba(142,22,22,0.40)";
                      e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(142,22,22,0.07)";
                    }
                  }}
                  onBlur={(e) => {
                    if (!validation.result.known_fingerprint) {
                      e.currentTarget.style.borderColor = "rgba(0,0,0,0.10)";
                      e.currentTarget.style.boxShadow   = "none";
                    }
                  }}
                />
                <CopyButton value={fingerprint} label="fingerprint" />
              </div>
            </div>
          </div>

          {/* ── Live validation result ── */}
          {vStatus !== "idle" && (
            <div style={{
              background:
                isBlocked   ? "rgba(244,63,94,0.05)" :
                isMismatch  ? "rgba(245,158,11,0.05)" :
                isValid     ? "rgba(5,150,105,0.05)"  :
                isChecking  ? "rgba(142,22,22,0.04)"  : "rgba(0,0,0,0.03)",
              border: `1px solid ${
                isBlocked   ? "rgba(244,63,94,0.18)" :
                isMismatch  ? "rgba(245,158,11,0.18)" :
                isValid     ? "rgba(5,150,105,0.18)"  :
                isChecking  ? "rgba(142,22,22,0.15)"  : "rgba(0,0,0,0.06)"
              }`,
              borderRadius: 10, padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 10,
              animation: "fadeIn 0.2s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  color:   isChecking ? "#8e1616" : isValid ? "#059669" : isBlocked ? "#f43f5e" : "#f59e0b",
                  fontSize: 14, display: "flex", alignItems: "center",
                }}>
                  {isChecking ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      style={{ animation: "spin 1s linear infinite" }}>
                      <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.08)" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                    </svg>
                  ) : isValid ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                    </svg>
                  )}
                </span>
                <span style={{
                  fontWeight: 700, fontSize: 12.5,
                  color:
                    isChecking ? "#8e1616" : isValid ? "#059669" :
                    isBlocked  ? "#f43f5e" : isMismatch ? "#f59e0b" : "#f43f5e",
                }}>
                  {isChecking  ? "Checking bindings…"        :
                   isValid     ? "Valid — ready to confirm"   :
                   isBlocked   ? "Blocked — in cooldown"      :
                   isMismatch  ? "Fingerprint Conflict"       : "Validation Error"}
                </span>
              </div>

              {validation.result.message && !isChecking && (
                <span style={{ color: "#8888aa", fontSize: 11.5, lineHeight: 1.5 }}>
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
                  <span style={{ color: "#8888aa", fontSize: 10, fontWeight: 500 }}>Bound fingerprint:</span>
                  <code style={{ color: "#d97706", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace" }}>
                    {validation.result.expected_fingerprint}
                  </code>
                </div>
              )}

              {isValid && validation.result.known_fingerprint && (
                <div style={{
                  background: "rgba(5,150,105,0.04)", border: "1px solid rgba(5,150,105,0.12)",
                  borderRadius: 8, padding: "8px 12px",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "#8888aa", fontSize: 10, fontWeight: 500 }}>Recalled fingerprint:</span>
                    <code style={{ color: "#059669", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace" }}>
                      {validation.result.known_fingerprint}
                    </code>
                  </div>
                  <CopyButton value={validation.result.known_fingerprint} label="fingerprint" />
                </div>
              )}
            </div>
          )}

          {/* ── Verify button ── */}
          {showConfirmBtn && (
            <button
              disabled={confirming || isChecking || isBlocked}
              onClick={handleConfirm}
              style={{
                background:     confirming
                  ? "rgba(142,22,22,0.25)"
                  : "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
                border:         "none",
                borderRadius:   9,
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
                boxShadow:      confirming ? "none" : "0 4px 14px rgba(142,22,22,0.28)",
                transition:     "all 0.2s cubic-bezier(0.16,1,0.3,1)",
              }}
              onMouseEnter={(e) => { if (!confirming) e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { if (!confirming) e.currentTarget.style.opacity = "1";    }}
            >
              {confirming ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Verifying…
                </>
              ) : "✓  Verify Identity"}
            </button>
          )}

          {/* ── Confirmed banner ── */}
          {confirmed && (
            <div style={{
              background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.18)",
              borderRadius: 8, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 8,
              color: "#059669", fontSize: 12, fontWeight: 600,
              animation: "fadeUp 0.22s cubic-bezier(0.16,1,0.3,1) both",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Identity verified — you may now save this record.
            </div>
          )}

          {confirmMsg && !confirmed && (
            <div style={{
              background: confirmMsg.ok ? "rgba(5,150,105,0.07)"  : "rgba(244,63,94,0.06)",
              border: `1px solid ${confirmMsg.ok ? "rgba(5,150,105,0.18)" : "rgba(244,63,94,0.18)"}`,
              borderRadius: 8, padding: "10px 14px",
              color: confirmMsg.ok ? "#059669" : "#f43f5e",
              fontSize: 12, fontWeight: 500,
              animation: "fadeIn 0.2s ease",
            }}>
              {confirmMsg.ok ? "✓ " : "⚠ "}{confirmMsg.text}
            </div>
          )}

          {/* ── Info hint ── */}
          <div style={M.infoBox}>
            💡 Type the Unique ID/IP to run a live binding audit. Click <strong>Verify</strong> to confirm
            the identity is clear, then save. Press{" "}
            <kbd style={M.kbd}>Enter</kbd> to save after verifying.
          </div>

          {error && <div style={M.errorBox}>{error}</div>}
        </div>

        {/* ── Footer ── */}
        <div style={M.footer}>
          <button
            style={M.btnCancel}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; e.currentTarget.style.color = "#1a1a2e"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent";       e.currentTarget.style.color = "#8888aa"; }}
          >
            Cancel
          </button>
          <button
            style={saving ? M.btnSaveDisabled : M.btnSave}
            onClick={handleSave}
            disabled={saving}
            onMouseEnter={(e) => { if (!saving) { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={(e) => { if (!saving) { e.currentTarget.style.opacity = "1";    e.currentTarget.style.transform = "none"; } }}
          >
            {saving ? "Saving…" : "Save Record"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Style object — white glassmorphism, red accent only ───────────────────────
const M: Record<string, React.CSSProperties> = {
  overlay: {
    position:       "fixed",
    inset:          0,
    background:     "rgba(10, 10, 20, 0.35)",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    zIndex:         1000,
    fontFamily:     "'Sarabun', -apple-system, sans-serif",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    animation:      "fadeIn 0.2s ease",
  },
  modal: {
    background:    "rgba(255,255,255,0.82)",
    backdropFilter: "blur(28px) saturate(2)",
    WebkitBackdropFilter: "blur(28px) saturate(2)",
    border:        "1px solid rgba(0,0,0,0.08)",
    borderRadius:  20,
    width:         "100%",
    maxWidth:      640,
    boxShadow:     "0 24px 70px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)",
    display:       "flex",
    flexDirection: "column",
    maxHeight:     "90vh",
    overflowY:     "auto",
    animation:     "scaleIn 0.22s cubic-bezier(0.16,1,0.3,1) both",
  },
  header: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    padding:        "16px 22px",
    borderBottom:   "1px solid rgba(0,0,0,0.07)",
  },
  headerTitle: {
    color:         "#1a1a2e",
    fontWeight:    700,
    fontSize:      16,
    letterSpacing: -0.2,
  },
  closeBtn: {
    background:   "transparent",
    border:       "none",
    borderRadius: 7,
    color:        "#8888aa",
    cursor:       "pointer",
    fontSize:     15,
    lineHeight:   1,
    padding:      "5px 7px",
    transition:   "all 0.18s ease",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
  },
  body: {
    padding:       "18px 22px",
    display:       "flex",
    flexDirection: "column",
    gap:           13,
  },
  row:      { display: "flex", gap: 12, flexWrap: "wrap" as const },
  field:    { display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 200 },
  inputRow: { display: "flex", alignItems: "center", gap: 6 },
  label: {
    color:         "#8888aa",
    fontSize:      10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    display:       "flex",
    alignItems:    "center",
    gap:           4,
    fontWeight:    600,
  },
  input: {
    background:   "rgba(255,255,255,0.90)",
    border:       "1px solid rgba(0,0,0,0.10)",
    borderRadius: 9,
    color:        "#1a1a2e",
    padding:      "9px 12px",
    fontSize:     13,
    fontFamily:   "inherit",
    outline:      "none",
    flex:         1,
    width:        "100%",
    transition:   "border-color 0.18s ease, box-shadow 0.18s ease",
  },
  kbd: {
    background:   "rgba(0,0,0,0.05)",
    border:       "1px solid rgba(0,0,0,0.12)",
    borderRadius: 5,
    padding:      "1px 6px",
    fontSize:     11,
    color:        "#444466",
    fontFamily:   "'JetBrains Mono', monospace",
  },
  infoBox: {
    background:   "rgba(142,22,22,0.04)",
    border:       "1px solid rgba(142,22,22,0.12)",
    color:        "#7a4040",
    borderRadius: 9,
    padding:      "11px 14px",
    fontSize:     12,
    lineHeight:   1.65,
  },
  errorBox: {
    background:   "rgba(244,63,94,0.05)",
    border:       "1px solid rgba(244,63,94,0.18)",
    color:        "#f43f5e",
    borderRadius: 8,
    padding:      "10px 12px",
    fontSize:     12,
  },
  footer: {
    display:        "flex",
    justifyContent: "flex-end",
    gap:            10,
    padding:        "14px 22px",
    borderTop:      "1px solid rgba(0,0,0,0.07)",
  },
  btnCancel: {
    background:   "transparent",
    border:       "1px solid rgba(0,0,0,0.10)",
    color:        "#8888aa",
    borderRadius: 9,
    padding:      "9px 18px",
    fontSize:     13,
    cursor:       "pointer",
    fontFamily:   "inherit",
    transition:   "all 0.18s ease",
  },
  btnSave: {
    background:   "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
    border:       "none",
    color:        "#fff",
    borderRadius: 9,
    padding:      "9px 22px",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
    fontFamily:   "inherit",
    boxShadow:    "0 4px 14px rgba(142,22,22,0.28)",
    transition:   "all 0.18s cubic-bezier(0.16,1,0.3,1)",
  },
  btnSaveDisabled: {
    background:   "rgba(0,0,0,0.05)",
    border:       "1px solid rgba(0,0,0,0.08)",
    color:        "#bbbbcc",
    borderRadius: 9,
    padding:      "9px 22px",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "not-allowed",
    fontFamily:   "inherit",
    boxShadow:    "none",
  },
};
