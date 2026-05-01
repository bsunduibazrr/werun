"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "werun-stopwatch-state-v1";
const DISPLAY_INTERVAL_MS = 43;

function defaultState() {
  return {
    isRunning: false,
    elapsedBeforeStartMs: 0,
    startedAtEpochMs: null,
    laps: [],
  };
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function formatRecordedAt(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function getTimeParts(ms) {
  const [hours, minutes, seconds] = formatTime(ms).split(":");
  return { hours, minutes, seconds };
}

function getElapsedTime(state, now = Date.now()) {
  if (!state.isRunning || !state.startedAtEpochMs) {
    return state.elapsedBeforeStartMs;
  }

  return state.elapsedBeforeStartMs + (now - state.startedAtEpochMs);
}

function loadState() {
  if (typeof window === "undefined") {
    return defaultState();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      laps: Array.isArray(parsed.laps) ? parsed.laps : [],
    };
  } catch {
    return defaultState();
  }
}

function escapeCsvValue(value) {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function StopwatchPage() {
  const [appState, setAppState] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Session persistence enabled",
  );
  const [connectivityMessage, setConnectivityMessage] = useState(
    "Checking connectivity",
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const intervalRef = useRef(null);
  const wakeLockRef = useRef(null);

  const elapsed = getElapsedTime(appState);
  const timeParts = getTimeParts(elapsed);
  const showPrestartLap = !appState.isRunning && elapsed === 0;
  const showResetButton = appState.isRunning || elapsed > 0;

  useEffect(() => {
    const restored = loadState();
    setAppState(restored);
    setHydrated(true);
    setStatusMessage(
      restored.isRunning
        ? "Recovered running session"
        : "Session persistence enabled",
    );
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }, [appState, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (appState.isRunning) {
      intervalRef.current = window.setInterval(() => {
        setAppState((current) => ({ ...current }));
      }, DISPLAY_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [appState.isRunning, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const syncConnectivity = () => {
      setConnectivityMessage(
        navigator.onLine ? "Online and offline-ready" : "Offline mode active",
      );
    };

    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const onVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        wakeLockRef.current?.released
      ) {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
    };

    syncConnectivity();
    syncFullscreen();

    window.addEventListener("online", syncConnectivity);
    window.addEventListener("offline", syncConnectivity);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("online", syncConnectivity);
      window.removeEventListener("offline", syncConnectivity);
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hydrated]);

  const stopwatchStatus = appState.isRunning
    ? "Running"
    : elapsed > 0
      ? "Paused"
      : "Ready";

  function startStopwatch() {
    setAppState((current) => ({
      ...current,
      isRunning: true,
      startedAtEpochMs: Date.now(),
    }));
    setStatusMessage("Running session auto-saved");
  }

  function pauseStopwatch() {
    setAppState((current) => ({
      ...current,
      isRunning: false,
      elapsedBeforeStartMs: getElapsedTime(current),
      startedAtEpochMs: null,
    }));
    setStatusMessage("Paused session saved locally");
  }

  function resetStopwatch() {
    setAppState(defaultState());
    setStatusMessage("Session cleared");
  }

  function addLap() {
    setAppState((current) => {
      const elapsedMs = getElapsedTime(current);
      const previousLap = current.laps[current.laps.length - 1];
      const splitMs = previousLap
        ? elapsedMs - previousLap.elapsedMs
        : elapsedMs;
      const recordedAt = new Date();

      return {
        ...current,
        laps: [
          ...current.laps,
          {
            index: current.laps.length + 1,
            elapsedMs,
            splitMs,
            recordedAtLabel: formatRecordedAt(recordedAt),
          },
        ],
      };
    });
    setStatusMessage("Lap added to official log");
  }

  function exportCsv() {
    const header = "lap,total_time,split_time,recorded_at";
    const rows = appState.laps.map((lap) =>
      [
        lap.index,
        formatTime(lap.elapsedMs),
        formatTime(lap.splitMs),
        lap.recordedAtLabel,
      ]
        .map(escapeCsvValue)
        .join(","),
    );

    downloadFile(
      "werun-stopwatch-laps.csv",
      [header, ...rows].join("\n"),
      "text/csv;charset=utf-8",
    );
  }

  function exportJson() {
    downloadFile(
      "werun-stopwatch-laps.json",
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalElapsedMs: Math.round(elapsed),
          state: appState,
        },
        null,
        2,
      ),
      "application/json;charset=utf-8",
    );
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      setStatusMessage("Fullscreen unavailable");
    }
  }

  async function toggleWakeLock() {
    if (
      !("wakeLock" in navigator) ||
      typeof navigator.wakeLock.request !== "function"
    ) {
      setStatusMessage("Wake lock unsupported");
      return;
    }

    if (wakeLockRef.current && !wakeLockRef.current.released) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
      return;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockActive(false);
      });
    } catch {
      setStatusMessage("Wake lock blocked by device");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <header className="brand-header">
          <img
            className="brand-logo"
            src="/assets/logo.png"
            alt="WeRun logo"
            width="220"
            height="66"
          />
        </header>

        <div className="display-panel" aria-live="polite">
          <div className="display-topline">
            <span className="display-label">Elapsed time</span>
            <span className="status-display">{stopwatchStatus}</span>
          </div>
          <div className="time-display" role="presentation">
            <div className="time-group">
              <span className="time-unit-label">hour</span>
              <span className="time-unit-value">{timeParts.hours}</span>
            </div>
            <span className="time-separator">:</span>
            <div className="time-group">
              <span className="time-unit-label">minute</span>
              <span className="time-unit-value">{timeParts.minutes}</span>
            </div>
            <span className="time-separator">:</span>
            <div className="time-group">
              <span className="time-unit-label">second</span>
              <span className="time-unit-value">{timeParts.seconds}</span>
            </div>
          </div>
        </div>

        <div className="controls" role="group" aria-label="Stopwatch controls">
          {appState.isRunning ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={addLap}
            >
              Lap
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={startStopwatch}
            >
              Start
            </button>
          )}
          {showResetButton && (
            <div
              className={`control-pair ${appState.isRunning ? "control-pair-grow" : ""}`}
            >
              <button
                className={`btn btn-ghost ${appState.isRunning ? "btn-fill" : ""}`}
                type="button"
                style={{ width: "170%" }}
                onClick={resetStopwatch}
              >
                Reset
              </button>
            </div>
          )}
        </div>

        <div
          className="utility-actions"
          role="group"
          aria-label="Display controls"
        >
          <button
            className="btn btn-utility"
            type="button"
            onClick={toggleWakeLock}
          >
            {wakeLockActive ? "Screen Awake On" : "Keep Screen Awake"}
          </button>
        </div>

        <div
          className="export-actions"
          role="group"
          aria-label="Export controls"
        >
          <button
            className="btn btn-accent"
            type="button"
            onClick={exportCsv}
            disabled={!appState.laps.length}
          >
            Export Result
          </button>
        </div>
      </section>

      <section className="laps-card">
        <div className="laps-header">
          <div>
            <p className="eyebrow">Session Laps</p>
            <h2> Split logs</h2>
          </div>
          <span className="lap-count">{appState.laps.length} laps</span>
        </div>

        <div className="lap-list-wrap">
          {appState.laps.length > 0 ? (
            <ol className="lap-list">
              {appState.laps
                .slice()
                .reverse()
                .map((lap) => (
                  <li className="lap-item" key={lap.index}>
                    <span className="lap-label">Lap: {lap.index}</span>
                    <div>
                      <div className="lap-meta">
                        Total: {formatTime(lap.elapsedMs)}
                      </div>
                      <div className="lap-meta">
                        Split: {formatTime(lap.splitMs)}
                      </div>
                      <span className="lap-split">
                        Date: {lap.recordedAtLabel}
                      </span>{" "}
                    </div>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="empty-state">
              Start the stopwatch and press Lap to create an official session
              split record.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
