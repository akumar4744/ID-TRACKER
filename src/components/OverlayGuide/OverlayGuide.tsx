// src/components/OverlayGuide/OverlayGuide.tsx

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  CSSProperties,
} from "react";
import ReactDOM from "react-dom";
import { useSpotlightRect } from "./useSpotlightRect";
import type { OverlayGuideProps, SpotlightRect } from "./types";

// ─── Animation keyframes injected once ───────────────────────────────────────
const KEYFRAMES_ID = "overlay-guide-keyframes";

function injectKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.innerHTML = `
    @keyframes og-fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes og-fadeOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes og-slideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);     }
    }
    @keyframes og-slideDown {
      from { opacity: 0; transform: translateY(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)     scale(1);    }
    }
    @keyframes og-glowPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(124,108,248,0), 0 0 24px 4px rgba(124,108,248,0.35); }
      50%      { box-shadow: 0 0 0 6px rgba(124,108,248,0), 0 0 40px 8px rgba(124,108,248,0.55); }
    }
    @keyframes og-brandPulse {
      0%,100% { opacity: 0.55; letter-spacing: 4px; }
      50%      { opacity: 0.85; letter-spacing: 5px; }
    }
    @keyframes og-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes og-shimmer {
      0%   { transform: translateX(-100%) skewX(-12deg); }
      100% { transform: translateX(200%)  skewX(-12deg); }
    }
  `;
  document.head.appendChild(style);
}

// ─── SVG mask approach: fullscreen SVG with a rect cut-out ───────────────────
// This is the most reliable cross-browser approach for spotlight masking.
// We render a fullscreen SVG with a <mask> that has a white rect (the "hole")
// over a black background. The mask is applied to a rect covering the viewport.

