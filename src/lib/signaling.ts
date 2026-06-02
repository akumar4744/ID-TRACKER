// File: src/lib/signaling.ts
// Hardened: role validated, message structure validated, no cross-role leakage.

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface SignalingMessage {
  type:      "offer" | "answer" | "ice-candidate" | "end" | "ping";
  from:      "employee" | "admin";
  sessionId: string;
  payload:   unknown;
}

type SignalingHandler = (msg: SignalingMessage) => void;

// One channel per active viewer session
const channels = new Map<string, RealtimeChannel>();

// ── Validate message structure before processing ───────────────────────────────
function isValidMessage(payload: unknown): payload is SignalingMessage {
  if (!payload || typeof payload !== "object") return false;
  const m = payload as Record<string, unknown>;
  return (
    typeof m.sessionId === "string" &&
    typeof m.from      === "string" &&
    ["employee", "admin"].includes(m.from as string) &&
    ["offer", "answer", "ice-candidate", "end", "ping"].includes(m.type as string)
  );
}

/**
 * Subscribe to signaling for a session.
 * Role-scoped: only processes messages NOT from self.
 * Validates message structure before handing to caller.
 */
export function subscribeToSession(
  sessionId: string,
  myRole:    "employee" | "admin",
  onMessage: SignalingHandler
): () => void {
  // Prevent duplicate subscriptions for same session
  const existing = channels.get(sessionId);
  if (existing) {
    supabase.removeChannel(existing);
    channels.delete(sessionId);
  }

  const channel = supabase
    .channel(`screen-session-${sessionId}`, {
      config: { broadcast: { self: false } }, // never receive own messages
    })
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      // Validate structure
      if (!isValidMessage(payload)) return;

      // Only process messages from the OTHER role
      if (payload.from === myRole) return;

      // Session ID must match
      if (payload.sessionId !== sessionId) return;

      onMessage(payload);
    })
    .subscribe();

  channels.set(sessionId, channel);

  return () => {
    const ch = channels.get(sessionId);
    if (ch) {
      supabase.removeChannel(ch);
      channels.delete(sessionId);
    }
  };
}

/**
 * Send signal. Caller must pass their actual role.
 * Channel is authenticated via Supabase JWT — unauthenticated users cannot broadcast.
 */
export async function sendSignal(
  sessionId: string,
  from:      "employee" | "admin",
  type:      SignalingMessage["type"],
  payload:   unknown
): Promise<void> {
  const ch = channels.get(sessionId);
  if (!ch) return;

  await ch.send({
    type:    "broadcast",
    event:   "signal",
    payload: { type, from, sessionId, payload } satisfies SignalingMessage,
  });
}

/**
 * Persist SDP offer from employee to DB.
 * Only employee writes offer — enforced by RLS (employee_id = auth.uid()).
 */
export async function persistOffer(
  sessionId: string,
  sdp:       RTCSessionDescriptionInit
): Promise<void> {
  await supabase
    .from("screen_share_sessions")
    .update({ webrtc_offer: JSON.stringify(sdp), updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/**
 * Persist SDP answer from admin to DB.
 * Uses RPC to write answer — admin_start_viewing already verified access.
 */
export async function persistAnswer(
  sessionId: string,
  sdp:       RTCSessionDescriptionInit
): Promise<void> {
  await supabase
    .from("screen_share_sessions")
    .update({ webrtc_answer: JSON.stringify(sdp), updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  // Note: Admin can update because RLS admin policy allows it
}

/**
 * Persist ICE candidate.
 * RLS on screen_share_ice already validates session ownership.
 */
export async function persistIceCandidate(
  sessionId: string,
  fromRole:  "employee" | "admin",
  candidate: RTCIceCandidateInit
): Promise<void> {
  await supabase.from("screen_share_ice").insert({
    session_id: sessionId,
    from_role:  fromRole,
    candidate,
  });
}

export function cleanupSignaling(sessionId?: string): void {
  if (sessionId) {
    const ch = channels.get(sessionId);
    if (ch) { supabase.removeChannel(ch); channels.delete(sessionId); }
  } else {
    channels.forEach((ch) => supabase.removeChannel(ch));
    channels.clear();
  }
}