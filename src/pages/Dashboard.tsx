// File: src/pages/Dashboard.tsx
// Clean white + crimson #8e1616 design — inspired by punto7x.com
// Soft background orbs, white cards with thin red borders, no black anywhere.

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
import ResourceManagement from "./ResourceManagement";
import { signOut } from "../lib/auth";
import type { UserProfile } from "../lib/auth";
import { ThemeCtx, getT } from "../lib/theme";
import type { Theme } from "../lib/theme";

export { ThemeCtx };

type NavPage = "records" | "addresses" | "employees" | "live" | "credentials" | "tasks" | "security" | "recovery" | "workspace" | "cache" | "keywords" | "smartlink";

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
  {
    page: "cache", label: "Cache",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 5v5c0 1.657 4.03 3 9 3s9-1.343 9-3V5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10v5c0 1.657 4.03 3 9 3s9-1.343 9-3v-5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    page: "keywords", label: "Keywords",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 10h10M4 14h12M4 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    page: "smartlink", label: "Smartlink",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// ── Global overrides injected for light mode ──────────────────────────────────
const LIGHT_CSS = `
  [data-theme="light"] {
    color-scheme: light;
    font-family: 'Sarabun', -apple-system, sans-serif !important;
    background: #ffffff !important;
  }

  /* ── Inputs, selects, textareas ── */
  [data-theme="light"] input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]) {
    background:   #ffffff !important;
    color:        #1a1a2e !important;
    border-color: rgba(0,0,0,0.10) !important;
  }
  [data-theme="light"] input::placeholder  { color: #bbbbcc !important; }
  [data-theme="light"] select {
    background:   #ffffff !important;
    color:        #1a1a2e !important;
    border-color: rgba(0,0,0,0.10) !important;
  }
  [data-theme="light"] option  { background: #ffffff; color: #1a1a2e; }
  [data-theme="light"] textarea {
    background:   #ffffff !important;
    color:        #1a1a2e !important;
    border-color: rgba(0,0,0,0.10) !important;
  }
  [data-theme="light"] textarea::placeholder { color: #bbbbcc !important; }

  /* ── Scrollbars ── */
  [data-theme="light"] ::-webkit-scrollbar       { width: 4px; height: 4px; }
  [data-theme="light"] ::-webkit-scrollbar-track { background: transparent; border-radius: 99px; }
  [data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(142,22,22,0.20); border-radius: 99px; }
  [data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(142,22,22,0.35); }

  /* ── Code / mono ── */
  [data-theme="light"] code { background: rgba(0,0,0,0.04) !important; color: #8e1616 !important; border-radius: 4px; padding: 1px 5px; }
  [data-theme="light"] kbd  { background: rgba(0,0,0,0.04) !important; color: #444466 !important; border-color: rgba(0,0,0,0.12) !important; }

  /* ── Table chrome ── */
  [data-theme="light"] table { border-color: rgba(0,0,0,0.06) !important; }
  [data-theme="light"] th {
    background:     rgba(0,0,0,0.025) !important;
    color:          #8e1616 !important;
    border-color:   rgba(0,0,0,0.07) !important;
    letter-spacing: 0.5px;
    font-weight:    600;
  }
  [data-theme="light"] td {
    border-color: rgba(0,0,0,0.05) !important;
    color:        #1a1a2e !important;
    background:   transparent !important;
  }
  [data-theme="light"] tr:hover td { background: rgba(0,0,0,0.018) !important; }

  /* ── Focus rings ── */
  [data-theme="light"] *:focus-visible { outline-color: rgba(142,22,22,0.40) !important; }

  /* ── Replace lingering purple ── */
  [data-theme="light"] [style*="7c6cf8"],
  [data-theme="light"] [style*="818cf8"] {
    color:        #8e1616 !important;
    border-color: rgba(142,22,22,0.22) !important;
    background:   transparent !important;
  }
`;

// ── Root export ───────────────────────────────────────────────────────────────
export default function Dashboard({ onLogout, profile }: DashboardProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("admin-theme") as Theme) ?? "light"; }
    catch { return "light"; }
  });

  const T = getT(theme);

  useEffect(() => {
    try { localStorage.setItem("admin-theme", theme); } catch {}
  }, [theme]);

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

