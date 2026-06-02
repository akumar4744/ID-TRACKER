// src/lib/theme.ts
// Shared theme context + tokens for the admin portal.
// Import useTheme() in any child component to read current theme + tokens.

import { createContext, useContext } from "react";

export type Theme = "dark" | "light";

export interface ThemeTokens {
  // App shell
  bgApp: string;
  // Sidebar
  bgSidebar: string;
  borderSidebar: string;
  sidebarGlow: string;
  shadowSidebar: string;
  shadowSidebarHover: string;
  // Nav
  navActiveGrad: string;
  navActiveBorder: string;
  navActiveColor: string;
  navInactiveColor: string;
  navSectionLabel: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  // Cards / surfaces
  bgCard: string;
  bgCardAlt: string;
  borderCard: string;
  shadowCard: string;
  // Header
  bgHeader: string;
  borderHeader: string;
  // Misc
  dividerGrad: string;
  dividerSolid: string;
  bgBtn: string;
  borderBtn: string;
  bgBtnHover: string;
  bgProfile: string;
  borderProfile: string;
  accentLine: string;
  // Inputs (used in child components)
  bgInput: string;
  borderInput: string;
  // Table / list rows
  bgTableHeader: string;
  bgTableRow: string;
  bgTableRowHover: string;
  bgTableRowSelected: string;
  borderTableRow: string;
  // Toggle / utility
  bgToggle: string;
  borderToggle: string;
  colorToggle: string;
  // Status colors (invariant, but slightly adjusted for bg context)
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorAccent: string;
}

// ── Dark theme ─────────────────────────────────────────────────────────────────
export const dark: ThemeTokens = {
  bgApp:                "#05060d",
  bgSidebar:            "rgba(8,10,20,0.98)",
  borderSidebar:        "rgba(255,255,255,0.06)",
  sidebarGlow:          "radial-gradient(ellipse at 50% 0%, rgba(124,108,248,0.04) 0%, transparent 70%)",
  shadowSidebar:        "4px 0 24px rgba(0,0,0,0.4)",
  shadowSidebarHover:   "4px 0 40px rgba(124,108,248,0.08)",
  navActiveGrad:        "linear-gradient(90deg, rgba(124,108,248,0.15), rgba(124,108,248,0.06))",
  navActiveBorder:      "rgba(124,108,248,0.22)",
  navActiveColor:       "#a5a8ff",
  navInactiveColor:     "#4a526e",
  navSectionLabel:      "#2d3450",
  textPrimary:          "#eef0f8",
  textSecondary:        "#8892b0",
  textMuted:            "#4a526e",
  textTertiary:         "#2d3450",
  bgCard:               "rgba(13,16,34,0.65)",
  bgCardAlt:            "rgba(13,16,34,0.85)",
  borderCard:           "rgba(255,255,255,0.06)",
  shadowCard:           "0 4px 24px rgba(0,0,0,0.4)",
  bgHeader:             "linear-gradient(180deg, rgba(124,108,248,0.03) 0%, transparent 100%)",
  borderHeader:         "rgba(255,255,255,0.05)",
  dividerGrad:          "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
  dividerSolid:         "rgba(255,255,255,0.06)",
  bgBtn:                "rgba(255,255,255,0.03)",
  borderBtn:            "rgba(255,255,255,0.07)",
  bgBtnHover:           "rgba(255,255,255,0.06)",
  bgProfile:            "rgba(255,255,255,0.02)",
  borderProfile:        "rgba(255,255,255,0.07)",
  accentLine:           "linear-gradient(90deg, rgba(124,108,248,0.5) 0%, rgba(34,211,238,0.2) 50%, transparent 100%)",
  bgInput:              "rgba(8,10,20,0.5)",
  borderInput:          "rgba(255,255,255,0.08)",
  bgTableHeader:        "rgba(8,10,20,0.3)",
  bgTableRow:           "transparent",
  bgTableRowHover:      "rgba(124,108,248,0.03)",
  bgTableRowSelected:   "rgba(124,108,248,0.07)",
  borderTableRow:       "rgba(255,255,255,0.04)",
  bgToggle:             "rgba(255,255,255,0.03)",
  borderToggle:         "rgba(255,255,255,0.07)",
  colorToggle:          "#4a526e",
  colorSuccess:         "#10b981",
  colorWarning:         "#f59e0b",
  colorError:           "#f43f5e",
  colorAccent:          "#7c6cf8",
};

// ── Light theme — warm white, easy on the eyes, premium feel ──────────────────
export const light: ThemeTokens = {
  bgApp:                "#f0f2f8",
  bgSidebar:            "#ffffff",
  borderSidebar:        "rgba(0,0,0,0.08)",
  sidebarGlow:          "radial-gradient(ellipse at 50% 0%, rgba(124,108,248,0.07) 0%, transparent 70%)",
  shadowSidebar:        "4px 0 20px rgba(0,0,0,0.06)",
  shadowSidebarHover:   "4px 0 32px rgba(124,108,248,0.12)",
  navActiveGrad:        "linear-gradient(90deg, rgba(124,108,248,0.1), rgba(124,108,248,0.04))",
  navActiveBorder:      "rgba(124,108,248,0.22)",
  navActiveColor:       "#5b50d6",
  navInactiveColor:     "#9ca3af",
  navSectionLabel:      "#d1d5db",
  textPrimary:          "#111827",
  textSecondary:        "#6b7280",
  textMuted:            "#9ca3af",
  textTertiary:         "#d1d5db",
  bgCard:               "#ffffff",
  bgCardAlt:            "#ffffff",
  borderCard:           "rgba(0,0,0,0.07)",
  shadowCard:           "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.05)",
  bgHeader:             "#ffffff",
  borderHeader:         "rgba(0,0,0,0.07)",
  dividerGrad:          "linear-gradient(90deg, transparent, rgba(0,0,0,0.07), transparent)",
  dividerSolid:         "rgba(0,0,0,0.07)",
  bgBtn:                "rgba(0,0,0,0.03)",
  borderBtn:            "rgba(0,0,0,0.09)",
  bgBtnHover:           "rgba(0,0,0,0.06)",
  bgProfile:            "rgba(0,0,0,0.02)",
  borderProfile:        "rgba(0,0,0,0.08)",
  accentLine:           "linear-gradient(90deg, rgba(124,108,248,0.6) 0%, rgba(34,211,238,0.3) 50%, transparent 100%)",
  bgInput:              "#f8f9fc",
  borderInput:          "rgba(0,0,0,0.09)",
  bgTableHeader:        "#f8f9fc",
  bgTableRow:           "transparent",
  bgTableRowHover:      "rgba(124,108,248,0.04)",
  bgTableRowSelected:   "rgba(124,108,248,0.06)",
  borderTableRow:       "rgba(0,0,0,0.05)",
  bgToggle:             "rgba(0,0,0,0.03)",
  borderToggle:         "rgba(0,0,0,0.09)",
  colorToggle:          "#9ca3af",
  colorSuccess:         "#059669",
  colorWarning:         "#d97706",
  colorError:           "#dc2626",
  colorAccent:          "#7c6cf8",
};

// ── Context ────────────────────────────────────────────────────────────────────
export interface ThemeCtxType {
  theme:  Theme;
  toggle: () => void;
  T:      ThemeTokens;
}

export const ThemeCtx = createContext<ThemeCtxType>({
  theme: "dark", toggle: () => {}, T: dark,
});

export function useTheme(): ThemeCtxType {
  return useContext(ThemeCtx);
}

export function getT(theme: Theme): ThemeTokens {
  return theme === "dark" ? dark : light;
}
