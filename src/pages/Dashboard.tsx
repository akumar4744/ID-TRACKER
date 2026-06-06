// File: src/pages/Dashboard.tsx

import { useState, useEffect, useContext } from "react";
import RecordsTable from "../components/RecordsTable";
import AddRecordModal from "../components/AddRecordModal";
import EmployeeManagement from "./EmployeeManagement";
import AddressManagement from "./AddressManagement";
import LiveMonitor from "./LiveMonitor";
import CredentialsManagement from "./CredentialsManagement";
import TasksManagement from "./TasksManagement";
import SecuritySettings from "./SecuritySettings";
import RecoveryRequestsInbox from "./RecoveryRequestsInbox";
import WorkspacePage from "./WorkspacePage";
import { signOut } from "../lib/auth";
import type { UserProfile } from "../lib/auth";
import { ThemeCtx, getT } from "../lib/theme";
import type { Theme } from "../lib/theme";

// ── Re-export ThemeCtx so any component in the tree can consume it ────────────
export { ThemeCtx };

type NavPage = "records" | "addresses" | "employees" | "live" | "credentials" | "tasks" | "security" | "recovery" | "workspace";

interface DashboardProps {
  onLogout: () => void;
  profile:  UserProfile;
}

const NAV_ITEMS: { page: NavPage; label: string; icon: React.ReactNode }[] = [
  {
    page: "records", label: "IP Address",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          stroke="currentColor" strokeWidth="1.5" />
        <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    page: "addresses", label: "Proxy",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
          stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    page: "employees", label: "Employees",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    page: "live", label: "Live Monitor",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"
          stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    page: "credentials", label: "Credentials",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    page: "tasks", label: "Tasks",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    page: "security", label: "Security",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5 4.5-1.35 8-6.25 8-11.5V6L12 2z"
          stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    page: "recovery", label: "Recovery Requests",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.78 1 6.45 2.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <polyline points="21 3 21 9 15 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    page: "workspace", label: "Workspace",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

// ── Global CSS injected when light mode is active ─────────────────────────────
// Uses !important to override hardcoded inline styles in child components.
const LIGHT_CSS = `
  [data-theme="light"] {
    color-scheme: light;
  }
  /* ── Inputs, selects, textareas ── */
  [data-theme="light"] input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]) {
    background: #f8f9fc !important;
    color: #111827 !important;
    border-color: rgba(0,0,0,0.1) !important;
  }
  [data-theme="light"] input::placeholder { color: #9ca3af !important; }
  [data-theme="light"] select {
    background: #f8f9fc !important;
    color: #111827 !important;
    border-color: rgba(0,0,0,0.1) !important;
  }
  [data-theme="light"] option {
    background: #ffffff;
    color: #111827;
  }
  [data-theme="light"] textarea {
    background: #f8f9fc !important;
    color: #111827 !important;
    border-color: rgba(0,0,0,0.1) !important;
  }
  [data-theme="light"] textarea::placeholder { color: #9ca3af !important; }
  /* ── Scrollbars ── */
  [data-theme="light"] ::-webkit-scrollbar { width: 5px; height: 5px; }
  [data-theme="light"] ::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); border-radius: 4px; }
  [data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 4px; }
  [data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.28); }
  /* ── Code / mono / kbd ── */
  [data-theme="light"] code { background: rgba(0,0,0,0.05) !important; color: #374151 !important; }
  [data-theme="light"] kbd  { background: rgba(0,0,0,0.05) !important; color: #374151 !important; border-color: rgba(0,0,0,0.12) !important; }
  /* ── Table chrome ── */
  [data-theme="light"] table { border-color: rgba(0,0,0,0.06) !important; }
  [data-theme="light"] th   { background: #f3f4f8 !important; color: #374151 !important; border-color: rgba(0,0,0,0.07) !important; }
  [data-theme="light"] td   { border-color: rgba(0,0,0,0.05) !important; }
  /* ── Focus rings ── */
  [data-theme="light"] *:focus-visible { outline-color: rgba(124,108,248,0.5); }
`;

// ── Root export ───────────────────────────────────────────────────────────────
export default function Dashboard({ onLogout, profile }: DashboardProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("admin-theme") as Theme) ?? "dark"; }
    catch { return "dark"; }
  });

  const T = getT(theme);

  // Persist theme
  useEffect(() => {
    try { localStorage.setItem("admin-theme", theme); } catch {}
  }, [theme]);

  // Inject / remove global CSS for light mode
  useEffect(() => {
    let el = document.getElementById("admin-theme-css") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "admin-theme-css";
      document.head.appendChild(el);
    }
    el.textContent = theme === "light" ? LIGHT_CSS : "";
  }, [theme]);

  function toggleTheme() { setTheme((t) => t === "dark" ? "light" : "dark"); }

  return (
    <ThemeCtx.Provider value={{ theme, toggle: toggleTheme, T }}>
      <DashboardInner onLogout={onLogout} profile={profile} />
    </ThemeCtx.Provider>
  );
}

