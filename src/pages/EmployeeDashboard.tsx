// src/pages/EmployeeDashboard.tsx
// Changes applied from patch (Doc 1 → Doc 2):
//   • Fingerprint auto-fill useEffect: removed `fingerprint` from deps to fix stale-closure bug
//   • handleUidChange: triggers validate when uniqueId has value (fingerprint optional)
//   • handleFpChange: triggers validate when uniqueId has value (fingerprint optional)
//   • Long text truncation in mismatch/valid fingerprint display blocks (max-width + ellipsis)
//   • Added hiddenIds / selectMode / selectedIds bulk-hide feature
//   • Redesigned sidebar, stat cards, task cards, banners, screen share gate
//   • CooldownTimer extracted as standalone component
//   • Confirm button added to TaskCard with 48h cooldown flow

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { useScreenShare } from "../hooks/useScreenShare";
import { useValidation } from "../hooks/useValidation";
import { OverlayGuide } from "../components/OverlayGuide";
import type { UserProfile } from "../lib/auth";

interface Assignment {
  id:           string;
  address_id:   string;
  status:       string;
  assigned_at:  string;
  updated_at:   string;
  address_text: string;
  category:     string | null;
}

interface AdminTask {
  id:          string;
  title:       string;
  description: string | null;
  category:    string | null;
  priority:    string;
  status:      string;
  due_date:    string | null;
  created_at:  string;
}

interface EmployeeDashboardProps {
  onLogout: () => void;
  profile:  UserProfile;
}

type WorkTab = "all" | "Pending" | "Completed" | "Failed";

// ── Copy helper ───────────────────────────────────────────────────────────────
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity  = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

// ── CopyButton ────────────────────────────────────────────────────────────────
function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy ${label}`}
      style={{
        background:   copied ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
        border:       `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 6,
        color:        copied ? "#10b981" : "#8892b0",
        fontSize:     10,
        fontWeight:   600,
        padding:      "3px 8px",
        cursor:       "pointer",
        fontFamily:   "inherit",
        transition:   "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        flexShrink:   0,
        letterSpacing: 0.3,
        display:      "inline-flex",
        alignItems:   "center",
        gap:          4,
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
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span style={{ fontSize: 9 }}>Copy</span>
        </>
      )}
    </button>
  );
}

