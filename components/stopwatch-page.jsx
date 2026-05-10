"use client";

import { useEffect, useRef, useState } from "react";
import { MdDarkMode, MdLightMode } from "react-icons/md";
import { TbTrash } from "react-icons/tb";

const STORAGE_KEY = "werun-stopwatch-state-v1";
const THEME_STORAGE_KEY = "werun-theme-v1";
const DISPLAY_INTERVAL_MS = 43;
const DEFAULT_LAP_COMMENT = "X";

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

function normalizeLapComment(comment) {
  const trimmedComment = String(comment ?? "").trim();
  return trimmedComment || DEFAULT_LAP_COMMENT;
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
      laps: Array.isArray(parsed.laps)
        ? parsed.laps.map((lap, index) => ({
            ...lap,
            index: index + 1,
            comment: normalizeLapComment(lap.comment),
          }))
        : [],
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
  const [theme, setTheme] = useState("light");
  const [lapSearchValue, setLapSearchValue] = useState("");
  const [activeLapSearch, setActiveLapSearch] = useState(null);
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
  const lapItemRefs = useRef({});
  const lapHighlightTimeoutRef = useRef(null);

  const elapsed = getElapsedTime(appState);
  const timeParts = getTimeParts(elapsed);
  const showPrestartLap = !appState.isRunning && elapsed === 0;
  const showResetButton = appState.isRunning || elapsed > 0;

  useEffect(() => {
    const restored = loadState();
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    setAppState(restored);
    setTheme(savedTheme === "dark" ? "dark" : "light");
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

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [hydrated, theme]);

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
    return () => {
      if (lapHighlightTimeoutRef.current) {
        window.clearTimeout(lapHighlightTimeoutRef.current);
      }
    };
  }, []);

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
            comment: DEFAULT_LAP_COMMENT,
          },
        ],
      };
    });
    setStatusMessage("Lap added to official log");
  }

  function updateLapComment(lapIndex, nextComment) {
    setAppState((current) => ({
      ...current,
      laps: current.laps.map((lap) =>
        lap.index === lapIndex ? { ...lap, comment: nextComment } : lap,
      ),
    }));
  }

  function finalizeLapComment(lapIndex) {
    setAppState((current) => ({
      ...current,
      laps: current.laps.map((lap) =>
        lap.index === lapIndex
          ? { ...lap, comment: normalizeLapComment(lap.comment) }
          : lap,
      ),
    }));
  }

  function removeLap(lapIndex) {
    setAppState((current) => ({
      ...current,
      laps: current.laps
        .filter((lap) => lap.index !== lapIndex)
        .map((lap, index) => ({
          ...lap,
          index: index + 1,
        })),
    }));
    setStatusMessage(`Lap ${lapIndex} removed from official log`);
  }

  function scrollToLapByIndex(lapIndex) {
    const nextLapIndex = Number.parseInt(String(lapIndex), 10);

    if (!Number.isInteger(nextLapIndex) || nextLapIndex < 1) {
      setStatusMessage("Enter a valid lap number");
      return;
    }

    const lapExists = appState.laps.some((lap) => lap.index === nextLapIndex);
    if (!lapExists) {
      setStatusMessage(`Lap ${nextLapIndex} not found`);
      return;
    }

    const targetLap = lapItemRefs.current[nextLapIndex];
    if (!targetLap) {
      setStatusMessage(`Lap ${nextLapIndex} is not ready yet`);
      return;
    }

    targetLap.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setActiveLapSearch(nextLapIndex);
    setStatusMessage(`Scrolled to lap ${nextLapIndex}`);

    if (lapHighlightTimeoutRef.current) {
      window.clearTimeout(lapHighlightTimeoutRef.current);
    }

    lapHighlightTimeoutRef.current = window.setTimeout(() => {
      setActiveLapSearch(null);
    }, 1800);
  }

  function handleLapSearchKeyDown(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    scrollToLapByIndex(lapSearchValue);
  }

  function exportCsv() {
    const header = "lap,total_time,split_time,recorded_at,comment";
    const rows = appState.laps.map((lap) =>
      [
        lap.index,
        formatTime(lap.elapsedMs),
        formatTime(lap.splitMs),
        lap.recordedAtLabel,
        normalizeLapComment(lap.comment),
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
          state: {
            ...appState,
            laps: appState.laps.map((lap) => ({
              ...lap,
              comment: normalizeLapComment(lap.comment),
            })),
          },
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

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <header className="brand-header">
          <img
            className="brand-logo"
            src={
              theme === "dark" ? "/assets/logo-dark.png" : "/assets/logo.png"
            }
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
                style={{ width: "190%" }}
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
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <MdLightMode /> : <MdDarkMode />}
          </button>
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
          <div className="laps-header-actions">
            <label className="lap-search-field">
              <span className="sr-only">Search lap number</span>
              <input
                className="lap-search-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={lapSearchValue}
                placeholder="Go to lap #"
                onChange={(event) =>
                  setLapSearchValue(event.target.value.replace(/\D/g, ""))
                }
                onKeyDown={handleLapSearchKeyDown}
              />
            </label>
            <span className="lap-count">{appState.laps.length} laps</span>
          </div>
        </div>

        <div className="lap-list-wrap">
          {appState.laps.length > 0 ? (
            <ol className="lap-list">
              {appState.laps
                .slice()
                .reverse()
                .map((lap) => (
                  // list helber ni end bgashu
                  <li
                    className={`lap-item ${activeLapSearch === lap.index ? "lap-item-active" : ""}`}
                    key={lap.index}
                    ref={(element) => {
                      if (element) {
                        lapItemRefs.current[lap.index] = element;
                        return;
                      }

                      delete lapItemRefs.current[lap.index];
                    }}
                  >
                    <div className="lap-main">
                      <span className="lap-label">Lap: {lap.index}</span>
                      <div className="lap-meta">
                        Total: {formatTime(lap.elapsedMs)}
                      </div>
                      <div className="lap-meta">
                        Split: {formatTime(lap.splitMs)}
                      </div>
                      <span className="lap-split">
                        Date: {lap.recordedAtLabel}
                      </span>
                    </div>
                    <div className="lap-actions">
                      <label className="lap-comment-field">
                        <span className="sr-only">Lap {lap.index} comment</span>
                        <input
                          className="lap-comment-input"
                          type="text"
                          value={lap.comment ?? ""}
                          placeholder={"Comment"}
                          onChange={(event) =>
                            updateLapComment(lap.index, event.target.value)
                          }
                          onBlur={() => finalizeLapComment(lap.index)}
                        />
                      </label>
                      <button
                        className="btn btn-danger lap-remove-btn"
                        type="button"
                        aria-label={`Remove lap ${lap.index}`}
                        title="Remove lap"
                        onClick={() => removeLap(lap.index)}
                      >
                        <TbTrash />
                      </button>
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
