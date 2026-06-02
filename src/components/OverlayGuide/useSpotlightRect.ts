// src/components/OverlayGuide/useSpotlightRect.ts

import { useState, useEffect, useCallback, useRef } from "react";
import type { SpotlightRect } from "./types";
import { DEFAULT_SPOTLIGHT_RECT } from "./types";

interface UseSpotlightRectOptions {
  targetSelector?: string;
  manualRect?: SpotlightRect;
  padding?: number;
  enabled?: boolean;
}

interface SpotlightRectResult {
  rect: SpotlightRect;
  found: boolean;
}

export function useSpotlightRect({
  targetSelector,
  manualRect,
  padding = 0,
  enabled = true,
}: UseSpotlightRectOptions): SpotlightRectResult {
  const [result, setResult] = useState<SpotlightRectResult>(() => {
    const base = manualRect ?? DEFAULT_SPOTLIGHT_RECT;
    return {
      rect: applyPadding(base, padding),
      found: false,
    };
  });

  const rafRef = useRef<number | null>(null);
  const lastRectRef = useRef<SpotlightRect | null>(null);

  const measure = useCallback(() => {
    if (!enabled) return;

    let raw: SpotlightRect | null = null;
    let found = false;

    if (targetSelector) {
      try {
        const el = document.querySelector(targetSelector);
        if (el) {
          const domRect = el.getBoundingClientRect();
          raw = {
            top: domRect.top,
            left: domRect.left,
            width: domRect.width,
            height: domRect.height,
          };
          found = true;
        }
      } catch {
        // Invalid selector — fall through to manual/default
      }
    }

    if (!raw) {
      raw = manualRect ?? {
        top: (window.innerHeight - 490) / 2,
        left: (window.innerWidth - 420) / 2,
        width: 420,
        height: 490,
      };
      found = false;
    }

    const padded = applyPadding(raw, padding);

    // Only update state if rect actually changed (avoids render loops)
    const last = lastRectRef.current;
    if (
      !last ||
      last.top !== padded.top ||
      last.left !== padded.left ||
      last.width !== padded.width ||
      last.height !== padded.height
    ) {
      lastRectRef.current = padded;
      setResult({ rect: padded, found });
    }
  }, [targetSelector, manualRect, padding, enabled]);

  // Measure on mount and when deps change
  useEffect(() => {
    if (!enabled) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Initial measure — use rAF to ensure DOM is painted
    rafRef.current = requestAnimationFrame(() => {
      measure();

      // If a targetSelector is specified but not found yet (element might
      // still be mounting), retry once after 200 ms then again at 600 ms.
      if (targetSelector && !document.querySelector(targetSelector)) {
        retryTimer = setTimeout(() => {
          measure();
          if (targetSelector && !document.querySelector(targetSelector)) {
            retryTimer = setTimeout(measure, 400);
          }
        }, 200);
      }
    });

    // Observe resize
    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });

    // Observe the target element for size changes
    if (targetSelector) {
      const el = document.querySelector(targetSelector);
      if (el) resizeObserver.observe(el);
    }

    // Also observe document body for layout changes
    resizeObserver.observe(document.body);

    // Window resize
    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    // Scroll
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (retryTimer) clearTimeout(retryTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [measure, targetSelector, enabled]);

  return result;
}

function applyPadding(rect: SpotlightRect, padding: number): SpotlightRect {
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}