export default function EmployeeDashboard({ onLogout, profile }: EmployeeDashboardProps) {
  const [assignments,  setAssignments]  = useState<Assignment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [updatingId,   setUpdatingId]   = useState<string | null>(null);
  const [msg,          setMsg]          = useState("");
  const [err,          setErr]          = useState("");
  const [tab,          setTab]          = useState<WorkTab>("all");
  const [search,       setSearch]       = useState("");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const realtimeRef                     = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [hiddenIds,    setHiddenIds]    = useState<Set<string>>(new Set());
  const [selectMode,   setSelectMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());

  const [adminTasks,   setAdminTasks]   = useState<AdminTask[]>([]);
  const [taskUpdating, setTaskUpdating] = useState<string | null>(null);
  const [dashView,     setDashView]     = useState<"proxy" | "tasks">("proxy");

  const screenShare = useScreenShare(profile.id);
  const isWork      = screenShare.status === "active";

  const [overlayEnabled,       setOverlayEnabled]       = useState(false);
  const [showDashboardOverlay, setShowDashboardOverlay] = useState(false);
  const [workToolOpen,         setWorkToolOpen]         = useState(false);

  // Reset overlay gate whenever screen share drops
  useEffect(() => {
    if (!isWork) {
      setOverlayEnabled(false);
      setShowDashboardOverlay(false);
      setWorkToolOpen(false);
    }
  }, [isWork]);

  const fetchAssignments = useCallback(async () => {
    const { data, error } = await supabase
      .from("address_assignments")
      .select("id, address_id, status, assigned_at, updated_at, category, addresses(address)")
      .eq("employee_id", profile.id)
      .order("assigned_at", { ascending: false })
      .limit(50000);

    if (error) { setLoading(false); return; }
    const mapped: Assignment[] = ((data as any[]) ?? []).map((r) => ({
      id:           r.id,
      address_id:   r.address_id,
      status:       r.status,
      assigned_at:  r.assigned_at,
      updated_at:   r.updated_at,
      address_text: r.addresses?.address ?? "—",
      category:     r.category ?? null,
    }));
    setAssignments(mapped);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  // Tasks fetch + realtime
  const fetchAdminTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("employee_tasks")
      .select("id, title, description, category, priority, status, due_date, created_at")
      .eq("employee_id", profile.id)
      .order("created_at", { ascending: false });
    if (!error && data) setAdminTasks(data as AdminTask[]);
  }, [profile.id]);

  useEffect(() => { fetchAdminTasks(); }, [fetchAdminTasks]);

  useEffect(() => {
    const ch = supabase.channel(`emp-tasks-${profile.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "employee_tasks",
        filter: `employee_id=eq.${profile.id}`,
      }, fetchAdminTasks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile.id, fetchAdminTasks]);

  async function handleTaskStatusChange(taskId: string, newStatus: string) {
    if (!isWork) return;
    setTaskUpdating(taskId);
    const { error } = await supabase
      .from("employee_tasks")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", taskId);
    setTaskUpdating(null);
    if (!error) {
      setAdminTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    }
  }

  useEffect(() => {
    const ch = supabase.channel(`emp-assignments-${profile.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "address_assignments",
        filter: `employee_id=eq.${profile.id}`,
      }, fetchAssignments)
      .subscribe();
    realtimeRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [profile.id, fetchAssignments]);

  useEffect(() => {
    if (assignments.length === 0) return;
    const ids = new Set(assignments.map((a) => a.id));
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const hid of next) {
        if (!ids.has(hid)) next.delete(hid);
      }
      return next;
    });
  }, [assignments]);

  async function handleStatusChange(assignmentId: string, newStatus: string) {
    if (!isWork) return;
    setUpdatingId(assignmentId); setMsg(""); setErr("");
    const { data, error } = await supabase.rpc("update_address_status", {
      p_assignment_id: assignmentId,
      p_status:        newStatus,
    });
    setUpdatingId(null);
    if (error) { setErr(error.message); return; }
    const result = data as { ok: boolean; error?: string };
    if (!result.ok) { setErr(result.error ?? "Update failed"); return; }
    setMsg("Status updated.");
    setAssignments((prev) =>
      prev.map((a) => a.id === assignmentId ? { ...a, status: newStatus } : a)
    );
    setTimeout(() => setMsg(""), 3000);
  }

  async function handleLogout() {
    await screenShare.stopSharing("logout");
    await signOut();
    onLogout();
  }

  function handleLaunchWorkTool() {
    if (!overlayEnabled) return;
    setWorkToolOpen(true);
  }

  function handleEnableOverlay() {
    setShowDashboardOverlay(true);
  }

  function handleOverlayDismiss() {
    setShowDashboardOverlay(false);
    setOverlayEnabled(true);
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(displayed.map((a) => a.id)));
  }

  function hideSelected() {
    setHiddenIds((prev) => new Set([...prev, ...selectedIds]));
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  const visibleAssignments = assignments.filter((a) => !hiddenIds.has(a.id));

  const displayed = visibleAssignments.filter((a) => {
    const matchTab    = tab === "all" || a.status === tab;
    const q           = search.trim().toLowerCase();
    const matchSearch = q === "" ||
      a.address_text.toLowerCase().includes(q) ||
      (a.category?.toLowerCase().includes(q) ?? false);
    return matchTab && matchSearch;
  });

  const pending   = visibleAssignments.filter((a) => a.status === "Pending").length;
  const completed = visibleAssignments.filter((a) => a.status === "Completed").length;
  const failed    = visibleAssignments.filter((a) => a.status === "Failed").length;

  return (
    <div style={S.root}>
      <div style={{
        position: "fixed", top: -100, right: -100, width: 400, height: 400,
        background: "radial-gradient(circle, rgba(124,108,248,0.07) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{
        position: "fixed", bottom: -150, left: -100, width: 500, height: 500,
        background: "radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      <aside style={S.sidebar}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 300,
          background: "radial-gradient(ellipse at 50% 0%, rgba(124,108,248,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={S.sidebarTop}>
          <div style={S.brand}>
            <svg width="54" height="40" viewBox="0 0 48 36" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="14" cy="20" r="12" fill="#8B1A1A" />
              <circle cx="33" cy="10" r="7.5" fill="#8B1A1A" />
              <circle cx="40" cy="25" r="4.5" fill="#8B1A1A" />
            </svg>
            <div style={{ ...S.brandText, fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
              Do<span style={{ color: "#8B1A1A" }}>T</span>
            </div>
          </div>

          <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />

          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ color: "#2d3450", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", padding: "6px 10px 4px" }}>
              Work area
            </div>

            {/* My Tasks (proxy) */}
            <button
              onClick={() => setDashView("proxy")}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "9px 10px", borderRadius: 9, width: "100%",
                background: dashView === "proxy" ? "linear-gradient(90deg, rgba(124,108,248,0.15), rgba(124,108,248,0.04))" : "transparent",
                border: dashView === "proxy" ? "1px solid rgba(124,108,248,0.22)" : "1px solid transparent",
                color: dashView === "proxy" ? "#a5a8ff" : "#4a526e",
                fontSize: 12, fontWeight: dashView === "proxy" ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                position: "relative" as const,
                transition: "all 0.18s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>My Tasks</span>
              {dashView === "proxy" && (
                <span style={{
                  position: "absolute", right: 10,
                  width: 5, height: 5, borderRadius: "50%",
                  background: "#7c6cf8",
                  boxShadow: "0 0 8px rgba(124,108,248,0.8)",
                }} />
              )}
            </button>

            {/* Admin Tasks */}
            <button
              onClick={() => setDashView("tasks")}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "9px 10px", borderRadius: 9, width: "100%",
                background: dashView === "tasks" ? "linear-gradient(90deg, rgba(124,108,248,0.15), rgba(124,108,248,0.04))" : "transparent",
                border: dashView === "tasks" ? "1px solid rgba(124,108,248,0.22)" : "1px solid transparent",
                color: dashView === "tasks" ? "#a5a8ff" : "#4a526e",
                fontSize: 12, fontWeight: dashView === "tasks" ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                position: "relative" as const,
                transition: "all 0.18s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Admin Tasks</span>
              {adminTasks.filter((t) => t.status === "Pending").length > 0 && (
                <span style={{
                  marginLeft: "auto",
                  background: "rgba(245,158,11,0.18)",
                  border: "1px solid rgba(245,158,11,0.4)",
                  color: "#f59e0b",
                  borderRadius: 99, padding: "1px 7px",
                  fontSize: 9.5, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {adminTasks.filter((t) => t.status === "Pending").length}
                </span>
              )}
              {dashView === "tasks" && (
                <span style={{
                  position: "absolute", right: 10,
                  width: 5, height: 5, borderRadius: "50%",
                  background: "#7c6cf8",
                  boxShadow: "0 0 8px rgba(124,108,248,0.8)",
                }} />
              )}
            </button>
          </nav>
        </div>

        <div style={S.sidebarBottom}>
          <div style={isWork ? S.shareOn : S.shareOff}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: isWork ? "#10b981" : "#4a526e",
              boxShadow: isWork ? "0 0 8px #10b981" : "none",
              animation: isWork ? "pulseDot 1.6s infinite ease-in-out" : "none",
            }} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{isWork ? "Sharing Active" : "Monitoring Offline"}</span>
          </div>

          {isWork && (
            <>
              {/* Enable Overlay button — shown until overlay is enabled */}
              {!overlayEnabled && (
                <button style={S.enableOverlayBtn} onClick={handleEnableOverlay}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)";
                    e.currentTarget.style.boxShadow = "0 0 12px rgba(245,158,11,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(245,158,11,0.3)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                  </svg>
                  <span>Enable Overlay</span>
                </button>
              )}

              {/* Launch Work Tool — locked until overlay is enabled */}
              <button
                style={overlayEnabled ? S.launchBtn : S.launchBtnLocked}
                onClick={overlayEnabled ? handleLaunchWorkTool : handleEnableOverlay}
                title={overlayEnabled ? undefined : "Enable Overlay first to unlock"}
                onMouseEnter={(e) => {
                  if (overlayEnabled) {
                    e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                    e.currentTarget.style.boxShadow = "0 0 12px rgba(124,108,248,0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (overlayEnabled) {
                    e.currentTarget.style.borderColor = "rgba(124,108,248,0.22)";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                {overlayEnabled ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                <span>{overlayEnabled ? "Launch Work Tool" : "Work Tool (Locked)"}</span>
              </button>
            </>
          )}

          <div style={S.profileCard}>
            <div style={S.profileAvatar}>
              {(profile.full_name || profile.email)[0].toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
              <span style={S.profileName}>{profile.full_name || "Employee"}</span>
              <span style={S.profileEmail}>{profile.email}</span>
            </div>
          </div>

          <button style={S.logoutBtn} onClick={handleLogout}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(244,63,94,0.3)";
              e.currentTarget.style.color = "#f43f5e";
              e.currentTarget.style.background = "rgba(244,63,94,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "#8892b0";
              e.currentTarget.style.background = "none";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Dashboard Overlay Guide — spotlights Launch Work Tool, gates its use */}
      <OverlayGuide
        targetSelector="#launch-work-zone"
        rect={{
          top:    36,
          left:   Math.max(276, window.innerWidth * 0.3),
          width:  180,
          height: 40,
        }}
        padding={18}
        borderRadius={12}
        branding="7dotitsolutions"
        overlayOpacity={0.86}
        overlayBlur={5}
        visible={showDashboardOverlay}
        dismissible={true}
        escapeKeyDismissible={true}
        disableOutsideClicks={true}
        onDismiss={handleOverlayDismiss}
        instruction={{
          stepLabel: "Step 1 of 1",
          title: "Launch your work session",
          description: "Your screen share is active and monitored. Click the button to open AdsPower and begin your assigned tasks.",
          footerHint: "Session is recorded & monitored",
          tooltipPosition: "bottom",
        }}
      />

      {/* ── Work Tool — Restricted Zone Guide ──────────────────────────────── */}
      {workToolOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "#05060d",
          display: "flex", flexDirection: "column",
          animation: "fadeIn 0.2s ease both",
        }}>
          {/* Control bar */}
          <div style={{
            height: 48, flexShrink: 0,
            background: "rgba(8,10,20,0.98)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#10b981", boxShadow: "0 0 8px #10b981",
                animation: "pulseDot 1.6s infinite ease-in-out",
              }} />
              <span style={{ color: "#a5a8ff", fontSize: 12.5, fontWeight: 600, letterSpacing: 0.1 }}>
                Work Session — Restricted Zone Guide
              </span>
              <span style={{
                background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.28)",
                borderRadius: 5, color: "#f59e0b", fontSize: 10, fontWeight: 600,
                padding: "2px 8px", letterSpacing: 0.4, textTransform: "uppercase",
              }}>
                Monitored
              </span>
            </div>
            <button
              onClick={() => setWorkToolOpen(false)}
              style={{
                background: "none", border: "1px solid rgba(244,63,94,0.3)",
                borderRadius: 7, color: "rgba(244,63,94,0.75)",
                fontSize: 11, fontWeight: 600,
                padding: "5px 14px", cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(244,63,94,0.08)";
                e.currentTarget.style.color = "#f43f5e";
                e.currentTarget.style.borderColor = "rgba(244,63,94,0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "rgba(244,63,94,0.75)";
                e.currentTarget.style.borderColor = "rgba(244,63,94,0.3)";
              }}
            >
              ✕ Close
            </button>
          </div>

          {/* Main content */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "32px 24px", overflow: "auto",
          }}>
            <div style={{ maxWidth: 720, width: "100%", display: "flex", flexDirection: "column", gap: 28 }}>

              {/* Heading */}
              <div>
                <h2 style={{ color: "#eef0f8", fontSize: 22, fontWeight: 700, margin: "0 0 8px", letterSpacing: -0.3 }}>
                  Restricted Work Zone
                </h2>
                <p style={{ color: "#8892b0", fontSize: 13, margin: 0, lineHeight: 1.65 }}>
                  You are only permitted to use the <span style={{ color: "#10b981", fontWeight: 600 }}>Profiles Table</span> in AdsPower.
                  The sidebar and top toolbar are restricted. Review the zone guide below before proceeding.
                </p>
              </div>

              {/* Zone diagram */}
              <div style={{
                position: "relative",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14, overflow: "hidden",
                height: 300,
                background: "rgba(13,16,34,0.6)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
              }}>
                {/* Left sidebar zone — RESTRICTED */}
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: "21%", bottom: 0,
                  background: "rgba(244,63,94,0.12)",
                  borderRight: "2px dashed rgba(244,63,94,0.35)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(244,63,94,0.15)",
                    border: "1px solid rgba(244,63,94,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div style={{ textAlign: "center", padding: "0 6px" }}>
                    <div style={{ color: "#f43f5e", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      Sidebar
                    </div>
                    <div style={{ color: "rgba(244,63,94,0.6)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>
                      Restricted
                    </div>
                  </div>
                  {/* Simulated sidebar icons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: 0.25 }}>
                    {[0,1,2,3].map((i) => (
                      <div key={i} style={{ width: 28, height: 6, borderRadius: 3, background: "#f43f5e" }} />
                    ))}
                  </div>
                </div>

                {/* Top toolbar zone — RESTRICTED */}
                <div style={{
                  position: "absolute", top: 0, left: "21%",
                  right: 0, height: "21%",
                  background: "rgba(244,63,94,0.12)",
                  borderBottom: "2px dashed rgba(244,63,94,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span style={{ color: "#f43f5e", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    Top Toolbar — Restricted
                  </span>
                </div>

                {/* Allowed zone — Profiles Table */}
                <div style={{
                  position: "absolute",
                  top: "21%", left: "21%",
                  right: 0, bottom: 0,
                  background: "rgba(16,185,129,0.05)",
                  border: "2px solid rgba(16,185,129,0.3)",
                  borderLeft: "none", borderTop: "none",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(16,185,129,0.15)",
                    border: "1px solid rgba(16,185,129,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#10b981", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                      Allowed Work Area
                    </div>
                    <div style={{ color: "#8892b0", fontSize: 11, lineHeight: 1.5 }}>
                      Browser Profiles Table
                    </div>
                  </div>
                  {/* Simulated table rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "65%", opacity: 0.3 }}>
                    {[0,1,2].map((i) => (
                      <div key={i} style={{ height: 8, borderRadius: 3, background: "#10b981" }} />
                    ))}
                  </div>
                </div>

                {/* Corner label */}
                <div style={{
                  position: "absolute", bottom: 10, right: 12,
                  color: "#2d3450", fontSize: 9, fontWeight: 600, letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}>
                  AdsPower Layout Preview
                </div>
              </div>

              {/* Info row */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                <div style={{
                  flex: "1 1 200px",
                  background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.18)",
                  borderRadius: 10, padding: "12px 14px",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <div>
                    <div style={{ color: "#f43f5e", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>Restricted Zones</div>
                    <div style={{ color: "#8892b0", fontSize: 11, lineHeight: 1.5 }}>
                      Left sidebar navigation and top toolbar are off-limits during this session.
                    </div>
                  </div>
                </div>
                <div style={{
                  flex: "1 1 200px",
                  background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
                  borderRadius: 10, padding: "12px 14px",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <div>
                    <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>Allowed Zone</div>
                    <div style={{ color: "#8892b0", fontSize: 11, lineHeight: 1.5 }}>
                      Use only the main Profiles / Browser List table area to complete your tasks.
                    </div>
                  </div>
                </div>
              </div>

              {/* Launch button */}
              <button
                onClick={() => {
                  const w = screen.availWidth;
                  const h = screen.availHeight;
                  // Try popup window first (no tab bar, minimal chrome)
                  const win = window.open(
                    "https://app.adspower.com/browserList",
                    "adspower_work",
                    `width=${w},height=${h},left=0,top=0,toolbar=0,menubar=0,status=0,scrollbars=1,resizable=0`
                  );
                  // If browser blocked the popup, open as normal tab
                  if (!win || win.closed || typeof win.closed === "undefined") {
                    window.open("https://app.adspower.com/browserList", "_blank");
                  }
                }}
                style={{
                  background: "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
                  border: "none", borderRadius: 10,
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  padding: "14px 0", cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 20px rgba(124,108,248,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
                  letterSpacing: 0.2,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.9";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open AdsPower — Profiles Table
              </button>

              <p style={{ color: "#2d3450", fontSize: 11, margin: 0, textAlign: "center" as const, lineHeight: 1.5 }}>
                Your session is recorded and monitored. Accessing restricted zones will be flagged.
              </p>
            </div>
          </div>
        </div>
      )}

      <main style={S.main}>
        {!isWork && (
          <ScreenShareGate
            status={screenShare.status}
            errorMessage={screenShare.errorMessage}
            onStart={screenShare.startSharing}
          />
        )}

        {isWork && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeIn 0.3s ease both", position: "relative", zIndex: 1 }}>

            <div style={S.shareBanner}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#10b981", boxShadow: "0 0 10px #10b981", flexShrink: 0,
                  animation: "pulseDot 1.4s infinite ease-in-out",
                }} />
                <span style={{ color: "#10b981", fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>
                  Screen sharing session is active & monitored
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Enable Overlay — shown until overlay is enabled */}
                {!overlayEnabled && (
                  <button style={S.enableOverlayBannerBtn} onClick={handleEnableOverlay}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(245,158,11,0.18)";
                      e.currentTarget.style.borderColor = "rgba(245,158,11,0.45)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(245,158,11,0.1)";
                      e.currentTarget.style.borderColor = "rgba(245,158,11,0.28)";
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </svg>
                    Enable Overlay
                  </button>
                )}

                {/* Launch Work Tool — wrapped with id for overlay targeting */}
                <div id="launch-work-zone">
                  <button
                    style={overlayEnabled ? S.workToolBannerBtn : S.workToolBannerBtnLocked}
                    onClick={overlayEnabled ? handleLaunchWorkTool : handleEnableOverlay}
                    title={overlayEnabled ? undefined : "Enable Overlay first to unlock"}
                    onMouseEnter={(e) => {
                      if (overlayEnabled) {
                        e.currentTarget.style.background = "rgba(124,108,248,0.18)";
                        e.currentTarget.style.borderColor = "rgba(124,108,248,0.35)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (overlayEnabled) {
                        e.currentTarget.style.background = "rgba(124,108,248,0.1)";
                        e.currentTarget.style.borderColor = "rgba(124,108,248,0.22)";
                      }
                    }}
                  >
                    {overlayEnabled ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                    {overlayEnabled ? "Launch Work Tool" : "Work Tool (Locked)"}
                  </button>
                </div>

                <button style={S.stopShareBtn} onClick={() => screenShare.stopSharing("manual_stop")}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(244,63,94,0.1)";
                    e.currentTarget.style.borderColor = "rgba(244,63,94,0.4)";
                    e.currentTarget.style.color = "#f43f5e";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.borderColor = "rgba(244,63,94,0.2)";
                    e.currentTarget.style.color = "rgba(244,63,94,0.7)";
                  }}
                >
                  Stop Sharing
                </button>
              </div>
            </div>

            {dashView === "proxy" && (
            <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16 }}>
              <div>
                <h1 style={S.pageTitle}>My Assigned Work</h1>
                <p style={S.pageSubtitle}>
                  {visibleAssignments.length} address{visibleAssignments.length !== 1 ? "es" : ""} assigned
                  {hiddenIds.size > 0 && (
                    <span style={{ color: "#4a526e", marginLeft: 8, fontSize: 11 }}>
                      ({hiddenIds.size} hidden —{" "}
                      <span
                        style={{ color: "#9d91ff", cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => setHiddenIds(new Set())}
                      >
                        restore all
                      </span>)
                    </span>
                  )}
                </p>
              </div>

              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                {selectMode && selectedIds.size > 0 && (
                  <>
                    <button style={S.bulkSelectAllBtn} onClick={selectAll}>
                      Select All
                    </button>
                    <button style={S.bulkHideBtn} onClick={hideSelected}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(244,63,94,0.18)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(244,63,94,0.1)"}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Hide {selectedIds.size} Task{selectedIds.size !== 1 ? "s" : ""}
                    </button>
                  </>
                )}
                {selectMode && selectedIds.size === 0 && (
                  <button style={S.bulkSelectAllBtn} onClick={selectAll}>
                    Select All
                  </button>
                )}
                <button
                  style={selectMode ? S.bulkCancelBtn : S.bulkModeBtn}
                  onClick={toggleSelectMode}
                >
                  {selectMode ? "✕ Cancel" : (
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      </svg>
                      Select Multiple
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div style={S.statsRow}>
              <StatCard label="Assigned Tasks"  value={visibleAssignments.length} color="#7c6cf8" gradient="rgba(124,108,248,0.15)" />
              <StatCard label="Pending Verify"  value={pending}                   color="#f59e0b" gradient="rgba(245,158,11,0.15)" />
              <StatCard label="Completed"       value={completed}                 color="#10b981" gradient="rgba(16,185,129,0.15)" />
              <StatCard label="Validation Fail" value={failed}                    color="#f43f5e" gradient="rgba(244,63,94,0.15)" />
            </div>

            {msg && <Toast type="success" message={msg} />}
            {err && <Toast type="error"   message={err} />}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" as const }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 3 }}>
                {(["all", "Pending", "Completed", "Failed"] as WorkTab[]).map((t) => {
                  const count = t === "all" ? visibleAssignments.length : t === "Pending" ? pending : t === "Completed" ? completed : failed;
                  const isActive = tab === t;
                  return (
                    <button key={t} style={isActive ? S.filterTabActive : S.filterTab} onClick={() => setTab(t)}>
                      <span>{t === "all" ? "All Tasks" : t}</span>
                      <span style={{
                        background: isActive ? "rgba(124,108,248,0.2)" : "rgba(255,255,255,0.05)",
                        color: isActive ? "#9d91ff" : "#8892b0",
                        borderRadius: 6, padding: "1px 6px", fontSize: 10, marginLeft: 6,
                        fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                      }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ position: "relative" as const, display: "flex", alignItems: "center", width: "100%", maxWidth: 300 }}>
                <span style={{ position: "absolute" as const, left: 12, color: "#8892b0", display: "flex", pointerEvents: "none" as const }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  style={S.searchInput}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by address or category…"
                />
              </div>
            </div>

            {loading ? (
              <LoadingSkeleton />
            ) : displayed.length === 0 ? (
              <EmptyState
                icon={search ? "🔍" : visibleAssignments.length === 0 ? "📭" : "✓"}
                message={
                  search ? `No results matches "${search}"` :
                  visibleAssignments.length === 0 ? "No active address assignments found for your account." :
                  `No assignments categorized under "${tab}".`
                }
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {displayed.map((a, i) => (
                  <TaskCard
                    key={a.id}
                    assignment={a}
                    isExpanded={expandedId === a.id}
                    onToggle={() => {
                      if (selectMode) { toggleSelect(a.id); return; }
                      setExpandedId(expandedId === a.id ? null : a.id);
                    }}
                    onStatusChange={handleStatusChange}
                    updating={updatingId === a.id}
                    disabled={!isWork}
                    animDelay={Math.min(i * 0.04, 0.25)}
                    selectMode={selectMode}
                    selected={selectedIds.has(a.id)}
                    onSelect={() => toggleSelect(a.id)}
                  />
                ))}
              </div>
            )}
            </>
            )}

            {/* ══════════════ ADMIN TASKS VIEW ══════════════ */}
            {dashView === "tasks" && (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16 }}>
                <div>
                  <h1 style={S.pageTitle}>Tasks from Admin</h1>
                  <p style={S.pageSubtitle}>
                    {adminTasks.length} task{adminTasks.length !== 1 ? "s" : ""} sent by admin
                    {adminTasks.filter((t) => t.status === "Pending").length > 0 && (
                      <span style={{ color: "#f59e0b", marginLeft: 8, fontSize: 11, fontWeight: 600 }}>
                        ({adminTasks.filter((t) => t.status === "Pending").length} pending)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Task stat cards */}
              <div style={S.statsRow}>
                <StatCard label="Total Tasks"      value={adminTasks.length}                                       color="#7c6cf8" gradient="rgba(124,108,248,0.15)" />
                <StatCard label="Pending"          value={adminTasks.filter((t) => t.status === "Pending").length}   color="#f59e0b" gradient="rgba(245,158,11,0.15)" />
                <StatCard label="Completed"        value={adminTasks.filter((t) => t.status === "Completed").length} color="#10b981" gradient="rgba(16,185,129,0.15)" />
                <StatCard label="Failed"           value={adminTasks.filter((t) => t.status === "Failed").length}    color="#f43f5e" gradient="rgba(244,63,94,0.15)" />
              </div>

              {/* Task list */}
              {adminTasks.length === 0 ? (
                <EmptyState
                  icon="📭"
                  message="No tasks assigned by admin yet. New tasks will appear here in real-time."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {adminTasks.map((t) => {
                    const sc: Record<string, { color: string; bg: string; border: string }> = {
                      Pending:   { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)"  },
                      Completed: { color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)"  },
                      Failed:    { color: "#f43f5e", bg: "rgba(244,63,94,0.08)",   border: "rgba(244,63,94,0.22)"   },
                    };
                    const st = sc[t.status] ?? { color: "#8892b0", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" };
                    const pc: Record<string, string> = { low: "#60a5fa", normal: "#a5a8ff", high: "#f43f5e" };
                    const priorityColor = pc[t.priority] ?? "#a5a8ff";
                    const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status === "Pending";
                    const updating = taskUpdating === t.id;

                    return (
                      <div key={t.id} style={{
                        background: "rgba(13,16,34,0.65)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderLeft: `3px solid ${priorityColor}`,
                        borderRadius: 14,
                        padding: "16px 20px",
                        display: "flex", flexDirection: "column", gap: 10,
                        backdropFilter: "blur(16px) saturate(1.5)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        animation: "fadeUp 0.3s ease both",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                          <span style={{ color: "#eef0f8", fontSize: 14, fontWeight: 600 }}>{t.title}</span>
                          <span style={{
                            background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                            borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600,
                          }}>{t.status}</span>
                          <span style={{
                            background: `${priorityColor}15`, color: priorityColor,
                            border: `1px solid ${priorityColor}40`,
                            borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                            textTransform: "uppercase" as const, letterSpacing: 0.5,
                          }}>{t.priority}</span>
                          {overdue && (
                            <span style={{
                              background: "rgba(244,63,94,0.15)", color: "#f43f5e",
                              border: "1px solid rgba(244,63,94,0.4)",
                              borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                              textTransform: "uppercase" as const, letterSpacing: 0.5,
                            }}>Overdue</span>
                          )}
                        </div>

                        {t.description && (
                          <span style={{ color: "#8892b0", fontSize: 12, lineHeight: 1.5 }}>{t.description}</span>
                        )}

                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" as const, fontSize: 11 }}>
                          {t.category && (
                            <span style={{ color: "#4a526e" }}>
                              <span style={{ color: "#2d3450", textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: 600, fontSize: 9, marginRight: 5 }}>Category:</span>
                              <span style={{ color: "#8892b0" }}>{t.category}</span>
                            </span>
                          )}
                          <span style={{ color: "#4a526e" }}>
                            <span style={{ color: "#2d3450", textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: 600, fontSize: 9, marginRight: 5 }}>Sent:</span>
                            <span style={{ color: "#8892b0" }}>{new Date(t.created_at).toLocaleString()}</span>
                          </span>
                          {t.due_date && (
                            <span style={{ color: "#4a526e" }}>
                              <span style={{ color: "#2d3450", textTransform: "uppercase" as const, letterSpacing: 0.6, fontWeight: 600, fontSize: 9, marginRight: 5 }}>Due:</span>
                              <span style={{ color: overdue ? "#f43f5e" : "#8892b0", fontWeight: overdue ? 600 : 400 }}>
                                {new Date(t.due_date).toLocaleString()}
                              </span>
                            </span>
                          )}
                        </div>

                        {isWork && t.status !== "Completed" && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 2 }}>
                            <span style={{ color: "#8892b0", fontSize: 11, fontWeight: 500, marginRight: 6, alignSelf: "center" }}>
                              Update Status:
                            </span>
                            {["Pending", "Completed", "Failed"]
                              .filter((s) => s !== t.status)
                              .map((s) => {
                                const c = sc[s];
                                return (
                                  <button
                                    key={s}
                                    disabled={updating}
                                    onClick={() => handleTaskStatusChange(t.id, s)}
                                    style={{
                                      background: updating ? "rgba(255,255,255,0.02)" : c.bg,
                                      border: `1px solid ${updating ? "rgba(255,255,255,0.06)" : c.border}`,
                                      color: updating ? "#2d3450" : c.color,
                                      borderRadius: 6, padding: "5px 12px",
                                      fontSize: 11, fontWeight: 600,
                                      cursor: updating ? "not-allowed" : "pointer",
                                      fontFamily: "inherit",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    {updating ? "…" : `Mark ${s}`}
                                  </button>
                                );
                              })}
                          </div>
                        )}

                        {!isWork && t.status !== "Completed" && (
                          <span style={{ color: "#4a526e", fontSize: 10.5, fontStyle: "italic" as const }}>
                            Start screen sharing to update task status.
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({
  assignment, isExpanded, onToggle, onStatusChange, updating, disabled,
  animDelay, selectMode, selected, onSelect,
}: {
  assignment:     Assignment;
  isExpanded:     boolean;
  onToggle:       () => void;
  onStatusChange: (id: string, status: string) => void;
  updating:       boolean;
  disabled:       boolean;
  animDelay:      number;
  selectMode:     boolean;
  selected:       boolean;
  onSelect:       () => void;
}) {
  const [uniqueId,    setUniqueId]    = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [confirming,  setConfirming]  = useState(false);
  const [confirmMsg,  setConfirmMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const validation = useValidation();

  // ── FIX: auto-fill fingerprint from known_fingerprint for ALL statuses
  // (valid, blocked, mismatch). Omitting `fingerprint` from deps intentionally
  // so a stale closure never blocks the one-time fill.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const kfp = validation.result.known_fingerprint;
    if (kfp && !fingerprint) {
      setFingerprint(kfp);
    }
  }, [validation.result.known_fingerprint]);

  // ── FIX: validate whenever uniqueId has a value, regardless of fingerprint
  function handleUidChange(val: string) {
    setUniqueId(val);
    setConfirmMsg(null);
    if (val.trim()) {
      validation.validate(val, fingerprint, assignment.id);
    } else {
      validation.reset();
    }
  }

  // ── FIX: validate whenever uniqueId already has a value
  function handleFpChange(val: string) {
    setFingerprint(val);
    setConfirmMsg(null);
    if (uniqueId.trim()) {
      validation.validate(uniqueId, val, assignment.id);
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
    if (validation.result.status !== "valid") {
      setConfirmMsg({ ok: false, text: "Wait for live validation to show Valid before confirming." });
      return;
    }
    setConfirming(true);
    setConfirmMsg(null);

    try {
      // Single authoritative write: saves unique_id + fingerprint + address
      // + cooldown timestamp into records and fingerprint_bindings atomically.
      const { data, error } = await supabase.rpc("confirm_identity_submission", {
        p_unique_id:     uniqueId.trim(),
        p_fingerprint:   fingerprint.trim(),
        p_assignment_id: assignment.id,
      });
      if (error) throw error;

      const result = data as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "Submission failed");

      setConfirmMsg({ ok: true, text: "Confirmed. IP, fingerprint & address saved. 48-hour cooldown started." });
      validation.reset();
      setUniqueId("");
      setFingerprint("");
    } catch (err: unknown) {
      setConfirmMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Confirmation failed.",
      });
    } finally {
      setConfirming(false);
    }
  }

  const statusStyle: Record<string, { bg: string; text: string; border: string }> = {
    Pending:   { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b", border: "rgba(245,158,11,0.22)" },
    Completed: { bg: "rgba(16,185,129,0.1)",   text: "#10b981", border: "rgba(16,185,129,0.22)" },
    Failed:    { bg: "rgba(244,63,94,0.1)",   text: "#f43f5e", border: "rgba(244,63,94,0.22)" },
  };
  const sc = statusStyle[assignment.status] ?? {
    bg: "rgba(255,255,255,0.03)", text: "#8892b0", border: "rgba(255,255,255,0.08)",
  };

  const dotColor =
    validation.result.status === "valid"    ? "#10b981" :
    validation.result.status === "blocked"  ? "#f43f5e" :
    validation.result.status === "mismatch" ? "#f59e0b" :
    validation.result.status === "checking" ? "#7c6cf8" : null;

  return (
    <div style={{
      background:   selected ? "rgba(124,108,248,0.03)" : "rgba(13,16,34,0.65)",
      border:       `1px solid ${selected ? "rgba(124,108,248,0.3)" : "rgba(255,255,255,0.06)"}`,
      borderLeft:   `3px solid ${selected ? "#7c6cf8" : sc.border.replace("rgba", "rgb")}`,
      borderRadius: 14,
      overflow:     "hidden",
      animation:    `fadeUp 0.3s ease ${animDelay}s both`,
      outline:      selected ? "1px solid rgba(124,108,248,0.15)" : "none",
      backdropFilter: "blur(16px) saturate(1.5)",
      boxShadow:    selected ? "0 4px 20px rgba(124,108,248,0.08)" : "0 4px 12px rgba(0,0,0,0.15)",
      transition:   "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", cursor: "pointer", gap: 12,
          userSelect: "none" as const,
          background: selected ? "rgba(124,108,248,0.02)" : "transparent",
        }}
        onClick={onToggle}
      >
        {selectMode && (
          <div
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              border: `2px solid ${selected ? "#7c6cf8" : "rgba(255,255,255,0.2)"}`,
              background: selected ? "#7c6cf8" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {selected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{
              color: "#eef0f8", fontSize: 13.5, fontWeight: 600,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 320,
              letterSpacing: 0.1,
            }}
              title={assignment.address_text}
            >
              {assignment.address_text}
            </span>
            <CopyButton value={assignment.address_text} label="address" />
          </div>
          {assignment.category && (
            <span style={{ color: "#8892b0", fontSize: 11, fontWeight: 400 }}>
              <span style={{ color: "#4a526e", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginRight: 4 }}>Category:</span>
              {assignment.category}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{
            background: sc.bg, color: sc.text,
            border: `1px solid ${sc.border}`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 11, fontWeight: 600,
            letterSpacing: 0.2,
          }}>
            {assignment.status}
          </span>
          {dotColor && !isExpanded && (
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: dotColor,
              display: "inline-block",
              boxShadow: `0 0 8px ${dotColor}`,
              animation: "pulseDot 1.4s infinite ease-in-out",
            }} />
          )}
          <span style={{
            color: "#4a526e", fontSize: 14,
            display: "inline-flex",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>

      {isExpanded && !selectMode && (
        <div style={{
          padding: "0 20px 20px",
          display: "flex", flexDirection: "column", gap: 16,
          animation: "slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -20px" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{
              color: "#7c6cf8", fontSize: 10, fontWeight: 600,
              letterSpacing: 1, textTransform: "uppercase" as const,
            }}>
              Identity Verification System
            </span>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px" }}>
                <label style={S.inputLabel}>Unique ID / IP Address</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
                  <input
                    style={S.taskInput}
                    value={uniqueId}
                    onChange={(e) => handleUidChange(e.target.value)}
                    placeholder="e.g. 192.168.1.1"
                    autoComplete="off"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(124,108,248,0.4)";
                      e.currentTarget.style.boxShadow = "0 0 8px rgba(124,108,248,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <CopyButton value={uniqueId} label="IP" />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px" }}>
                <label style={S.inputLabel}>
                  Device Fingerprint
                  {validation.result.known_fingerprint && !fingerprint && (
                    <span style={{ color: "#7c6cf8", marginLeft: 6, fontSize: 9 }}>
                      (auto-filled)
                    </span>
                  )}
                  {validation.result.known_fingerprint && fingerprint && (
                    <span style={{ color: "#10b981", marginLeft: 6, fontSize: 9 }}>
                      (recalled)
                    </span>
                  )}
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    style={{
                      ...S.taskInput,
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
                      e.currentTarget.style.boxShadow = "0 0 8px rgba(124,108,248,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = validation.result.known_fingerprint ? "rgba(124,108,248,0.3)" : "rgba(255,255,255,0.08)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <CopyButton value={fingerprint} label="fingerprint" />
                </div>
              </div>
            </div>

            <ValidationResultBox result={validation.result} />

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

            {(validation.result.status === "valid" ||
              validation.result.status === "idle") &&
              uniqueId.trim() && fingerprint.trim() && (
              <button
                disabled={confirming || validation.result.status === "checking"}
                onClick={handleConfirm}
                style={{
                  background:   confirming ? "rgba(124,108,248,0.3)" : "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
                  border:       "none",
                  borderRadius: 8,
                  color:        "#fff",
                  fontSize:     12.5,
                  fontWeight:   600,
                  padding:      "10px 0",
                  cursor:       confirming ? "not-allowed" : "pointer",
                  fontFamily:   "inherit",
                  width:        "100%",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  gap:          6,
                  transition:   "all 0.2s ease",
                  boxShadow:    confirming ? "none" : "0 4px 15px rgba(124,108,248,0.3)",
                }}
                onMouseEnter={(e) => {
                  if (!confirming) e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  if (!confirming) e.currentTarget.style.opacity = "1";
                }}
              >
                {confirming ? "⟳ Registering Session..." : "✓ OK — Verify & Start 48h Cooldown"}
              </button>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -20px" }} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            <MetaPill label="Assigned Date" value={new Date(assignment.assigned_at).toLocaleString()} />
            {assignment.updated_at !== assignment.assigned_at && (
              <MetaPill label="Last Updated" value={new Date(assignment.updated_at).toLocaleString()} />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const, marginTop: 4 }}>
            <span style={{ color: "#8892b0", fontSize: 11, fontWeight: 500, letterSpacing: 0.3 }}>Override Status:</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["Pending", "Completed", "Failed"]
                .filter((s) => s !== assignment.status)
                .map((s) => {
                  const c = statusStyle[s];
                  return (
                    <button
                      key={s}
                      disabled={updating || disabled}
                      onClick={() => onStatusChange(assignment.id, s)}
                      style={
                        updating || disabled
                          ? {
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              color: "#2d3450",
                              borderRadius: 6, padding: "5px 12px",
                              fontSize: 11, cursor: "not-allowed", fontFamily: "inherit",
                              fontWeight: 500,
                            }
                          : {
                              background: c.bg,
                              border: `1px solid ${c.border}`,
                              color: c.text,
                              borderRadius: 6, padding: "5px 12px",
                              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                              transition: "all 0.15s ease",
                            }
                      }
                      onMouseEnter={(e) => {
                        if (!updating && !disabled) {
                          e.currentTarget.style.background = c.border.replace("0.22", "0.15").replace("0.2", "0.15");
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!updating && !disabled) {
                          e.currentTarget.style.background = c.bg;
                        }
                      }}
                    >
                      {updating ? "..." : s}
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

// ── ValidationResultBox ───────────────────────────────────────────────────────

function ValidationResultBox({ result }: { result: ReturnType<typeof useValidation>["result"] }) {
  if (result.status === "idle") return null;

  const config: Record<string, { bg: string; border: string; color: string; label: string }> = {
    checking: { bg: "rgba(124,108,248,0.06)",  border: "rgba(124,108,248,0.2)",  color: "#9d91ff", label: "Checking system bindings…" },
    valid:    { bg: "rgba(16,185,129,0.06)",   border: "rgba(16,185,129,0.2)",   color: "#10b981", label: "Valid IP & Fingerprint combination — Ready to confirm" },
    blocked:  { bg: "rgba(244,63,94,0.06)",   border: "rgba(244,63,94,0.2)",   color: "#f43f5e", label: "IP in Active Cooldown" },
    mismatch: { bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.2)",  color: "#f59e0b", label: "Fingerprint Conflict" },
    error:    { bg: "rgba(244,63,94,0.04)",   border: "rgba(244,63,94,0.15)",  color: "#f43f5e", label: "Verification System Error" },
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
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

      {result.status === "blocked" && result.cooldown_ends_at && (
        <CooldownTimer endsAt={result.cooldown_ends_at} />
      )}

      {/* FIX: truncate long fingerprint strings with ellipsis + title tooltip */}
      {result.status === "mismatch" && result.expected_fingerprint && (
        <div style={{
          background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)",
          borderRadius: 8, padding: "8px 12px",
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Expected Fingerprint for this IP:</span>
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
            <CopyButton value={result.expected_fingerprint} label="fingerprint" />
          </div>
        </div>
      )}

      {result.status === "valid" && result.known_fingerprint && (
        <div style={{
          background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)",
          borderRadius: 8, padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ color: "#8892b0", fontSize: 10, fontWeight: 500 }}>Recalled Fingerprint (auto-filled):</span>
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
          <CopyButton value={result.known_fingerprint} label="fingerprint" />
        </div>
      )}
    </div>
  );
}

// ── CooldownTimer ─────────────────────────────────────────────────────────────
function CooldownTimer({ endsAt }: { endsAt: string }) {
  function calc() {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
    const s = Math.floor(diff / 1000);
    return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, expired: false };
  }

  const [t, setT] = useState(calc);

  useEffect(() => {
    if (t.expired) return;
    const id = setInterval(() => {
      const next = calc();
      setT(next);
      if (next.expired) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (t.expired) {
    return (
      <div style={{ color: "#10b981", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
        <span>✓</span> Cooldown expired. Refresh page or re-enter IP to validate.
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.15)",
      borderRadius: 8, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ color: "#8892b0", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.8, fontWeight: 600 }}>
        Cooldown Remaining
      </span>
      <span style={{ color: "#f43f5e", fontSize: 18, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        {String(t.hours).padStart(2, "0")}h {String(t.minutes).padStart(2, "0")}m {String(t.seconds).padStart(2, "0")}s
      </span>
      <span style={{ color: "#4a526e", fontSize: 10, fontWeight: 500 }}>
        Expires: {new Date(endsAt).toLocaleString()}
      </span>
    </div>
  );
}

// ── ScreenShareGate ───────────────────────────────────────────────────────────

function ScreenShareGate({
  status, errorMessage, onStart,
}: {
  status: string;
  errorMessage: string | null;
  onStart: () => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);

  async function handle() {
    setStarting(true);
    await onStart();
    setStarting(false);
  }

  const isWrong  = status === "wrong_target";
  const isDenied = status === "denied";
  const isError  = status === "error";

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem", animation: "fadeIn 0.25s ease both",
    }}>
      <div style={{
        maxWidth: 460, width: "100%",
        background: "rgba(13,16,34,0.7)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 24,
        padding: "44px 36px",
        display: "flex", flexDirection: "column", gap: 24,
        alignItems: "center", textAlign: "center" as const,
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset",
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ position: "relative" as const }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: isDenied || isError ? "rgba(244,63,94,0.15)" : isWrong ? "rgba(245,158,11,0.15)" : "rgba(124,108,248,0.15)",
            border: `1px solid ${isDenied || isError ? "rgba(244,63,94,0.3)" : isWrong ? "rgba(245,158,11,0.3)" : "rgba(124,108,248,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 30px ${isDenied || isError ? "rgba(244,63,94,0.15)" : isWrong ? "rgba(245,158,11,0.15)" : "rgba(124,108,248,0.15)"}`,
          }}>
            {isDenied || isError ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
              </svg>
            ) : isWrong ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a5a8ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            )}
          </div>
          <div style={{
            position: "absolute" as const, inset: -20,
            background: `radial-gradient(circle, ${isDenied || isError ? "rgba(244,63,94,0.12)" : isWrong ? "rgba(245,158,11,0.12)" : "rgba(124,108,248,0.12)"} 0%, transparent 70%)`,
            borderRadius: "50%", pointerEvents: "none" as const,
          }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ color: "#eef0f8", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
            {status === "idle"    ? "Screen Share Required"
             : status === "stopped" ? "Sharing Disconnected"
             : isDenied           ? "Permission Rejected"
             : isWrong            ? "Incorrect Monitor Selected"
             : "Verification Failed"}
          </h2>
          <p style={{ color: "#8892b0", fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            {status === "idle"
              ? "To secure validation integrity, you must stream your entire screen. Earmarked activities are logged for administrative inspection."
              : status === "stopped"
              ? "Your broadcast stream has ceased. Re-initiate stream sharing to resume task processing."
              : isDenied
              ? "Session authorization requires screen feed access. Please modify browser permissions and re-authenticate."
              : isWrong
              ? "You chose a standalone browser tab or program window. Please stop and select 'Entire Screen' to proceed."
              : "An unexpected handshake failure occurred. Please attempt to reconnect your stream."}
          </p>
        </div>

        {errorMessage && (
          <div style={{
            background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)",
            borderRadius: 10, color: "#f43f5e", fontSize: 12,
            padding: "11px 15px", width: "100%", textAlign: "left" as const,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {errorMessage}
          </div>
        )}

        {isWrong && (
          <div style={{
            background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12, padding: "16px",
            width: "100%", textAlign: "left" as const,
          }}>
            <p style={{ color: "#eef0f8", fontSize: 12, fontWeight: 600, margin: "0 0 10px" }}>
              How to share your entire screen properly:
            </p>
            <ol style={{ color: "#8892b0", fontSize: 12, lineHeight: 2.1, paddingLeft: 18, margin: 0 }}>
              <li>Click the <strong style={{ color: "#9d91ff" }}>Retry Screen Share</strong> button below</li>
              <li>Select the <strong style={{ color: "#eef0f8" }}>"Entire Screen"</strong> tab in the pop-up</li>
              <li>Select your active desktop screen → click <strong style={{ color: "#eef0f8" }}>Share</strong></li>
            </ol>
          </div>
        )}

        <button
          disabled={starting}
          onClick={handle}
          style={{
            background: starting ? "rgba(124,108,248,0.35)" : "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
            border: "none", borderRadius: 10, color: "#fff",
            fontSize: 13.5, fontWeight: 600,
            padding: "14px 0", cursor: starting ? "not-allowed" : "pointer",
            fontFamily: "inherit", width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: starting ? "none" : "0 8px 24px rgba(124,108,248,0.35)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (!starting) e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            if (!starting) e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {starting ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
              </svg>
              <span>Negotiating broadcast...</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <polyline points="8 21 12 17 16 21" />
              </svg>
              <span>{status === "idle" ? "Start Screen Share" : "Retry Screen Share"}</span>
            </>
          )}
        </button>

        <p style={{ color: "#4a526e", fontSize: 11, lineHeight: 1.5, margin: 0 }}>
          Monitoring stream is end-to-end encrypted and restricted to authorization verification audit processes.
        </p>
      </div>
    </div>
  );
}

// ── Utility components ────────────────────────────────────────────────────────

function StatCard({ label, value, color, gradient }: { label: string; value: number; color: string; gradient: string }) {
  return (
    <div style={{
      flex: "1 1 150px", background: "rgba(13,16,34,0.7)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 6,
      backdropFilter: "blur(16px)",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    }}>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: color, opacity: 0.8,
      }} />
      <div style={{
        position: "absolute", right: -20, top: -20, width: 80, height: 80,
        background: `radial-gradient(circle, ${gradient} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <span style={{ color: "#eef0f8", fontSize: 28, fontWeight: 700, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
      <span style={{ color: "#8892b0", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 6, padding: "6px 12px",
    }}>
      <span style={{ color: "#4a526e", fontSize: 9.5, textTransform: "uppercase" as const, letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#8892b0", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

function Toast({ type, message }: { type: "success" | "error"; message: string }) {
  const color  = type === "success" ? "#10b981" : "#f43f5e";
  const bg     = type === "success" ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)";
  const border = type === "success" ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)";

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      color, borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 500,
      animation: "fadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
      <span>
        {type === "success" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </span>
      <span>{message}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          height: 64, borderRadius: 14,
          background: "rgba(13,16,34,0.4)",
          border: "1px solid rgba(255,255,255,0.05)",
          animation: `shimmer 1.8s infinite ${i * 0.15}s`,
          backgroundImage: "linear-gradient(90deg, rgba(13,16,34,0.4) 25%, rgba(26,32,53,0.4) 50%, rgba(13,16,34,0.4) 75%)",
          backgroundSize: "200% 100%",
        }} />
      ))}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 16, padding: "70px 20px", textAlign: "center" as const,
      animation: "fadeIn 0.3s ease both",
      background: "rgba(13,16,34,0.25)",
      border: "1px solid rgba(255,255,255,0.03)",
      borderRadius: 20,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 16,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, color: "#8892b0",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
      }}>
        {icon}
      </div>
      <span style={{ color: "#8892b0", fontSize: 13.5, maxWidth: 300, lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", minHeight: "100vh", background: "#05060d",
    color: "#eef0f8",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: 14,
    position: "relative", overflow: "hidden",
  },
  sidebar: {
    width: 240, background: "rgba(8,10,20,0.95)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    display: "flex", flexDirection: "column", justifyContent: "space-between",
    padding: "24px 14px", flexShrink: 0,
    backdropFilter: "blur(20px)",
    position: "relative", zIndex: 10,
    boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
  },
  sidebarTop:    { display: "flex", flexDirection: "column", gap: 24 },
  sidebarBottom: { display: "flex", flexDirection: "column", gap: 10 },
  brand:         { display: "flex", alignItems: "center", gap: 10, paddingLeft: 4 },
  brandText:     { color: "#eef0f8", fontWeight: 700, fontSize: 15, letterSpacing: -0.2 },
  navItem: {
    display: "flex", alignItems: "center", gap: 9,
    background: "linear-gradient(90deg, rgba(124,108,248,0.15), rgba(124,108,248,0.06))",
    border: "1px solid rgba(124,108,248,0.22)",
    borderRadius: 9, padding: "9px 12px", color: "#a5a8ff", fontSize: 12.5, fontWeight: 600,
    position: "relative", width: "100%", boxSizing: "border-box",
  },
  shareOn: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
    borderRadius: 8, padding: "9px 12px", fontSize: 11.5, color: "#10b981",
  },
  shareOff: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8, padding: "9px 12px", fontSize: 11.5, color: "#8892b0",
  },
  launchBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "rgba(124,108,248,0.1)", border: "1px solid rgba(124,108,248,0.22)",
    borderRadius: 8, padding: "9px 12px", color: "#a5a8ff", fontSize: 11.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  launchBtnLocked: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 8, padding: "9px 12px", color: "#4a526e", fontSize: 11.5, fontWeight: 600,
    cursor: "not-allowed", fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  enableOverlayBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 8, padding: "9px 12px", color: "#f59e0b", fontSize: 11.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  enableOverlayBannerBtn: {
    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.28)",
    borderRadius: 7, color: "#f59e0b", fontSize: 11, fontWeight: 600,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center",
    transition: "all 0.2s ease",
  },
  workToolBannerBtnLocked: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 7, color: "#4a526e", fontSize: 11, fontWeight: 600,
    padding: "6px 12px", cursor: "not-allowed", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center",
    transition: "all 0.2s ease",
  },
  profileCard: {
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10, padding: "10px 12px",
  },
  profileAvatar: {
    width: 32, height: 32, borderRadius: "50%",
    background: "rgba(124,108,248,0.15)", border: "1px solid rgba(124,108,248,0.25)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#a5a8ff", fontSize: 13, fontWeight: 700, flexShrink: 0,
  },
  profileName: {
    color: "#eef0f8", fontSize: 12, fontWeight: 600,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  profileEmail: {
    color: "#4a526e", fontSize: 10,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  logoutBtn: {
    background: "none", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8, color: "#8892b0", padding: "9px 12px", fontSize: 12,
    cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s ease",
  },
  main: {
    flex: 1, padding: "32px 36px", display: "flex", flexDirection: "column",
    overflow: "auto", minHeight: 0, position: "relative", zIndex: 1,
  },
  shareBanner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
    borderRadius: 10, padding: "10px 16px",
    backdropFilter: "blur(8px)",
  },
  workToolBannerBtn: {
    background: "rgba(124,108,248,0.1)", border: "1px solid rgba(124,108,248,0.22)",
    borderRadius: 7, color: "#a5a8ff", fontSize: 11, fontWeight: 600,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center",
    transition: "all 0.2s ease",
  },
  stopShareBtn: {
    background: "none", border: "1px solid rgba(244,63,94,0.2)",
    borderRadius: 7, color: "rgba(244,63,94,0.7)", fontSize: 11,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s ease",
  },
  pageTitle:    { color: "#eef0f8", fontSize: 24, fontWeight: 700, letterSpacing: -0.4, margin: 0 },
  pageSubtitle: { color: "#8892b0", fontSize: 13, marginTop: 4 },
  statsRow:     { display: "flex", gap: 12, flexWrap: "wrap" as const },
  filterTab: {
    display: "inline-flex", alignItems: "center",
    background: "none", border: "1px solid transparent",
    borderRadius: 8, color: "#8892b0", fontSize: 12,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  filterTabActive: {
    display: "inline-flex", alignItems: "center",
    background: "rgba(124,108,248,0.12)", border: "1px solid rgba(124,108,248,0.28)",
    borderRadius: 8, color: "#a5a8ff", fontSize: 12, fontWeight: 600,
    padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
    boxShadow: "0 2px 10px rgba(124,108,248,0.1)",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  searchInput: {
    background: "rgba(13,16,34,0.55)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8, color: "#eef0f8", fontSize: 13,
    padding: "8px 12px 8px 36px", outline: "none", width: "100%",
    backdropFilter: "blur(12px)",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  inputLabel: {
    color: "#8892b0", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const,
    fontWeight: 600,
  },
  taskInput: {
    flex: 1,
    background: "rgba(8,10,20,0.6)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8, color: "#eef0f8", fontSize: 12.5,
    padding: "9px 12px", outline: "none", fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  bulkModeBtn: {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 8, color: "#8892b0", fontSize: 12, fontWeight: 600,
    padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  bulkCancelBtn: {
    background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)",
    borderRadius: 8, color: "#f43f5e", fontSize: 12, fontWeight: 600,
    padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  bulkSelectAllBtn: {
    background: "rgba(124,108,248,0.08)", border: "1px solid rgba(124,108,248,0.2)",
    borderRadius: 8, color: "#a5a8ff", fontSize: 12, fontWeight: 600,
    padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
  },
  bulkHideBtn: {
    background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)",
    borderRadius: 8, color: "#f43f5e", fontSize: 12, fontWeight: 600,
    padding: "7px 16px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s ease",
    display: "inline-flex", alignItems: "center",
  },
};