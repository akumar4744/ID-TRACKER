// src/lib/theme.ts
// Shared theme context + tokens.
// Default: light (clean white + crimson #8e1616, no glassmorphism)

import { createContext, useContext } from "react";

export type Theme = "dark" | "light";

export interface ThemeTokens {
  bgApp: string;
  bgSidebar: string;
  borderSidebar: string;
  sidebarGlow: string;
  shadowSidebar: string;
  shadowSidebarHover: string;
  navActiveGrad: string;
  navActiveBorder: string;
  navActiveColor: string;
  navInactiveColor: string;
  navSectionLabel: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  bgCard: string;
  bgCardAlt: string;
  borderCard: string;
  shadowCard: string;
  bgHeader: string;
  borderHeader: string;
  dividerGrad: string;
  dividerSolid: string;
  bgBtn: string;
  borderBtn: string;
  bgBtnHover: string;
  bgProfile: string;
  borderProfile: string;
  accentLine: string;
  bgInput: string;
  borderInput: string;
  bgTableHeader: string;
  bgTableRow: string;
  bgTableRowHover: string;
  bgTableRowSelected: string;
  borderTableRow: string;
  bgToggle: string;
  borderToggle: string;
  colorToggle: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorAccent: string;
}

// ── Light theme — Pure white, red on button outlines only ─────────────────────
export const light: ThemeTokens = {
  bgApp:              "#ffffff",
  bgSidebar:          "#ffffff",
  borderSidebar:      "rgba(0,0,0,0.07)",
  sidebarGlow:        "none",
  shadowSidebar:      "1px 0 12px rgba(0,0,0,0.06)",
  shadowSidebarHover: "1px 0 20px rgba(0,0,0,0.09)",

  navActiveGrad:   "rgba(142,22,22,0.06)",
  navActiveBorder: "rgba(142,22,22,0.18)",
  navActiveColor:  "#8e1616",
  navInactiveColor:"#9a9ab0",
  navSectionLabel: "#c8c8d8",

  textPrimary:   "#1a1a2e",
  textSecondary: "#444466",
  textMuted:     "#8888aa",
  textTertiary:  "#bbbbcc",

  bgCard:     "#ffffff",
  bgCardAlt:  "#fafafa",
  borderCard: "rgba(0,0,0,0.07)",
  shadowCard: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",

  bgHeader:    "#ffffff",
  borderHeader:"rgba(0,0,0,0.07)",

  dividerGrad:  "linear-gradient(90deg, transparent, rgba(0,0,0,0.07), transparent)",
  dividerSolid: "rgba(0,0,0,0.06)",

  /* ── Buttons get red outlines ── */
  bgBtn:      "#ffffff",
  borderBtn:  "#8e1616",
  bgBtnHover: "rgba(142,22,22,0.05)",

  bgProfile:    "#ffffff",
  borderProfile:"rgba(0,0,0,0.08)",

  accentLine:"linear-gradient(90deg, #8e1616 0%, rgba(142,22,22,0.15) 55%, transparent 100%)",

  bgInput:    "#ffffff",
  borderInput:"rgba(0,0,0,0.10)",

  bgTableHeader:      "rgba(0,0,0,0.025)",
  bgTableRow:         "transparent",
  bgTableRowHover:    "rgba(0,0,0,0.02)",
  bgTableRowSelected: "rgba(142,22,22,0.05)",
  borderTableRow:     "rgba(0,0,0,0.05)",

  bgToggle:    "#ffffff",
  borderToggle:"#8e1616",
  colorToggle: "#8e1616",

  colorSuccess: "#059669",
  colorWarning: "#d97706",
  colorError:   "#dc2626",
  colorAccent:  "#8e1616",
};

// ── Dark theme ────────────────────────────────────────────────────────────────
export const dark: ThemeTokens = {
  bgApp:              "#05060d",
  bgSidebar:          "rgba(8,10,20,0.98)",
  borderSidebar:      "rgba(255,255,255,0.06)",
  sidebarGlow:        "radial-gradient(ellipse at 50% 0%, rgba(142,22,22,0.05) 0%, transparent 70%)",
  shadowSidebar:      "4px 0 24px rgba(0,0,0,0.4)",
  shadowSidebarHover: "4px 0 40px rgba(142,22,22,0.10)",

  navActiveGrad:   "linear-gradient(90deg, rgba(142,22,22,0.18), rgba(142,22,22,0.07))",
  navActiveBorder: "rgba(142,22,22,0.28)",
  navActiveColor:  "#e87070",
  navInactiveColor:"#4a526e",
  navSectionLabel: "#2d3450",

  textPrimary:   "#eef0f8",
  textSecondary: "#8892b0",
  textMuted:     "#4a526e",
  textTertiary:  "#2d3450",

  bgCard:    "rgba(13,16,34,0.65)",
  bgCardAlt: "rgba(13,16,34,0.85)",
  borderCard:"rgba(255,255,255,0.06)",
  shadowCard:"0 4px 24px rgba(0,0,0,0.4)",

  bgHeader:    "rgba(8,10,20,0.5)",
  borderHeader:"rgba(255,255,255,0.05)",

  dividerGrad:  "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
  dividerSolid: "rgba(255,255,255,0.06)",

  bgBtn:      "rgba(255,255,255,0.03)",
  borderBtn:  "rgba(255,255,255,0.07)",
  bgBtnHover: "rgba(255,255,255,0.06)",

  bgProfile:    "rgba(255,255,255,0.02)",
  borderProfile:"rgba(255,255,255,0.07)",

  accentLine:"linear-gradient(90deg, rgba(142,22,22,0.6) 0%, rgba(142,22,22,0.2) 50%, transparent 100%)",

  bgInput:    "rgba(8,10,20,0.5)",
  borderInput:"rgba(255,255,255,0.08)",

  bgTableHeader:      "rgba(8,10,20,0.3)",
  bgTableRow:         "transparent",
  bgTableRowHover:    "rgba(142,22,22,0.04)",
  bgTableRowSelected: "rgba(142,22,22,0.08)",
  borderTableRow:     "rgba(255,255,255,0.04)",

  bgToggle:    "rgba(255,255,255,0.03)",
  borderToggle:"rgba(255,255,255,0.07)",
  colorToggle: "#4a526e",

  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorError:   "#f43f5e",
  colorAccent:  "#8e1616",
};

// ── Context ────────────────────────────────────────────────────────────────────
export interface ThemeCtxType {
  theme:  Theme;
  toggle: () => void;
  T:      ThemeTokens;
}

export const ThemeCtx = createContext<ThemeCtxType>({
  theme: "light", toggle: () => {}, T: light,
});

export function useTheme(): ThemeCtxType {
  return useContext(ThemeCtx);
}

export function getT(theme: Theme): ThemeTokens {
  return theme === "dark" ? dark : light;
}
