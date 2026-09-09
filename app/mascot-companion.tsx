"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MascotState } from "@/lib/mascot";
import {
  mascotMediaForMotion,
  mascotMotionForMood,
  type MascotMotionClip,
} from "@/lib/mascot-motion";
import "./mascot-companion.css";

const Mascot3dViewer = dynamic(() => import("./mascot-3d-viewer"), {
  loading: () => null,
  ssr: false,
});

const MUTE_KEY = "portmanager:mascot:muted";
const HIDE_KEY = "portmanager:mascot:hidden-document";
const VIDEO_START_TIMEOUT_MS = 15_000;
const MUTED = 1;
const HIDDEN = 2;
let preferences = 0;
let storageLoaded = false;
const preferenceListeners = new Set<() => void>();

function notifyPreferences() {
  for (const listener of preferenceListeners) listener();
}

function readPreferences() {
  return preferences;
}

function serverPreferences() {
  // The same visible, unmuted preview is used for SSR and initial hydration.
  return 0;
}

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function serverReducedMotion() {
  // Keep SSR/hydration static until the browser preference is known.
  return true;
}

function subscribeHydration() {
  return () => {};
}

function clientHydrated() {
  return true;
}

function serverHydrated() {
  return false;
}

function subscribePreferences(listener: () => void) {
  preferenceListeners.add(listener);
  if (!storageLoaded) {
    storageLoaded = true;
    try {
      const muted = localStorage.getItem(MUTE_KEY) === "true";
      const hidden = localStorage.getItem(HIDE_KEY) === String(performance.timeOrigin);
      preferences = (muted ? MUTED : 0) | (hidden ? HIDDEN : 0);
    } catch {
      // Blocked browser storage still permits controls for this document.
    }
    notifyPreferences();
  }

  const syncMute = (event: StorageEvent) => {
    if (event.key !== MUTE_KEY && event.key !== null) return;
    preferences = (preferences & HIDDEN) | (event.newValue === "true" ? MUTED : 0);
    notifyPreferences();
  };
  window.addEventListener("storage", syncMute);
  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener("storage", syncMute);
  };
}

function setMuted(muted: boolean) {
  preferences = (preferences & HIDDEN) | (muted ? MUTED : 0);
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // Keep the in-memory preference when storage is unavailable or full.
  }
  notifyPreferences();
}

function hideGuide() {
  preferences |= HIDDEN;
  try {
    // timeOrigin identifies this document: route changes retain dismissal,
    // while a reload gets a new token and shows the guide again.
    localStorage.setItem(HIDE_KEY, String(performance.timeOrigin));
  } catch {
    // The in-memory dismissal still survives client route mounts.
  }
  notifyPreferences();
}

function MascotVideoFallback({
  clip,
  onUnavailable,
}: {
  clip: MascotMotionClip;
  onUnavailable: (clip: MascotMotionClip) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = mascotMediaForMotion(clip);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let watchdog = 0;

    const clearWatchdog = () => {
      if (watchdog) window.clearTimeout(watchdog);
      watchdog = 0;
    };
    const armWatchdog = () => {
      clearWatchdog();
      watchdog = window.setTimeout(() => {
        watchdog = 0;
        if (!stopped && !document.hidden) onUnavailable(clip);
      }, VIDEO_START_TIMEOUT_MS);
    };

    const play = () => {
      if (document.hidden) return;
      armWatchdog();
      void video.play().catch(() => {
        if (stopped || document.hidden || !video.isConnected) return;
        clearWatchdog();
        onUnavailable(clip);
      });
    };
    const handleVisibility = () => {
      if (document.hidden) {
        clearWatchdog();
        video.pause();
      } else play();
    };
    const handlePause = () => {
      if (!stopped && !document.hidden) play();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    video.addEventListener("pause", handlePause);
    video.addEventListener("playing", clearWatchdog);
    video.addEventListener("error", clearWatchdog);
    play();
    return () => {
      stopped = true;
      clearWatchdog();
      document.removeEventListener("visibilitychange", handleVisibility);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("playing", clearWatchdog);
      video.removeEventListener("error", clearWatchdog);
      video.pause();
    };
  }, [clip, onUnavailable]);

  return (
    <video
      ref={videoRef}
      data-mascot-video
      data-mascot-motion={clip}
      muted
      autoPlay
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      onError={() => onUnavailable(clip)}
    >
      <source type="video/webm" src={media.webm} />
      <source type="video/mp4" src={media.mp4} />
    </video>
  );
}

