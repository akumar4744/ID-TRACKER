// File: src/pages/EmployeeManagement.tsx
// UI REDESIGN ONLY — all logic, RPCs, and data flows preserved exactly.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { getProfile } from "../lib/auth";
import type { UserProfile } from "../lib/auth";

interface Employee {
  id:          string;
  email:       string;
  full_name:   string;
  role:        string;
  status:      string;
  created_at:  string;
  last_active: string | null;
  revoked_at:  string | null;
  is_owner?:   boolean;
}

interface AddressSummary {
  total:     number;
  pending:   number;
  completed: number;
  failed:    number;
}

interface WorkAssignment {
  id:          string;
  address:     string;
  category:    string | null;
  status:      string;
  assigned_at: string;
  updated_at:  string;
}

interface Credential {
  id:                string;
  employee_id:       string;
  platform:          string;
  platform_email:    string;
  platform_password: string;
  notes:             string | null;
  created_at:        string;
}

interface EmployeeTask {
  id:          string;
  employee_id: string;
  title:       string;
  description: string | null;
  category:    string | null;
  priority:    string;
  status:      string;
  due_date:    string | null;
  created_at:  string;
}

type PanelView  = "list" | "create" | "detail";
type DetailTab  = "overview" | "work" | "credentials" | "tasks";

