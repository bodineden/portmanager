"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
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

  function collapse() {
    setExpanded(false);
    setBubble((current) => ({ ...current, phase: "quiet" }));
    chipRef.current?.focus();
  }

  const showBubble = !muted && (expanded || bubble.phase !== "quiet");
  const fading = !expanded && bubble.phase === "fading";

  return (
    <aside
      className={`mascot-companion${expanded ? " is-expanded" : ""}`}
      aria-label="PortManager guide"
      data-mascot-companion
      data-mascot-mood={state.mood}
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
          onClick={() => expanded ? collapse() : setExpanded(true)}
        >
          {/* The supplied sprites are already-sized image cards, not cutouts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/mascot/mascot-${state.mood}.webp`} width={320} height={480} alt={`PortManager guide — ${state.mood}`} className="mascot-sprite" />
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
