const STORAGE_KEY = "werun-stopwatch-state-v1";
const DISPLAY_INTERVAL_MS = 43;

const timeDisplay = document.getElementById("time-display");
const statusDisplay = document.getElementById("status-display");
const startPauseButton = document.getElementById("start-pause-btn");
const lapButton = document.getElementById("lap-btn");
const resetButton = document.getElementById("reset-btn");
const exportCsvButton = document.getElementById("export-csv-btn");
const exportJsonButton = document.getElementById("export-json-btn");
const fullscreenButton = document.getElementById("fullscreen-btn");
const wakeLockButton = document.getElementById("wake-lock-btn");
const offlineBadge = document.getElementById("offline-badge");
const restoreBadge = document.getElementById("restore-badge");
const lapList = document.getElementById("lap-list");
const emptyState = document.getElementById("empty-state");
const lapCount = document.getElementById("lap-count");

let timerId = null;
let wakeLockSentinel = null;
let state = loadState();

function defaultState() {
  return {
    isRunning: false,
    elapsedBeforeStartMs: 0,
    startedAtEpochMs: null,
    laps: [],
    wakeLockEnabled: false,
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
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
  } catch (error) {
    return defaultState();
  }
}

function persistState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(ms) {
  const totalCentiseconds = Math.max(0, Math.floor(ms / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cc = String(centiseconds).padStart(2, "0");

  return hours > 0 ? `${hh}:${mm}:${ss}.${cc}` : `${mm}:${ss}.${cc}`;
}

function getElapsedTime(now = Date.now()) {
  if (!state.isRunning || !state.startedAtEpochMs) {
    return state.elapsedBeforeStartMs;
  }

  return state.elapsedBeforeStartMs + (now - state.startedAtEpochMs);
}

function updateDisplay() {
  timeDisplay.textContent = formatTime(getElapsedTime());
}

function startTicker() {
  stopTicker();
  updateDisplay();
  timerId = window.setInterval(() => {
    updateDisplay();
    persistState();
  }, DISPLAY_INTERVAL_MS);
}

function stopTicker() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function refreshButtons() {
  const hasLaps = state.laps.length > 0;
  startPauseButton.textContent = state.isRunning ? "Pause" : "Start";
  lapButton.disabled = !state.isRunning;
  exportCsvButton.disabled = !hasLaps;
  exportJsonButton.disabled = !hasLaps;
}

function refreshStatus() {
  if (state.isRunning) {
    statusDisplay.textContent = "Running";
    return;
  }

  statusDisplay.textContent = getElapsedTime() > 0 ? "Paused" : "Ready";
}

function updateRestoreBadge(message) {
  restoreBadge.textContent = message;
}

function renderLaps() {
  lapList.innerHTML = "";
  emptyState.hidden = state.laps.length > 0;
  lapCount.textContent = `${state.laps.length} lap${state.laps.length === 1 ? "" : "s"}`;

  state.laps
    .slice()
    .reverse()
    .forEach((lap) => {
      const lapItem = document.createElement("li");
      lapItem.className = "lap-item";
      lapItem.innerHTML = `
        <span class="lap-label">Lap ${lap.index}</span>
        <div>
          <div class="lap-total">${formatTime(lap.elapsedMs)}</div>
          <div class="lap-meta">Split ${formatTime(lap.splitMs)}</div>
        </div>
        <span class="lap-split">${lap.recordedAtLabel}</span>
      `;
      lapList.appendChild(lapItem);
    });
}

function refreshAll() {
  updateDisplay();
  refreshStatus();
  refreshButtons();
  renderLaps();
}

function startStopwatch() {
  state.startedAtEpochMs = Date.now();
  state.isRunning = true;
  persistState();
  startTicker();
  refreshStatus();
  refreshButtons();
  updateRestoreBadge("Running session auto-saved");
}

function pauseStopwatch() {
  state.elapsedBeforeStartMs = getElapsedTime();
  state.startedAtEpochMs = null;
  state.isRunning = false;
  persistState();
  stopTicker();
  refreshStatus();
  refreshButtons();
  updateDisplay();
  updateRestoreBadge("Paused session saved locally");
}

function resetStopwatch() {
  stopTicker();
  state = defaultState();
  persistState();
  refreshAll();
  updateRestoreBadge("Session cleared");
}

function addLap() {
  const elapsedMs = getElapsedTime();
  const previousLap = state.laps[state.laps.length - 1];
  const splitMs = previousLap ? elapsedMs - previousLap.elapsedMs : elapsedMs;
  const recordedAt = new Date();

  state.laps.push({
    index: state.laps.length + 1,
    elapsedMs,
    splitMs,
    recordedAtIso: recordedAt.toISOString(),
    recordedAtLabel: recordedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  });

  persistState();
  renderLaps();
  refreshButtons();
  updateRestoreBadge("Lap added to official log");
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

function exportCsv() {
  const header = "lap,total_time,split_time,recorded_at";
  const rows = state.laps.map((lap) =>
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
  const payload = {
    exportedAt: new Date().toISOString(),
    totalElapsedMs: Math.round(getElapsedTime()),
    state,
  };

  downloadFile(
    "werun-stopwatch-laps.json",
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

function syncFullscreenUi() {
  const inFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = inFullscreen
    ? "Exit Fullscreen"
    : "Fullscreen";
  document.body.classList.toggle("fullscreen-active", inFullscreen);
}

async function requestWakeLock() {
  if (
    !("wakeLock" in navigator) ||
    typeof navigator.wakeLock.request !== "function"
  ) {
    wakeLockButton.textContent = "Wake Lock Unsupported";
    wakeLockButton.disabled = true;
    state.wakeLockEnabled = false;
    persistState();
    return;
  }

  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", syncWakeLockUi);
    syncWakeLockUi();
  } catch (error) {
    updateRestoreBadge("Wake lock blocked by device");
    syncWakeLockUi();
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
  syncWakeLockUi();
}

function syncWakeLockUi() {
  const active = Boolean(wakeLockSentinel && !wakeLockSentinel.released);
  wakeLockButton.textContent = active ? "Screen Awake On" : "Keep Screen Awake";
}

async function toggleWakeLock() {
  const active = Boolean(wakeLockSentinel && !wakeLockSentinel.released);
  if (active) {
    state.wakeLockEnabled = false;
    persistState();
    await releaseWakeLock();
    return;
  }

  state.wakeLockEnabled = true;
  persistState();
  await requestWakeLock();
}

function updateConnectivityBadge() {
  if (navigator.onLine) {
    offlineBadge.textContent = "Online and offline-ready";
    return;
  }

  offlineBadge.textContent = "Offline mode active";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const isLocalhost =
    location.hostname === "localhost" || location.hostname === "::1";

  if (isLocalhost) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
    updateRestoreBadge("Dev mode: cache cleared");
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    updateRestoreBadge("Offline cache unavailable on this browser");
  }
}

function restoreRunningSessionIfNeeded() {
  if (state.isRunning && state.startedAtEpochMs) {
    startTicker();
    updateRestoreBadge("Recovered running session");
    return;
  }

  updateRestoreBadge(
    state.updatedAt
      ? `Last saved ${new Date(state.updatedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "Session persistence enabled",
  );
}

function syncFromVisibilityChange() {
  updateDisplay();

  if (document.visibilityState === "visible" && state.isRunning) {
    persistState();
    if (state.wakeLockEnabled) {
      requestWakeLock();
    }
  }
}

startPauseButton.addEventListener("click", () => {
  if (state.isRunning) {
    pauseStopwatch();
    return;
  }

  startStopwatch();
});

lapButton.addEventListener("click", addLap);
resetButton.addEventListener("click", resetStopwatch);
exportCsvButton.addEventListener("click", exportCsv);
exportJsonButton.addEventListener("click", exportJson);
fullscreenButton.addEventListener("click", () => {
  toggleFullscreen().catch(() => {
    updateRestoreBadge("Fullscreen unavailable");
  });
});
wakeLockButton.addEventListener("click", () => {
  toggleWakeLock().catch(() => {
    updateRestoreBadge("Could not change wake lock");
  });
});

document.addEventListener("fullscreenchange", syncFullscreenUi);
document.addEventListener("visibilitychange", syncFromVisibilityChange);
window.addEventListener("pageshow", updateDisplay);
window.addEventListener("beforeunload", persistState);
window.addEventListener("online", updateConnectivityBadge);
window.addEventListener("offline", updateConnectivityBadge);

refreshAll();
restoreRunningSessionIfNeeded();
updateConnectivityBadge();
syncFullscreenUi();
syncWakeLockUi();
if (state.wakeLockEnabled && document.visibilityState === "visible") {
  requestWakeLock();
}
registerServiceWorker();