export default function EmployeeManagement() {
  const { T } = useTheme();
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [panel,       setPanel]       = useState<PanelView>("list");
  const [selected,    setSelected]    = useState<Employee | null>(null);
  const [addrSummary, setAddrSummary] = useState<AddressSummary | null>(null);
  const [actionMsg,   setActionMsg]   = useState("");
  const [actionErr,   setActionErr]   = useState("");

  const [newEmail,    setNewEmail]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName,     setNewName]     = useState("");
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState("");

  const [confirmTarget, setConfirmTarget] = useState<Employee | null>(null);
  const [confirmInput,  setConfirmInput]  = useState("");
  const [deleting,      setDeleting]      = useState(false);
  const [deleteErr,     setDeleteErr]     = useState("");

  // Detail tab
  const [detailTab,    setDetailTab]    = useState<DetailTab>("overview");

  // Work tracking
  const [workAssignments,    setWorkAssignments]    = useState<WorkAssignment[]>([]);
  const [workAssignLoading,  setWorkAssignLoading]  = useState(false);

  // Credentials
  const [credentials,    setCredentials]    = useState<Credential[]>([]);
  const [credLoading,    setCredLoading]    = useState(false);
  const [showCredForm,   setShowCredForm]   = useState(false);
  const [credPlatform,   setCredPlatform]   = useState("");
  const [credEmail,      setCredEmail]      = useState("");
  const [credPassword,   setCredPassword]   = useState("");
  const [credNotes,      setCredNotes]      = useState("");
  const [credSaving,     setCredSaving]     = useState(false);
  const [credErr,        setCredErr]        = useState("");
  const [credMsg,        setCredMsg]        = useState("");
  const [revealedCreds,  setRevealedCreds]  = useState<Set<string>>(new Set());

  // Tasks
  const [tasks,          setTasks]          = useState<EmployeeTask[]>([]);
  const [tasksLoading,   setTasksLoading]   = useState(false);
  const [showTaskForm,   setShowTaskForm]   = useState(false);
  const [taskTitle,      setTaskTitle]      = useState("");
  const [taskDesc,       setTaskDesc]       = useState("");
  const [taskCategory,   setTaskCategory]   = useState("");
  const [taskPriority,   setTaskPriority]   = useState("normal");
  const [taskDueDate,    setTaskDueDate]    = useState("");
  const [taskSending,    setTaskSending]    = useState(false);
  const [taskErr,        setTaskErr]        = useState("");
  const [taskMsg,        setTaskMsg]        = useState("");

  // ── Owner / ownership-transfer / admin-password state ──
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const isOwner = currentProfile?.is_owner === true;

  // Transfer ownership flow
  const [showTransfer,      setShowTransfer]      = useState(false);
  const [transferPhrase,    setTransferPhrase]    = useState("");
  const [transferring,      setTransferring]      = useState(false);
  const [transferErr,       setTransferErr]       = useState("");

  // Admin password change (owner-only)
  const [showPwdChange,     setShowPwdChange]     = useState(false);
  const [newAdminPwd,       setNewAdminPwd]       = useState("");
  const [newAdminPwd2,      setNewAdminPwd2]      = useState("");
  const [pwdChanging,       setPwdChanging]       = useState(false);
  const [pwdErr,            setPwdErr]            = useState("");
  const [pwdMsg,            setPwdMsg]            = useState("");

  // Fetch current profile once
  useEffect(() => {
    let cancelled = false;
    getProfile().then((p) => { if (!cancelled) setCurrentProfile(p); });
    return () => { cancelled = true; };
  }, []);

  async function handleTransferOwnership(toUserId: string) {
    setTransferring(true); setTransferErr("");
    const { data, error } = await supabase.rpc("transfer_ownership", {
      p_to_user_id:          toUserId,
      p_confirmation_phrase: transferPhrase,
    });
    setTransferring(false);
    if (error) { setTransferErr(error.message); return; }
    const result = data as { ok: boolean; error?: string };
    if (!result.ok) { setTransferErr(result.error ?? "Transfer failed"); return; }
    setActionMsg("Ownership transferred. You are no longer the owner.");
    setShowTransfer(false); setTransferPhrase("");
    await fetchEmployees();
    // Refresh own profile to reflect demoted state
    const p = await getProfile();
    setCurrentProfile(p);
  }

  async function handleSetAdminPassword(targetId: string) {
    if (newAdminPwd.length < 8) { setPwdErr("Password must be at least 8 characters."); return; }
    if (newAdminPwd !== newAdminPwd2) { setPwdErr("Passwords do not match."); return; }
    setPwdChanging(true); setPwdErr(""); setPwdMsg("");
    const { data, error } = await supabase.rpc("owner_set_admin_password", {
      p_target_id:    targetId,
      p_new_password: newAdminPwd,
    });
    setPwdChanging(false);
    if (error) { setPwdErr(error.message); return; }
    const result = data as { ok: boolean; error?: string };
    if (!result.ok) { setPwdErr(result.error ?? "Password change failed"); return; }
    setPwdMsg("✓ Password updated.");
    setNewAdminPwd(""); setNewAdminPwd2(""); setShowPwdChange(false);
    setTimeout(() => setPwdMsg(""), 3000);
  }

  async function fetchEmployees() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, created_at, last_active, revoked_at, is_owner")
      .order("created_at", { ascending: false });
    if (!error) setEmployees((data as Employee[]) ?? []);
    setLoading(false);
  }

  async function fetchAddressSummary(empId: string) {
    setAddrSummary(null);
    const { data } = await supabase
      .from("address_assignments")
      .select("status")
      .eq("employee_id", empId);
    if (!data) return;
    const rows = data as { status: string }[];
    setAddrSummary({
      total:     rows.length,
      pending:   rows.filter((r) => r.status === "Pending").length,
      completed: rows.filter((r) => r.status === "Completed").length,
      failed:    rows.filter((r) => r.status === "Failed").length,
    });
  }

  async function fetchWorkAssignments(empId: string) {
    setWorkAssignLoading(true);
    const { data } = await supabase
      .from("address_assignments")
      .select("id, status, assigned_at, updated_at, category, addresses(address)")
      .eq("employee_id", empId)
      .order("assigned_at", { ascending: false });
    if (data) {
      setWorkAssignments((data as any[]).map((r) => ({
        id:          r.id,
        address:     r.addresses?.address ?? "—",
        category:    r.category ?? null,
        status:      r.status,
        assigned_at: r.assigned_at,
        updated_at:  r.updated_at,
      })));
    }
    setWorkAssignLoading(false);
  }

  async function fetchCredentials(empId: string) {
    setCredLoading(true);
    const { data } = await supabase
      .from("employee_credentials")
      .select("id, employee_id, platform, platform_email, platform_password, notes, created_at")
      .eq("employee_id", empId)
      .order("created_at", { ascending: false });
    if (data) setCredentials(data as Credential[]);
    setCredLoading(false);
  }

  async function handleAddCredential(empId: string) {
    if (!credPlatform.trim() || !credEmail.trim() || !credPassword.trim()) {
      setCredErr("Platform, email and password are all required."); return;
    }
    setCredSaving(true); setCredErr(""); setCredMsg("");
    const { error } = await supabase.from("employee_credentials").insert({
      employee_id:       empId,
      platform:          credPlatform.trim(),
      platform_email:    credEmail.trim(),
      platform_password: credPassword.trim(),
      notes:             credNotes.trim() || null,
    });
    setCredSaving(false);
    if (error) { setCredErr(error.message); return; }
    setCredMsg("✓ Credential saved.");
    setCredPlatform(""); setCredEmail(""); setCredPassword(""); setCredNotes("");
    setShowCredForm(false);
    await fetchCredentials(empId);
    setTimeout(() => setCredMsg(""), 3000);
  }

  async function handleDeleteCredential(credId: string, empId: string) {
    const { error } = await supabase.from("employee_credentials").delete().eq("id", credId);
    if (!error) {
      setCredentials((prev) => prev.filter((c) => c.id !== credId));
      setRevealedCreds((prev) => { const n = new Set(prev); n.delete(credId); return n; });
    }
  }

  async function fetchTasks(empId: string) {
    setTasksLoading(true);
    const { data } = await supabase
      .from("employee_tasks")
      .select("id, employee_id, title, description, category, priority, status, due_date, created_at")
      .eq("employee_id", empId)
      .order("created_at", { ascending: false });
    if (data) setTasks(data as EmployeeTask[]);
    setTasksLoading(false);
  }

  async function handleSendTask(empId: string) {
    if (!taskTitle.trim()) {
      setTaskErr("Task title is required."); return;
    }
    setTaskSending(true); setTaskErr(""); setTaskMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("employee_tasks").insert({
      employee_id: empId,
      title:       taskTitle.trim(),
      description: taskDesc.trim() || null,
      category:    taskCategory.trim() || null,
      priority:    taskPriority,
      status:      "Pending",
      due_date:    taskDueDate ? new Date(taskDueDate).toISOString() : null,
      created_by:  user?.id ?? null,
    });
    setTaskSending(false);
    if (error) { setTaskErr(error.message); return; }
    setTaskMsg("✓ Task sent to employee.");
    setTaskTitle(""); setTaskDesc(""); setTaskCategory(""); setTaskPriority("normal"); setTaskDueDate("");
    setShowTaskForm(false);
    await fetchTasks(empId);
    setTimeout(() => setTaskMsg(""), 3000);
  }

  async function handleDeleteTask(taskId: string, empId: string) {
    const { error } = await supabase.from("employee_tasks").delete().eq("id", taskId);
    if (!error) setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  useEffect(() => { fetchEmployees(); }, []);

  async function handleCreate() {
    if (!newEmail.trim() || !newPassword.trim() || !newName.trim()) {
      setCreateErr("All fields are required."); return;
    }
    if (newPassword.length < 6) {
      setCreateErr("Password must be at least 6 characters."); return;
    }
    setCreating(true); setCreateErr("");
    try {
      const session = await supabase.auth.getSession();
      const token   = session.data.session?.access_token;
      if (!token) { setCreateErr("Not authenticated."); setCreating(false); return; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            p_email: newEmail.trim().toLowerCase(),
            p_password: newPassword.trim(),
            p_full_name: newName.trim(),
          }),
        }
      );
      const result = await res.json() as { ok: boolean; error?: string };
      if (!result.ok) { setCreateErr(result.error ?? "Failed to create"); setCreating(false); return; }
      setNewEmail(""); setNewPassword(""); setNewName("");
      setPanel("list"); await fetchEmployees();
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : "Network error.");
    } finally { setCreating(false); }
  }

  async function handleRevoke(emp: Employee, action: "revoked" | "reactivated") {
    setActionMsg(""); setActionErr("");
    const { data, error } = await supabase.rpc("revoke_employee", {
      p_target_id: emp.id, p_action: action,
    });
    if (error) { setActionErr(error.message); return; }
    const result = data as { ok: boolean; error?: string; status?: string };
    if (!result.ok) { setActionErr(result.error ?? "Action failed"); return; }
    setActionMsg(action === "revoked" ? "Employee revoked." : "Employee reactivated.");
    await fetchEmployees();
    if (selected?.id === emp.id)
      setSelected((prev) => prev ? { ...prev, status: result.status ?? prev.status } : prev);
  }

  function promptDelete(emp: Employee) {
    if (emp.status !== "revoked") return;
    setConfirmTarget(emp); setConfirmInput(""); setDeleteErr("");
  }

  async function handleDeleteConfirm() {
    if (!confirmTarget) return;
    const expectedName = (confirmTarget.full_name || confirmTarget.email).trim();
    if (confirmInput.trim() !== expectedName) {
      setDeleteErr(`Type exactly: "${expectedName}" to confirm deletion.`); return;
    }
    setDeleting(true); setDeleteErr("");
    try {
      const { data, error } = await supabase.rpc("delete_employee", { p_target_id: confirmTarget.id });
      if (error) {
        setDeleteErr(error.message.includes("does not exist") || error.message.includes("not found")
          ? "The delete_employee RPC is not yet configured on your backend."
          : error.message);
        setDeleting(false); return;
      }
      const result = data as { ok: boolean; error?: string };
      if (!result.ok) { setDeleteErr(result.error ?? "Delete failed"); setDeleting(false); return; }
      setConfirmTarget(null); setConfirmInput("");
      setActionMsg(`Employee "${expectedName}" has been deleted.`);
      if (selected?.id === confirmTarget.id) { setSelected(null); setPanel("list"); }
      await fetchEmployees();
    } catch (err: unknown) {
      setDeleteErr(err instanceof Error ? err.message : "Unexpected error.");
    } finally { setDeleting(false); }
  }

  // ── List ────────────────────────────────────────────────────────────────
  function renderList() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
              Employee Accounts
            </h2>
            <p style={{ color: T.textMuted, margin: "4px 0 0", fontSize: 12 }}>
              All admin-created employee accounts
            </p>
          </div>
          <button style={S.addBtn} onClick={() => { setPanel("create"); setCreateErr(""); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Create Employee
          </button>
        </div>

        {actionMsg && <StatusBanner type="success" message={actionMsg} />}
        {actionErr && <StatusBanner type="error"   message={actionErr} />}

        {/* Employee cards grid */}
        {loading ? (
          <div style={{ ...S.tableCard, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
            <LoadingRows />
          </div>
        ) : employees.length === 0 ? (
          <div style={{ ...S.tableCard, background: T.bgCard, border: `1px solid ${T.borderCard}` }}>
            <EmptyTableState message="No employees yet. Create one to get started." />
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}>
            {employees.map((emp, i) => {
              const initials = (emp.full_name || emp.email).slice(0, 2).toUpperCase();
              const statusColor =
                emp.status === "active"   ? "#10b981" :
                emp.status === "revoked"  ? "#f43f5e" : "#f59e0b";
              const statusBg =
                emp.status === "active"   ? "rgba(16,185,129,0.1)"  :
                emp.status === "revoked"  ? "rgba(244,63,94,0.1)"   : "rgba(245,158,11,0.1)";

              function openDetail() {
                setSelected(emp); setPanel("detail");
                setActionMsg(""); setActionErr("");
                setDetailTab("overview");
                setWorkAssignments([]); setCredentials([]); setTasks([]);
                setShowCredForm(false); setCredErr(""); setCredMsg("");
                setShowTaskForm(false); setTaskErr(""); setTaskMsg("");
                setTaskTitle(""); setTaskDesc(""); setTaskCategory(""); setTaskPriority("normal"); setTaskDueDate("");
                fetchAddressSummary(emp.id);
                fetchWorkAssignments(emp.id);
                fetchCredentials(emp.id);
                fetchTasks(emp.id);
              }

              return (
                <div
                  key={emp.id}
                  onClick={openDetail}
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${T.borderCard}`,
                    borderRadius: 14,
                    padding: "20px 18px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    opacity: emp.status === "revoked" ? 0.6 : 1,
                    boxShadow: T.shadowCard,
                    animation: `fadeUp 0.3s ease ${i * 0.05}s both`,
                    transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.25)";
                    e.currentTarget.style.borderColor = "rgba(142,22,22,0.30)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = T.shadowCard;
                    e.currentTarget.style.borderColor = T.borderCard;
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(142,22,22,0.30), rgba(142,22,22,0.10))",
                    border: "1px solid rgba(142,22,22,0.28)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#8e1616", fontSize: 16, fontWeight: 700,
                    boxShadow: "0 0 14px rgba(142,22,22,0.18)",
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>

                  {/* Name */}
                  <div style={{
                    color: T.textPrimary, fontSize: 13, fontWeight: 600,
                    textAlign: "center", lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", maxWidth: "100%",
                  }}
                    title={emp.full_name || emp.email}
                  >
                    {emp.full_name || emp.email}
                  </div>

                  {/* Status dot + label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: statusBg, borderRadius: 99,
                      padding: "3px 10px",
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: statusColor, flexShrink: 0,
                        boxShadow: `0 0 6px ${statusColor}`,
                      }} />
                      <span style={{ color: statusColor, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3 }}>
                        {emp.status}
                      </span>
                    </div>
                    {emp.is_owner && (
                      <span style={{
                        background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))",
                        border: "1px solid rgba(245,158,11,0.4)",
                        color: "#f59e0b", borderRadius: 99,
                        padding: "3px 9px", fontSize: 9.5, fontWeight: 700,
                        letterSpacing: 0.5, textTransform: "uppercase",
                      }}>
                        ★ Owner
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Create form ──────────────────────────────────────────────────────────
  function renderCreate() {
    return (
      <div style={{ ...S.formCard, background: T.bgCard, border: `1px solid ${T.borderCard}`, boxShadow: T.shadowCard }}>
        <div style={S.formHeader}>
          <button style={{ ...S.backBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => { setPanel("list"); setCreateErr(""); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <h2 style={{ color: T.textPrimary, fontSize: 16, fontWeight: 700, margin: 0 }}>
            Create Employee
          </h2>
        </div>

        <div style={S.formBody}>
          <FormField label="Full Name">
            <input style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }} value={newName}
              onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" autoComplete="off" />
          </FormField>
          <FormField label="Email">
            <input style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }} type="email" value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@company.com" autoComplete="off" />
          </FormField>
          <FormField label="Password">
            <input style={{ ...S.input, background: T.bgInput, border: `1px solid ${T.borderInput}`, color: T.textPrimary }} type="password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" autoComplete="new-password" />
          </FormField>

          {createErr && <StatusBanner type="error" message={createErr} />}

          <div style={{ ...S.formNote, color: T.textMuted, background: T.bgBtn, border: `1px solid ${T.borderBtn}` }}>
            Account is created server-side via secure admin API.
            Role is set to employee automatically.
          </div>

          <div style={S.formActions}>
            <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => { setPanel("list"); setCreateErr(""); }}>
              Cancel
            </button>
            <button style={creating ? S.submitBtnDisabled : S.submitBtn}
              onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create Employee"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ───────────────────────────────────────────────────────
  function renderDetail() {
    if (!selected) return null;
    const emp = employees.find((e) => e.id === selected.id) ?? selected;

    // ── work tab helpers ────────────────────────────────────────────────
    const wPending   = workAssignments.filter((a) => a.status === "Pending").length;
    const wCompleted = workAssignments.filter((a) => a.status === "Completed").length;
    const wFailed    = workAssignments.filter((a) => a.status === "Failed").length;
    const wTotal     = workAssignments.length;
    const completionPct = wTotal > 0 ? Math.round((wCompleted / wTotal) * 100) : 0;

    const TAB_LABELS: { id: DetailTab; label: string }[] = [
      { id: "overview",    label: "Overview"      },
      { id: "work",        label: "Work Tracking" },
      { id: "tasks",       label: "Tasks"         },
      { id: "credentials", label: "Credentials"   },
    ];

    return (
      <div style={{
        background: T.bgCard, border: `1px solid ${T.borderCard}`,
        boxShadow: T.shadowCard, borderRadius: 14,
        display: "flex", flexDirection: "column", gap: 0,
        animation: "fadeUp 0.3s ease both",
        maxWidth: 780,
      }}>
        {/* ── Header row ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "18px 22px 14px",
          borderBottom: `1px solid ${T.dividerSolid}`,
        }}>
          <button
            style={{ ...S.backBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}
            onClick={() => setPanel("list")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            <h2 style={{ color: T.textPrimary, fontSize: 15, fontWeight: 700, margin: 0 }}>
              {emp.full_name || emp.email}
            </h2>
            <span style={{ color: T.textMuted, fontSize: 11 }}>{emp.email}</span>
          </div>
          <StatusBadge status={emp.status} />
        </div>

        {/* ── Tab bar ── */}
        <div style={{
          display: "flex", gap: 0,
          borderBottom: `1px solid ${T.dividerSolid}`,
          padding: "0 22px",
        }}>
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setDetailTab(id)}
              style={{
                background: "none", border: "none",
                borderBottom: detailTab === id ? "2px solid #8e1616" : "2px solid transparent",
                color: detailTab === id ? "#8e1616" : T.textMuted,
                padding: "11px 16px 9px",
                fontSize: 12, fontWeight: detailTab === id ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center",
                transition: "all 0.15s ease",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Action messages (shown on all tabs) ── */}
        {(actionMsg || actionErr) && (
          <div style={{ padding: "12px 22px 0" }}>
            {actionMsg && <StatusBanner type="success" message={actionMsg} />}
            {actionErr && <StatusBanner type="error"   message={actionErr} />}
          </div>
        )}

        {/* ══════════ OVERVIEW TAB ══════════ */}
        {detailTab === "overview" && (
          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Employee info rows */}
            <div style={S.detailGrid}>
              <DR label="Full Name"   value={emp.full_name || "—"} />
              <DR label="Email"       value={emp.email} mono />
              <DR label="Role"        value={emp.role}   badge roleKey={emp.role} />
              <DR label="Status"      value={emp.status} badge statusKey={emp.status} />
              <DR label="Created"     value={new Date(emp.created_at).toLocaleString()} />
              <DR label="Last Active"
                value={emp.last_active
                  ? `${new Date(emp.last_active).toLocaleString()} (${timeAgo(emp.last_active)})`
                  : "Never"} />
              {emp.revoked_at && (
                <DR label="Revoked At" value={new Date(emp.revoked_at).toLocaleString()} />
              )}
            </div>

            {/* Proxy assignment summary */}
            {addrSummary !== null && (
              <div style={{ ...S.addrSummary, background: T.bgInput, border: `1px solid ${T.borderInput}` }}>
                <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Assigned Proxies
                </span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  <Chip label="Total"     count={addrSummary.total}     color="#8e1616" />
                  <Chip label="Pending"   count={addrSummary.pending}   color="#f59e0b" />
                  <Chip label="Completed" count={addrSummary.completed} color="#10b981" />
                  <Chip label="Failed"    count={addrSummary.failed}    color="#f43f5e" />
                </div>
              </div>
            )}

            {/* Action buttons */}
            {emp.role !== "admin" && (
              <div style={S.detailActions}>
                {emp.status !== "revoked" ? (
                  <button style={S.revokeBtn} onClick={() => handleRevoke(emp, "revoked")}>
                    🚫 Revoke Access
                  </button>
                ) : (
                  <>
                    <button style={S.reactivateBtn} onClick={() => handleRevoke(emp, "reactivated")}>
                      ✅ Reactivate Access
                    </button>
                    <button style={S.deleteBtnLarge}
                      onClick={() => { setActionMsg(""); setActionErr(""); promptDelete(emp); }}>
                      🗑 Delete Employee
                    </button>
                  </>
                )}
              </div>
            )}

            {emp.status === "revoked" && (
              <div style={{
                background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.15)",
                borderRadius: 8, padding: "10px 14px",
                color: "rgba(244,63,94,0.8)", fontSize: 12, lineHeight: 1.6,
              }}>
                ⚠ This employee is revoked. You may permanently delete them. Deletion will unassign all their
                address assignments. This action cannot be undone.
              </div>
            )}

            {/* ══════ OWNER-ONLY ACTIONS (visible only to current owner, for admin targets) ══════ */}
            {isOwner && emp.role === "admin" && emp.id !== currentProfile?.id && (
              <div style={{
                background: "linear-gradient(135deg, rgba(245,158,11,0.05), rgba(245,158,11,0.02))",
                border: "1px solid rgba(245,158,11,0.22)",
                borderRadius: 12, padding: "16px 18px",
                display: "flex", flexDirection: "column", gap: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>★</span>
                  <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
                    Owner-only Actions
                  </span>
                </div>
                <span style={{ color: T.textMuted, fontSize: 11, lineHeight: 1.5 }}>
                  Sensitive controls visible only to the current owner. These cannot be reached by other admins.
                </span>

                {/* — Transfer Ownership — */}
                {!emp.is_owner && (
                  <div style={{
                    background: T.bgInput, border: `1px solid ${T.borderInput}`,
                    borderRadius: 8, padding: "12px 14px",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <span style={{ color: T.textPrimary, fontSize: 12, fontWeight: 600 }}>
                      Transfer Ownership to {emp.full_name || emp.email}
                    </span>
                    {!showTransfer ? (
                      <button
                        onClick={() => { setShowTransfer(true); setTransferErr(""); setTransferPhrase(""); }}
                        style={{
                          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                          color: "#f59e0b", borderRadius: 7, padding: "7px 14px",
                          fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          alignSelf: "flex-start",
                        }}
                      >
                        ★ Begin Ownership Transfer
                      </button>
                    ) : (
                      <>
                        <span style={{ color: "rgba(244,63,94,0.85)", fontSize: 11.5, lineHeight: 1.5 }}>
                          ⚠ This will demote you from owner. The new owner gains full power including the ability
                          to remove any other profile. Type exactly <strong>TRANSFER OWNERSHIP</strong> to confirm.
                        </span>
                        <input
                          value={transferPhrase}
                          onChange={(e) => { setTransferPhrase(e.target.value); setTransferErr(""); }}
                          placeholder="Type confirmation phrase"
                          autoComplete="off"
                          style={{
                            background: "rgba(8,10,20,0.5)", border: `1px solid ${
                              transferPhrase === "TRANSFER OWNERSHIP"
                                ? "rgba(16,185,129,0.4)"
                                : transferPhrase
                                  ? "rgba(244,63,94,0.4)"
                                  : T.borderInput
                            }`,
                            color: T.textPrimary, borderRadius: 6, padding: "9px 12px",
                            fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none",
                          }}
                        />
                        {transferErr && (
                          <span style={{ color: "#f43f5e", fontSize: 11, fontWeight: 500 }}>⚠ {transferErr}</span>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => { setShowTransfer(false); setTransferErr(""); setTransferPhrase(""); }}
                            style={{
                              background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
                              color: T.textSecondary, borderRadius: 7, padding: "7px 14px",
                              fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleTransferOwnership(emp.id)}
                            disabled={transferring || transferPhrase !== "TRANSFER OWNERSHIP"}
                            style={{
                              background: transferring || transferPhrase !== "TRANSFER OWNERSHIP"
                                ? "rgba(245,158,11,0.2)"
                                : "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
                              border: "none",
                              color: transferring || transferPhrase !== "TRANSFER OWNERSHIP" ? T.textMuted : "#fff",
                              borderRadius: 7, padding: "7px 16px",
                              fontSize: 12, fontWeight: 700,
                              cursor: transferring || transferPhrase !== "TRANSFER OWNERSHIP" ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {transferring ? "Transferring…" : "Confirm Transfer"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* — Change Admin Password — */}
                <div style={{
                  background: T.bgInput, border: `1px solid ${T.borderInput}`,
                  borderRadius: 8, padding: "12px 14px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <span style={{ color: T.textPrimary, fontSize: 12, fontWeight: 600 }}>
                    Change Password for {emp.full_name || emp.email}
                  </span>
                  {!showPwdChange ? (
                    <button
                      onClick={() => { setShowPwdChange(true); setPwdErr(""); setPwdMsg(""); setNewAdminPwd(""); setNewAdminPwd2(""); }}
                      style={{
                        background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.28)",
                        color: "#8e1616", borderRadius: 7, padding: "7px 14px",
                        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        alignSelf: "flex-start",
                      }}
                    >
                      🔑 Change Admin Password
                    </button>
                  ) : (
                    <>
                      <input
                        type="password"
                        value={newAdminPwd}
                        onChange={(e) => { setNewAdminPwd(e.target.value); setPwdErr(""); }}
                        placeholder="New password (min 8 chars)"
                        autoComplete="new-password"
                        style={{
                          background: "rgba(8,10,20,0.5)", border: `1px solid ${T.borderInput}`,
                          color: T.textPrimary, borderRadius: 6, padding: "9px 12px",
                          fontSize: 12, fontFamily: "inherit", outline: "none",
                        }}
                      />
                      <input
                        type="password"
                        value={newAdminPwd2}
                        onChange={(e) => { setNewAdminPwd2(e.target.value); setPwdErr(""); }}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        style={{
                          background: "rgba(8,10,20,0.5)", border: `1px solid ${
                            newAdminPwd && newAdminPwd2 && newAdminPwd !== newAdminPwd2
                              ? "rgba(244,63,94,0.4)"
                              : T.borderInput
                          }`,
                          color: T.textPrimary, borderRadius: 6, padding: "9px 12px",
                          fontSize: 12, fontFamily: "inherit", outline: "none",
                        }}
                      />
                      {pwdErr && (
                        <span style={{ color: "#f43f5e", fontSize: 11, fontWeight: 500 }}>⚠ {pwdErr}</span>
                      )}
                      {pwdMsg && (
                        <span style={{ color: "#10b981", fontSize: 11, fontWeight: 500 }}>{pwdMsg}</span>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => { setShowPwdChange(false); setPwdErr(""); setNewAdminPwd(""); setNewAdminPwd2(""); }}
                          style={{
                            background: T.bgBtn, border: `1px solid ${T.borderBtn}`,
                            color: T.textSecondary, borderRadius: 7, padding: "7px 14px",
                            fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSetAdminPassword(emp.id)}
                          disabled={pwdChanging || newAdminPwd.length < 8 || newAdminPwd !== newAdminPwd2}
                          style={{
                            background: pwdChanging || newAdminPwd.length < 8 || newAdminPwd !== newAdminPwd2
                              ? "rgba(142,22,22,0.18)"
                              : "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
                            border: "none",
                            color: pwdChanging || newAdminPwd.length < 8 || newAdminPwd !== newAdminPwd2 ? T.textMuted : "#fff",
                            borderRadius: 7, padding: "7px 16px",
                            fontSize: 12, fontWeight: 700,
                            cursor: pwdChanging || newAdminPwd.length < 8 || newAdminPwd !== newAdminPwd2 ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {pwdChanging ? "Updating…" : "Update Password"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ WORK TRACKING TAB ══════════ */}
        {detailTab === "work" && (
          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

            {workAssignLoading ? (
              <LoadingRows />
            ) : (
              <>
                {/* Summary stat cards */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  {[
                    { label: "Total Assigned", value: wTotal,     color: "#8e1616", bg: "rgba(142,22,22,0.05)", border: "rgba(142,22,22,0.18)" },
                    { label: "Pending",         value: wPending,   color: "#f59e0b", bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.18)"  },
                    { label: "Completed",       value: wCompleted, color: "#10b981", bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.18)"  },
                    { label: "Failed",          value: wFailed,    color: "#f43f5e", bg: "rgba(244,63,94,0.06)",   border: "rgba(244,63,94,0.18)"   },
                  ].map(({ label, value, color, bg, border }) => (
                    <div key={label} style={{
                      flex: "1 1 120px", background: bg, border: `1px solid ${border}`,
                      borderRadius: 10, padding: "12px 16px",
                      display: "flex", flexDirection: "column", gap: 4,
                    }}>
                      <span style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
                      <span style={{ color: T.textMuted, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase" as const, fontWeight: 600 }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Completion progress bar */}
                {wTotal > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600 }}>Completion Rate</span>
                      <span style={{ color: completionPct >= 70 ? "#10b981" : completionPct >= 30 ? "#f59e0b" : "#f43f5e", fontSize: 12, fontWeight: 700 }}>
                        {completionPct}%
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: T.bgInput, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${completionPct}%`,
                        background: completionPct >= 70 ? "#10b981" : completionPct >= 30 ? "#f59e0b" : "#f43f5e",
                        borderRadius: 99, transition: "width 0.6s ease",
                      }} />
                    </div>
                    <span style={{ color: T.textMuted, fontSize: 10 }}>
                      {wCompleted} of {wTotal} tasks completed • {wFailed} failed • {wPending} pending
                    </span>
                  </div>
                )}

                {/* Assignment list */}
                {workAssignments.length === 0 ? (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 10, padding: "32px 20px", textAlign: "center" as const,
                    background: T.bgInput, border: `1px solid ${T.borderInput}`,
                    borderRadius: 10,
                  }}>
                    <span style={{ fontSize: 28 }}>📭</span>
                    <span style={{ color: T.textMuted, fontSize: 13 }}>No work assignments yet for this employee.</span>
                  </div>
                ) : (
                  <div style={{
                    background: T.bgCard, border: `1px solid ${T.borderCard}`,
                    borderRadius: 10, overflow: "hidden",
                  }}>
                    <div style={{
                      display: "flex", padding: "8px 14px",
                      background: T.bgTableHeader, borderBottom: `1px solid ${T.dividerSolid}`,
                      fontSize: 9.5, fontWeight: 600, color: T.textMuted,
                      letterSpacing: 0.8, textTransform: "uppercase" as const,
                    }}>
                      <span style={{ flex: "2 1 160px" }}>Proxy IP</span>
                      <span style={{ flex: "1 1 100px" }}>Category</span>
                      <span style={{ flex: "0 0 90px" }}>Status</span>
                      <span style={{ flex: "0 0 130px" }}>Assigned At</span>
                      <span style={{ flex: "0 0 130px" }}>Updated At</span>
                    </div>
                    <div style={{ maxHeight: 340, overflowY: "auto" }}>
                      {workAssignments.map((a, i) => {
                        const sc: Record<string, { color: string; bg: string; border: string }> = {
                          Pending:   { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
                          Completed: { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)"  },
                          Failed:    { color: "#f43f5e", bg: "rgba(244,63,94,0.08)",   border: "rgba(244,63,94,0.22)"   },
                        };
                        const st = sc[a.status] ?? { color: "#8892b0", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" };
                        return (
                          <div key={a.id} style={{
                            display: "flex", alignItems: "center", padding: "9px 14px",
                            borderBottom: i < workAssignments.length - 1 ? `1px solid ${T.borderTableRow}` : "none",
                            fontSize: 11.5,
                          }}>
                            <span style={{ flex: "2 1 160px", color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}
                              title={a.address}>
                              {a.address}
                            </span>
                            <span style={{ flex: "1 1 100px", color: T.textMuted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                              {a.category || "—"}
                            </span>
                            <span style={{ flex: "0 0 90px" }}>
                              <span style={{
                                background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                                borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                              }}>
                                {a.status}
                              </span>
                            </span>
                            <span style={{ flex: "0 0 130px", color: T.textMuted, fontSize: 10.5 }}>
                              {new Date(a.assigned_at).toLocaleDateString()}
                            </span>
                            <span style={{ flex: "0 0 130px", color: T.textMuted, fontSize: 10.5 }}>
                              {a.updated_at !== a.assigned_at ? new Date(a.updated_at).toLocaleDateString() : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed report panel */}
                {wTotal > 0 && (
                  <div style={{
                    background: T.bgInput, border: `1px solid ${T.borderInput}`,
                    borderRadius: 10, padding: "14px 16px",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      Detailed Report
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.borderTableRow}`, paddingBottom: 5 }}>
                        <span style={{ color: T.textMuted }}>Total proxy assignments</span>
                        <span style={{ color: T.textPrimary, fontWeight: 600 }}>{wTotal}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.borderTableRow}`, paddingBottom: 5 }}>
                        <span style={{ color: T.textMuted }}>Work completion rate</span>
                        <span style={{ color: completionPct >= 70 ? "#10b981" : "#f59e0b", fontWeight: 600 }}>{completionPct}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.borderTableRow}`, paddingBottom: 5 }}>
                        <span style={{ color: T.textMuted }}>Pending tasks</span>
                        <span style={{ color: wPending > 0 ? "#f59e0b" : T.textMuted, fontWeight: 600 }}>{wPending}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.borderTableRow}`, paddingBottom: 5 }}>
                        <span style={{ color: T.textMuted }}>Successfully completed</span>
                        <span style={{ color: "#10b981", fontWeight: 600 }}>{wCompleted}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.borderTableRow}`, paddingBottom: 5 }}>
                        <span style={{ color: T.textMuted }}>Failed / errors</span>
                        <span style={{ color: wFailed > 0 ? "#f43f5e" : T.textMuted, fontWeight: 600 }}>{wFailed}</span>
                      </div>
                      {workAssignments.length > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: T.textMuted }}>Most recent assignment</span>
                          <span style={{ color: T.textSecondary, fontWeight: 500 }}>
                            {new Date(workAssignments[0].assigned_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════ TASKS TAB ══════════ */}
        {detailTab === "tasks" && (
          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header + Assign button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>
                {tasks.length} task{tasks.length !== 1 ? "s" : ""} assigned
              </span>
              <button
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: showTaskForm ? T.bgBtn : "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
                  border: showTaskForm ? `1px solid ${T.borderBtn}` : "none",
                  color: showTaskForm ? T.textSecondary : "#fff",
                  borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: showTaskForm ? "none" : "0 4px 12px rgba(142,22,22,0.28)",
                }}
                onClick={() => { setShowTaskForm((v) => !v); setTaskErr(""); }}
              >
                {showTaskForm ? "✕ Cancel" : "+ Assign New Task"}
              </button>
            </div>

            {/* Task creation form */}
            {showTaskForm && (
              <div style={{
                background: T.bgInput, border: `1px solid ${T.borderInput}`,
                borderRadius: 10, padding: "16px",
                display: "flex", flexDirection: "column", gap: 12,
                animation: "fadeUp 0.2s ease both",
              }}>
                <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>Assign New Task</span>

                {/* Title */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
                    Task Title *
                  </label>
                  <input
                    style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Verify proxy batch for client X"
                    autoComplete="off"
                  />
                </div>

                {/* Description */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
                    Description (optional)
                  </label>
                  <textarea
                    style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12, resize: "vertical" as const, minHeight: 70, fontFamily: "inherit" }}
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    placeholder="Detailed instructions for the employee…"
                    rows={3}
                  />
                </div>

                {/* Category + priority + due date row */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
                      Category (optional)
                    </label>
                    <input
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                      value={taskCategory}
                      onChange={(e) => setTaskCategory(e.target.value)}
                      placeholder="e.g. Verification, Research…"
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "0 1 140px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
                      Priority
                    </label>
                    <select
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 180px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
                      Due Date (optional)
                    </label>
                    <input
                      type="datetime-local"
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                    />
                  </div>
                </div>

                {taskErr && <StatusBanner type="error" message={taskErr} />}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}
                    onClick={() => { setShowTaskForm(false); setTaskErr(""); }}
                  >
                    Cancel
                  </button>
                  <button
                    style={taskSending ? S.submitBtnDisabled : S.submitBtn}
                    onClick={() => handleSendTask(emp.id)}
                    disabled={taskSending}
                  >
                    {taskSending ? "Sending…" : "📤 Send to Employee"}
                  </button>
                </div>
              </div>
            )}

            {taskMsg && <StatusBanner type="success" message={taskMsg} />}

            {/* Task list */}
            {tasksLoading ? (
              <LoadingRows />
            ) : tasks.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, padding: "32px 20px", textAlign: "center" as const,
                background: T.bgInput, border: `1px solid ${T.borderInput}`,
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 28 }}>✅</span>
                <span style={{ color: T.textMuted, fontSize: 13 }}>No tasks assigned yet. Click "+ Assign New Task" to send one.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tasks.map((t) => {
                  const sc: Record<string, { color: string; bg: string; border: string }> = {
                    Pending:   { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
                    Completed: { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)"  },
                    Failed:    { color: "#f43f5e", bg: "rgba(244,63,94,0.08)",   border: "rgba(244,63,94,0.22)"   },
                  };
                  const st = sc[t.status] ?? { color: "#8892b0", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" };
                  const pc: Record<string, string> = {
                    low:    "#60a5fa",
                    normal: "#8e1616",
                    high:   "#f43f5e",
                  };
                  const priorityColor = pc[t.priority] ?? "#8e1616";

                  return (
                    <div key={t.id} style={{
                      background: T.bgCard, border: `1px solid ${T.borderCard}`,
                      borderLeft: `3px solid ${priorityColor}`,
                      borderRadius: 10, padding: "14px 16px",
                      display: "flex", flexDirection: "column", gap: 8,
                      animation: "fadeUp 0.2s ease both",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                            <span style={{ color: T.textPrimary, fontSize: 13.5, fontWeight: 600 }}>{t.title}</span>
                            <span style={{
                              background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                              borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                            }}>{t.status}</span>
                            <span style={{
                              background: `${priorityColor}15`, color: priorityColor,
                              border: `1px solid ${priorityColor}40`,
                              borderRadius: 5, padding: "2px 8px", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5,
                            }}>{t.priority}</span>
                          </div>
                          {t.description && (
                            <span style={{ color: T.textSecondary, fontSize: 11.5, lineHeight: 1.5 }}>{t.description}</span>
                          )}
                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const, marginTop: 2 }}>
                            {t.category && (
                              <span style={{ color: T.textMuted, fontSize: 10.5 }}>
                                <span style={{ color: T.textTertiary, textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: 600, fontSize: 9, marginRight: 4 }}>Category:</span>
                                {t.category}
                              </span>
                            )}
                            <span style={{ color: T.textMuted, fontSize: 10.5 }}>
                              <span style={{ color: T.textTertiary, textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: 600, fontSize: 9, marginRight: 4 }}>Sent:</span>
                              {new Date(t.created_at).toLocaleDateString()}
                            </span>
                            {t.due_date && (
                              <span style={{ color: new Date(t.due_date) < new Date() && t.status === "Pending" ? "#f43f5e" : T.textMuted, fontSize: 10.5 }}>
                                <span style={{ color: T.textTertiary, textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: 600, fontSize: 9, marginRight: 4 }}>Due:</span>
                                {new Date(t.due_date).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteTask(t.id, emp.id)}
                          title="Delete task"
                          style={{
                            background: "none", border: "1px solid rgba(244,63,94,0.2)",
                            borderRadius: 5, color: "rgba(244,63,94,0.6)",
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
        )}

        {/* ══════════ CREDENTIALS TAB ══════════ */}
        {detailTab === "credentials" && (
          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Security notice */}
            <div style={{
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 8, padding: "10px 14px",
              display: "flex", alignItems: "flex-start", gap: 9,
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#f59e0b", fontSize: 11.5, fontWeight: 600 }}>Security Notice</span>
                <span style={{ color: "rgba(245,158,11,0.8)", fontSize: 11, lineHeight: 1.5 }}>
                  These are <strong>external platform credentials</strong> (e.g. GitHub, social accounts) — not this portal's login.
                  Passwords are stored for admin reference only and are protected by row-level security.
                  Do not store highly sensitive credentials without additional encryption.
                </span>
              </div>
            </div>

            {/* Header + Add button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>
                {credentials.length} credential{credentials.length !== 1 ? "s" : ""} stored
              </span>
              <button
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: showCredForm ? T.bgBtn : "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
                  border: showCredForm ? `1px solid ${T.borderBtn}` : "none",
                  color: showCredForm ? T.textSecondary : "#fff",
                  borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: showCredForm ? "none" : "0 4px 12px rgba(142,22,22,0.28)",
                }}
                onClick={() => { setShowCredForm((v) => !v); setCredErr(""); }}
              >
                {showCredForm ? "✕ Cancel" : "+ Add Credential"}
              </button>
            </div>

            {/* Add credential form */}
            {showCredForm && (
              <div style={{
                background: T.bgInput, border: `1px solid ${T.borderInput}`,
                borderRadius: 10, padding: "16px",
                display: "flex", flexDirection: "column", gap: 12,
                animation: "fadeUp 0.2s ease both",
              }}>
                <span style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>Add Platform Credential</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>Platform *</label>
                    <input
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                      value={credPlatform}
                      onChange={(e) => setCredPlatform(e.target.value)}
                      placeholder="e.g. GitHub, Twitter…"
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>Email / Username *</label>
                    <input
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                      value={credEmail}
                      onChange={(e) => setCredEmail(e.target.value)}
                      placeholder="user@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>Password *</label>
                    <input
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                      type="text"
                      value={credPassword}
                      onChange={(e) => setCredPassword(e.target.value)}
                      placeholder="Platform password"
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px" }}>
                    <label style={{ color: T.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" as const }}>Notes (optional)</label>
                    <input
                      style={{ ...S.input, background: "rgba(8,10,20,0.4)", color: T.textPrimary, fontSize: 12 }}
                      value={credNotes}
                      onChange={(e) => setCredNotes(e.target.value)}
                      placeholder="Any relevant notes…"
                      autoComplete="off"
                    />
                  </div>
                </div>
                {credErr && <StatusBanner type="error" message={credErr} />}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }}
                    onClick={() => { setShowCredForm(false); setCredErr(""); }}
                  >
                    Cancel
                  </button>
                  <button
                    style={credSaving ? S.submitBtnDisabled : S.submitBtn}
                    onClick={() => handleAddCredential(emp.id)}
                    disabled={credSaving}
                  >
                    {credSaving ? "Saving…" : "Save Credential"}
                  </button>
                </div>
              </div>
            )}

            {credMsg && <StatusBanner type="success" message={credMsg} />}

            {/* Credentials list */}
            {credLoading ? (
              <LoadingRows />
            ) : credentials.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, padding: "32px 20px", textAlign: "center" as const,
                background: T.bgInput, border: `1px solid ${T.borderInput}`,
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 28 }}>🔑</span>
                <span style={{ color: T.textMuted, fontSize: 13 }}>No credentials stored yet. Click "+ Add Credential" to begin.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {credentials.map((cred) => {
                  const isRevealed = revealedCreds.has(cred.id);
                  return (
                    <div key={cred.id} style={{
                      background: T.bgCard, border: `1px solid ${T.borderCard}`,
                      borderRadius: 10, padding: "14px 16px",
                      display: "flex", flexDirection: "column", gap: 8,
                      animation: "fadeUp 0.2s ease both",
                    }}>
                      {/* Top row: platform + delete */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            background: "rgba(142,22,22,0.08)", border: "1px solid rgba(142,22,22,0.22)",
                            color: "#8e1616", borderRadius: 6, padding: "3px 10px",
                            fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                          }}>
                            {cred.platform}
                          </span>
                          <span style={{ color: T.textMuted, fontSize: 10 }}>
                            Added {new Date(cred.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteCredential(cred.id, emp.id)}
                          title="Delete credential"
                          style={{
                            background: "none", border: "1px solid rgba(244,63,94,0.2)",
                            borderRadius: 5, color: "rgba(244,63,94,0.6)",
                            fontSize: 10, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(244,63,94,0.08)";
                            e.currentTarget.style.color = "#f43f5e";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "none";
                            e.currentTarget.style.color = "rgba(244,63,94,0.6)";
                          }}
                        >
                          🗑 Delete
                        </button>
                      </div>

                      {/* Credential fields */}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
                          <span style={{ color: T.textMuted, fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.7, fontWeight: 600 }}>Email / Username</span>
                          <span style={{ color: T.textPrimary, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                            {cred.platform_email}
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
                          <span style={{ color: T.textMuted, fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.7, fontWeight: 600 }}>Password</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: T.textPrimary, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                              {isRevealed ? cred.platform_password : "•".repeat(Math.min(cred.platform_password.length, 12))}
                            </span>
                            <button
                              onClick={() => setRevealedCreds((prev) => {
                                const n = new Set(prev);
                                isRevealed ? n.delete(cred.id) : n.add(cred.id);
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
                        {cred.notes && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
                            <span style={{ color: T.textMuted, fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.7, fontWeight: 600 }}>Notes</span>
                            <span style={{ color: T.textSecondary, fontSize: 11 }}>{cred.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Delete modal ─────────────────────────────────────────────────────
  function renderDeleteModal() {
    if (!confirmTarget) return null;
    const expectedName = (confirmTarget.full_name || confirmTarget.email).trim();
    const nameMatches  = confirmInput.trim() === expectedName;

    return (
      <div style={S.modalOverlay}>
        <div style={{ ...S.modal, background: T.bgCardAlt, border: `1px solid rgba(244,63,94,0.2)` }}>
          <div style={{ ...S.modalHeader, borderBottom: `1px solid ${T.dividerSolid}` }}>
            <span style={{ color: "#f43f5e", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  stroke="currentColor" strokeWidth="1.5" />
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Delete Employee
            </span>
            <button style={{ ...S.closeBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => { setConfirmTarget(null); setDeleteErr(""); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div style={S.modalBody}>
            <div style={{
              background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.18)",
              borderRadius: 8, padding: "12px 14px",
              color: "rgba(248,180,180,0.9)", fontSize: 13, lineHeight: 1.7,
            }}>
              <strong>This action is permanent and cannot be undone.</strong>
              <br />
              All address assignments will be unassigned. The employee account will be removed.
            </div>

            <div style={{
              background: T.bgInput, border: `1px solid ${T.borderInput}`,
              borderRadius: 8, padding: "10px 14px",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <span style={{ color: T.textMuted, fontSize: 11 }}>Deleting:</span>
              <span style={{ color: "#f87171", fontWeight: 700, fontSize: 14 }}>
                {confirmTarget.full_name || confirmTarget.email}
              </span>
              <span style={{ color: T.textMuted, fontSize: 11 }}>{confirmTarget.email}</span>
            </div>

            <FormField label={<>Type <strong style={{ color: "#f43f5e" }}>{expectedName}</strong> to confirm</>}>
              <input
                style={{
                  ...S.input,
                  background: T.bgInput,
                  border: `1px solid ${T.borderInput}`,
                  color: T.textPrimary,
                  borderColor: confirmInput.trim()
                    ? nameMatches ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)"
                    : T.borderInput,
                }}
                value={confirmInput}
                onChange={(e) => { setConfirmInput(e.target.value); setDeleteErr(""); }}
                placeholder={`Type "${expectedName}"`}
                autoFocus autoComplete="off"
              />
            </FormField>

            {deleteErr && <StatusBanner type="error" message={deleteErr} />}
          </div>
          <div style={{ ...S.modalFooter, borderTop: `1px solid ${T.dividerSolid}` }}>
            <button style={{ ...S.cancelBtn, background: T.bgBtn, border: `1px solid ${T.borderBtn}`, color: T.textSecondary }} onClick={() => { setConfirmTarget(null); setDeleteErr(""); }}>
              Cancel
            </button>
            <button
              style={deleting || !nameMatches ? S.deleteBtnDisabled : S.deleteBtnConfirm}
              onClick={handleDeleteConfirm} disabled={deleting || !nameMatches}
            >
              {deleting ? "Deleting…" : "Confirm Delete"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, color: T.textPrimary }}>
      {panel === "list"   && renderList()}
      {panel === "create" && renderCreate()}
      {panel === "detail" && renderDetail()}
      {renderDeleteModal()}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DR({ label, value, mono, badge, roleKey, statusKey }: {
  label: string; value: string; mono?: boolean;
  badge?: boolean; roleKey?: string; statusKey?: string;
}) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0", borderBottom: `1px solid ${T.borderTableRow}` }}>
      <span style={{ color: T.textMuted, fontSize: 11, minWidth: 110, flexShrink: 0 }}>{label}</span>
      {badge && (roleKey || statusKey) ? (
        roleKey ? <RoleBadge role={roleKey} /> : <StatusBadge status={statusKey!} />
      ) : (
        <span style={{
          color: T.textSecondary, fontSize: 12,
          fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
        }}>{value}</span>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ color: T.textSecondary, fontSize: 11, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const { T } = useTheme();
  const isAdmin = role === "admin";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: isAdmin ? "rgba(59,130,246,0.1)" : T.bgBtn,
      color: isAdmin ? "#60a5fa" : T.textSecondary,
      border: `1px solid ${isAdmin ? "rgba(59,130,246,0.25)" : T.borderBtn}`,
      borderRadius: 5, padding: "2px 9px",
      fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
    }}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    active:   { bg: "rgba(16,185,129,0.1)",  color: "#10b981", border: "rgba(16,185,129,0.25)" },
    inactive: { bg: "rgba(245,158,11,0.1)",  color: "#f59e0b", border: "rgba(245,158,11,0.25)" },
    revoked:  { bg: "rgba(244,63,94,0.1)",   color: "#f43f5e", border: "rgba(244,63,94,0.25)"  },
  };
  const s = map[status] ?? { bg: "rgba(255,255,255,0.04)", color: "#8892b0", border: "rgba(255,255,255,0.08)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 5, padding: "2px 9px",
      fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
    }}>
      {status}
    </span>
  );
}

function Chip({ label, count, color }: { label: string; count: number; color: string }) {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.bgBtn,
      border: `1px solid ${color}28`,
      borderRadius: 9, padding: "10px 16px",
      display: "flex", flexDirection: "column",
      alignItems: "center", gap: 3, minWidth: 70,
    }}>
      <span style={{ color, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{count}</span>
      <span style={{ color: T.textMuted, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
        {label}
      </span>
    </div>
  );
}

function StatusBanner({ type, message }: { type: "success" | "error"; message: string }) {
  const isSuccess = type === "success";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9,
      background: isSuccess ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
      border: `1px solid ${isSuccess ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}`,
      borderRadius: 8, padding: "10px 14px",
      color: isSuccess ? "#10b981" : "#f43f5e",
      fontSize: 13, animation: "fadeIn 0.2s ease",
    }}>
      {isSuccess ? "✓" : "⚠"} {message}
    </div>
  );
}

function LoadingRows() {
  return (
    <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      {[0,1,2].map((i) => (
        <div key={i} style={{
          height: 44, borderRadius: 8,
          background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.03) 75%)",
          backgroundSize: "400% 100%",
          animation: `shimmer 1.6s ease infinite ${i * 0.15}s`,
        }} />
      ))}
    </div>
  );
}

function EmptyTableState({ message }: { message: string }) {
  const { T } = useTheme();
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 12, padding: "48px 20px", textAlign: "center",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: T.bgBtn,
        border: `1px solid ${T.borderBtn}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>👥</div>
      <span style={{ color: T.textMuted, fontSize: 13 }}>{message}</span>
    </div>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Styles ────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  addBtn: {
    display: "flex", alignItems: "center", gap: 7,
    background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
    border: "none", color: "#fff",
    borderRadius: 9, padding: "9px 16px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    boxShadow: "0 4px 16px rgba(142,22,22,0.28), inset 0 1px 0 rgba(255,255,255,0.1)",
    transition: "all 0.2s ease",
  },
  tableCard: {
    background: "rgba(13,16,34,0.6)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12, overflow: "hidden",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    backdropFilter: "blur(12px)",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    background: "rgba(8,10,20,0.8)", color: "#4a526e",
    textAlign: "left", padding: "11px 16px",
    fontWeight: 600, fontSize: 10, letterSpacing: 1,
    textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)",
    fontFamily: "inherit",
  },
  tr: { borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s ease" },
  td: { padding: "12px 16px", color: "#8892b0", verticalAlign: "middle" },
  mono: { fontFamily: "'JetBrains Mono', monospace", color: "#6b7a99" },
  nameLink: { color: "#8e1616", cursor: "pointer", fontWeight: 500 },
  revokeBtn: {
    background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.22)",
    color: "#f43f5e", borderRadius: 6, padding: "4px 11px",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  reactivateBtn: {
    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)",
    color: "#10b981", borderRadius: 6, padding: "4px 11px",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  deleteBtn: {
    background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.15)",
    color: "rgba(244,63,94,0.7)", borderRadius: 6, padding: "4px 11px",
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  deleteBtnLarge: {
    background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)",
    color: "#f43f5e", borderRadius: 8, padding: "9px 18px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  deleteBtnConfirm: {
    background: "#f43f5e", border: "none", color: "#fff",
    borderRadius: 8, padding: "9px 22px",
    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  deleteBtnDisabled: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
    color: "#2d3450", borderRadius: 8, padding: "9px 22px",
    fontSize: 13, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit",
  },
  formCard: {
    background: "rgba(13,16,34,0.7)",
    border: "1px solid rgba(255,255,255,0.07)",
    backdropFilter: "blur(16px)",
    borderRadius: 14, padding: "22px",
    maxWidth: 560, display: "flex", flexDirection: "column", gap: 18,
    animation: "fadeUp 0.3s ease both",
  },
  formHeader: { display: "flex", alignItems: "center", gap: 14 },
  formBody: { display: "flex", flexDirection: "column", gap: 14 },
  formActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 },
  formNote: {
    color: "#4a526e", fontSize: 11,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 7, padding: "9px 12px", lineHeight: 1.6,
  },
  backBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#8892b0", borderRadius: 7, padding: "6px 12px",
    fontSize: 12, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  cancelBtn: {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#8892b0", borderRadius: 8, padding: "9px 18px",
    fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  },
  submitBtn: {
    background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
    border: "none", color: "#fff",
    borderRadius: 8, padding: "9px 22px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    boxShadow: "0 4px 16px rgba(142,22,22,0.28)",
  },
  submitBtnDisabled: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
    color: "#2d3450", borderRadius: 8, padding: "9px 22px",
    fontSize: 13, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit",
  },
  input: {
    background: "rgba(8,10,20,0.6)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8, color: "#eef0f8", padding: "10px 12px",
    fontSize: 13, fontFamily: "inherit", outline: "none",
    transition: "border-color 0.15s ease",
    width: "100%",
  },
  detailGrid: { display: "flex", flexDirection: "column" },
  detailActions: { display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" },
  addrSummary: {
    background: "rgba(8,10,20,0.5)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10, padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: 12,
  },
  modalOverlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, animation: "fadeIn 0.2s ease",
  },
  modal: {
    background: "rgba(13,16,34,0.95)",
    border: "1px solid rgba(244,63,94,0.2)",
    backdropFilter: "blur(24px)",
    borderRadius: 16, width: "100%", maxWidth: 460,
    boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(244,63,94,0.08)",
    display: "flex", flexDirection: "column",
    animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both",
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  closeBtn: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
    color: "#8892b0", cursor: "pointer", borderRadius: 6,
    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0,
  },
  modalBody: { padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 },
  modalFooter: {
    display: "flex", justifyContent: "flex-end", gap: 10,
    padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
  },
};