// src/components/OverlayGuide/types.ts

export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface InstructionContent {
  title?: string;
  description?: string;
  stepLabel?: string;
  footerHint?: string;
  tooltipPosition?: "top" | "bottom" | "left" | "right";
}

export interface OverlayGuideProps {
  /** CSS selector to target an element (uses getBoundingClientRect) */
  targetSelector?: string;

  /** Manual rect override — used if no targetSelector or selector not found */
  rect?: SpotlightRect;

  /** Extra padding around the spotlight rect in px */
  padding?: number;

  /** Corner radius of the spotlight hole */
  borderRadius?: number;

  /** Branding text shown on the overlay */
  branding?: string;

  /** Block all clicks outside spotlight (default: true) */
  disableOutsideClicks?: boolean;

  /** Lock ALL interactions including inside spotlight */
  lockAllInteractions?: boolean;

  /** Allow dismissing overlay by clicking spotlight area */
  dismissible?: boolean;

  /** Allow Escape key to dismiss */
  escapeKeyDismissible?: boolean;

  /** Called when overlay is dismissed */
  onDismiss?: () => void;

  /** Instructional content near spotlight */
  instruction?: InstructionContent;

  /** Whether overlay is visible */
  visible?: boolean;

  /** Overlay background opacity 0–1 */
  overlayOpacity?: number;

  /** Overlay backdrop blur in px */
  overlayBlur?: number;
}

/**
 * Default screenshot-based spotlight estimate.
 * The login card in the app is centered, ~420px wide, ~490px tall.
 * Adjust these values via props.rect or targetSelector for live measurement.
 */
export const DEFAULT_SPOTLIGHT_RECT: SpotlightRect = {
  top: (window.innerHeight - 490) / 2,
  left: (window.innerWidth - 420) / 2,
  width: 420,
  height: 490,
};