export default function OverlayGuide({
  targetSelector,
  rect: manualRect,
  padding = 20,
  borderRadius = 18,
  branding = "7dotitsolutions",
  disableOutsideClicks = true,
  lockAllInteractions = false,
  dismissible = false,
  escapeKeyDismissible = false,
  onDismiss,
  instruction,
  visible = true,
  overlayOpacity = 0.82,
  overlayBlur = 3,
}: OverlayGuideProps) {
  // ── Inject animation keyframes once ────────────────────────────────────────
  useEffect(() => { injectKeyframes(); }, []);

  // ── Mount/unmount animation state ──────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const [animOut, setAnimOut] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setAnimOut(false);
      // Small delay ensures CSS transition kicks in after mount
      const t = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(t);
    } else {
      // Animate out then unmount
      setAnimOut(true);
      dismissTimerRef.current = setTimeout(() => setMounted(false), 380);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
  }, [visible]);

  // ── Spotlight rect via hook ─────────────────────────────────────────────────
  const { rect, found } = useSpotlightRect({
    targetSelector,
    manualRect,
    padding,
    enabled: visible,
  });

  // ── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !escapeKeyDismissible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, escapeKeyDismissible, onDismiss]);

  // ── Body scroll lock when overlay is active ────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  // ── Click handler for outside region ───────────────────────────────────────
  const handleOutsideClick = useCallback((e: React.MouseEvent) => {
    if (lockAllInteractions) { e.stopPropagation(); e.preventDefault(); return; }
    if (!disableOutsideClicks) return;
    e.stopPropagation();
    e.preventDefault();
  }, [disableOutsideClicks, lockAllInteractions]);

  // ── Click handler for spotlight region ─────────────────────────────────────
  const handleSpotlightClick = useCallback((e: React.MouseEvent) => {
    if (lockAllInteractions) { e.stopPropagation(); e.preventDefault(); return; }
    if (dismissible) { onDismiss?.(); return; }
    // Allow clicks to pass through to underlying element
    e.stopPropagation();
  }, [lockAllInteractions, dismissible, onDismiss]);

  if (!visible && !mounted) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Compute instruction panel position
  // ─────────────────────────────────────────────────────────────────────────
  const tooltipPos = instruction?.tooltipPosition ?? "bottom";
  const TOOLTIP_GAP = 18;

  const tooltipStyle = computeTooltipStyle(rect, tooltipPos, TOOLTIP_GAP);

  // ─────────────────────────────────────────────────────────────────────────
  // Render via portal into document.body
  // ─────────────────────────────────────────────────────────────────────────
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const overlayContent = (
    <div
      style={{
        ...styles.root,
        opacity: animOut ? 0 : mounted ? 1 : 0,
        transition: `opacity 350ms cubic-bezier(0.16,1,0.3,1)`,
      }}
      aria-modal="true"
      role="dialog"
      aria-label={instruction?.title ?? "Guide overlay"}
    >
      {/* ── Layer 1: Full-screen click blocker (behind spotlight) ── */}
      {/* This layer sits above the app but captures all outside clicks */}
      <div
        style={styles.clickBlocker}
        onMouseDown={handleOutsideClick}
        onClick={handleOutsideClick}
        onPointerDown={handleOutsideClick}
      />

      {/* ── Layer 2: SVG spotlight mask ────────────────────────────── */}
      <svg
        style={{
          ...styles.svgMask,
          backdropFilter: `blur(${overlayBlur}px)`,
          WebkitBackdropFilter: `blur(${overlayBlur}px)`,
        } as CSSProperties}
        viewBox={`0 0 ${vw} ${vh}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <mask id="og-spotlight-mask">
            {/* Black = masked (visible overlay), white = hole (spotlight) */}
            <rect width={vw} height={vh} fill="white" />
            <rect
              x={Math.max(0, rect.left)}
              y={Math.max(0, rect.top)}
              width={Math.min(rect.width, vw - Math.max(0, rect.left))}
              height={Math.min(rect.height, vh - Math.max(0, rect.top))}
              rx={borderRadius}
              ry={borderRadius}
              fill="black"
            />
          </mask>
          {/* Radial gradient for soft vignette */}
          <radialGradient id="og-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor={`rgba(5,6,13,${overlayOpacity * 0.85})`} />
            <stop offset="100%" stopColor={`rgba(5,6,13,${Math.min(overlayOpacity + 0.1, 1)})`} />
          </radialGradient>
        </defs>

        {/* Main dark overlay rect with mask applied */}
        <rect
          width={vw}
          height={vh}
          fill="url(#og-vignette)"
          mask="url(#og-spotlight-mask)"
        />
      </svg>

      {/* ── Layer 3: Spotlight border / glow ring (pointer-events: none) ── */}
      <SpotlightGlow rect={rect} borderRadius={borderRadius} animOut={animOut} mounted={mounted} />

      {/* ── Layer 4: Spotlight interaction zone ────────────────────── */}
      {/* This sits exactly over the spotlight and either passes through or blocks */}
      <div
        style={{
          ...styles.spotlightZone,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius,
          pointerEvents: lockAllInteractions ? "auto" : "none",
          cursor: lockAllInteractions ? "not-allowed" : "auto",
        }}
        onClick={lockAllInteractions ? handleSpotlightClick : undefined}
        onMouseDown={lockAllInteractions ? handleSpotlightClick : undefined}
      />

      {/* ── Layer 5: Branding ───────────────────────────────────────── */}
      <BrandingBadge
        branding={branding}
        rect={rect}
        animOut={animOut}
        mounted={mounted}
        found={found}
      />

      {/* ── Layer 6: Instruction panel ──────────────────────────────── */}
      {instruction && (
        <InstructionPanel
          instruction={instruction}
          tooltipStyle={tooltipStyle}
          animOut={animOut}
          mounted={mounted}
          tooltipPos={tooltipPos}
          onDismiss={dismissible ? onDismiss : undefined}
        />
      )}
    </div>
  );

  return ReactDOM.createPortal(overlayContent, document.body);
}

// ─── SpotlightGlow ────────────────────────────────────────────────────────────
function SpotlightGlow({
  rect,
  borderRadius,
  animOut,
  mounted,
}: {
  rect: SpotlightRect;
  borderRadius: number;
  animOut: boolean;
  mounted: boolean;
}) {
  return (
    <>
      {/* Outer glow ring */}
      <div
        style={{
          position: "fixed",
          top: rect.top - 2,
          left: rect.left - 2,
          width: rect.width + 4,
          height: rect.height + 4,
          borderRadius: borderRadius + 2,
          border: "1.5px solid rgba(124,108,248,0.55)",
          boxShadow: [
            "0 0 0 1px rgba(124,108,248,0.15)",
            "0 0 20px 4px rgba(124,108,248,0.3)",
            "0 0 60px 8px rgba(124,108,248,0.12)",
            "inset 0 0 20px rgba(124,108,248,0.05)",
          ].join(", "),
          pointerEvents: "none",
          zIndex: 10001,
          opacity: animOut ? 0 : mounted ? 1 : 0,
          transition: "opacity 400ms ease, top 300ms cubic-bezier(0.16,1,0.3,1), left 300ms cubic-bezier(0.16,1,0.3,1), width 300ms cubic-bezier(0.16,1,0.3,1), height 300ms cubic-bezier(0.16,1,0.3,1)",
          animation: mounted && !animOut ? "og-glowPulse 3s ease-in-out infinite" : "none",
        }}
      />
      {/* Corner accent dots */}
      {[
        { top: rect.top - 4, left: rect.left - 4 },
        { top: rect.top - 4, left: rect.left + rect.width - 4 },
        { top: rect.top + rect.height - 4, left: rect.left - 4 },
        { top: rect.top + rect.height - 4, left: rect.left + rect.width - 4 },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            ...pos,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(165,168,255,0.9) 0%, rgba(124,108,248,0.4) 100%)",
            boxShadow: "0 0 8px rgba(124,108,248,0.8)",
            pointerEvents: "none",
            zIndex: 10002,
            opacity: animOut ? 0 : mounted ? 1 : 0,
            transition: `opacity 400ms ease ${i * 60}ms, top 300ms cubic-bezier(0.16,1,0.3,1), left 300ms cubic-bezier(0.16,1,0.3,1)`,
          }}
        />
      ))}
    </>
  );
}

// ─── BrandingBadge ────────────────────────────────────────────────────────────
function BrandingBadge({
  branding,
  rect,
  animOut,
  mounted,
  found,
}: {
  branding: string;
  rect: SpotlightRect;
  animOut: boolean;
  mounted: boolean;
  found: boolean;
}) {
  const topBrand = rect.top > 80;
  const brandTop = topBrand ? rect.top - 56 : rect.top + rect.height + 16;

  return (
    <div
      style={{
        position: "fixed",
        top: brandTop,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        zIndex: 10003,
        opacity: animOut ? 0 : mounted ? 1 : 0,
        transition: "opacity 500ms ease 100ms, top 300ms cubic-bezier(0.16,1,0.3,1), left 300ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Logo mark */}
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        background: "linear-gradient(135deg, rgba(124,108,248,0.25), rgba(124,108,248,0.08))",
        border: "1px solid rgba(124,108,248,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 12px rgba(124,108,248,0.3)",
        flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5 4.5-1.35 8-6.25 8-11.5V6L12 2z"
            fill="rgba(124,108,248,0.3)" stroke="rgba(165,168,255,0.85)" strokeWidth="2" />
        </svg>
      </div>

      {/* Brand text */}
      <span style={{
        color: "rgba(165,168,255,0.7)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 4,
        textTransform: "uppercase",
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
        animation: mounted && !animOut ? "og-brandPulse 4s ease-in-out infinite" : "none",
        textShadow: "0 0 12px rgba(124,108,248,0.5)",
      }}>
        {branding}
      </span>

      {/* Status indicator */}
      {!found && (
        <span style={{
          fontSize: 8,
          color: "rgba(245,158,11,0.6)",
          fontFamily: "'JetBrains Mono', monospace",
          marginLeft: 4,
        }}>
          [est]
        </span>
      )}
    </div>
  );
}

// ─── InstructionPanel ─────────────────────────────────────────────────────────
function InstructionPanel({
  instruction,
  tooltipStyle,
  animOut,
  mounted,
  tooltipPos,
  onDismiss,
}: {
  instruction: NonNullable<OverlayGuideProps["instruction"]>;
  tooltipStyle: CSSProperties;
  animOut: boolean;
  mounted: boolean;
  tooltipPos: string;
  onDismiss?: () => void;
}) {
  const animName = tooltipPos === "top" ? "og-slideDown" : "og-slideUp";

  return (
    <div
      style={{
        ...tooltipStyle,
        ...styles.instructionPanel,
        opacity: animOut ? 0 : mounted ? 1 : 0,
        animation: mounted && !animOut ? `${animName} 0.45s cubic-bezier(0.16,1,0.3,1) 0.15s both` : "none",
        transition: "opacity 350ms ease, top 300ms cubic-bezier(0.16,1,0.3,1), left 300ms cubic-bezier(0.16,1,0.3,1), bottom 300ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Step label */}
      {instruction.stepLabel && (
        <div style={styles.stepLabel}>
          <span style={styles.stepDot} />
          {instruction.stepLabel}
        </div>
      )}

      {/* Title */}
      {instruction.title && (
        <div style={styles.instructionTitle}>
          {instruction.title}
        </div>
      )}

      {/* Description */}
      {instruction.description && (
        <div style={styles.instructionDesc}>
          {instruction.description}
        </div>
      )}

      {/* Footer hint */}
      {instruction.footerHint && (
        <div style={styles.footerHint}>
          <div style={styles.footerHintDot} />
          {instruction.footerHint}
        </div>
      )}

      {/* Dismiss button if dismissible */}
      {onDismiss && (
        <button style={styles.dismissBtn} onClick={onDismiss}>
          Got it
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Tooltip arrow */}
      <TooltipArrow position={tooltipPos as "top" | "bottom" | "left" | "right"} />
    </div>
  );
}

// ─── Tooltip Arrow ────────────────────────────────────────────────────────────
function TooltipArrow({ position }: { position: "top" | "bottom" | "left" | "right" }) {
  const arrowBase: CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
    pointerEvents: "none",
  };

  if (position === "bottom") {
    return (
      <div style={{
        ...arrowBase,
        top: -7,
        left: "50%",
        transform: "translateX(-50%)",
        borderLeft: "7px solid transparent",
        borderRight: "7px solid transparent",
        borderBottom: "7px solid rgba(124,108,248,0.25)",
      }} />
    );
  }
  if (position === "top") {
    return (
      <div style={{
        ...arrowBase,
        bottom: -7,
        left: "50%",
        transform: "translateX(-50%)",
        borderLeft: "7px solid transparent",
        borderRight: "7px solid transparent",
        borderTop: "7px solid rgba(124,108,248,0.25)",
      }} />
    );
  }
  if (position === "right") {
    return (
      <div style={{
        ...arrowBase,
        left: -7,
        top: "50%",
        transform: "translateY(-50%)",
        borderTop: "7px solid transparent",
        borderBottom: "7px solid transparent",
        borderRight: "7px solid rgba(124,108,248,0.25)",
      }} />
    );
  }
  // left
  return (
    <div style={{
      ...arrowBase,
      right: -7,
      top: "50%",
      transform: "translateY(-50%)",
      borderTop: "7px solid transparent",
      borderBottom: "7px solid transparent",
      borderLeft: "7px solid rgba(124,108,248,0.25)",
    }} />
  );
}

// ─── Tooltip positioning helper ───────────────────────────────────────────────
function computeTooltipStyle(
  rect: SpotlightRect,
  position: string,
  gap: number
): CSSProperties {
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 10004,
    maxWidth: 340,
    minWidth: 260,
    pointerEvents: "auto",
  };

  switch (position) {
    case "top":
      return {
        ...base,
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      };
    case "left":
      return {
        ...base,
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left + gap,
        transform: "translateY(-50%)",
      };
    case "right":
      return {
        ...base,
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + gap,
        transform: "translateY(-50%)",
      };
    default: // bottom
      return {
        ...base,
        top: rect.top + rect.height + gap,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    pointerEvents: "none", // Root is non-interactive; children opt in
    isolation: "isolate",
  },
  clickBlocker: {
    // Covers full viewport, blocks ALL outside clicks
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    pointerEvents: "auto",
    cursor: "not-allowed",
    background: "transparent",
  },
  svgMask: {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 10000,
    pointerEvents: "none", // SVG itself doesn't capture events — clickBlocker handles it
  },
  spotlightZone: {
    position: "fixed",
    zIndex: 10001,
    background: "transparent",
  },
  instructionPanel: {
    background: "rgba(13,16,34,0.92)",
    backdropFilter: "blur(20px) saturate(1.5)",
    WebkitBackdropFilter: "blur(20px) saturate(1.5)",
    border: "1px solid rgba(124,108,248,0.22)",
    borderRadius: 14,
    padding: "18px 20px",
    boxShadow: [
      "0 8px 40px rgba(0,0,0,0.6)",
      "0 0 0 1px rgba(124,108,248,0.08)",
      "inset 0 1px 0 rgba(255,255,255,0.05)",
    ].join(", "),
  },
  stepLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "rgba(124,108,248,0.8)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace",
    marginBottom: 8,
  },
  stepDot: {
    display: "inline-block",
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "rgba(124,108,248,0.8)",
    boxShadow: "0 0 6px rgba(124,108,248,0.6)",
    flexShrink: 0,
  },
  instructionTitle: {
    color: "#eef0f8",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: -0.3,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  instructionDesc: {
    color: "#8892b0",
    fontSize: 13,
    lineHeight: 1.7,
    marginBottom: 4,
  },
  footerHint: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    color: "#4a526e",
    fontSize: 11,
    fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    paddingTop: 10,
  },
  footerHintDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: "rgba(16,185,129,0.6)",
    boxShadow: "0 0 5px rgba(16,185,129,0.4)",
    flexShrink: 0,
  },
  dismissBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    marginTop: 14,
    width: "100%",
    background: "linear-gradient(135deg, rgba(124,108,248,0.18), rgba(124,108,248,0.08))",
    border: "1px solid rgba(124,108,248,0.3)",
    borderRadius: 9,
    color: "rgba(165,168,255,0.9)",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 0",
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  },
};