// File: src/hooks/useAdminViewer.ts
// Admin-side WebRTC viewer. Isolated from UI.
// All authorization done via server-side RPCs, not client state.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  subscribeToSession,
  sendSignal,
  persistAnswer,
  persistIceCandidate,
  cleanupSignaling,
} from "../lib/signaling";

export type ViewerStatus =
  | "idle"           // not connected
  | "connecting"     // setting up WebRTC
  | "connected"      // stream received and playing
  | "disconnected"   // employee stopped or errored
  | "unauthorized"   // RPC rejected
  | "error";

export interface AdminViewerState {
  status:      ViewerStatus;
  sessionId:   string | null;
  employeeId:  string | null;
  startedAt:   string | null;
  displayType: string | null;
  errorMsg:    string | null;
  stream:      MediaStream | null;
}

export interface UseAdminViewerReturn extends AdminViewerState {
  connectToSession:    (sessionId: string) => Promise<void>;
  disconnectFromSession: () => Promise<void>;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useAdminViewer(): UseAdminViewerReturn {
  const [state, setState] = useState<AdminViewerState>({
    status: "idle", sessionId: null, employeeId: null,
    startedAt: null, displayType: null, errorMsg: null, stream: null,
  });

  const peerConnRef    = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef   = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const sessionWatchRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Internal cleanup ───────────────────────────────────────────────────────
  const cleanupViewer = useCallback(async (callRpc = true) => {
    if (peerConnRef.current) {
      peerConnRef.current.close();
      peerConnRef.current = null;
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (sessionWatchRef.current) {
      supabase.removeChannel(sessionWatchRef.current);
      sessionWatchRef.current = null;
    }

    const sid = sessionIdRef.current;
    if (sid) {
      cleanupSignaling(sid);
      if (callRpc) {
        await supabase.rpc("admin_stop_viewing", { p_session_id: sid });
      }
      sessionIdRef.current = null;
    }
  }, []);

  // ── Watch session row for employee stop/revocation ─────────────────────────
  function watchSessionRow(sessionId: string) {
    if (sessionWatchRef.current) {
      supabase.removeChannel(sessionWatchRef.current);
    }

    const ch = supabase
      .channel(`admin-watch-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "screen_share_sessions",
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          const updated = payload.new as { status: string };
          if (updated.status !== "active") {
            // Employee stopped sharing or was revoked
            await cleanupViewer(false); // RPC not needed — session already ended
            setState((prev) => ({
              ...prev,
              status:  "disconnected",
              stream:  null,
              errorMsg: "Employee stopped screen sharing.",
            }));
          }
        }
      )
      .subscribe();

    sessionWatchRef.current = ch;
  }

  // ── connectToSession ──────────────────────────────────────────────────────
  const connectToSession = useCallback(async (sessionId: string) => {
    // Disconnect from any existing session first
    await cleanupViewer(true);

    setState({
      status: "connecting", sessionId, employeeId: null,
      startedAt: null, displayType: null, errorMsg: null, stream: null,
    });

    // ── Server-side authorization: RPC verifies admin role + session active ──
    const { data, error } = await supabase.rpc("admin_start_viewing", {
      p_session_id: sessionId,
    });

    if (error || !data?.ok) {
      setState({
        status: "unauthorized", sessionId: null, employeeId: null,
        startedAt: null, displayType: null,
        errorMsg: error?.message ?? data?.error ?? "Unauthorized",
        stream: null,
      });
      return;
    }

    const {
      employee_id:  employeeId,
      webrtc_offer: offerJson,
      display_type: displayType,
      started_at:   startedAt,
    } = data as {
      employee_id:  string;
      webrtc_offer: string | null;
      display_type: string | null;
      started_at:   string | null;
    };

    sessionIdRef.current = sessionId;

    // Watch session row for employee stopping
    watchSessionRow(sessionId);

    // ── Build WebRTC peer connection (receiver side) ───────────────────────
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnRef.current = pc;

    // Collect incoming tracks from employee
    const remoteStream = new MediaStream();

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
      setState((prev) => ({
        ...prev,
        status: "connected",
        stream: remoteStream,
      }));
    };

    pc.onicecandidate = async ({ candidate }) => {
      if (candidate && sessionIdRef.current) {
        await persistIceCandidate(sessionId, "admin", candidate.toJSON());
        await sendSignal(sessionId, "admin", "ice-candidate", candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = async () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        await cleanupViewer(true);
        setState((prev) => ({
          ...prev,
          status:  "disconnected",
          stream:  null,
          errorMsg: "WebRTC connection lost. Employee may have stopped sharing.",
        }));
      }
    };

    // Subscribe to signaling BEFORE processing offer
    const unsub = subscribeToSession(sessionId, "admin", async (msg) => {
      if (msg.type === "ice-candidate" && peerConnRef.current) {
        try {
          await peerConnRef.current.addIceCandidate(
            new RTCIceCandidate(msg.payload as RTCIceCandidateInit)
          );
        } catch { /* stale ICE — ignore */ }
      }
      if (msg.type === "end") {
        await cleanupViewer(false);
        setState((prev) => ({
          ...prev,
          status:  "disconnected",
          stream:  null,
          errorMsg: "Employee ended screen sharing.",
        }));
      }
    });
    unsubscribeRef.current = unsub;

    // Process the SDP offer (may be persisted in DB or arrive via signaling)
    if (offerJson) {
      try {
        const offer = JSON.parse(offerJson) as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await persistAnswer(sessionId, answer);
        await sendSignal(sessionId, "admin", "answer", answer);

        // Apply any already-persisted ICE candidates from employee
        const { data: iceCandidates } = await supabase
          .from("screen_share_ice")
          .select("candidate")
          .eq("session_id", sessionId)
          .eq("from_role", "employee");

        for (const row of (iceCandidates ?? []) as { candidate: RTCIceCandidateInit }[]) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(row.candidate));
          } catch { /* ignore */ }
        }
      } catch (rtcErr) {
        console.error("WebRTC answer error:", rtcErr);
        setState((prev) => ({
          ...prev,
          status:  "error",
          errorMsg: "Failed to establish WebRTC connection. Employee may need to reshare.",
        }));
        return;
      }
    }
    // If no offer yet: wait for it via signaling (employee may be mid-share-start)

    setState((prev) => ({
      ...prev,
      employeeId,
      startedAt,
      displayType,
      // Status stays 'connecting' until ontrack fires
    }));
  }, [cleanupViewer]);

  // ── disconnectFromSession ─────────────────────────────────────────────────
  const disconnectFromSession = useCallback(async () => {
    await cleanupViewer(true);
    setState({
      status: "idle", sessionId: null, employeeId: null,
      startedAt: null, displayType: null, errorMsg: null, stream: null,
    });
  }, [cleanupViewer]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { cleanupViewer(true).catch(console.error); };
  }, [cleanupViewer]);

  return { ...state, connectToSession, disconnectFromSession };
}