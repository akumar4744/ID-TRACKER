// File: src/hooks/useScreenShare.ts

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  subscribeToSession,
  sendSignal,
  persistOffer,
  persistIceCandidate,
  cleanupSignaling,
} from "../lib/signaling";

export type ShareStatus =
  | "idle"
  | "requesting"
  | "active"
  | "wrong_target"
  | "denied"
  | "stopped"
  | "error";

export interface ScreenShareState {
  status:       ShareStatus;
  sessionId:    string | null;
  errorMessage: string | null;
  stream:       MediaStream | null;
}

export interface UseScreenShareReturn extends ScreenShareState {
  startSharing: () => Promise<void>;
  stopSharing:  (reason?: string) => Promise<void>;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ── Module-level persistent session ───────────────────────────────────────────
// Survives React component unmount/remount (e.g. caused by token refresh).
interface PersistentSession {
  stream:    MediaStream;
  sessionId: string;
  pc:        RTCPeerConnection | null;
  unsub:     (() => void) | null;
}

let _persistentSession: PersistentSession | null = null;

function getActivePersistentSession(): PersistentSession | null {
  if (!_persistentSession) return null;
  const tracks = _persistentSession.stream.getVideoTracks();
  if (!tracks.length || tracks[0].readyState !== "live") {
    // Track ended externally — wipe it
    _persistentSession = null;
    return null;
  }
  return _persistentSession;
}

// ── Safe RPC helper: supabase.rpc() is a thenable, not a real Promise.
// Wrapping in Promise.resolve() gives us a real Promise with .catch() support.
async function safeRpc(
  fn: () => ReturnType<typeof supabase.rpc>
): Promise<{ data: unknown; error: unknown }> {
  try {
    const result = await Promise.resolve(fn());
    return result as { data: unknown; error: unknown };
  } catch {
    return { data: null, error: null };
  }
}

export function useScreenShare(_employeeId: string): UseScreenShareReturn {
  // ── Initialise from any live persistent session ────────────────────────────
  const existingSession = getActivePersistentSession();

  const [state, setState] = useState<ScreenShareState>(() => {
    if (existingSession) {
      return {
        status:       "active",
        sessionId:    existingSession.sessionId,
        errorMessage: null,
        stream:       existingSession.stream,
      };
    }
    return { status: "idle", sessionId: null, errorMessage: null, stream: null };
  });

  const streamRef     = useRef<MediaStream | null>(existingSession?.stream ?? null);
  const sessionIdRef  = useRef<string | null>(existingSession?.sessionId ?? null);
  const peerConnRef   = useRef<RTCPeerConnection | null>(existingSession?.pc ?? null);
  const unsubRef      = useRef<(() => void) | null>(existingSession?.unsub ?? null);
  const isStartingRef = useRef(false);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (reason = "stopped") => {
    // Clear global persistent session on explicit stop
    _persistentSession = null;

    const sid = sessionIdRef.current;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (peerConnRef.current) {
      peerConnRef.current.close();
      peerConnRef.current = null;
    }
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (sid) {
      cleanupSignaling(sid);
      sessionIdRef.current = null;

      await safeRpc(() =>
        supabase.rpc("end_screen_session", {
          p_session_id: sid,
          p_reason:     reason,
        })
      );

      await safeRpc(() =>
        supabase.rpc("log_share_event", {
          p_session_id: sid,
          p_event:      "share_stopped",
          p_detail:     reason,
        })
      );
    }
  }, []);

  // ── Display type detection ─────────────────────────────────────────────────
  function getDisplayType(
    stream: MediaStream
  ): "monitor" | "window" | "browser" | "unknown" {
    const track = stream.getVideoTracks()[0];
    if (!track) return "unknown";
    const settings = track.getSettings() as MediaTrackSettings & {
      displaySurface?: string;
    };
    if (settings.displaySurface === "monitor") return "monitor";
    if (settings.displaySurface === "window")  return "window";
    if (settings.displaySurface === "browser") return "browser";
    return "unknown";
  }

  // ── WebRTC peer connection ─────────────────────────────────────────────────
  async function buildPeerConnection(stream: MediaStream, sessionId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnRef.current = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        try {
          await Promise.resolve(
            persistIceCandidate(sessionId, "employee", candidate.toJSON())
          );
        } catch {}
        try {
          await sendSignal(
            sessionId, "employee", "ice-candidate", candidate.toJSON()
          );
        } catch {}
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        ["disconnected", "failed", "closed"].includes(pc.connectionState)
      ) {
        console.info("WebRTC peer disconnected:", pc.connectionState);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await Promise.resolve(persistOffer(sessionId, offer));
    await sendSignal(sessionId, "employee", "offer", offer);
    return pc;
  }

  // ── startSharing ───────────────────────────────────────────────────────────
  const startSharing = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    // Always clean up any lingering previous session first
    try { await cleanup("restarted"); } catch {}

