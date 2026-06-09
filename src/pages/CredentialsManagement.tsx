// File: src/pages/CredentialsManagement.tsx
// Global credentials manager: admin saves platform credentials in one place
// and assigns each to a chosen employee. Backed by the existing
// `employee_credentials` table (also surfaced per-employee in EmployeeManagement).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

interface Employee {
  id:        string;
  email:     string;
  full_name: string;
  status:    string;
}

interface CredentialRow {
  id:                string;
  employee_id:       string;
  employee_name:     string | null;
  employee_email:    string | null;
  platform:          string;
  platform_email:    string;
  platform_password: string;
  notes:             string | null;
  created_at:        string;
}

export default function CredentialsManagement() {
  const { T } = useTheme();

  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filterEmp,   setFilterEmp]   = useState("");
  const [showForm,    setShowForm]    = useState(false);

  // Create form
  const [empId,    setEmpId]    = useState("");
  const [platform, setPlatform] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");
  const [msg,      setMsg]      = useState("");

  // Reveal toggle
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("role", "employee")
      .order("full_name");
    if (data) setEmployees(data as Employee[]);
  }, []);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_credentials")
      .select(`
        id, employee_id, platform, platform_email, platform_password, notes, created_at,
        profiles!employee_id ( full_name, email )
      `)
      .order("created_at", { ascending: false });
    if (data) {
      setCredentials((data as any[]).map((r) => ({
        id:                r.id,
        employee_id:       r.employee_id,
        employee_name:     r.profiles?.full_name ?? null,
        employee_email:    r.profiles?.email ?? null,
        platform:          r.platform,
        platform_email:    r.platform_email,
        platform_password: r.platform_password,
        notes:             r.notes ?? null,
        created_at:        r.created_at,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmployees(); fetchCredentials(); }, [fetchEmployees, fetchCredentials]);

  async function handleSave() {
    if (!empId)                                          { setErr("Select an employee."); return; }
    if (!platform.trim() || !email.trim() || !password.trim()) {
      setErr("Platform, email, and password are all required."); return;
    }
    setSaving(true); setErr(""); setMsg("");
    const { error } = await supabase.from("employee_credentials").insert({
      employee_id:       empId,
      platform:          platform.trim(),
      platform_email:    email.trim(),
      platform_password: password.trim(),
      notes:             notes.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setMsg("✓ Credential saved & sent to employee.");
    setPlatform(""); setEmail(""); setPassword(""); setNotes(""); setEmpId("");
    setShowForm(false);
    await fetchCredentials();
    setTimeout(() => setMsg(""), 3000);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("employee_credentials").delete().eq("id", id);
    if (!error) setCredentials((prev) => prev.filter((c) => c.id !== id));
  }

  const filtered = credentials.filter((c) => {
    if (filterEmp && c.employee_id !== filterEmp) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.platform.toLowerCase().includes(q) ||
      c.platform_email.toLowerCase().includes(q) ||
      (c.employee_name?.toLowerCase().includes(q) ?? false) ||
      (c.employee_email?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: T.textPrimary }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
            Credential Manager
          </h2>
          <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
            {credentials.length} credential{credentials.length !== 1 ? "s" : ""} stored across all employees
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setErr(""); }}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: showForm ? T.bgBtn : "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
            border: showForm ? `1px solid ${T.borderBtn}` : "none",
            color: showForm ? T.textSecondary : "#fff",
            borderRadius: 9, padding: "9px 16px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            boxShadow: showForm ? "none" : "0 4px 16px rgba(142,22,22,0.28)",
          }}
        >
          {showForm ? "✕ Cancel" : "+ Add & Send Credential"}
        </button>
      </div>

      {/* Security notice */}
      <div style={{
        background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
        borderRadius: 8, padding: "10px 14px", display: "flex", gap: 9,
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
        <span style={{ color: "rgba(245,158,11,0.85)", fontSize: 11.5, lineHeight: 1.5 }}>
          These are <strong>external platform credentials</strong> (e.g. GitHub) — not portal logins.
          Protected by row-level security (admins only).
        </span>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: T.bgInput, border: `1px solid ${T.borderInput}`,
          borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 12,
          animation: "fadeUp 0.2s ease both",
        }}>
          <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>New Credential</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Send to Employee *" flex="1 1 200px">
              <select
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                style={inputStyle(T)}
              >
                <option value="">— Select employee —</option>
                {employees.filter((e) => e.status === "active").map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Platform *" flex="1 1 160px">
              <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="e.g. GitHub" style={inputStyle(T)} autoComplete="off" />
            </Field>
            <Field label="Email / Username *" flex="1 1 200px">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" style={inputStyle(T)} autoComplete="off" />
            </Field>
            <Field label="Password *" flex="1 1 160px">
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Platform password" style={{ ...inputStyle(T), fontFamily: "'JetBrains Mono', monospace" }} autoComplete="off" />
            </Field>
            <Field label="Notes (optional)" flex="1 1 100%">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any relevant notes…" style={inputStyle(T)} autoComplete="off" />
            </Field>
          </div>
          {err && <Banner type="error" message={err} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => { setShowForm(false); setErr(""); }}
              style={{
                background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
                color: T.textSecondary, borderRadius: 8, padding: "9px 18px",
                fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving
                  ? "rgba(142,22,22,0.30)"
                  : "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
                border: "none", color: "#fff",
                borderRadius: 8, padding: "9px 22px",
                fontSize: 13, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                boxShadow: saving ? "none" : "0 4px 16px rgba(142,22,22,0.28)",
              }}
            >
              {saving ? "Saving…" : "📤 Save & Send"}
            </button>
          </div>
        </div>
      )}

      {msg && <Banner type="success" message={msg} />}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select
          value={filterEmp}
          onChange={(e) => setFilterEmp(e.target.value)}
          style={{ ...inputStyle(T), maxWidth: 240 }}
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search platform, email, employee…"
          style={{ ...inputStyle(T), flex: "1 1 240px" }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: T.textMuted, padding: "32px", textAlign: "center" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          padding: "48px 20px", textAlign: "center" as const,
          background: T.bgInput, border: `1px solid ${T.borderInput}`, borderRadius: 12,
        }}>
          <span style={{ fontSize: 30 }}>🔑</span>
          <span style={{ color: T.textMuted, fontSize: 13 }}>
            {credentials.length === 0
              ? "No credentials yet. Click \"+ Add & Send Credential\" to begin."
              : "No credentials match your filter."}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((c) => {
            const isRevealed = revealed.has(c.id);
            return (
              <div key={c.id} style={{
                background: T.bgCard, border: `1px solid ${T.borderCard}`,
                borderRadius: 12, padding: "14px 18px",
                display: "flex", flexDirection: "column", gap: 10,
                boxShadow: T.shadowCard,
                animation: "fadeUp 0.2s ease both",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.22)",
                      color: "#8e1616", borderRadius: 6, padding: "3px 10px",
                      fontSize: 11, fontWeight: 700,
                    }}>{c.platform}</span>
                    <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600 }}>
                      → {c.employee_name || c.employee_email || "Unknown"}
                    </span>
                    <span style={{ color: T.textMuted, fontSize: 10 }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    style={{
                      background: "none", border: "1px solid rgba(244,63,94,0.2)",
                      borderRadius: 5, color: "rgba(244,63,94,0.7)",
                      fontSize: 10, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    🗑 Delete
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <Pair label="Email / Username" value={c.platform_email} T={T} mono />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
                    <span style={metaLabel(T)}>Password</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: T.textPrimary, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        {isRevealed ? c.platform_password : "•".repeat(Math.min(c.platform_password.length, 12))}
                      </span>
                      <button
                        onClick={() => setRevealed((prev) => {
                          const n = new Set(prev);
                          isRevealed ? n.delete(c.id) : n.add(c.id);
                          return n;
                        })}
                        style={{
                          background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
                          borderRadius: 4, color: T.textMuted, fontSize: 9.5,
                          padding: "2px 7px", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {isRevealed ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  {c.notes && <Pair label="Notes" value={c.notes} T={T} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function inputStyle(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    background: T.bgInput,
    border: `1px solid ${T.borderInput}`,
    color: T.textPrimary,
    borderRadius: 8, padding: "10px 12px",
    fontSize: 12, fontFamily: "inherit", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
}

function metaLabel(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    color: T.textMuted, fontSize: 9.5,
    textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600,
  };
}

function Field({ label, flex, children }: { label: string; flex: string; children: React.ReactNode }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex }}>
      <label style={metaLabel(T)}>{label}</label>
      {children}
    </div>
  );
}

function Pair({ label, value, T, mono }: { label: string; value: string; T: ReturnType<typeof useTheme>["T"]; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
      <span style={metaLabel(T)}>{label}</span>
      <span style={{
        color: T.textPrimary, fontSize: 12,
        fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
      }}>{value}</span>
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
      color: isSuccess ? "#10b981" : "#f43f5e",
      fontSize: 13,
    }}>
      {isSuccess ? "✓" : "⚠"} {message}
    </div>
  );
}