function CompanionView({ state, muted }: { state: MascotState; muted: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [viewerMounted, setViewerMounted] = useState(true);
  const [viewerState, setViewerState] = useState<"off" | "on" | "error">("off");
  const [failedVideoClip, setFailedVideoClip] = useState<MascotMotionClip | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
  const [bubble, setBubble] = useState<{
    mood: MascotState["mood"];
    message: string;
    muted: boolean;
    phase: "visible" | "fading" | "quiet";
  }>({ ...state, muted, phase: "visible" });

  // Reset only the finite announcement when server copy or mute changes.
  // Keep the panel and focused controls mounted across those updates.
  if (bubble.mood !== state.mood || bubble.message !== state.message || bubble.muted !== muted) {
    setBubble({ ...state, muted, phase: "visible" });
  }

  useEffect(() => {
    if (muted) return;
    const fade = window.setTimeout(() => setBubble((current) => ({
      ...current,
      phase: current.phase === "quiet" || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "quiet" : "fading",
    })), 6000);
    const settle = window.setTimeout(() => setBubble((current) => ({ ...current, phase: "quiet" })), 6160);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(settle);
    };
  }, [state.mood, state.message, muted]);

  const handleViewerState = useCallback((nextState: "off" | "on" | "error") => {
    setViewerState(nextState);
    if (nextState === "on") {
      setFailedVideoClip(null);
    } else {
      setViewerMounted(false);
    }
  }, []);

  const handleVideoUnavailable = useCallback((clip: MascotMotionClip) => {
    setFailedVideoClip(clip);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setViewerState("off");
      setViewerMounted(!event.matches);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  function collapse() {
    setExpanded(false);
    setBubble((current) => ({ ...current, phase: "quiet" }));
    chipRef.current?.focus();
  }

  function expand() {
    setExpanded(true);
  }

  const showBubble = !muted && (expanded || bubble.phase !== "quiet");
  const fading = !expanded && bubble.phase === "fading";
  const currentClip: MascotMotionClip = expanded ? mascotMotionForMood(state.mood) : "idle";
  const liveSurface = hydrated && !reducedMotion && viewerState === "on";
  const videoSurface = hydrated && !liveSurface && failedVideoClip !== currentClip;
  const staticSurface = hydrated && !liveSurface && failedVideoClip === currentClip;
  const surfaceState = liveSurface ? "on" : videoSurface ? "video" : staticSurface ? "off" : undefined;

  return (
    <aside
      className={`mascot-companion${expanded ? " is-expanded" : ""}`}
      aria-label="PortManager guide"
      data-mascot-companion
      data-mascot-mood={state.mood}
      data-mascot-3d={surfaceState}
      data-mascot-hydrated={hydrated ? "" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          collapse();
        }
      }}
    >
      {showBubble && (
        <p
          className={`mascot-bubble${fading ? " is-fading" : ""}`}
          data-mascot-bubble
          role="status"
          aria-hidden={fading}
        >
          <span>{state.message}</span>
        </p>
      )}
      <div className="mascot-card">
        <button
          ref={chipRef}
          type="button"
          className="mascot-chip"
          data-mascot-toggle
          aria-label="Toggle guide"
          aria-expanded={expanded}
          onClick={() => expanded ? collapse() : expand()}
        >
          {/* The supplied sprites are already-sized image cards, not cutouts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/mascot/mascot-${state.mood}.webp`} width={320} height={480} alt={`PortManager guide — ${state.mood}`} className="mascot-sprite" />
          {hydrated && !liveSurface && failedVideoClip !== currentClip && (
            <MascotVideoFallback
              key={currentClip}
              clip={currentClip}
              onUnavailable={handleVideoUnavailable}
            />
          )}
          {hydrated && viewerMounted && !reducedMotion && (
            <Mascot3dViewer clip={currentClip} onStateChange={handleViewerState} />
          )}
          <span className="mascot-status" data-mascot-status aria-label={`Guide status: ${state.mood}`} role="img" />
        </button>
        {expanded && <div className="mascot-controls">
          <label className="mascot-mute">
            <input
              type="checkbox"
              role="button"
              aria-label="Mute guide"
              aria-pressed={muted}
              checked={muted}
              onChange={(event) => setMuted(event.target.checked)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setMuted(!muted);
                }
              }}
            />
            <span>Mute guide</span>
          </label>
          <button type="button" aria-label="Hide guide" onClick={hideGuide}>Hide guide</button>
        </div>}
      </div>
    </aside>
  );
}

export default function MascotCompanion({ state }: { state: MascotState }) {
  const storedPreferences = useSyncExternalStore(subscribePreferences, readPreferences, serverPreferences);
  if (storedPreferences & HIDDEN) return null;
  const muted = Boolean(storedPreferences & MUTED);

  return <CompanionView state={state} muted={muted} />;
}
