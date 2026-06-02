// File: src/hooks/useValidation.ts
//
// Unified IP + fingerprint validation hook.
//
// Key behaviours:
//  - All cooldown checks use backend truth — no client-clock-only logic.
//  - 48-hour cooldown starts only after successful OK/save confirmation.
//  - known_fingerprint surfaces in ALL non-idle states (valid, blocked, mismatch)
//    so the fingerprint field can auto-fill even during the 48h cooldown period.
//  - Stale-call guard via callIdRef; no race conditions between debounced calls.
//  - assignmentId guard; nil UUID allowed for admin context.
//  - used_at is returned for 'blocked' responses so UI can show last-used time.
//  - Shared between admin (AddressWorkCard) and employee (TaskCard).

import { useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationStatus =
  | "idle"
  | "checking"
  | "valid"
  | "blocked"
  | "mismatch"
  | "error";

export interface ValidationResult {
  status:               ValidationStatus;
  message:              string | null;
  remaining:            { hours: number; minutes: number; seconds: number } | null;
  cooldown_ends_at:     string | null;
  /** The fingerprint currently bound to this unique-id in the DB.
   *  Returned for valid, blocked, and mismatch states so the UI can auto-fill. */
  known_fingerprint:    string | null;
  /** Only set for 'mismatch' — the fingerprint the server expected. */
  expected_fingerprint: string | null;
  /** ISO timestamp of the last successful use; only set for 'blocked'. */
  used_at:              string | null;
}

export interface UseValidationReturn {
  result:   ValidationResult;
  /** Debounced check — call on every keystroke. */
  validate: (uniqueId: string, fingerprint: string, assignmentId: string) => void;
  /** Writes the record — call only when the user clicks OK/Save. */
  confirm:  (uniqueId: string, fingerprint: string, assignmentId: string) => Promise<boolean>;
  reset:    () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDLE: ValidationResult = {
  status:               "idle",
  message:              null,
  remaining:            null,
  cooldown_ends_at:     null,
  known_fingerprint:    null,
  expected_fingerprint: null,
  used_at:              null,
};

const DEBOUNCE_MS = 600;

/** Nil UUID sentinel used by admin-context callers (no assignment scoping). */
export const ADMIN_ASSIGNMENT_ID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRemaining(
  cooldownEndsAt: string
): { hours: number; minutes: number; seconds: number } | null {
  const end  = new Date(cooldownEndsAt).getTime();
  const now  = Date.now();
  const diff = end - now;
  if (diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  return {
    hours:   Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

/** Shape returned by the `validate_ip_fingerprint` RPC. */
interface RpcResponse {
  ok:                   boolean;
  status:               string;        // matches ValidationStatus
  message:              string | null;
  cooldown_ends_at:     string | null;
  known_fingerprint:    string | null;
  expected_fingerprint: string | null;
  used_at:              string | null;
}

/** Map a raw RPC response to a ValidationResult. */
function fromRpc(d: RpcResponse): ValidationResult {
  const remaining = d.cooldown_ends_at
    ? parseRemaining(d.cooldown_ends_at)
    : null;

  return {
    status:               d.status as ValidationStatus,
    message:              d.message              ?? null,
    remaining,
    cooldown_ends_at:     d.cooldown_ends_at     ?? null,
    // known_fingerprint is surfaced for ALL non-idle states, including
    // 'blocked', so the fingerprint field can auto-fill during the cooldown.
    known_fingerprint:    d.known_fingerprint    ?? null,
    expected_fingerprint: d.expected_fingerprint ?? null,
    used_at:              d.used_at              ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useValidation(): UseValidationReturn {
  const [result, setResult] = useState<ValidationResult>(IDLE);

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmingRef = useRef(false);
  // Incremented on every new validate() or reset() to discard stale responses.
  const callIdRef     = useRef(0);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    callIdRef.current += 1;
    setResult(IDLE);
  }, []);

  // ── validate (debounced, read-only) ───────────────────────────────────────
  const validate = useCallback(
    (uniqueId: string, fingerprint: string, assignmentId: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const uid = uniqueId.trim();
      const fp  = fingerprint.trim();

      // Clear state if the ID field is empty.
      if (!uid) {
        callIdRef.current += 1;
        setResult(IDLE);
        return;
      }

      // Guard: assignmentId must be a non-empty string.
      // Nil UUID is explicitly allowed for admin context.
      if (!assignmentId) {
        setResult({
          ...IDLE,
          status:  "error",
          message: "No assignment ID supplied — please refresh the page.",
        });
        return;
      }

      setResult((prev) => ({ ...prev, status: "checking", message: null }));

      const thisCallId = ++callIdRef.current;

      debounceRef.current = setTimeout(async () => {
        // Discard if a newer call has already been issued.
        if (thisCallId !== callIdRef.current) return;

        try {
          const { data, error } = await supabase.rpc("validate_ip_fingerprint", {
            p_unique_id:     uid,
            p_fingerprint:   fp || null,
            p_assignment_id: assignmentId,
            p_confirm:       false,
          });

          if (thisCallId !== callIdRef.current) return; // stale response

          if (error) {
            setResult({
              ...IDLE,
              status:  "error",
              message: error.message ?? "Validation failed.",
            });
            return;
          }

          setResult(fromRpc(data as RpcResponse));
        } catch (err: unknown) {
          if (thisCallId !== callIdRef.current) return;
          setResult({
            ...IDLE,
            status:  "error",
            message: err instanceof Error ? err.message : "Unexpected validation error.",
          });
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  // ── confirm (write — called only when user clicks OK/Save) ────────────────
  const confirm = useCallback(
    async (
      uniqueId:     string,
      fingerprint:  string,
      assignmentId: string
    ): Promise<boolean> => {
      // Prevent double-submission.
      if (confirmingRef.current) return false;
      confirmingRef.current = true;

      const uid = uniqueId.trim();
      const fp  = fingerprint.trim();

      if (!uid || !fp || !assignmentId) {
        confirmingRef.current = false;
        return false;
      }

      setResult((prev) => ({ ...prev, status: "checking", message: null }));

      try {
        const { data, error } = await supabase.rpc("validate_ip_fingerprint", {
          p_unique_id:     uid,
          p_fingerprint:   fp,
          p_assignment_id: assignmentId,
          p_confirm:       true,
        });

        if (error) {
          setResult({
            ...IDLE,
            status:  "error",
            message: error.message ?? "Confirmation failed.",
          });
          confirmingRef.current = false;
          return false;
        }

        const d = data as RpcResponse;
        setResult(fromRpc(d));

        confirmingRef.current = false;
        return d.ok === true && d.status === "valid";
      } catch (err: unknown) {
        setResult({
          ...IDLE,
          status:  "error",
          message: err instanceof Error ? err.message : "Unexpected error during confirmation.",
        });
        confirmingRef.current = false;
        return false;
      }
    },
    []
  );

  return { result, validate, confirm, reset };
}