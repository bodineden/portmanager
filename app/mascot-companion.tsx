"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { MascotState } from "@/lib/mascot";
import "./mascot-companion.css";

const MUTE_KEY = "portmanager:mascot:muted";
const HIDE_KEY = "portmanager:mascot:hidden-document";
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

function CompanionView({ state, muted }: { state: MascotState; muted: boolean }) {
  const [bubblePhase, setBubblePhase] = useState<"visible" | "fading" | "quiet">("visible");

  useEffect(() => {
    if (muted) return;
    const fade = window.setTimeout(() => setBubblePhase("fading"), 6000);
    const settle = window.setTimeout(() => setBubblePhase("quiet"), 6160);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(settle);
    };
  }, [muted]);

  const showBubble = !muted && bubblePhase !== "quiet";

  return (
    <aside className="mascot-companion" aria-label="PortManager guide" data-mascot-companion data-mascot-mood={state.mood}>
      {showBubble && (
        <p
          className={`mascot-bubble${bubblePhase === "fading" ? " is-fading" : ""}`}
          data-mascot-bubble
          role="status"
          aria-hidden={bubblePhase === "fading"}
        >
          {state.message}
        </p>
      )}
      <div className="mascot-card">
        {(!showBubble || bubblePhase === "fading") && (
          <span className="mascot-status" data-mascot-status aria-label={`Guide status: ${state.mood}`} role="img" />
        )}
        {/* The supplied sprites are already-sized image cards, not cutouts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/mascot/mascot-${state.mood}.webp`} width={320} height={480} alt={`PortManager guide — ${state.mood}`} className="mascot-sprite" />
        <div className="mascot-controls">
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
          <button type="button" onClick={hideGuide}>Hide guide</button>
        </div>
      </div>
    </aside>
  );
}

export default function MascotCompanion({ state }: { state: MascotState }) {
  const storedPreferences = useSyncExternalStore(subscribePreferences, readPreferences, serverPreferences);
  if (storedPreferences & HIDDEN) return null;
  const muted = Boolean(storedPreferences & MUTED);

  // A changed server message (or unmute) starts one fresh, finite bubble.
  return <CompanionView key={`${state.mood}:${state.message}:${muted}`} state={state} muted={muted} />;
}
