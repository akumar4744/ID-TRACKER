// File: src/pages/TasksManagement.tsx
// Global tasks manager: admin composes a task once and sends it to ONE or MORE
// employees. Backed by the existing `employee_tasks` table (also surfaced
// per-employee in EmployeeManagement → Tasks tab).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

interface Employee {
  id:        string;
  email:     string;
  full_name: string;
  status:    string;
}

interface TaskRow {
  id:             string;
  employee_id:    string;
  employee_name:  string | null;
  employee_email: string | null;
  title:          string;
  description:    string | null;
  category:       string | null;
  priority:       string;
  status:         string;
  due_date:       string | null;
  created_at:     string;
}

export default function TasksManagement() {
  const { T } = useTheme();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks,     setTasks]     = useState<TaskRow[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [filterEmp,    setFilterEmp]    = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search,       setSearch]       = useState("");

  // Create form
  const [showForm,    setShowForm]    = useState(false);
  const [empIds,      setEmpIds]      = useState<Set<string>>(new Set()); // multi-select
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState("");
  const [priority,    setPriority]    = useState("normal");
  const [dueDate,     setDueDate]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState("");
  const [msg,         setMsg]         = useState("");

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("role", "employee")
      .order("full_name");
    if (data) setEmployees(data as Employee[]);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_tasks")
      .select(`
        id, employee_id, title, description, category, priority, status, due_date, created_at,
        profiles!employee_id ( full_name, email )
      `)
      .order("created_at", { ascending: false });
    if (data) {
      setTasks((data as any[]).map((r) => ({
        id:             r.id,
        employee_id:    r.employee_id,
        employee_name:  r.profiles?.full_name ?? null,
        employee_email: r.profiles?.email ?? null,
        title:          r.title,
        description:    r.description ?? null,
        category:       r.category ?? null,
        priority:       r.priority,
        status:         r.status,
        due_date:       r.due_date ?? null,
        created_at:     r.created_at,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmployees(); fetchTasks(); }, [fetchEmployees, fetchTasks]);

  function toggleEmp(id: string) {
    setEmpIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function handleSend() {
    if (empIds.size === 0)        { setErr("Pick at least one employee."); return; }
    if (!title.trim())            { setErr("Task title is required."); return; }
    setSaving(true); setErr(""); setMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    const rows = Array.from(empIds).map((eid) => ({
      employee_id: eid,
      title:       title.trim(),
      description: description.trim() || null,
      category:    category.trim() || null,
      priority,
      status:      "Pending",
      due_date:    dueDate ? new Date(dueDate).toISOString() : null,
      created_by:  user?.id ?? null,
    }));
    const { error } = await supabase.from("employee_tasks").insert(rows);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setMsg(`✓ Task sent to ${empIds.size} employee${empIds.size !== 1 ? "s" : ""}.`);
    setTitle(""); setDescription(""); setCategory(""); setPriority("normal");
    setDueDate(""); setEmpIds(new Set()); setShowForm(false);
    await fetchTasks();
    setTimeout(() => setMsg(""), 3000);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("employee_tasks").delete().eq("id", id);
    if (!error) setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  const filtered = tasks.filter((t) => {
    if (filterEmp && t.employee_id !== filterEmp) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false) ||
      (t.category?.toLowerCase().includes(q) ?? false) ||
      (t.employee_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const pending   = tasks.filter((t) => t.status === "Pending").length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  const failed    = tasks.filter((t) => t.status === "Failed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: T.textPrimary }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
            Task Composer
          </h2>
          <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""} sent · {pending} pending · {completed} completed · {failed} failed
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setErr(""); }}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: showForm ? T.bgBtn : "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
            border: showForm ? `1px solid ${T.borderBtn}` : "none",
            color: showForm ? T.textSecondary : "#fff",
            borderRadius: 9, padding: "9px 16px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            boxShadow: showForm ? "none" : "0 4px 16px rgba(124,108,248,0.3)",
          }}
        >
          {showForm ? "✕ Cancel" : "+ Compose & Send Task"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: T.bgInput, border: `1px solid ${T.borderInput}`,
          borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 12,
          animation: "fadeUp 0.2s ease both",
        }}>
          <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>
            Compose Task
          </span>

          {/* Title */}
          <Field label="Task Title *" flex="1 1 100%">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Verify proxy batch for client X" style={inputStyle(T)} autoComplete="off" />
          </Field>

          {/* Description */}
          <Field label="Description (optional)" flex="1 1 100%">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed instructions…" rows={3}
              style={{ ...inputStyle(T), resize: "vertical", minHeight: 70, fontFamily: "inherit" }} />
          </Field>

          {/* Category + Priority + Due */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Category (optional)" flex="1 1 160px">
              <input value={category} onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Verification, Research" style={inputStyle(T)} autoComplete="off" />
            </Field>
            <Field label="Priority" flex="0 1 140px">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle(T)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Due Date (optional)" flex="1 1 180px">
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle(T)} />
            </Field>
          </div>

          {/* Employee multi-select */}
          <Field label={`Send to (${empIds.size} selected) *`} flex="1 1 100%">
            <div style={{
              background: "rgba(8,10,20,0.4)", border: `1px solid ${T.borderInput}`,
              borderRadius: 8, padding: "8px 10px",
              display: "flex", flexWrap: "wrap", gap: 6,
              maxHeight: 160, overflowY: "auto",
            }}>
              {employees.filter((e) => e.status === "active").length === 0 && (
                <span style={{ color: T.textMuted, fontSize: 11 }}>No active employees.</span>
              )}
              {employees.filter((e) => e.status === "active").map((e) => {
                const selected = empIds.has(e.id);
                return (
                  <button key={e.id} type="button" onClick={() => toggleEmp(e.id)}
                    style={{
                      background: selected ? "rgba(124,108,248,0.18)" : T.bgBtn,
                      border: `1px solid ${selected ? "rgba(124,108,248,0.4)" : T.borderBtn}`,
                      color: selected ? "#a5a8ff" : T.textSecondary,
                      borderRadius: 99, padding: "4px 12px",
                      fontSize: 11, fontWeight: selected ? 600 : 400,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {selected ? "✓ " : ""}{e.full_name || e.email}
                  </button>
                );
              })}
            </div>
          </Field>

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
              onClick={handleSend}
              disabled={saving}
              style={{
                background: saving
                  ? "rgba(124,108,248,0.35)"
                  : "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
                border: "none", color: "#fff",
                borderRadius: 8, padding: "9px 22px",
                fontSize: 13, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                boxShadow: saving ? "none" : "0 4px 16px rgba(124,108,248,0.3)",
              }}
            >
              {saving ? "Sending…" : `📤 Send Task${empIds.size > 1 ? `s (×${empIds.size})` : ""}`}
            </button>
          </div>
        </div>
      )}

      {msg && <Banner type="success" message={msg} />}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} style={{ ...inputStyle(T), maxWidth: 220 }}>
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle(T), maxWidth: 160 }}>
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="Failed">Failed</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, description, category…"
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
          <span style={{ fontSize: 30 }}>📭</span>
          <span style={{ color: T.textMuted, fontSize: 13 }}>
            {tasks.length === 0
              ? "No tasks yet. Click \"+ Compose & Send Task\" to begin."
              : "No tasks match your filter."}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((t) => {
            const sc: Record<string, { color: string; bg: string; border: string }> = {
              Pending:   { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
              Completed: { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)"  },
              Failed:    { color: "#f43f5e", bg: "rgba(244,63,94,0.08)",   border: "rgba(244,63,94,0.22)"   },
            };
            const st = sc[t.status] ?? { color: "#8892b0", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" };
            const pc: Record<string, string> = { low: "#60a5fa", normal: "#a5a8ff", high: "#f43f5e" };
            const priorityColor = pc[t.priority] ?? "#a5a8ff";
            const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status === "Pending";

            return (
              <div key={t.id} style={{
                background: T.bgCard, border: `1px solid ${T.borderCard}`,
                borderLeft: `3px solid ${priorityColor}`,
                borderRadius: 12, padding: "14px 18px",
                display: "flex", flexDirection: "column", gap: 8,
                boxShadow: T.shadowCard,
                animation: "fadeUp 0.2s ease both",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: T.textPrimary, fontSize: 13.5, fontWeight: 600 }}>{t.title}</span>
                      <span style={{
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                        borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                      }}>{t.status}</span>
                      <span style={{
                        background: `${priorityColor}15`, color: priorityColor,
                        border: `1px solid ${priorityColor}40`,
                        borderRadius: 5, padding: "2px 8px", fontSize: 9.5, fontWeight: 700,
                        textTransform: "uppercase" as const, letterSpacing: 0.5,
                      }}>{t.priority}</span>
                      {overdue && (
                        <span style={{
                          background: "rgba(244,63,94,0.15)", color: "#f43f5e",
                          border: "1px solid rgba(244,63,94,0.4)",
                          borderRadius: 5, padding: "2px 8px", fontSize: 9.5, fontWeight: 700,
                          textTransform: "uppercase" as const, letterSpacing: 0.5,
                        }}>Overdue</span>
                      )}
                    </div>
                    {t.description && (
                      <span style={{ color: T.textSecondary, fontSize: 11.5, lineHeight: 1.5 }}>{t.description}</span>
                    )}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 10.5 }}>
                      <span style={{ color: T.textMuted }}>
                        <span style={metaInlineLabel(T)}>To:</span>
                        <span style={{ color: T.textSecondary, marginLeft: 5 }}>{t.employee_name || t.employee_email || "Unknown"}</span>
                      </span>
                      {t.category && (
                        <span style={{ color: T.textMuted }}>
                          <span style={metaInlineLabel(T)}>Category:</span>
                          <span style={{ marginLeft: 5 }}>{t.category}</span>
                        </span>
                      )}
                      <span style={{ color: T.textMuted }}>
                        <span style={metaInlineLabel(T)}>Sent:</span>
                        <span style={{ marginLeft: 5 }}>{new Date(t.created_at).toLocaleDateString()}</span>
                      </span>
                      {t.due_date && (
                        <span style={{ color: overdue ? "#f43f5e" : T.textMuted }}>
                          <span style={metaInlineLabel(T)}>Due:</span>
                          <span style={{ marginLeft: 5 }}>{new Date(t.due_date).toLocaleString()}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{
                      background: "none", border: "1px solid rgba(244,63,94,0.2)",
                      borderRadius: 5, color: "rgba(244,63,94,0.7)",
                      fontSize: 10, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    🗑
                  </button>
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

function metaInlineLabel(T: ReturnType<typeof useTheme>["T"]): React.CSSProperties {
  return {
    color: T.textTertiary, fontSize: 9,
    textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600,
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