    setState({
      status: "requesting", sessionId: null, errorMessage: null, stream: null,
    });

    try {
      // 1. Get display media
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } } as MediaTrackConstraints,
          audio: false,
        });
      } catch {
        setState({
          status: "denied",
          sessionId: null,
          errorMessage:
            "Screen share permission denied. You must share your screen to access work.",
          stream: null,
        });
        return;
      }

      // 2. Validate display type
      const displayType = getDisplayType(stream);
      if (displayType === "window" || displayType === "browser") {
        stream.getTracks().forEach((t) => t.stop());
        setState({
          status: "wrong_target",
          sessionId: null,
          errorMessage:
            displayType === "browser"
              ? "You shared a browser tab. Please share your entire screen instead."
              : "You shared a single window. Please share your entire screen instead.",
          stream: null,
        });
        return;
      }

      streamRef.current = stream;

      // 3. Register session in DB — use Promise.resolve() so .then/.catch work
      const { data, error } = await Promise.resolve(
        supabase.rpc("upsert_screen_session", {
          p_display_type: displayType,
        })
      );

      if (error || !(data as any)?.ok) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState({
          status: "error",
          sessionId: null,
          errorMessage:
            (error as any)?.message ??
            (data as any)?.error ??
            "Failed to register screen session.",
          stream: null,
        });
        return;
      }

      const sessionId: string = (data as any).session_id;
      sessionIdRef.current = sessionId;

      // Fire-and-forget log — wrapped safely
      await safeRpc(() =>
        supabase.rpc("log_share_event", {
          p_session_id: sessionId,
          p_event:      "share_started",
          p_detail:     displayType,
        })
      );

      // 4. Build WebRTC (non-fatal if it fails)
      let pc: RTCPeerConnection | null = null;
      let unsub: (() => void) | null = null;
      try {
        pc = await buildPeerConnection(stream, sessionId);

        unsub = subscribeToSession(
          sessionId,
          "employee",
          async (msg) => {
            if (msg.type === "answer" && peerConnRef.current) {
              try {
                await peerConnRef.current.setRemoteDescription(
                  new RTCSessionDescription(
                    msg.payload as RTCSessionDescriptionInit
                  )
                );
              } catch (e) {
                console.error("setRemoteDescription failed:", e);
              }
            }
            if (msg.type === "ice-candidate" && peerConnRef.current) {
              try {
                await peerConnRef.current.addIceCandidate(
                  new RTCIceCandidate(msg.payload as RTCIceCandidateInit)
                );
              } catch {}
            }
          }
        );

        unsubRef.current = unsub;
        peerConnRef.current = pc;
      } catch (rtcErr) {
        console.error("WebRTC setup error (non-fatal):", rtcErr);
      }

      // 5. Save to module-level persistent session so it survives unmount
      _persistentSession = { stream, sessionId, pc, unsub };

      // 6. Native "Stop sharing" button handler — clears persistent session too
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", async () => {
          _persistentSession = null;
          await cleanup("track_ended");
          setState({
            status: "stopped",
            sessionId: null,
            errorMessage:
              "Screen sharing was stopped. Reshare your screen to continue working.",
            stream: null,
          });
        });
      }

      // 7. All good
      setState({ status: "active", sessionId, errorMessage: null, stream });

    } catch (unexpectedErr) {
      console.error("Unexpected error in startSharing:", unexpectedErr);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try { await cleanup("error"); } catch {}
      setState({
        status: "error",
        sessionId: null,
        errorMessage: "An unexpected error occurred. Please try again.",
        stream: null,
      });
    } finally {
      isStartingRef.current = false;
    }
  }, [cleanup]);

  // ── stopSharing ────────────────────────────────────────────────────────────
  const stopSharing = useCallback(
    async (reason = "manual_stop") => {
      await cleanup(reason);
      setState({
        status: "stopped", sessionId: null, errorMessage: null, stream: null,
      });
    },
    [cleanup]
  );

  // ── Cleanup on unmount — save to persistent session if still live ──────────
  useEffect(() => {
    return () => {
      const stream    = streamRef.current;
      const sessionId = sessionIdRef.current;

      if (stream && sessionId) {
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0 && tracks[0].readyState === "live") {
          // Stream still running — park it in the module-level session instead
          // of stopping it. The next mount will pick it up via getActivePersistentSession().
          _persistentSession = {
            stream,
            sessionId,
            pc:    peerConnRef.current,
            unsub: unsubRef.current,
          };
          // Detach refs so cleanup() won't stop the stream if called later
          streamRef.current    = null;
          sessionIdRef.current = null;
          peerConnRef.current  = null;
          unsubRef.current     = null;
          return; // Do NOT call cleanup
        }
      }

      // Stream already dead — run normal cleanup
      cleanup("component_unmounted").catch(console.error);
    };
  }, [cleanup]);

  return { ...state, startSharing, stopSharing };
}