// ── DOM patcher: fixes hardcoded dark inline-styles in child components ───────
// Only runs in light mode. Intercepts new nodes + style attribute mutations.
const DARK_BG_RE  = /rgba?\(\s*(8\s*,\s*10\s*,\s*20|13\s*,\s*16\s*,\s*34|5\s*,\s*6\s*,\s*13|20\s*,\s*19\s*,\s*38)/i;
const DARK_HEX_BG = /^(#0f1320|#141826|#080a14|#05060d|#0d1022|#0a0d1a|#1a1b2e)$/i;
const DARK_TEXT_RE = /^(#eef0f8|rgb\(\s*238\s*,|#f0f2f8|rgb\(\s*240\s*,\s*242)/i;
const PURPLE_TEXT  = /^(#818cf8|#7c6cf8|#a5a8ff|rgb\(\s*129\s*,\s*140\s*,\s*248|rgb\(\s*124\s*,\s*108)/i;
const DARK_MUTED   = /^(#4a526e|#4a5166|#8892b0|rgb\(\s*74\s*,\s*82|rgb\(\s*136\s*,\s*146)/i;
const WHITE_BDR    = /^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.(0[0-9]|1[0-4])\s*\)$/i;
const PURPLE_BG    = /rgba?\(\s*(124\s*,\s*108\s*,\s*248|91\s*,\s*110\s*,\s*245|129\s*,\s*140\s*,\s*248)/i;

function patchLightEl(el: HTMLElement) {
  const s = el.style;
  const bg  = s.background.trim();
  const bgc = s.backgroundColor.trim();
  const col = s.color.trim();
  const bdc = s.borderColor.trim();

  // Dark backgrounds → white
  if (bg  && (DARK_BG_RE.test(bg)  || DARK_HEX_BG.test(bg)))  s.background      = "#ffffff";
  if (bgc && (DARK_BG_RE.test(bgc) || DARK_HEX_BG.test(bgc))) s.backgroundColor = "#ffffff";
  // Purple/indigo backgrounds → neutral light tint
  if (bg  && PURPLE_BG.test(bg))   s.background      = "rgba(0,0,0,0.04)";
  if (bgc && PURPLE_BG.test(bgc))  s.backgroundColor = "rgba(0,0,0,0.04)";

  // Text color patches
  if (col && DARK_TEXT_RE.test(col))  s.color = "#1a1a2e";
  if (col && PURPLE_TEXT.test(col))   s.color = "#8e1616";
  if (col && DARK_MUTED.test(col))    s.color = "#111111";

  // Border patches: low-opacity white borders → neutral light
  if (bdc && WHITE_BDR.test(bdc))   s.borderColor = "rgba(0,0,0,0.09)";
}

// ── Inner dashboard ───────────────────────────────────────────────────────────
function DashboardInner({ onLogout, profile }: DashboardProps) {
  const { theme, toggle, T } = useContext(ThemeCtx);
  const [page,           setPage]           = useState<NavPage>("records");
  const [showModal,      setShowModal]      = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sidebarHover,   setSidebarHover]   = useState(false);

  async function handleLogout() { await signOut(); onLogout(); }

  // Light-mode DOM patcher — fixes hardcoded dark colors from child components
  useEffect(() => {
    if (theme !== "light") return;
    const root = document.querySelector("[data-theme='light']") as HTMLElement | null;
    if (!root) return;

    // Initial sweep
    root.querySelectorAll<HTMLElement>("*").forEach(patchLightEl);

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              patchLightEl(n);
              n.querySelectorAll<HTMLElement>("*").forEach(patchLightEl);
            }
          });
        } else if (m.type === "attributes" && m.target instanceof HTMLElement) {
          patchLightEl(m.target as HTMLElement);
        }
      }
    });
    obs.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    return () => obs.disconnect();
  }, [theme]);

  const pageLabels: Record<NavPage, { title: string; subtitle: string }> = {
    records:     { title: "IP Address",   subtitle: "Manage IP address entries and validate unique IDs." },
    addresses:   { title: "Proxy",        subtitle: "Bulk import, select ranges, and assign proxy IPs to employees." },
    employees:   { title: "Employees",    subtitle: "Create, manage, revoke and delete employee accounts." },
    live:        { title: "Live Monitor", subtitle: "Real-time view of active employee screen-share sessions." },
    credentials: { title: "Credentials",  subtitle: "Store platform credentials and send them to any employee." },
    tasks:       { title: "Tasks",        subtitle: "Compose tasks once and assign them to one or more employees." },
    security:    { title: "Security",     subtitle: "Manage two-factor authentication and recovery codes." },
    recovery:    { title: "Recovery",     subtitle: "Review and approve emergency account-recovery requests." },
    workspace:   { title: "Workspace",    subtitle: "Your private space — notes and an encrypted vault only you can read." },
    cache:       { title: "Cache",        subtitle: "Upload and manage your cache value pool. Assign to proxy IPs during the assignment workflow." },
    keywords:    { title: "Keywords",     subtitle: "Upload and manage keyword sets. Assign to proxy IPs during the assignment workflow." },
    smartlink:   { title: "Smartlink",    subtitle: "Upload and manage smartlinks. Assign to proxy IPs during the assignment workflow." },
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
        fontFamily: "'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize:   14,
        position:   "relative",
        transition: "background 0.25s ease",
      }}
    >

      {/* Pure white background — no orbs */}

      {/* ════════════════════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════════════════════ */}
      <aside
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
        style={{
          width:                240,
          height:               "100vh",
          overflowY:            "auto",
          position:             "sticky",
          top:                  0,
          zIndex:               20,
          background:  T.bgSidebar,
          borderRight: `1px solid ${T.borderSidebar}`,
          display:              "flex",
          flexDirection:        "column",
          padding:              "20px 12px",
          flexShrink:           0,
          gap:                  6,
          boxShadow:            sidebarHover ? T.shadowSidebarHover : T.shadowSidebar,
          transition:           "box-shadow 0.35s ease, background 0.25s ease",
        }}
      >

        {/* ── Logo ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 16px" }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(142,22,22,0.30)",
          }}>
            <svg width="20" height="20" viewBox="0 0 48 36" fill="none">
              <circle cx="14" cy="20" r="12" fill="rgba(255,255,255,0.9)" />
              <circle cx="33" cy="10" r="7.5" fill="rgba(255,255,255,0.7)" />
              <circle cx="40" cy="25" r="4.5" fill="rgba(255,255,255,0.55)" />
            </svg>
          </div>
          <div>
            <div style={{ color: T.textPrimary, fontWeight: 800, fontSize: 17, letterSpacing: -0.4, lineHeight: 1.1 }}>
              Do<span style={{ color: "#8e1616" }}>T</span>
            </div>
            <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500 }}>
              Portal
            </div>
          </div>
        </div>

        {/* ── Nav divider ── */}
        <div style={{ height: 1, margin: "0 4px 4px", background: T.dividerGrad }} />

        {/* ── Navigation ── */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            color:         T.navSectionLabel,
            fontSize:      9,
            fontWeight:    600,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            padding:       "4px 10px 8px",
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
                    e.currentTarget.style.background = isLight
                      ? "rgba(142,22,22,0.04)"
                      : "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = isLight ? "#8e1616" : "#6b7280";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color      = T.navInactiveColor;
                  }
                }}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          9,
                  borderRadius: 10,
                  padding:      "9px 10px",
                  cursor:       "pointer",
                  background:   active ? T.navActiveGrad : "transparent",
                  border:       active
                    ? `1px solid ${T.navActiveBorder}`
                    : "1px solid transparent",
                  color:        active ? T.navActiveColor : T.navInactiveColor,
                  fontSize:     12.5,
                  fontWeight:   active ? 600 : 400,
                  transition:   "all 0.18s cubic-bezier(0.16,1,0.3,1)",
                  fontFamily:   "inherit",
                  boxShadow:    "none",
                  position:     "relative",
                  width:        "100%",
                  textAlign:    "left",
                }}
              >
                <span style={{
                  opacity:    active ? 1 : 0.45,
                  transition: "opacity 0.18s ease",
                  display:    "flex",
                  flexShrink: 0,
                }}>
                  {icon}
                </span>
                <span style={{ letterSpacing: 0.1, flex: 1 }}>{label}</span>
                {active && (
                  <span style={{
                    width:      5,
                    height:     5,
                    borderRadius: "50%",
                    background: "#8e1616",
                    boxShadow:  "0 0 7px rgba(142,22,22,0.65)",
                    flexShrink: 0,
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
            e.currentTarget.style.background  = T.bgBtnHover;
            e.currentTarget.style.color       = T.textSecondary;
            e.currentTarget.style.borderColor = isLight ? "rgba(142,22,22,0.22)" : "rgba(255,255,255,0.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background  = T.bgToggle;
            e.currentTarget.style.color       = T.colorToggle;
            e.currentTarget.style.borderColor = T.borderToggle;
          }}
          style={{
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            {isLight
              ? <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.5" />
              : <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
            }
          </svg>
          <span>{isLight ? "Dark Mode" : "Light Mode"}</span>
        </button>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: T.dividerGrad, margin: "2px 0" }} />

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
            width:      30,
            height:     30,
            borderRadius: "50%",
            flexShrink: 0,
            background: isLight
              ? "linear-gradient(135deg, rgba(142,22,22,0.14), rgba(142,22,22,0.06))"
              : "linear-gradient(135deg, rgba(142,22,22,0.4), rgba(142,22,22,0.18))",
            border:     "1px solid rgba(142,22,22,0.20)",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            color:      isLight ? "#8e1616" : "#e87070",
            fontSize:   12,
            fontWeight: 700,
            boxShadow:  "0 0 10px rgba(142,22,22,0.12)",
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
              color:     T.textMuted,
              fontSize:  9,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {profile.email}
            </span>
          </div>
          <span style={{
            background:   isLight ? "rgba(142,22,22,0.07)" : "rgba(142,22,22,0.15)",
            border:       "1px solid rgba(142,22,22,0.20)",
            color:        isLight ? "#8e1616" : "#e87070",
            borderRadius: 4,
            padding:      "2px 5px",
            fontSize:     8,
            fontWeight:   700,
            letterSpacing: 0.8,
            flexShrink:   0,
          }}>
            ADMIN
          </span>
        </div>

        {/* ── Logout ── */}
        <button
          onClick={handleLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.background  = "rgba(220,38,38,0.06)";
            e.currentTarget.style.borderColor = "rgba(220,38,38,0.18)";
            e.currentTarget.style.color       = "#dc2626";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background  = "transparent";
            e.currentTarget.style.borderColor = T.borderBtn;
            e.currentTarget.style.color       = T.colorToggle;
          }}
          style={{
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            gap:          7,
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

      {/* ════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════════════════ */}
      <main style={{
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        overflow:      "auto",
        minHeight:     0,
        minWidth:      0,
        position:      "relative",
        zIndex:        10,
      }}>

        {/* ── Page header ── */}
        <div style={{
          display:              "flex",
          justifyContent:       "space-between",
          alignItems:           "flex-start",
          padding:              "22px 28px 18px",
          background:  T.bgHeader,
          borderBottom:`1px solid ${T.borderHeader}`,
          gap:         16,
          flexWrap:    "wrap",
          boxShadow:   isLight ? "0 1px 6px rgba(0,0,0,0.04)" : "none",
          transition:           "background 0.25s ease",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 style={{
              color:        T.textPrimary,
              margin:       0,
              fontSize:     20,
              fontWeight:   700,
              letterSpacing: -0.3,
            }}>
              {pageLabels[page].title}
            </h1>
            <p style={{ color: T.textMuted, margin: 0, fontSize: 12 }}>
              {pageLabels[page].subtitle}
            </p>
          </div>

          {page === "records" && (
            <button
              onClick={() => setShowModal(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity   = "0.88";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(142,22,22,0.36)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity   = "1";
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "0 4px 14px rgba(142,22,22,0.28)";
              }}
              style={{
                background:    "linear-gradient(135deg, #8e1616 0%, #6b1010 100%)",
                border:        "none",
                color:         "#fff",
                borderRadius:  10,
                padding:       "9px 18px",
                fontSize:      13,
                fontWeight:    600,
                cursor:        "pointer",
                fontFamily:    "inherit",
                flexShrink:    0,
                boxShadow:     "0 4px 14px rgba(142,22,22,0.28)",
                letterSpacing: 0.2,
                display:       "flex",
                alignItems:    "center",
                gap:           7,
                transition:    "all 0.18s cubic-bezier(0.16,1,0.3,1)",
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

        {/* ── Accent line ── */}
        <div style={{
          height:     2,
          flexShrink: 0,
          background: T.accentLine,
          opacity:    isLight ? 0.55 : 0.35,
        }} />

        {/* ── Page content ── */}
        <div style={{
          flex:          1,
          padding:       "22px 28px 32px",
          display:       "flex",
          flexDirection: "column",
          gap:           20,
          overflow:      "auto",
        }}>

          {/* ── IP Address ── */}
          {page === "records" && (
            <>
              <div style={{
                background:   T.bgCard,
                border:       `1px solid ${T.borderCard}`,
                borderRadius: 18,
                overflow:     "hidden",
                boxShadow:    T.shadowCard,
                animation:    "fadeUp 0.28s ease both",
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

          {/* ── Proxy ── */}
          {page === "addresses" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <AddressManagement />
            </div>
          )}

          {/* ── Employees ── */}
          {page === "employees" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <EmployeeManagement />
            </div>
          )}

          {/* ── Live Monitor ── */}
          {page === "live" && (
            <div style={{ animation: "fadeUp 0.28s ease both" }}>
              <LiveMonitor />
            </div>
          )}

          {/* ── Credentials ── */}
          {page === "credentials" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <CredentialsManagement />
            </div>
          )}

          {/* ── Tasks ── */}
          {page === "tasks" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <TasksManagement />
            </div>
          )}

          {/* ── Security ── */}
          {page === "security" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <SecuritySettings />
            </div>
          )}

          {/* ── Recovery ── */}
          {page === "recovery" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <RecoveryRequestsInbox />
            </div>
          )}

          {/* ── Workspace ── */}
          {page === "workspace" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <WorkspacePage />
            </div>
          )}

          {/* ── Cache ── */}
          {page === "cache" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <ResourceManagement resourceType="cache" />
            </div>
          )}

          {/* ── Keywords ── */}
          {page === "keywords" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <ResourceManagement resourceType="keywords" />
            </div>
          )}

          {/* ── Smartlink ── */}
          {page === "smartlink" && (
            <div style={{
              background:   "#ffffff",
              border:       "1px solid rgba(0,0,0,0.07)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
              animation:    "fadeUp 0.28s ease both",
            }}>
              <ResourceManagement resourceType="smartlink" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