// ── Inner dashboard ───────────────────────────────────────────────────────────
function DashboardInner({ onLogout, profile }: DashboardProps) {
  const { theme, toggle, T } = useContext(ThemeCtx);
  const [page,           setPage]           = useState<NavPage>("records");
  const [showModal,      setShowModal]      = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sidebarHover,   setSidebarHover]   = useState(false);

  async function handleLogout() { await signOut(); onLogout(); }

  const pageLabels: Record<NavPage, { title: string; subtitle: string }> = {
    records:     { title: "IP Address",   subtitle: "Manage IP address entries. Save first, then Check to validate Unique IDs." },
    addresses:   { title: "Proxy",        subtitle: "Bulk import, select ranges, and assign proxy IPs to employees."          },
    employees:   { title: "Employees",    subtitle: "Create, manage, revoke and delete employee accounts."                   },
    live:        { title: "Live Monitor", subtitle: "Real-time view of active employee screen-share sessions."               },
    credentials: { title: "Credentials",  subtitle: "Store platform credentials and send them to any employee."              },
    tasks:       { title: "Tasks",        subtitle: "Compose tasks once and assign them to one or more employees."           },
    security:    { title: "Security",     subtitle: "Manage two-factor authentication and recovery codes."                  },
    recovery:    { title: "Recovery",     subtitle: "Review and approve emergency account-recovery requests."                },
    workspace:   { title: "Workspace",    subtitle: "Your private space — notes and an encrypted vault only you can read."  },
  };

  const initials = (profile.full_name || profile.email)[0].toUpperCase();
  const isLight  = theme === "light";

  return (
    <div
      data-theme={theme}
      style={{
        display:    "flex",
        height:     "100vh",
        overflow:   "hidden",
        background: T.bgApp,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize:   14,
        transition: "background 0.25s ease",
      }}
    >

      {/* ══════════════════════════════════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════════════════════════════════ */}
      <aside
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
        style={{
          width:          240,
          height:         "100vh",
          overflowY:      "auto",
          position:       "sticky",
          top:            0,
          background:     T.bgSidebar,
          borderRight:    `1px solid ${T.borderSidebar}`,
          display:        "flex",
          flexDirection:  "column",
          padding:        "20px 12px",
          flexShrink:     0,
          gap:            6,
          boxShadow:      sidebarHover ? T.shadowSidebarHover : T.shadowSidebar,
          zIndex:         10,
          transition:     "box-shadow 0.4s ease, background 0.25s ease",
        }}
      >
        {/* Ambient glow */}
        <div style={{
          position:      "absolute",
          top: 0, left: 0, right: 0, height: 300,
          background:    T.sidebarGlow,
          pointerEvents: "none",
        }} />

        {/* ── Logo ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 14px" }}>
          <svg width="54" height="40" viewBox="0 0 48 36" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="14" cy="20" r="12" fill="#8B1A1A" />
            <circle cx="33" cy="10" r="7.5" fill="#8B1A1A" />
            <circle cx="40" cy="25" r="4.5" fill="#8B1A1A" />
          </svg>
          <div style={{ color: T.textPrimary, fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>
            Do<span style={{ color: "#8B1A1A" }}>T</span>
          </div>
        </div>

        {/* ── Nav divider ── */}
        <div style={{
          height: 1, margin: "0 4px 6px",
          background: T.dividerGrad,
        }} />

        {/* ── Navigation ── */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            color: T.navSectionLabel, fontSize: 9, fontWeight: 600,
            letterSpacing: 1.5, textTransform: "uppercase", padding: "6px 10px 4px",
          }}>
            Navigation
          </div>
          {NAV_ITEMS.map(({ page: p, icon, label }) => {
            const active = page === p;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color      = isLight ? "#374151"           : "#6b7280";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color      = T.navInactiveColor;
                  }
                }}
                style={{
                  display:     "flex",
                  alignItems:  "center",
                  gap:         9,
                  borderRadius: 9,
                  padding:     "9px 10px",
                  cursor:      "pointer",
                  background:  active ? T.navActiveGrad : "transparent",
                  border:      active ? `1px solid ${T.navActiveBorder}` : "1px solid transparent",
                  color:       active ? T.navActiveColor : T.navInactiveColor,
                  fontSize:    12,
                  fontWeight:  active ? 600 : 400,
                  transition:  "all 0.18s cubic-bezier(0.16,1,0.3,1)",
                  fontFamily:  "inherit",
                  boxShadow:   active ? (isLight ? "0 2px 12px rgba(124,108,248,0.12)" : "0 2px 12px rgba(124,108,248,0.1)") : "none",
                  position:    "relative",
                  width:       "100%",
                  textAlign:   "left",
                }}
              >
                <span style={{ opacity: active ? 1 : 0.45, transition: "opacity 0.18s ease", display: "flex", flexShrink: 0 }}>
                  {icon}
                </span>
                <span style={{ letterSpacing: 0.1 }}>{label}</span>
                {active && (
                  <span style={{
                    position: "absolute", right: 10,
                    width: 5, height: 5, borderRadius: "50%",
                    background: "#7c6cf8",
                    boxShadow:  "0 0 8px rgba(124,108,248,0.8)",
                  }} />
                )}
              </button>
            );
          })}
        </nav>
              
              
        <div style={{ flex: 1 }} />

        {/* ── Theme toggle ── */}
        <button
          onClick={toggle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background   = T.bgBtnHover;
            e.currentTarget.style.color        = T.textSecondary;
            e.currentTarget.style.borderColor  = isLight ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background   = T.bgToggle;
            e.currentTarget.style.color        = T.colorToggle;
            e.currentTarget.style.borderColor  = T.borderToggle;
          }}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            background:   T.bgToggle,
            border:       `1px solid ${T.borderToggle}`,
            borderRadius: 9,
            color:        T.colorToggle,
            padding:      "8px 12px",
            fontSize:     11,
            cursor:       "pointer",
            fontFamily:   "inherit",
            transition:   "all 0.18s ease",
            width:        "100%",
          }}
        >
          <span>{isLight ? "Dark Mode" : "Light Mode"}</span>
        </button>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: T.dividerGrad }} />

        {/* ── Profile chip ── */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          9,
          background:   T.bgProfile,
          border:       `1px solid ${T.borderProfile}`,
          borderRadius: 10,
          padding:      "9px 10px",
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            background: isLight
              ? "linear-gradient(135deg, rgba(124,108,248,0.3), rgba(124,108,248,0.12))"
              : "linear-gradient(135deg, rgba(124,108,248,0.4), rgba(124,108,248,0.15))",
            border:    "1px solid rgba(124,108,248,0.3)",
            display:   "flex", alignItems: "center", justifyContent: "center",
            color:     isLight ? "#5b50d6" : "#a5a8ff",
            fontSize:  12, fontWeight: 700,
            boxShadow: "0 0 12px rgba(124,108,248,0.2)",
          }}>
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
            <span style={{
              color:      T.textPrimary,
              fontSize:   11,
              fontWeight: 600,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {profile.full_name || "Admin"}
            </span>
            <span style={{
              color:      T.textMuted,
              fontSize:   9,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {profile.email}
            </span>
          </div>
          <span style={{
            background:  isLight ? "rgba(124,108,248,0.08)" : "rgba(124,108,248,0.12)",
            border:      "1px solid rgba(124,108,248,0.22)",
            color:       "#7c6cf8",
            borderRadius: 4, padding: "2px 5px",
            fontSize: 8, fontWeight: 700, letterSpacing: 0.8, flexShrink: 0,
          }}>ADMIN</span>
        </div>

        {/* ── Logout ── */}
        <button
          onClick={handleLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.background   = "rgba(244,63,94,0.06)";
            e.currentTarget.style.borderColor  = "rgba(244,63,94,0.2)";
            e.currentTarget.style.color        = "#f43f5e";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background   = "transparent";
            e.currentTarget.style.borderColor  = T.borderBtn;
            e.currentTarget.style.color        = T.colorToggle;
          }}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            background:   "transparent",
            border:       `1px solid ${T.borderBtn}`,
            borderRadius: 9,
            color:        T.colorToggle,
            padding:      "8px 12px",
            fontSize:     11,
            cursor:       "pointer",
            fontFamily:   "inherit",
            transition:   "all 0.18s ease",
            width:        "100%",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" />
          </svg>
          Sign Out
        </button>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════════ */}
      <main style={{
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        overflow:      "auto",
        minHeight:     0,
        minWidth:      0,
        background:    T.bgApp,
        transition:    "background 0.25s ease",
      }}>

        {/* ── Page header ── */}
        <div style={{
          display:         "flex",
          justifyContent:  "space-between",
          alignItems:      "flex-start",
          padding:         "22px 28px 18px",
          background:      T.bgHeader,
          borderBottom:    `1px solid ${T.borderHeader}`,
          gap:             16,
          flexWrap:        "wrap",
          boxShadow:       isLight ? "0 1px 0 rgba(0,0,0,0.04)" : "none",
          transition:      "background 0.25s ease, border-color 0.25s ease",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, animation: "fadeDown 0.3s ease both" }}>
            <h1 style={{ color: T.textPrimary, margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>
              {pageLabels[page].title}
            </h1>
            <p style={{ color: T.textMuted, margin: 0, fontSize: 12 }}>
              {pageLabels[page].subtitle}
            </p>
          </div>

          {page === "records" && (
            <button
              onClick={() => setShowModal(true)}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1";   e.currentTarget.style.transform = "none"; }}
              style={{
                background:    "linear-gradient(135deg, #7c6cf8 0%, #5b50d6 100%)",
                border:        "none",
                color:         "#fff",
                borderRadius:  10,
                padding:       "9px 18px",
                fontSize:      13,
                fontWeight:    600,
                cursor:        "pointer",
                fontFamily:    "inherit",
                flexShrink:    0,
                boxShadow:     "0 4px 16px rgba(124,108,248,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
                letterSpacing: 0.2,
                display:       "flex",
                alignItems:    "center",
                gap:           7,
                transition:    "all 0.2s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Add IP Address
            </button>
          )}
        </div>

        {/* ── Accent gradient line ── */}
        <div style={{
          height:     1,
          flexShrink: 0,
          background: T.accentLine,
          opacity:    isLight ? 0.6 : 0.4,
        }} />

        {/* ── Page content ── */}
        <div style={{
          flex:          1,
          padding:       "20px 28px 28px",
          display:       "flex",
          flexDirection: "column",
          gap:           20,
          overflow:      "auto",
        }}>
          {page === "records" && (
            <>
              <div style={{
                background:    T.bgCard,
                border:        `1px solid ${T.borderCard}`,
                borderRadius:  14,
                overflow:      "hidden",
                boxShadow:     T.shadowCard,
                animation:     "fadeUp 0.3s ease both",
                transition:    "background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
              }}>
                <RecordsTable refreshTrigger={refreshTrigger} />
              </div>
              {showModal && (
                <AddRecordModal
                  onClose={() => setShowModal(false)}
                  onSaved={() => setRefreshTrigger((n) => n + 1)}
                />
              )}
            </>
          )}
          {page === "addresses" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <AddressManagement />
            </div>
          )}
          {page === "employees" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <EmployeeManagement />
            </div>
          )}
          {page === "live" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <LiveMonitor />
            </div>
          )}
          {page === "credentials" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <CredentialsManagement />
            </div>
          )}
          {page === "tasks" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <TasksManagement />
            </div>
          )}
          {page === "security" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <SecuritySettings />
            </div>
          )}
          {page === "recovery" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <RecoveryRequestsInbox />
            </div>
          )}
          {page === "workspace" && (
            <div style={{ animation: "fadeUp 0.3s ease both" }}>
              <WorkspacePage />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
